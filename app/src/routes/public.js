// 客が使うAPI（ログイン不要）
//   POST /api/register              自分のスマホで登録
//   POST /api/u/:token/login        マイページを開く（名前で本人確認。印刷QRなら名前を登録）
//   GET  /api/u/:token              マイページのデータ（X-User-Key が要る）
//   GET  /api/rankings              番付（賄賂・所持金）
//   GET  /api/ranking               LP用の番付
//   GET  /api/config                ゲーム・位・出し物名

import { ApiError, json, readJson, randomToken, shortCode, cleanNickname, allSettings, settingInt, RANK_NAME } from '../util.js';
import { applyDelta, history } from '../ledger.js';
import { userKey, checkUserKey } from '../auth.js';
import { listGames, shapePlay } from '../plays.js';
import { rankings, lpRanking, positions } from '../rankings.js';
import { SITE } from '../site.js';

const CORS = { 'access-control-allow-origin': '*' };

export async function register(request, env) {
  const body = await readJson(request);
  const nickname = cleanNickname(body.nickname);
  validateNickname(nickname);
  const s = await allSettings(env.DB);
  if (s.registration_open !== '1') throw new ApiError('CLOSED', '受付は終了しました', 403);

  const token = randomToken();
  const code = await uniqueShortCode(env.DB);
  const ins = await env.DB
    .prepare(
      `INSERT INTO users (token, short_code, nickname, source, claimed_at)
       SELECT ?, ?, ?, 'self', datetime('now')
        WHERE (SELECT COUNT(*) FROM users WHERE nickname IS NOT NULL) < ?`,
    )
    .bind(token, code, nickname, Number(s.max_users) || 999999)
    .run();
  if (!ins.meta.changes) throw new ApiError('FULL', '受付は満員です', 403);
  const userId = ins.meta.last_row_id;
  await grantStart(env.DB, userId, Number(s.starting_en));
  return json({ token, key: await userKey(env, token), url: `/u/${token}`, shortCode: code }, 201);
}

export function validateNickname(n) {
  if (n.length < 1 || n.length > 12) throw new ApiError('NICK', 'ニックネームは1〜12文字で入れてください');
}

export async function uniqueShortCode(db) {
  for (let i = 0; i < 10; i++) {
    const c = shortCode(6);
    const dup = await db.prepare('SELECT 1 FROM users WHERE short_code = ?').bind(c).first();
    if (!dup) return c;
  }
  throw new ApiError('CODE', '札の番号を作れませんでした', 500);
}

// 受付で配る縁。同じ客には一度だけ
export async function grantStart(db, userId, amount, staffId = null) {
  if (amount > 0) {
    await applyDelta(db, { userId, delta: amount, type: 'grant', staffId, note: '受付で配布', requestId: `grant:${userId}` });
  }
}

export async function login(request, env, token) {
  const body = await readJson(request);
  const nickname = cleanNickname(body.nickname);
  const u = await env.DB.prepare('SELECT id, nickname, status FROM users WHERE token = ?').bind(token).first();
  if (!u) throw new ApiError('NOT_FOUND', 'このQRは登録されていません', 404);
  if (u.status !== 'active') throw new ApiError('DISABLED', 'このページは使えなくなっています。受付に声をかけてください', 403);

  if (u.nickname == null) {
    // 印刷QRの札を、持ち主が自分で登録する
    validateNickname(nickname);
    const s = await allSettings(env.DB);
    if (s.registration_open !== '1') throw new ApiError('CLOSED', '受付は終了しました', 403);
    const upd = await env.DB
      .prepare("UPDATE users SET nickname = ?, source = 'card', claimed_at = datetime('now') WHERE id = ? AND nickname IS NULL")
      .bind(nickname, u.id)
      .run();
    if (upd.meta.changes) await grantStart(env.DB, u.id, Number(s.starting_en));
    else {
      // 同時に受付でも登録された。名前が合うかで判断する
      const now = await env.DB.prepare('SELECT nickname FROM users WHERE id = ?').bind(u.id).first();
      if (!sameName(now.nickname, nickname)) throw new ApiError('NAME', '名前が登録と違います', 403);
    }
  } else if (!sameName(u.nickname, nickname)) {
    throw new ApiError('NAME', '名前が登録と違います。受付で登録した名前を入れてください', 403);
  }
  return json({ key: await userKey(env, token), url: `/u/${token}` });
}

function sameName(a, b) {
  return cleanNickname(a).toLowerCase() === cleanNickname(b).toLowerCase();
}

export async function me(request, env, token) {
  const u = await env.DB
    .prepare('SELECT id, token, short_code, nickname, balance, status, created_at FROM users WHERE token = ?')
    .bind(token)
    .first();
  if (!u) throw new ApiError('NOT_FOUND', 'このQRは登録されていません', 404);
  const key = request.headers.get('X-User-Key') || new URL(request.url).searchParams.get('key');
  if (!(await checkUserKey(env, token, key))) {
    return json({ error: 'LOGIN', claimed: u.nickname != null, message: u.nickname == null ? '名前を入れて登録してください' : '名前を入れてください' }, 401);
  }
  if (u.status !== 'active') throw new ApiError('DISABLED', 'このページは使えなくなっています', 403);

  const s = await allSettings(env.DB);
  const [openPlay, openReading, hist, readings, pos] = await Promise.all([
    env.DB
      .prepare(
        `SELECT p.*, g.name AS game_name, g.kind, g.slug, u.nickname, u.balance, u.short_code, s.name AS staff_name
           FROM plays p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id JOIN staff s ON s.id = p.staff_id
          WHERE p.user_id = ? AND p.status = 'playing' LIMIT 1`,
      )
      .bind(u.id)
      .first(),
    env.DB.prepare("SELECT id, bribe, rank, started_at FROM readings WHERE user_id = ? AND status = 'open' LIMIT 1").bind(u.id).first(),
    history(env.DB, u.id, 30),
    env.DB
      .prepare("SELECT id, bribe, rank, sou_name, kizashi_name, oracle, finished_at FROM readings WHERE user_id = ? AND status = 'done' ORDER BY id DESC")
      .bind(u.id)
      .all(),
    positions(env.DB, u.id),
  ]);

  return json({
    id: u.id,
    nickname: u.nickname,
    shortCode: u.short_code,
    url: `/u/${u.token}`,
    balance: u.balance,
    createdAt: u.created_at,
    openPlay: openPlay ? shapePlay(openPlay) : null,
    openReading: openReading ? { id: openReading.id, bribe: openReading.bribe, rank: openReading.rank, rankName: openReading.rank ? RANK_NAME[openReading.rank] : null } : null,
    history: hist,
    readings: readings.results.map((r) => ({
      id: r.id,
      bribe: r.bribe,
      rank: r.rank,
      rankName: RANK_NAME[r.rank],
      sou: r.sou_name,
      kizashi: r.kizashi_name,
      oracle: r.oracle,
      finishedAt: r.finished_at,
    })),
    position: pos,
    ranks: { sho: Number(s.rank_sho), dai: Number(s.rank_dai), kaizan: Number(s.rank_kaizan) },
    site: SITE,
  });
}

export async function config(env) {
  const s = await allSettings(env.DB);
  return json(
    {
      site: SITE,
      startingEn: Number(s.starting_en),
      registrationOpen: s.registration_open === '1',
      ranks: { sho: Number(s.rank_sho), dai: Number(s.rank_dai), kaizan: Number(s.rank_kaizan) },
      games: await listGames(env.DB, true),
    },
    200,
    CORS,
  );
}

export async function rankingsRoute(env) {
  return json(await rankings(env.DB), 200, CORS);
}

export async function lpRankingRoute(env) {
  return json(await lpRanking(env.DB), 200, CORS);
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' } });
}
