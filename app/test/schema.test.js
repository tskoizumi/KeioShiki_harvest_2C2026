// 研修モードは migrations/0001_init.sql を文ごとに分けて SQLite に流す。その分け方が正しいか
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
  for (const f of ['0001_init.sql', '0002_invites_rules.sql', '0003_tax_negative.sql']) {
    for (const s of splitSql(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'))) db.exec(s);
  }
  const g = db.prepare("SELECT COUNT(*) AS n FROM games WHERE rules <> ''").get();
  assert.equal(g.n, 4);
  db.exec("INSERT INTO staff_invites (code, level, expires_at) VALUES ('abc', 2, '2099-01-01')");
  assert.equal(db.prepare('SELECT level FROM staff_invites').get().level, 2);
  // 0003：チンチロにマイナスの倍率、資産区分の設定
  const cfg = JSON.parse(db.prepare("SELECT config FROM games WHERE slug = 'chinchiro'").get().config);
  assert.ok(cfg.outcomes.some((o) => o.mult < 0), 'マイナスの倍率がある');
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'tax_brackets'").get().value, '1000,3000,6000,10000');
  assert.ok(db.prepare("SELECT rules FROM games WHERE slug = 'chinchiro'").get().rules.includes('資産区分'));
});

test('4つ目のマイグレーション（写真展）：同じ名前は大文字小文字を区別せず1人だけ', () => {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_invites_rules.sql', '0003_tax_negative.sql', '0004_photos.sql']) {
    for (const s of splitSql(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'))) db.exec(s);
  }
  db.exec("INSERT INTO photo_guests (name, pass_hash, pass_salt) VALUES ('Aoi', 'h', 's')");
  assert.throws(() => db.exec("INSERT INTO photo_guests (name, pass_hash, pass_salt) VALUES ('aoi', 'h', 's')"));
  db.exec('INSERT INTO photos (guest_id, width, height, bytes) VALUES (1, 2560, 1707, 900000)');
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'photo_title'").get().value, '写真展');
});

test('5つ目のマイグレーション：ゲームの名前と並び、ラッキーパネルは点数を足し引きする', () => {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_invites_rules.sql', '0003_tax_negative.sql', '0004_photos.sql', '0005_game_names.sql']) {
    for (const s of splitSql(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'))) db.exec(s);
  }
  const names = db.prepare('SELECT name FROM games ORDER BY sort').all().map((g) => g.name);
  assert.deepEqual(names, ['ストラックアウト', 'チンチロ', 'ブラックボックス', 'ラッキーパネル']);
  const lp = JSON.parse(db.prepare("SELECT config FROM games WHERE slug = 'shinkei'").get().config);
  assert.equal(lp.score, true);
  assert.deepEqual(lp.levels.map((l) => l.miss), [-10, -20, -30]);
  // 0006：ラッキーパネルの参加費は10縁
  for (const s of splitSql(readFileSync(new URL('../migrations/0006_lucky_fee.sql', import.meta.url), 'utf8'))) db.exec(s);
  const g = db.prepare("SELECT fee, rules FROM games WHERE slug = 'shinkei'").get();
  assert.equal(g.fee, 10);
  assert.ok(g.rules.includes('参加費 10縁') && !g.rules.includes('50縁'));
});

test('7つ目のマイグレーション：権限はスタッフ（1）と管理者（4）だけになる', () => {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_invites_rules.sql', '0003_tax_negative.sql', '0004_photos.sql', '0005_game_names.sql', '0006_lucky_fee.sql']) {
    for (const s of splitSql(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'))) db.exec(s);
  }
  for (const [n, l] of [['a', 1], ['b', 2], ['c', 3], ['d', 4]]) db.exec(`INSERT INTO staff (name, level, code_hash, code_salt) VALUES ('${n}', ${l}, 'h', 's')`);
  db.exec("INSERT INTO staff_invites (code, level, expires_at) VALUES ('x2', 2, '2099-01-01'), ('x3', 3, '2099-01-01')");
  for (const s of splitSql(readFileSync(new URL('../migrations/0007_two_levels.sql', import.meta.url), 'utf8'))) db.exec(s);
  assert.deepEqual(db.prepare('SELECT level FROM staff ORDER BY name').all().map((r) => r.level), [1, 1, 4, 4]);
  assert.deepEqual(db.prepare('SELECT DISTINCT level FROM staff_invites').all().map((r) => r.level), [1]);
});

test('8つ目のマイグレーション：スタッフごとの権限。前に占い師だった人には占いが戻る', () => {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_invites_rules.sql', '0003_tax_negative.sql', '0004_photos.sql', '0005_game_names.sql', '0006_lucky_fee.sql']) {
    for (const s of splitSql(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'))) db.exec(s);
  }
  db.exec("INSERT INTO staff (id, name, level, code_hash, code_salt) VALUES (1, 'teller', 2, 'h', 's'), (2, 'staff', 1, 'h', 's'), (3, 'joined', 2, 'h', 's')");
  db.exec("INSERT INTO audit_log (staff_id, action, target, detail) VALUES (1, 'スタッフ追加', 'staff:1', 'teller 占い師'), (3, '招待から登録', 'staff:3', 'joined 占い師（招待 5）')");
  for (const f of ['0007_two_levels.sql', '0008_staff_perms.sql']) for (const s of splitSql(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'))) db.exec(s);
  const rows = db.prepare('SELECT name, level, perms FROM staff ORDER BY id').all();
  assert.deepEqual(rows.map((r) => [r.name, r.level, r.perms && JSON.parse(r.perms).includes('fortune')]), [['teller', 1, true], ['staff', 1, null], ['joined', 1, true]]);
});

test('9つ目のマイグレーション：ブラックボックスは難易度×正解・時間切れの8つ、参加費0、1分のタイマー', () => {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_invites_rules.sql', '0003_tax_negative.sql', '0004_photos.sql', '0005_game_names.sql', '0006_lucky_fee.sql', '0007_two_levels.sql', '0008_staff_perms.sql', '0009_blackbox.sql']) {
    for (const s of splitSql(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'))) db.exec(s);
  }
  const g = db.prepare("SELECT name, kind, fee, config FROM games WHERE slug = 'tsumi'").get();
  const c = JSON.parse(g.config);
  assert.equal(g.name, 'ブラックボックス'); assert.equal(g.kind, 'fixed'); assert.equal(g.fee, 0); assert.equal(c.timer, 60);
  assert.deepEqual(c.outcomes.map((o) => o.payout), [10, -10, 20, -20, 30, -30, 50, -50]);
});

test('10個目のマイグレーション：ストラックアウトは1球5縁、色ごとの点', () => {
  const db = new DatabaseSync(':memory:');
  const files = readdirSync(new URL('../migrations/', import.meta.url)).filter((x) => x.endsWith('.sql')).sort();
  for (const f of files.filter((f) => f < '0011')) for (const s of splitSql(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'))) db.exec(s);
  const g = db.prepare("SELECT fee, config FROM games WHERE slug = 'matoate'").get();
  const c = JSON.parse(g.config);
  assert.equal(g.fee, 0); assert.equal(c.perBall, 5);
  assert.deepEqual(Object.fromEntries(c.keys.map((k) => [k.label, k.pts])), { 赤: 50, 緑: 30, 黄: 20, 青: 10, 黒: -20, はずれ: 0 });
});

test('11個目のマイグレーション：ラッキーパネルの参加費は0', () => {
  const db = new DatabaseSync(':memory:');
  const files = readdirSync(new URL('../migrations/', import.meta.url)).filter((x) => x.endsWith('.sql')).sort();
  for (const f of files.filter((f) => f < '0012')) for (const s of splitSql(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'))) db.exec(s);
  const g = db.prepare("SELECT fee, rules FROM games WHERE slug = 'shinkei'").get();
  assert.equal(g.fee, 0);
  assert.ok(g.rules.includes('参加費なし') && !g.rules.includes('10縁。'));
});

test('マイグレーションはどれも ; で終わる（本番では後ろに記録用の文がつながるため）', () => {
  for (const f of readdirSync(new URL('../migrations/', import.meta.url)).filter((x) => x.endsWith('.sql'))) {
    const body = readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8').replace(/--.*$/gm, '').trim();
    assert.ok(body.endsWith(';'), f + ' の最後に ; がない');
  }
});
