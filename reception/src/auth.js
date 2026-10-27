// スタッフ・管理者の判定
// Cloudflare Access を通過したリクエストには、Access が署名したJWTが
// Cf-Access-Jwt-Assertion ヘッダー（またはクッキー CF_Authorization）で付きます。
// その署名・宛先（aud）・期限を検証して、中のメールアドレスを使います。
// Cf-Access-Authenticated-User-Email ヘッダーは偽装できるので信用しません。

const JWKS_TTL_MS = 10 * 60 * 1000; // Access の公開鍵は10分だけ覚えておく
let jwksCache = { team: null, at: 0, keys: null };

function b64urlToBytes(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function accessKeys(team, force) {
  if (!force && jwksCache.team === team && jwksCache.keys && Date.now() - jwksCache.at < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('Access の公開鍵を取得できません');
  const { keys } = await r.json();
  jwksCache = { team, at: Date.now(), keys: keys || [] };
  return jwksCache.keys;
}

// Access のJWTを検証し、正しければメールアドレスを返す。だめなら null
export async function verifyAccessJwt(token, env) {
  const team = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!token || !team || !aud) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  let header, payload;
  try {
    header = b64urlToJson(h);
    payload = b64urlToJson(p);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  // 鍵が入れ替わった直後に備えて、見つからなければ1回だけ取り直す
  let jwk = (await accessKeys(team)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await accessKeys(team, true)).find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(sig),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;
  if (payload.iss !== `https://${team}`) return null;

  return typeof payload.email === 'string' ? payload.email : null;
}

function accessToken(request) {
  const h = request.headers.get('Cf-Access-Jwt-Assertion');
  if (h) return h;
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : null;
}

// メールアドレスの取得。
// 本番では Access のJWTを検証できたときだけ。設定（ACCESS_TEAM_DOMAIN / ACCESS_AUD）がなければ誰もスタッフになれない。
// 手元の開発（localhost）でだけ、.dev.vars の DEV_AUTH_EMAIL を代わりに使う（デプロイ後の本番URLでは無効）。
async function staffEmail(request, env) {
  const host = new URL(request.url).hostname;
  if ((host === 'localhost' || host === '127.0.0.1') && env.DEV_AUTH_EMAIL) return env.DEV_AUTH_EMAIL;
  try {
    return await verifyAccessJwt(accessToken(request), env);
  } catch (e) {
    console.error(e);
    return null;
  }
}

export async function currentStaff(request, env) {
  const email = await staffEmail(request, env);
  if (!email) return null;

  const s = await env.DB
    .prepare('SELECT id, display_name, role, fortune_perm FROM staff WHERE access_identity = ? AND active = 1')
    .bind(email.toLowerCase())
    .first();
  if (!s) return null;

  const g = await env.DB.prepare('SELECT game_id FROM staff_games WHERE staff_id = ?').bind(s.id).all();
  return { ...s, games: g.results.map((r) => r.game_id) };
}

// 操作の権限チェック（サーバー側で必ず行う。画面の表示だけに頼らない）
export function can(s, what, gameId) {
  if (!s) return false;
  if (s.role === 'admin') return true;
  if (what === 'game') return s.role === 'game' && s.games.includes(gameId);
  if (what === 'fortune') return s.role === 'game' && !!s.fortune_perm;
  if (what === 'bonus') return s.role === 'bonus';
  return false;
}
