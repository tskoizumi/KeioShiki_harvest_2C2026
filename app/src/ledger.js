// 縁の台帳。残高の増減は必ずここを通す。
//  - 同じ request_id は二度反映しない（端末の二重送信対策）
//  - 読んだ残高と同じときだけ更新する（同時操作で残高が狂わない）
//  - 残高は 0 を下回れない

import { ApiError } from './util.js';

export async function applyDelta(db, { userId, delta, type, refType = null, refId = null, staffId = null, note = null, requestId }) {
  if (!requestId) throw new ApiError('REQUEST_ID', 'requestId が必要です');
  if (!Number.isInteger(delta)) throw new ApiError('DELTA', '増減の額が不正です');

  const dup = await db.prepare('SELECT delta, balance_after FROM ledger WHERE request_id = ?').bind(requestId).first();
  if (dup) return { duplicate: true, delta: dup.delta, balance: dup.balance_after };

  for (let attempt = 0; attempt < 4; attempt++) {
    const u = await db.prepare('SELECT balance, status, nickname FROM users WHERE id = ?').bind(userId).first();
    if (!u) throw new ApiError('NOT_FOUND', 'その客は見つかりません', 404);
    if (u.status !== 'active') throw new ApiError('DISABLED', 'この客は無効になっています', 403);
    if (u.nickname == null) throw new ApiError('UNCLAIMED', 'まだ誰にも渡していないQRカードです。先に受付で名前を登録してください', 409);

    const after = u.balance + delta;
    if (after < 0) throw new ApiError('INSUFFICIENT', `縁が足りません（残高 ${u.balance} 縁）`, 409);

    const [ins, upd] = await db.batch([
      db
        .prepare(
          `INSERT INTO ledger (user_id, delta, balance_after, type, ref_type, ref_id, staff_id, note, request_id)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND balance = ? AND status = 'active')`,
        )
        .bind(userId, delta, after, type, refType, refId, staffId, note, requestId, userId, u.balance),
      db
        .prepare(`UPDATE users SET balance = ? WHERE id = ? AND balance = ? AND status = 'active'`)
        .bind(after, userId, u.balance),
    ]);
    if (ins.meta.changes === 1 && upd.meta.changes === 1) {
      return { duplicate: false, delta, balance: after, ledgerId: ins.meta.last_row_id };
    }
    // 先に誰かが残高を変えた。読み直してやり直す
  }
  throw new ApiError('CONFLICT', '混み合っています。もう一度押してください', 409);
}

export async function history(db, userId, limit = 30) {
  const r = await db
    .prepare(
      `SELECT l.id, l.delta, l.balance_after, l.type, l.ref_type, l.ref_id, l.note, l.created_at,
              g.name AS game_name
         FROM ledger l
         LEFT JOIN plays p ON l.ref_type = 'play' AND p.id = l.ref_id
         LEFT JOIN games g ON g.id = p.game_id
        WHERE l.user_id = ? ORDER BY l.id DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all();
  return r.results;
}
