// 受付システム：Cloudflare Worker（API・ページ振り分け）
import { applyPoints, audit, setFortune, randomToken, PointError } from './points.js';
import { currentStaff, can } from './auth.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const fail = (code, status, message) => json({ error: code, message }, status);

// 選択可能な配色（public/u.html の THEMES と揃える）
const THEME_KEYS = ['fiat', 'black', 'white', 'red', 'purple', 'blue', 'green'];

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function setting(db, key) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

/* ---------- 公開API（利用者） ---------- */

// 登録：ニックネーム（重複可）から、内部IDの自動採番と個人トークンを発行
async function register(request, env) {
  const body = await readJson(request);
  const nickname = String(body.nickname ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (nickname.length < 1 || nickname.length > 12) {
    return fail('NICK_INVALID', 400, 'ニックネームは1〜12文字で入力してください');
  }
  const token = randomToken();
  // 上限未満かつ受付中のときだけ INSERT される（件数チェックと挿入を1文で行う）
  const r = await env.DB.prepare(
    `INSERT INTO users (nickname, token)
     SELECT ?, ?
     WHERE (SELECT COUNT(*) FROM users) < (SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'max_users')
       AND (SELECT value FROM settings WHERE key = 'registration_open') = '1'`,
  )
    .bind(nickname, token)
    .run();
  if (!r.meta.changes) return fail('REG_FULL', 403, '受付を終了しました');
  return json({ id: r.meta.last_row_id, token, url: `/u/${token}` }, 201);
}

// 個人ページ用のデータ（トークンで閲覧）
async function me(env, token) {
  const u = await env.DB
    .prepare('SELECT id, nickname, points, fortune_done, theme FROM users WHERE token = ? AND status = ?')
    .bind(token, 'active')
    .first();
  if (!u) return fail('NOT_FOUND', 404, 'ページが見つかりません');

  const ch = await env.DB
    .prepare('SELECT no, name, image_key FROM characters WHERE threshold <= ? ORDER BY threshold DESC LIMIT 1')
    .bind(u.points)
    .first();
  const next = await env.DB
    .prepare('SELECT threshold FROM characters WHERE threshold > ? ORDER BY threshold ASC LIMIT 1')
    .bind(u.points)
    .first();
  const hist = await env.DB
    .prepare('SELECT source_type, outcome, applied_delta, created_at FROM point_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 10')
    .bind(u.id)
    .all();

  // 配色：利用者変更が許可されていて本人が選んでいればそれ、なければ全体テーマ
  const globalTheme = (await setting(env.DB, 'theme')) || 'fiat';
  const allowUser = (await setting(env.DB, 'allow_user_theme')) === '1';
  const effectiveTheme = allowUser && THEME_KEYS.includes(u.theme) ? u.theme : globalTheme;

  return json({
    id: u.id,
    nickname: u.nickname,
    points: u.points,
    locked: !!u.fortune_done,
    character: ch ? { no: ch.no, name: ch.name, image: ch.image_key ? `/img/${ch.image_key}` : null } : null,
    nextThreshold: next ? next.threshold : null,
    theme: effectiveTheme,
    themeChoice: allowUser,
    themeLocked: !!u.fortune_done,
    history: hist.results,
  });
}

// 利用者が自分の配色を選ぶ（プリセットのみ・占い済みは不可）
async function setUserTheme(request, env, token) {
  const allow = (await setting(env.DB, 'allow_user_theme')) === '1';
  if (!allow) return fail('THEME_CLOSED', 403, 'テーマの変更は受付で停止されています');

  const b = await readJson(request);
  if (!THEME_KEYS.includes(b.theme)) return fail('THEME_INVALID', 400, 'テーマが不正です');

  const u = await env.DB
    .prepare('SELECT id, fortune_done FROM users WHERE token = ? AND status = ?')
    .bind(token, 'active')
    .first();
  if (!u) return fail('NOT_FOUND', 404, 'ページが見つかりません');
  if (u.fortune_done) return fail('LOCKED', 403, '占い済みのためテーマは変更できません');

  // 占い完了と同時に変更されないよう、更新条件にも未完了を入れる
  const r = await env.DB
    .prepare('UPDATE users SET theme = ? WHERE id = ? AND fortune_done = 0')
    .bind(b.theme, u.id)
    .run();
  if (!r.meta.changes) return fail('LOCKED', 403, '占い済みのためテーマは変更できません');
  return json({ ok: true, theme: b.theme });
}

// キャラクター画像の配信（R2）
async function image(env, key) {
  if (!/^[a-z0-9/_.-]+$/i.test(key)) return new Response('Not found', { status: 404 });
  const obj = await env.R2.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'image/png',
      'cache-control': 'public, max-age=300',
    },
  });
}

/* ---------- スタッフAPI（Access：staff / admin） ---------- */

async function grantBonus(db, { userId, bonusId, reason, operatorId, requestId, bonus }) {
  // 同じ request_id は処理済み（成功扱い）。claim の二重登録より先に判定する
  const dup = await db.prepare('SELECT 1 FROM point_transactions WHERE request_id = ?').bind(requestId).first();
  if (dup) return { duplicate: true };

  if (!bonus.repeatable) {
    try {
      await db
        .prepare('INSERT INTO bonus_claims (user_id, bonus_id, reason) VALUES (?, ?, ?)')
        .bind(userId, bonusId, reason)
        .run();
    } catch {
      throw new PointError('BONUS_ALREADY', '取得済みです（1回限り）', 409);
    }
  }
  try {
    return await applyPoints(db, {
      userId,
      delta: bonus.points,
      sourceType: 'bonus',
      bonusId,
      reason,
      operatorId,
      requestId,
    });
  } catch (e) {
    // 付与に失敗したら取得記録を戻す
    if (!bonus.repeatable) {
      await db.prepare('DELETE FROM bonus_claims WHERE user_id = ? AND bonus_id = ?').bind(userId, bonusId).run();
    }
    throw e;
  }
}

async function staffApi(request, env, url) {
  const s = await currentStaff(request, env);
  if (!s) return fail('FORBIDDEN', 403, '権限がありません');
  const p = url.pathname;
  const m = request.method;

  if (p === '/api/staff/me' && m === 'GET') {
    return json({ name: s.display_name, role: s.role, games: s.games, fortunePerm: !!s.fortune_perm });
  }

  if (p === '/api/staff/games' && m === 'GET') {
    const g = await env.DB.prepare('SELECT id, name, outcomes_json, enabled FROM games ORDER BY id').all();
    return json({ results: g.results.map((x) => ({ ...x, outcomes: JSON.parse(x.outcomes_json) })) });
  }

  if (p === '/api/staff/bonuses' && m === 'GET') {
    const b = await env.DB.prepare('SELECT id, name, points, repeatable, enabled FROM bonuses ORDER BY id').all();
    return json({ results: b.results });
  }

  if (p === '/api/staff/lookup' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return json({ results: [] });
    const rows = await env.DB
      .prepare(
        `SELECT id, nickname, points, fortune_done FROM users
         WHERE status = 'active' AND (nickname LIKE ? OR id = ? OR token = ?)
         ORDER BY id LIMIT 30`,
      )
      .bind(`%${q}%`, /^\d+$/.test(q) ? Number(q) : -1, q)
      .all();
    return json({ results: rows.results });
  }

  if (p === '/api/points/game' && m === 'POST') {
    const b = await readJson(request);
    const gameId = Number(b.gameId);
    if (!can(s, 'game', gameId)) return fail('FORBIDDEN', 403, 'この担当ゲームではありません');
    const g = await env.DB.prepare('SELECT outcomes_json, enabled FROM games WHERE id = ?').bind(gameId).first();
    if (!g || !g.enabled) return fail('GAME_OFF', 400, 'ゲームが無効です');
    const outcome = JSON.parse(g.outcomes_json)[Number(b.outcome)];
    if (!outcome) return fail('BAD_OUTCOME', 400, '結果が不正です');
    const r = await applyPoints(env.DB, {
      userId: Number(b.userId),
      delta: outcome.delta,
      sourceType: 'game',
      gameId,
      outcome: outcome.name,
      operatorId: s.id,
      requestId: b.requestId,
    });
    return json(r);
  }

  if (p === '/api/points/bonus' && m === 'POST') {
    if (!can(s, 'bonus')) return fail('FORBIDDEN', 403, 'ボーナスの付与権限がありません');
    const b = await readJson(request);
    const reason = String(b.reason || '').trim();
    if (!reason) return fail('REASON_REQUIRED', 400, '理由（目検の確認内容）は必須です');
    const bonus = await env.DB
      .prepare('SELECT points, repeatable, enabled FROM bonuses WHERE id = ?')
      .bind(Number(b.bonusId))
      .first();
    if (!bonus || !bonus.enabled) return fail('BONUS_OFF', 400, 'このボーナスは無効です');
    const r = await grantBonus(env.DB, {
      userId: Number(b.userId),
      bonusId: Number(b.bonusId),
      reason,
      operatorId: s.id,
      requestId: b.requestId,
      bonus,
    });
    return json(r);
  }

  if (p === '/api/points/fortune' && m === 'POST') {
    if (!can(s, 'fortune')) return fail('FORBIDDEN', 403, '占い完了の権限がありません');
    const b = await readJson(request);
    await setFortune(env.DB, Number(b.userId), true, s.id);
    return json({ ok: true });
  }

  return fail('NOT_FOUND', 404, 'APIが見つかりません');
}

/* ---------- 管理者API（Access：admin のみ） ---------- */

async function adminApi(request, env, url, s) {
  const p = url.pathname;
  const m = request.method;
  const body = () => readJson(request);

  if (p === '/api/admin/users' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    const rows = await env.DB
      .prepare(
        `SELECT id, nickname, token, points, fortune_done, status FROM users
         WHERE (? = '' OR nickname LIKE ? OR id = ?) ORDER BY id LIMIT 300`,
      )
      .bind(q, `%${q}%`, Number(q) || -1)
      .all();
    return json({ results: rows.results });
  }

  if (p === '/api/admin/adjust' && m === 'POST') {
    const b = await body();
    const reason = String(b.reason || '').trim();
    if (!reason) return fail('REASON_REQUIRED', 400, '理由は必須です');
    return json(
      await applyPoints(env.DB, {
        userId: Number(b.userId),
        delta: Number(b.delta),
        sourceType: 'admin',
        reason,
        operatorId: s.id,
        requestId: b.requestId,
      }),
    );
  }

  if (p === '/api/admin/unlock' && m === 'POST') {
    const b = await body();
    await setFortune(env.DB, Number(b.userId), false, s.id);
    return json({ ok: true });
  }

  if (p === '/api/admin/reissue' && m === 'POST') {
    const b = await body();
    const token = randomToken();
    await env.DB.prepare('UPDATE users SET token = ? WHERE id = ?').bind(token, Number(b.userId)).run();
    await audit(env.DB, s.id, 'URL再発行', `user:${b.userId}`, '旧URLは無効（QRの再印刷が必要）');
    return json({ token });
  }

  if (p === '/api/admin/status' && m === 'POST') {
    const b = await body();
    const st = b.status === 'disabled' ? 'disabled' : 'active';
    await env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(st, Number(b.userId)).run();
    await audit(env.DB, s.id, 'ユーザー状態変更', `user:${b.userId}`, st);
    return json({ ok: true });
  }

  if (p === '/api/admin/config' && m === 'GET') {
    const [settings, games, bonuses, chars] = await Promise.all([
      env.DB.prepare('SELECT key, value FROM settings').all(),
      env.DB.prepare('SELECT id, name, outcomes_json, enabled FROM games ORDER BY id').all(),
      env.DB.prepare('SELECT id, name, points, repeatable, enabled FROM bonuses ORDER BY id').all(),
      env.DB.prepare('SELECT no, name, threshold, image_key FROM characters ORDER BY no').all(),
    ]);
    return json({
      settings: Object.fromEntries(settings.results.map((r) => [r.key, r.value])),
      games: games.results.map((g) => ({ ...g, outcomes: JSON.parse(g.outcomes_json) })),
      bonuses: bonuses.results,
      characters: chars.results.map((c) => ({ ...c, image: c.image_key ? `/img/${c.image_key}` : null })),
    });
  }

  if (p === '/api/admin/settings' && m === 'PUT') {
    const b = await body();
    if ('theme' in b && !THEME_KEYS.includes(b.theme)) return fail('THEME_INVALID', 400, 'テーマが不正です');
    for (const k of ['max_users', 'registration_open', 'theme', 'allow_user_theme']) {
      if (!(k in b)) continue;
      const v = k === 'allow_user_theme' ? (b[k] === true || b[k] === '1' ? '1' : '0') : String(b[k]);
      await env.DB.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(v, k).run();
    }
    await audit(env.DB, s.id, '設定変更', 'settings', JSON.stringify(b));
    return json({ ok: true });
  }

  if (/^\/api\/admin\/games\/\d+$/.test(p) && m === 'PUT') {
    const id = Number(p.split('/').pop());
    const b = await body();
    const outcomes = JSON.stringify(
      (Array.isArray(b.outcomes) ? b.outcomes : []).map((o) => ({ name: String(o.name), delta: Number(o.delta) })),
    );
    await env.DB
      .prepare('UPDATE games SET name = ?, outcomes_json = ?, enabled = ? WHERE id = ?')
      .bind(String(b.name), outcomes, b.enabled ? 1 : 0, id)
      .run();
    await audit(env.DB, s.id, 'ゲーム設定変更', `game:${id}`, outcomes);
    return json({ ok: true });
  }

  if (/^\/api\/admin\/bonuses\/\d+$/.test(p) && m === 'PUT') {
    const id = Number(p.split('/').pop());
    const b = await body();
    await env.DB
      .prepare('UPDATE bonuses SET name = ?, points = ?, repeatable = ?, enabled = ? WHERE id = ?')
      .bind(String(b.name), Number(b.points), b.repeatable ? 1 : 0, b.enabled ? 1 : 0, id)
      .run();
    await audit(env.DB, s.id, 'ボーナス設定変更', `bonus:${id}`, JSON.stringify(b));
    return json({ ok: true });
  }

  // キャラクター画像のアップロード（R2）
  if (/^\/api\/admin\/characters\/\d+\/image$/.test(p) && m === 'PUT') {
    const no = Number(p.split('/')[4]);
    const type = request.headers.get('content-type') || '';
    if (!['image/png', 'image/webp'].includes(type)) return fail('IMG_TYPE', 400, 'PNGまたはWebPをアップロードしてください');
    const buf = await request.arrayBuffer();
    if (buf.byteLength > 2 * 1024 * 1024) return fail('IMG_SIZE', 413, '2MB以下にしてください');
    const key = `char/${no}-${Date.now()}.${type === 'image/png' ? 'png' : 'webp'}`;
    await env.R2.put(key, buf, { httpMetadata: { contentType: type } });
    await env.DB.prepare('UPDATE characters SET image_key = ? WHERE no = ?').bind(key, no).run();
    await audit(env.DB, s.id, 'キャラ画像アップロード', `char:${no}`, key);
    return json({ ok: true, image: `/img/${key}` });
  }

  // キャラクターの名称・閾値（前後の順序を検証）
  if (/^\/api\/admin\/characters\/\d+$/.test(p) && m === 'PUT') {
    const no = Number(p.split('/').pop());
    const b = await body();
    const th = Number(b.threshold);
    if (!Number.isInteger(th) || th < 0 || th > 3000) return fail('TH_RANGE', 400, '閾値は0〜3000の整数で入力してください');
    const prev = await env.DB.prepare('SELECT threshold FROM characters WHERE no = ?').bind(no - 1).first();
    const next = await env.DB.prepare('SELECT threshold FROM characters WHERE no = ?').bind(no + 1).first();
    if (prev && th <= prev.threshold) return fail('TH_ORDER', 400, '前のキャラより大きい値にしてください');
    if (next && th >= next.threshold) return fail('TH_ORDER', 400, '次のキャラより小さい値にしてください');
    await env.DB
      .prepare('UPDATE characters SET name = ?, threshold = ? WHERE no = ?')
      .bind(String(b.name), th, no)
      .run();
    await audit(env.DB, s.id, 'キャラ設定変更', `char:${no}`, `閾値 ${th}`);
    return json({ ok: true });
  }

  if (p === '/api/admin/staff' && m === 'GET') {
    const rows = await env.DB
      .prepare('SELECT id, display_name, access_identity, role, fortune_perm, active FROM staff ORDER BY id')
      .all();
    const games = await env.DB.prepare('SELECT staff_id, game_id FROM staff_games').all();
    return json({
      results: rows.results.map((r) => ({
        ...r,
        games: games.results.filter((g) => g.staff_id === r.id).map((g) => g.game_id),
      })),
    });
  }

  if (p === '/api/admin/staff' && m === 'POST') {
    const b = await body();
    if (!['admin', 'game', 'bonus'].includes(b.role)) return fail('ROLE', 400, '種別が不正です');
    if (b.role === 'game') {
      const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM staff WHERE role = 'game'").first()).n;
      if (n >= 5) return fail('GAME_SLOT_FULL', 400, 'ゲーム担当は5枠までです');
    }
    const r = await env.DB
      .prepare('INSERT INTO staff (access_identity, display_name, role, fortune_perm) VALUES (?, ?, ?, ?)')
      .bind(String(b.accessIdentity || '').toLowerCase(), String(b.displayName || ''), b.role, b.fortunePerm ? 1 : 0)
      .run();
    const id = r.meta.last_row_id;
    for (const g of b.games || []) {
      await env.DB.prepare('INSERT INTO staff_games (staff_id, game_id) VALUES (?, ?)').bind(id, Number(g)).run();
    }
    await audit(env.DB, s.id, 'スタッフ追加', `staff:${id}`, b.role);
    return json({ id }, 201);
  }

  if (/^\/api\/admin\/staff\/\d+$/.test(p) && m === 'PATCH') {
    const id = Number(p.split('/').pop());
    const b = await body();
    if ('fortunePerm' in b) {
      await env.DB.prepare('UPDATE staff SET fortune_perm = ? WHERE id = ?').bind(b.fortunePerm ? 1 : 0, id).run();
    }
    if ('active' in b) {
      await env.DB.prepare('UPDATE staff SET active = ? WHERE id = ?').bind(b.active ? 1 : 0, id).run();
    }
    if (Array.isArray(b.games)) {
      await env.DB.prepare('DELETE FROM staff_games WHERE staff_id = ?').bind(id).run();
      for (const g of b.games) {
        await env.DB.prepare('INSERT INTO staff_games (staff_id, game_id) VALUES (?, ?)').bind(id, Number(g)).run();
      }
    }
    await audit(env.DB, s.id, 'スタッフ権限変更', `staff:${id}`, JSON.stringify(b));
    return json({ ok: true });
  }

  if (p === '/api/admin/logs' && m === 'GET') {
    const rows = await env.DB
      .prepare(
        `SELECT l.created_at, s.display_name AS actor, l.action, l.target, l.detail
         FROM audit_logs l LEFT JOIN staff s ON s.id = l.actor_id
         ORDER BY l.id DESC LIMIT 200`,
      )
      .all();
    return json({ results: rows.results });
  }

  return fail('NOT_FOUND', 404, 'APIが見つかりません');
}

/* ---------- 振り分け ---------- */

// 管理画面・付与端末のページは、スタッフ権限を確認してから配信する
async function guardedPage(request, env, roles, file) {
  const s = await currentStaff(request, env);
  if (!s || !roles.includes(s.role)) {
    return new Response('権限がありません（スタッフ用のアクセスが必要です）', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return env.ASSETS.fetch(new Request(new URL(file, request.url), request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const m = request.method;
    try {
      if (p === '/api/register' && m === 'POST') return await register(request, env);
      const tm = p.match(/^\/api\/me\/([^/]+)\/theme$/);
      if (tm && m === 'PUT') return await setUserTheme(request, env, decodeURIComponent(tm[1]));
      if (p.startsWith('/api/me/') && m === 'GET') return await me(env, p.slice('/api/me/'.length));
      if (p.startsWith('/img/') && m === 'GET') return await image(env, p.slice('/img/'.length));

      // 個人ページ（公開）。QRの読取先もこのページ
      // 静的ファイルは「.html なし」で取り出す（/u.html を頼むと /u へ転送され、トークンが消える）
      if (p.startsWith('/u/')) return env.ASSETS.fetch(new Request(new URL('/u', url), request));

      // 権限確認を通さずに .html を直接開かれないよう、正規のURLへ転送する
      if (p === '/admin.html') return Response.redirect(new URL('/admin', url), 302);
      if (p === '/terminal.html') return Response.redirect(new URL('/terminal', url), 302);

      // .html 付きで頼むと静的ファイル側が同じURLへ転送し続けるので、.html なしで取り出す
      if (p === '/terminal') return await guardedPage(request, env, ['game', 'bonus', 'admin'], '/terminal');
      if (p === '/admin') return await guardedPage(request, env, ['admin'], '/admin');

      if (p.startsWith('/api/staff/') || p.startsWith('/api/points/')) return await staffApi(request, env, url);

      if (p.startsWith('/api/admin/')) {
        const s = await currentStaff(request, env);
        if (!s || s.role !== 'admin') return fail('FORBIDDEN', 403, '管理者のみ利用できます');
        return await adminApi(request, env, url, s);
      }

      // それ以外（/, 共有CSS等）は静的ファイル
      return env.ASSETS.fetch(request);
    } catch (e) {
      if (e instanceof PointError) return fail(e.code, e.status, e.message);
      console.error(e);
      return fail('INTERNAL', 500, 'システムエラーが発生しました');
    }
  },
};
