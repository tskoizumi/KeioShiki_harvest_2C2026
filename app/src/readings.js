// 占い（1回分）の流れ：開始 → 心付け → 質問と兆 → 台本 → 終了
// 台本の中身は oracle.js。ここは保存と金の出入りだけ。

import { ORACLE } from './oracle.js';
import { applyDelta } from './ledger.js';
import { ApiError, allSettings, rankOf, RANK_NAME, nowIso } from './util.js';

export async function openReading(db, userId, staffId) {
  const u = await db.prepare("SELECT id, nickname, status FROM users WHERE id = ?").bind(userId).first();
  if (!u) throw new ApiError('NOT_FOUND', 'その客は見つかりません', 404);
  if (u.nickname == null) throw new ApiError('UNCLAIMED', 'まだ名前が登録されていないQRカードです', 409);
  if (u.status !== 'active') throw new ApiError('DISABLED', 'この客は無効になっています', 403);
  const open = await db.prepare("SELECT id FROM readings WHERE user_id = ? AND status = 'open'").bind(userId).first();
  if (open) return getReading(db, open.id);
  const play = await db.prepare("SELECT id FROM plays WHERE user_id = ? AND status = 'playing'").bind(userId).first();
  if (play) throw new ApiError('PLAYING', 'ゲームをプレイ中です。先にゲームの結果を入れてください', 409);
  const r = await db.prepare('INSERT INTO readings (user_id, staff_id) VALUES (?, ?)').bind(userId, staffId).run();
  return getReading(db, r.meta.last_row_id);
}

export async function getReading(db, id) {
  const r = await db
    .prepare(
      `SELECT r.*, u.nickname, u.balance, u.short_code FROM readings r JOIN users u ON u.id = r.user_id WHERE r.id = ?`,
    )
    .bind(id)
    .first();
  if (!r) throw new ApiError('NOT_FOUND', 'その占いは見つかりません', 404);
  return shape(r);
}

function shape(r) {
  return {
    id: r.id,
    userId: r.user_id,
    nickname: r.nickname,
    shortCode: r.short_code,
    balance: r.balance,
    staffId: r.staff_id,
    status: r.status,
    bribe: r.bribe,
    rank: r.rank,
    rankName: r.rank ? RANK_NAME[r.rank] : null,
    sou: r.sou_id ? { id: r.sou_id, name: r.sou_name } : null,
    kizashi: r.kizashi_id ? { id: r.kizashi_id, name: r.kizashi_name } : null,
    answers: r.answers ? JSON.parse(r.answers) : null,
    script: r.script ? JSON.parse(r.script) : null,
    oracle: r.oracle,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}

// 心付け。何回かに分けて置いてもいい（合計で位が決まる）
export async function addBribe(db, id, amount, staffId, requestId) {
  if (!Number.isInteger(amount) || amount <= 0) throw new ApiError('AMOUNT', '賄賂の額が正しくありません');
  const r = await db.prepare('SELECT user_id, status FROM readings WHERE id = ?').bind(id).first();
  if (!r) throw new ApiError('NOT_FOUND', 'その占いは見つかりません', 404);
  if (r.status !== 'open') throw new ApiError('CLOSED', 'この占いは終わっています', 409);
  const res = await applyDelta(db, { userId: r.user_id, delta: -amount, type: 'bribe', refType: 'reading', refId: id, staffId, note: '賄賂', requestId });
  if (!res.duplicate) {
    const s = await allSettings(db);
    const row = await db.prepare('SELECT bribe FROM readings WHERE id = ?').bind(id).first();
    const total = row.bribe + amount;
    await db.prepare('UPDATE readings SET bribe = ?, rank = ? WHERE id = ?').bind(total, rankOf(total, s), id).run();
  }
  return getReading(db, id);
}

// 質問の答えと兆を保存して、台本を組み立てる
export async function updateReading(db, id, { judge, mention, kizashiId, souId }) {
  const r = await db.prepare('SELECT id, status, bribe FROM readings WHERE id = ?').bind(id).first();
  if (!r) throw new ApiError('NOT_FOUND', 'その占いは見つかりません', 404);
  if (r.status !== 'open') throw new ApiError('CLOSED', 'この占いは終わっています', 409);

  const j = Array.from({ length: ORACLE.JUDGE.length }, (_, i) => clamp15(judge && judge[i]));
  const m = Array.from({ length: ORACLE.MENTION.length }, (_, i) => clamp15(mention && mention[i]));
  const sou = (souId && ORACLE.souById(souId)) || ORACLE.judge(j);
  const kz = kizashiId ? ORACLE.kizashiById(kizashiId) : null;
  const s = await allSettings(db);
  const rank = rankOf(r.bribe, s);

  let script = null, oracle = null;
  if (kz) {
    const mentions = ORACLE.pickMentions(m, ORACLE.DIRECTION[rank].mentions, id);
    const out = ORACLE.compose(sou, kz, rank, mentions);
    script = { parts: out.parts, direction: out.direction };
    oracle = out.oracle;
  }
  await db
    .prepare(
      `UPDATE readings SET rank = ?, sou_id = ?, sou_name = ?, kizashi_id = ?, kizashi_name = ?, answers = ?, script = ?, oracle = ?
        WHERE id = ?`,
    )
    .bind(rank, sou.id, sou.name, kz ? kz.id : null, kz ? kz.name : null, JSON.stringify({ judge: j, mention: m, souOverride: souId || null }), script ? JSON.stringify(script) : null, oracle, id)
    .run();
  return getReading(db, id);
}

function clamp15(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : 3;
}

export async function finishReading(db, id) {
  const r = await db.prepare('SELECT status, script FROM readings WHERE id = ?').bind(id).first();
  if (!r) throw new ApiError('NOT_FOUND', 'その占いは見つかりません', 404);
  if (r.status !== 'open') throw new ApiError('CLOSED', 'この占いは終わっています', 409);
  if (!r.script) throw new ApiError('NO_SCRIPT', '引いたカードを選んで台本を出してから終了してください', 409);
  await db.prepare("UPDATE readings SET status = 'done', finished_at = ? WHERE id = ? AND status = 'open'").bind(nowIso(), id).run();
  return getReading(db, id);
}

// 取りやめ。心付けは返す
export async function voidReading(db, id, staffId) {
  const r = await db.prepare('SELECT user_id, status, bribe FROM readings WHERE id = ?').bind(id).first();
  if (!r) throw new ApiError('NOT_FOUND', 'その占いは見つかりません', 404);
  if (r.status !== 'open') throw new ApiError('CLOSED', 'この占いは終わっています', 409);
  const upd = await db.prepare("UPDATE readings SET status = 'void', finished_at = ? WHERE id = ? AND status = 'open'").bind(nowIso(), id).run();
  if (upd.meta.changes === 1 && r.bribe > 0) {
    await applyDelta(db, { userId: r.user_id, delta: r.bribe, type: 'refund', refType: 'reading', refId: id, staffId, note: '占いの取りやめ', requestId: `refund:reading:${id}` });
  }
  return getReading(db, id);
}

export const ORACLE_PUBLIC = {
  judge: ORACLE.JUDGE.map((q) => q.text),
  mention: ORACLE.MENTION.map((q) => q.text),
  sou: ORACLE.SOU.map((s) => ({ id: s.id, name: s.name, hot: s.hot, move: s.move, out: s.out })),
  kizashi: ORACLE.KIZASHI.map((k) => ({ id: k.id, name: k.name, omen: k.omen })),
  direction: ORACLE.DIRECTION,
};
