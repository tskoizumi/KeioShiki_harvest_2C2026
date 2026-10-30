// 写真の中身の置き場所（Durable Object の SQLite）。1行2MBまでなので、1MBずつに分けて入れる
// 目録（だれの写真か）は D1 の photos。ここは「キー → バイト列」だけ

import { DurableObject } from 'cloudflare:workers';

const PART = 1024 * 1024;

export class PhotoStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS blobs (key TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (key, part))');
  }

  put(key, buf) {
    const sql = this.ctx.storage.sql;
    const bytes = new Uint8Array(buf);
    this.ctx.storage.transactionSync(() => {
      sql.exec('DELETE FROM blobs WHERE key = ?', key);
      for (let i = 0, n = 0; i < bytes.length; i += PART, n++) sql.exec('INSERT INTO blobs (key, part, data) VALUES (?, ?, ?)', key, n, bytes.slice(i, i + PART).buffer);
    });
    return bytes.length;
  }

  get(key) {
    const rows = this.ctx.storage.sql.exec('SELECT data FROM blobs WHERE key = ? ORDER BY part', key).toArray();
    if (!rows.length) return null;
    const parts = rows.map((r) => new Uint8Array(r.data));
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out.buffer;
  }

  del(keys) {
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => { for (const k of keys) sql.exec('DELETE FROM blobs WHERE key = ?', k); });
    return true;
  }

  // 展示が終わったら全部消す
  clear() {
    this.ctx.storage.sql.exec('DELETE FROM blobs');
    return true;
  }
}

export function photoStore(env) {
  return env.PHOTOS.get(env.PHOTOS.idFromName('main'));
}
