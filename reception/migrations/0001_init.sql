-- 受付システム 初期スキーマ（設計書 v1.0 + 改訂：ニックネーム重複可／占い済みフラグ／スタッフ種別）

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('max_users', '300'),
  ('registration_open', '1'),
  ('theme', 'fiat');

-- スタッフ（Cloudflare Access の個人IDと紐づけ）
-- role: admin = 管理者 / game = ゲーム担当（最大5枠） / bonus = ボーナス担当
CREATE TABLE staff (
  id              INTEGER PRIMARY KEY,
  access_identity TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin','game','bonus')),
  fortune_perm    INTEGER NOT NULL DEFAULT 0,   -- 占い完了権限（game 種別のみ有効）
  active          INTEGER NOT NULL DEFAULT 1
);

-- 担当ゲーム（game 種別）。game_id 5 は「占い」（games テーブルにはない）
CREATE TABLE staff_games (
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  game_id  INTEGER NOT NULL,
  PRIMARY KEY (staff_id, game_id)
);

CREATE TABLE games (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  outcomes_json TEXT NOT NULL,   -- [{"name":"当たり","delta":30}, ...]
  enabled       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE bonuses (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  points     INTEGER NOT NULL,
  repeatable INTEGER NOT NULL DEFAULT 0,
  enabled    INTEGER NOT NULL DEFAULT 1
);

-- 利用者：ニックネームは重複可。判別は内部ID・個人トークン（QR）で行う
CREATE TABLE users (
  id              INTEGER PRIMARY KEY,           -- 内部ID（No.・自動採番）
  nickname        TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,          -- 個人URL・個人QR
  points          INTEGER NOT NULL DEFAULT 0 CHECK (points BETWEEN 0 AND 3000),
  fortune_done    INTEGER NOT NULL DEFAULT 0,    -- 占い済み（1でポイント更新を停止）
  fortune_done_at TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_users_nickname ON users (nickname);

-- ポイント台帳（履歴は消さない。取り消しは逆符号の行を追加）
CREATE TABLE point_transactions (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  requested_delta INTEGER NOT NULL,
  applied_delta   INTEGER NOT NULL,              -- 0〜3000 の範囲で実際に反映された増減
  source_type     TEXT NOT NULL CHECK (source_type IN ('game','bonus','admin','undo')),
  game_id         INTEGER,
  bonus_id        INTEGER,
  outcome         TEXT,
  reason          TEXT,
  operator_id     INTEGER REFERENCES staff(id),
  request_id      TEXT NOT NULL UNIQUE,          -- 二重送信対策（端末が生成）
  reverts_tx_id   INTEGER REFERENCES point_transactions(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_tx_user ON point_transactions (user_id);

-- ボーナス取得記録（1回限りのボーナスの二重付与を防ぐ）
CREATE TABLE bonus_claims (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  bonus_id   INTEGER NOT NULL REFERENCES bonuses(id),
  reason     TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, bonus_id)
);

-- キャラクター（60体）。閾値は 0, 50, ..., 2950（管理画面で変更可能）
CREATE TABLE characters (
  no        INTEGER PRIMARY KEY CHECK (no BETWEEN 1 AND 60),
  name      TEXT NOT NULL,
  image_key TEXT,                                -- R2 のキー
  threshold INTEGER NOT NULL UNIQUE CHECK (threshold BETWEEN 0 AND 3000)
);
INSERT INTO characters (no, name, threshold)
WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM c WHERE n < 60)
SELECT n, 'キャラ' || n, (n - 1) * 50 FROM c;

-- 初期ゲーム（4種）・ボーナス（2箇所）
INSERT INTO games (id, name, outcomes_json, enabled) VALUES
  (1, '射的',     '[{"name":"当たり","delta":30},{"name":"はずれ","delta":-10}]', 1),
  (2, '輪投げ',   '[{"name":"成功","delta":20},{"name":"失敗","delta":-5}]', 1),
  (3, 'ボール投げ', '[{"name":"ストライク","delta":50},{"name":"ボール","delta":0}]', 1),
  (4, 'クイズ',   '[{"name":"正解","delta":15},{"name":"不正解","delta":-3}]', 1);

INSERT INTO bonuses (id, name, points, repeatable, enabled) VALUES
  (1, '1箇所目（入口）', 100, 0, 1),
  (2, '2箇所目（撮影スポット）', 50, 0, 1);

-- 監査ログ（誰がいつ何をしたか）
CREATE TABLE audit_logs (
  id         INTEGER PRIMARY KEY,
  actor_id   INTEGER REFERENCES staff(id),
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
