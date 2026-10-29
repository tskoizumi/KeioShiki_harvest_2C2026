// 番付：賄賂（心付けの合計）と所持金

import { allSettings } from './util.js';

export async function bribeRanking(db, limit) {
  const r = await db
    .prepare(
      `SELECT u.id, u.nickname AS name, SUM(r.bribe) AS amount, COUNT(*) AS readings
         FROM readings r JOIN users u ON u.id = r.user_id
        WHERE r.status = 'done' AND u.status = 'active' AND u.nickname IS NOT NULL
        GROUP BY u.id HAVING amount > 0
        ORDER BY amount DESC, MIN(r.finished_at) ASC LIMIT ?`,
    )
    .bind(limit)
    .all();
  return r.results;
}

export async function balanceRanking(db, limit) {
  const r = await db
    .prepare(
      `SELECT id, nickname AS name, balance AS amount FROM users
        WHERE status = 'active' AND nickname IS NOT NULL AND balance > 0
        ORDER BY balance DESC, id ASC LIMIT ?`,
    )
    .bind(limit)
    .all();
  return r.results;
}

// ある客の順位（同額は同じ順位）
export async function positions(db, userId) {
  const mine = await db
    .prepare(`SELECT COALESCE(SUM(bribe), 0) AS total FROM readings WHERE user_id = ? AND status = 'done'`)
    .bind(userId)
    .first();
  const bribeTotal = mine ? mine.total : 0;
  let bribePos = null;
  if (bribeTotal > 0) {
    const above = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT r.user_id, SUM(r.bribe) AS t FROM readings r JOIN users u ON u.id = r.user_id
            WHERE r.status = 'done' AND u.status = 'active' GROUP BY r.user_id HAVING t > ?)`,
      )
      .bind(bribeTotal)
      .first();
    bribePos = above.n + 1;
  }
  const u = await db.prepare('SELECT balance FROM users WHERE id = ?').bind(userId).first();
  const aboveBal = await db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE status = 'active' AND nickname IS NOT NULL AND balance > ?`)
    .bind(u ? u.balance : 0)
    .first();
  return { bribeTotal, bribePos, balancePos: aboveBal.n + 1 };
}

export async function rankings(db) {
  const s = await allSettings(db);
  const n = Number(s.ranking_size) || 10;
  const [bribe, balance] = await Promise.all([bribeRanking(db, n), balanceRanking(db, n)]);
  return {
    updatedAt: new Date().toISOString(),
    kaizanThreshold: Number(s.rank_kaizan),
    bribe: { title: s.first_title, entries: bribe },
    balance: { title: s.rich_title, entries: balance },
  };
}

// LP が読む形（config.js の rankingUrl）
export async function lpRanking(db) {
  const s = await allSettings(db);
  const entries = await bribeRanking(db, Number(s.ranking_size) || 10);
  return {
    updatedAt: new Date().toISOString(),
    firstTitle: s.first_title,
    entries: entries.map((e) => ({ name: e.name, amount: e.amount })),
  };
}
