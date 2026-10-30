// 研修モードのデータベース。Durable Object の SQLite を、D1 と同じ使い方（prepare / bind / first / all / run / batch）で触れるようにする。
// 本番の D1 には一切触れない。Worker 側は trainingDb(env) を env.DB の代わりに渡すだけで、同じコードがそのまま動く。

import { DurableObject } from 'cloudflare:workers';
import { splitSql } from './util.js';

export class TrainingDb extends DurableObject {
  // 複数の文をひとつのトランザクションで実行する（D1 の batch と同じ）
  run(stmts) {
    const sql = this.ctx.storage.sql;
    return this.ctx.storage.transactionSync(() =>
      stmts.map(({ sql: q, params }) => {
        const cur = sql.exec(q, ...(params || []));
        const results = cur.toArray();
        const m = sql.exec('SELECT changes() AS c, last_insert_rowid() AS r').one();
        return { results, changes: m.c, last_row_id: m.r };
      }),
    );
  }

  // 見本データまで入っているか
  ready() {
    const t = this.ctx.storage.sql.exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'settings'").one();
    if (!t.n) return false;
    const r = this.ctx.storage.sql.exec("SELECT COUNT(*) AS n FROM settings WHERE key = 'training_seeded'").one();
    return r.n > 0;
  }

  // 全部消して、スキーマを入れ直す
  reset(schemaSql) {
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      // 外部キーがあるので、参照する側から消す
      sql.exec('PRAGMA defer_foreign_keys = ON');
      const tables = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'").toArray().map((t) => t.name);
      const order = ['photos', 'photo_guests', 'audit_log', 'ledger', 'plays', 'readings', 'users', 'staff', 'games', 'settings'];
      tables.sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)));
      for (const name of tables) sql.exec(`DROP TABLE IF EXISTS "${name.replace(/"/g, '""')}"`);
      for (const stmt of splitSql(schemaSql)) sql.exec(stmt);
    });
    return true;
  }
}

// D1 風の薄い皮。env.DB と差し替えて使う
export function trainingDb(env) {
  const stub = env.TRAINING.get(env.TRAINING.idFromName('main'));
  const exec = (stmts) => stub.run(stmts);
  const toD1 = (r) => ({ results: r.results, success: true, meta: { changes: r.changes, last_row_id: r.last_row_id, duration: 0 } });
  const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

  class Stmt {
    constructor(sql) { this.sql = sql; this.params = []; }
    bind(...p) { this.params = p.map(norm); return this; }
    q() { return { sql: this.sql, params: this.params }; }
    async all() { return toD1((await exec([this.q()]))[0]); }
    async run() { return toD1((await exec([this.q()]))[0]); }
    async first(col) {
      const row = (await exec([this.q()]))[0].results[0];
      if (!row) return null;
      return col == null ? row : row[col];
    }
  }
  return {
    training: true,
    stub,
    prepare: (sql) => new Stmt(sql),
    batch: async (stmts) => (await exec(stmts.map((s) => s.q()))).map(toD1),
  };
}
