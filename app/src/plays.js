// ミニゲームの1回分：開始（参加費・賭け金を引く）→ 結果（払い戻す）／取消（返す）

import { applyDelta } from './ledger.js';
import { ApiError, nowIso, allSettings, taxDiv, taxedMult } from './util.js';

// 点数を足し引きするゲーム（ラッキーパネル）は、データベースでは kind = fixed のまま config.score で見分ける
// （kind の制約を変えるにはテーブルを作り直す必要があるため）
export function shapeGame(g) {
  const config = JSON.parse(g.config);
  return {
    id: g.id,
    slug: g.slug,
    name: g.name,
    kana: g.kana,
    kind: config.score ? 'score' : g.kind,
    fee: g.fee,
    minBet: g.min_bet,
    maxBet: g.max_bet,
    config,
    roleLabel: g.role_label,
    rules: g.rules || '',
    enabled: !!g.enabled,
    sort: g.sort,
  };
}

export async function listGames(db, onlyEnabled) {
  const r = await db.prepare(`SELECT * FROM games ${onlyEnabled ? 'WHERE enabled = 1' : ''} ORDER BY sort, id`).all();
  return r.results.map(shapeGame);
}

export async function startPlay(db, { userId, gameId, stake, staffId, requestId }) {
  const g = await db.prepare('SELECT * FROM games WHERE id = ?').bind(gameId).first();
  if (!g || !g.enabled) throw new ApiError('GAME_OFF', 'このゲームは今は遊べません');
  const game = shapeGame(g);

  // 同じ requestId で二度押されたら、作ったプレイを返す
  const dup = await db.prepare("SELECT ref_id FROM ledger WHERE request_id = ? AND ref_type = 'play'").bind(requestId).first();
  if (dup) return getPlay(db, dup.ref_id);

  const open = await db.prepare("SELECT id FROM plays WHERE user_id = ? AND status = 'playing'").bind(userId).first();
  if (open) throw new ApiError('ALREADY_PLAYING', 'この客はほかのゲームをプレイ中です。先にその結果を入れてください', 409);
  const reading = await db.prepare("SELECT id FROM readings WHERE user_id = ? AND status = 'open'").bind(userId).first();
  if (reading) throw new ApiError('READING', 'この客は占いの最中です', 409);

  let amount;
  if (game.kind === 'bet') {
    amount = Number(stake);
    if (!Number.isInteger(amount) || amount < game.minBet || amount <= 0) throw new ApiError('BET', `賭け金は ${game.minBet} 縁以上で`);
    if (game.maxBet > 0 && amount > game.maxBet) throw new ApiError('BET', `賭け金は ${game.maxBet} 縁まで`);
  } else {
    amount = game.fee;
  }

  // 始めたときの残高で資産区分を決める（賭け金を引く前）
  const u = await db.prepare('SELECT balance FROM users WHERE id = ?').bind(userId).first();
  const div = game.kind === 'bet' ? taxDiv(u ? u.balance : 0, await allSettings(db)) : 1;
  const ins = await db.prepare('INSERT INTO plays (user_id, game_id, staff_id, stake, tax_div) VALUES (?, ?, ?, ?, ?)').bind(userId, gameId, staffId, amount, div).run();
  const playId = ins.meta.last_row_id;
  try {
    if (amount > 0) {
      await applyDelta(db, { userId, delta: -amount, type: 'fee', refType: 'play', refId: playId, staffId, note: game.name, requestId });
    }
  } catch (e) {
    await db.prepare('DELETE FROM plays WHERE id = ?').bind(playId).run();
    throw e;
  }
  return getPlay(db, playId);
}

// 払い戻し。bet は 賭け金 × 倍率（資産区分で割ったもの）。マイナスもある
export function computePayout(game, stake, result, div = 1) {
  const c = game.config;
  if (game.kind === 'fixed') {
    const o = c.outcomes[Number(result.outcome)];
    if (!o) throw new ApiError('RESULT', '結果の選び方が不正です');
    return { payout: Math.max(0, Math.round(o.payout)), label: o.label };
  }
  if (game.kind === 'score') {
    const pts = Array.isArray(result.points) ? result.points.map(Number) : [];
    if (pts.length > 300 || pts.some((n) => !Number.isInteger(n) || Math.abs(n) > 1000)) throw new ApiError('RESULT', '点数が不正です');
    const total = Math.max(-5000, Math.min(5000, pts.reduce((a, n) => a + n, 0)));
    const lv = (c.levels || [])[Number(result.level)];
    return { payout: total, label: (lv ? lv.name + '・' : '') + (total > 0 ? '+' : '') + total + '点' };
  }
  if (game.kind === 'stack') {
    const n = Number(result.level);
    if (!Number.isInteger(n) || n < 0) throw new ApiError('RESULT', '段数が不正です');
    const lv = Math.min(n, c.max_level || n);
    return { payout: lv * (c.per_level || 0), label: `${lv}段` };
  }
  if (game.kind === 'bet') {
    const o = c.outcomes[Number(result.outcome)];
    if (!o) throw new ApiError('RESULT', '結果の選び方が不正です');
    const mult = taxedMult(o.mult, div);
    return { payout: Math.round(stake * mult), label: o.label, mult, baseMult: Number(o.mult) };
  }
  throw new ApiError('KIND', 'ゲームの種類が不正です');
}

export async function finishPlay(db, playId, result, staffId) {
  const p = await db.prepare('SELECT p.*, g.config, g.kind, g.name, g.slug, g.fee, g.min_bet, g.max_bet, g.kana, g.role_label, g.enabled, g.sort FROM plays p JOIN games g ON g.id = p.game_id WHERE p.id = ?').bind(playId).first();
  if (!p) throw new ApiError('NOT_FOUND', 'そのプレイは見つかりません', 404);
  if (p.status !== 'playing') return getPlay(db, playId);   // もう入っている（二度押し）
  const game = shapeGame({ ...p, id: p.game_id });
  const out = computePayout(game, p.stake, result || {}, p.tax_div || 1);
  const label = out.label;
  let payout = out.payout;
  // マイナス（ションベン・ヒフミ、ラッキーパネルの減点）は残高から追加で引く。残高より多くは引かない
  if (payout < 0) {
    const u = await db.prepare('SELECT balance FROM users WHERE id = ?').bind(p.user_id).first();
    payout = -Math.min(-payout, u ? u.balance : 0);
  }

  const upd = await db
    .prepare("UPDATE plays SET status = 'done', result = ?, payout = ?, finished_at = ? WHERE id = ? AND status = 'playing'")
    .bind(JSON.stringify({ ...result, label, mult: out.mult, baseMult: out.baseMult, taxDiv: p.tax_div || 1 }), payout, nowIso(), playId)
    .run();
  if (upd.meta.changes === 1 && payout !== 0) {
    await applyDelta(db, { userId: p.user_id, delta: payout, type: 'payout', refType: 'play', refId: playId, staffId, note: `${p.name}：${label}`, requestId: `payout:${playId}` });
  }
  return getPlay(db, playId);
}

export async function voidPlay(db, playId, staffId) {
  const p = await db.prepare('SELECT * FROM plays WHERE id = ?').bind(playId).first();
  if (!p) throw new ApiError('NOT_FOUND', 'そのプレイは見つかりません', 404);
  if (p.status !== 'playing') throw new ApiError('CLOSED', 'このプレイはもう終わっています', 409);
  const upd = await db.prepare("UPDATE plays SET status = 'void', finished_at = ? WHERE id = ? AND status = 'playing'").bind(nowIso(), playId).run();
  if (upd.meta.changes === 1 && p.stake > 0) {
    await applyDelta(db, { userId: p.user_id, delta: p.stake, type: 'refund', refType: 'play', refId: playId, staffId, note: '取消', requestId: `refund:play:${playId}` });
  }
  return getPlay(db, playId);
}

export async function getPlay(db, id) {
  const p = await db
    .prepare(
      `SELECT p.*, g.name AS game_name, g.kind, g.slug, u.nickname, u.balance, u.short_code, s.name AS staff_name
         FROM plays p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id JOIN staff s ON s.id = p.staff_id
        WHERE p.id = ?`,
    )
    .bind(id)
    .first();
  if (!p) throw new ApiError('NOT_FOUND', 'そのプレイは見つかりません', 404);
  return shapePlay(p);
}

export function shapePlay(p) {
  return {
    id: p.id,
    userId: p.user_id,
    nickname: p.nickname,
    shortCode: p.short_code,
    balance: p.balance,
    gameId: p.game_id,
    gameName: p.game_name,
    gameSlug: p.slug,
    kind: p.kind,
    staffId: p.staff_id,
    staffName: p.staff_name,
    stake: p.stake,
    taxDiv: p.tax_div || 1,
    status: p.status,
    result: p.result ? JSON.parse(p.result) : null,
    payout: p.payout,
    startedAt: p.started_at,
    finishedAt: p.finished_at,
  };
}

export async function openPlays(db) {
  const r = await db
    .prepare(
      `SELECT p.*, g.name AS game_name, g.kind, g.slug, u.nickname, u.balance, u.short_code, s.name AS staff_name
         FROM plays p JOIN games g ON g.id = p.game_id JOIN users u ON u.id = p.user_id JOIN staff s ON s.id = p.staff_id
        WHERE p.status = 'playing' ORDER BY p.id DESC LIMIT 50`,
    )
    .all();
  return r.results.map(shapePlay);
}
