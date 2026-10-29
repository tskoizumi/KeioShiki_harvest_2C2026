// 研修モードは migrations/0001_init.sql を文ごとに分けて SQLite に流す。その分け方が正しいか
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { splitSql } from '../src/util.js';

test('スキーマを文ごとに分けて、そのまま SQLite に入る', () => {
  const sql = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
  const stmts = splitSql(sql);
  assert.ok(stmts.length >= 10);
  assert.ok(stmts.every((s) => !s.includes('--')), 'コメントが残っていない');
  const db = new DatabaseSync(':memory:');
  for (const s of stmts) db.exec(s);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM games').get().n, 4);
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'rank_kaizan'").get().value, '2000');
});

test('2つ目のマイグレーション（招待・ルール）も入り、4つのゲームにルールが入る', () => {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_invites_rules.sql']) {
    for (const s of splitSql(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'))) db.exec(s);
  }
  const g = db.prepare("SELECT COUNT(*) AS n FROM games WHERE rules <> ''").get();
  assert.equal(g.n, 4);
  db.exec("INSERT INTO staff_invites (code, level, expires_at) VALUES ('abc', 2, '2099-01-01')");
  assert.equal(db.prepare('SELECT level FROM staff_invites').get().level, 2);
});
