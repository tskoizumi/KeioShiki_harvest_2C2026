// スタッフ・管理者の判定
// Cloudflare Access を通過したリクエストには、認証済みユーザーのメールアドレスが
// Cf-Access-Authenticated-User-Email ヘッダーで付きます。
// 本番では必ず README の「セキュリティ設定」を実施してください（workers.dev の無効化・JWT検証）。

// メールアドレスの取得。
// 本番では Access が付けるヘッダのみを使う。
// 手元の開発（localhost）でだけ、.dev.vars の DEV_AUTH_EMAIL を代わりに使う（デプロイ後の本番URLでは無効）。
function staffEmail(request, env) {
  const h = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (h) return h;
  const host = new URL(request.url).hostname;
  if ((host === 'localhost' || host === '127.0.0.1') && env.DEV_AUTH_EMAIL) return env.DEV_AUTH_EMAIL;
  return null;
}

export async function currentStaff(request, env) {
  const email = staffEmail(request, env);
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
