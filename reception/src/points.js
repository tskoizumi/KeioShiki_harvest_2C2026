// ポイント台帳の処理（付与・取り消し・監査ログ・占い完了）
// 範囲制限（0〜3000）、二重送信防止（request_id）、占い済みロックをここに集約します。

export class PointError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// 個人トークン（16バイト・base64url・約22文字）
export function randomToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function audit(db, actorId, action, target, detail) {
  await db
    .prepare('INSERT INTO audit_logs (actor_id, action, target, detail) VALUES (?, ?, ?, ?)')
    .bind(actorId ?? null, action, target ?? null, detail ?? null)
    .run();
}

// 占い完了／解除（占い済みフラグ）
export async function setFortune(db, userId, done, operatorId) {
  await db
    .prepare('UPDATE users SET fortune_done = ?, fortune_done_at = ? WHERE id = ?')
    .bind(done ? 1 : 0, done ? new Date().toISOString() : null, userId)
    .run();
  await audit(
    db,
    operatorId,
    done ? '占い完了' : '占い解除',
    `user:${userId}`,
    done ? 'ポイント更新を停止' : '占い済みフラグを解除',
  );
}

// ポイント付与（ゲーム・ボーナス・手動調整・取り消しの共通処理）
export async function applyPoints(
  db,
  { userId, delta, sourceType, gameId = null, bonusId = null, outcome = null, reason = null, operatorId = null, requestId, revertsTxId = null },
) {
  if (!requestId) throw new PointError('REQUEST_ID', 'requestIdが必要です');
  if (!Number.isInteger(delta)) throw new PointError('DELTA', '増減値が不正です');

  // 二重送信（同じ request_id）は既に処理済みとして成功扱い
  const dup = await db.prepare('SELECT applied_delta FROM point_transactions WHERE request_id = ?').bind(requestId).first();
  if (dup) return { duplicate: true, applied: dup.applied_delta };

  for (let attempt = 0; attempt < 3; attempt++) {
    const u = await db.prepare('SELECT points, fortune_done, status FROM users WHERE id = ?').bind(userId).first();
    if (!u) throw new PointError('NOT_FOUND', '利用者が見つかりません', 404);
    if (u.status !== 'active') throw new PointError('DISABLED', '無効な利用者です', 403);
    if (u.fortune_done) throw new PointError('LOCKED', '占い済みのためポイントは更新できません', 409);

    const after = Math.min(3000, Math.max(0, u.points + delta));
    const applied = after - u.points;
    if (delta !== 0 && applied === 0) {
      throw new PointError(
        delta > 0 ? 'POINT_MAX' : 'POINT_MIN',
        delta > 0 ? '上限3000に達しているため付与されません' : '0ptのため減点されません',
        409,
      );
    }

    // 台帳追記と残高更新を1つのbatchにまとめる。
    // どちらも「読んだ時点の残高（points = u.points）」が変わっていない場合のみ実行される。
    const [ins, upd] = await db.batch([
      db
        .prepare(
          `INSERT INTO point_transactions
             (user_id, requested_delta, applied_delta, source_type, game_id, bonus_id, outcome, reason, operator_id, request_id, reverts_tx_id)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND points = ? AND fortune_done = 0 AND status = 'active')`,
        )
        .bind(userId, delta, applied, sourceType, gameId, bonusId, outcome, reason, operatorId, requestId, revertsTxId, userId, u.points),
      db
        .prepare(`UPDATE users SET points = points + ? WHERE id = ? AND points = ? AND fortune_done = 0 AND status = 'active'`)
        .bind(applied, userId, u.points),
    ]);

    if (ins.meta.changes === 1 && upd.meta.changes === 1) {
      return { duplicate: false, applied, points: after };
    }
    // 他の操作が先に残高を変えた場合は、読み直して再試行する
  }
  throw new PointError('CONFLICT', '混雑しています。もう一度お試しください', 409);
}
