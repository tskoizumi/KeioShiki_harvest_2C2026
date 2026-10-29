-- 運命、賄賂で買いませんか？ — 受付・縁・占いのデータベース
-- 金額の単位はすべて「縁」（整数）。残高は users.balance が正、履歴は ledger に全部残す。

-- 当日に変える設定（改竄の閾値・初期配布など）
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('starting_en',        '100'),    -- 受付で配る縁
  ('registration_open',  '1'),      -- 0 で受付停止
  ('max_users',          '600'),
  ('rank_sho',           '100'),    -- 心付けの位の下限（無は0）
  ('rank_dai',           '500'),
  ('rank_kaizan',        '2000'),   -- 改竄の閾値。昼に上げ下げする
  ('first_title',        '神託を買った者'),   -- 賄賂番付1位の称号
  ('rich_title',         '縁の長者'),         -- 所持金番付1位の称号
  ('ranking_size',       '10');

-- スタッフ。権限はピラミッド型：level が大きいほど下の権限も全部持つ
--   1 = staff   両替商・受付（ゲームの開始と結果、登録、QR読取）
--   2 = teller  占い師（＋占い）
--   3 = manager 責任者・遊軍（＋残高調整、ゲームと設定の変更、印刷用QRの発行）
--   4 = admin   管理者（＋スタッフ管理、監査ログ、書き出し）
CREATE TABLE staff (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  level        INTEGER NOT NULL CHECK (level BETWEEN 1 AND 4),
  code_hash    TEXT NOT NULL,                 -- ログイン用の合言葉（PBKDF2）
  code_salt    TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  fail_count   INTEGER NOT NULL DEFAULT 0,    -- ログイン失敗の回数（5回で1分ロック）
  locked_until TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 客。token がマイページのURL（QRの中身）。short_code は印刷QRの札に書く短い番号
CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  short_code  TEXT NOT NULL UNIQUE,
  nickname    TEXT,                            -- NULL = 印刷QRがまだ誰にも渡っていない
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  source      TEXT NOT NULL DEFAULT 'self' CHECK (source IN ('self','staff','card')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at  TEXT
);
CREATE INDEX ix_users_nickname ON users (nickname);

-- 縁の台帳。残高の増減は必ずここを通る（消さない。取り消しは逆の行を足す）
CREATE TABLE ledger (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  delta         INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('grant','fee','payout','refund','bribe','adjust')),
  ref_type      TEXT,                          -- 'play' | 'reading' | NULL
  ref_id        INTEGER,
  staff_id      INTEGER REFERENCES staff(id),
  note          TEXT,
  request_id    TEXT NOT NULL UNIQUE,          -- 二重送信対策（端末が作る）
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_ledger_user ON ledger (user_id, id DESC);

-- ミニゲーム。kind で結果の入れ方が変わる
--   fixed : 参加費固定、結果ボタンから払い戻し額を選ぶ（的当て・神経衰弱）
--   stack : 参加費固定、積んだ段数 × per_level（積み）
--   bet   : 賭け金を客が決め、結果の倍率を掛ける（チンチロ）
CREATE TABLE games (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  kana        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('fixed','stack','bet')),
  fee         INTEGER NOT NULL DEFAULT 0,      -- fixed / stack の参加費
  min_bet     INTEGER NOT NULL DEFAULT 0,      -- bet の下限
  max_bet     INTEGER NOT NULL DEFAULT 0,      -- bet の上限（0 = 残高まで）
  config      TEXT NOT NULL,                   -- JSON。結果の選択肢など
  role_label  TEXT NOT NULL DEFAULT '',
  enabled     INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0
);
INSERT INTO games (id, slug, name, kana, kind, fee, min_bet, max_bet, config, role_label, sort) VALUES
  (1, 'matoate',   '的当て',   'まとあて',         'fixed', 10,  0,  0,
   '{"outcomes":[{"label":"はずれ","payout":0},{"label":"外側","payout":20},{"label":"中","payout":30},{"label":"内側","payout":40},{"label":"中心","payout":50}]}',
   '手堅い', 1),
  (2, 'shinkei',   '神経衰弱', 'しんけいすいじゃく', 'fixed', 50,  0,  0,
   '{"outcomes":[{"label":"0組","payout":0},{"label":"1組","payout":50},{"label":"2組","payout":100},{"label":"3組","payout":150},{"label":"4組以上","payout":200}]}',
   '記憶力', 2),
  (3, 'tsumi',     '積み',     'つみ',             'stack', 100, 0,  0,
   '{"per_level":50,"max_level":20}',
   'みんなで', 3),
  (4, 'chinchiro', 'チンチロ', 'ちんちろ',         'bet',   0,   10, 0,
   '{"outcomes":[{"label":"負け","mult":0},{"label":"目なし（引き分け）","mult":1},{"label":"勝ち","mult":2},{"label":"ゾロ目","mult":3},{"label":"4-5-6","mult":4},{"label":"ピンゾロ","mult":5}]}',
   '一発逆転', 4);

-- ゲームのプレイ1回分。開始で参加費（or 賭け金）を引き、結果でそのぶん払い戻す
CREATE TABLE plays (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  game_id     INTEGER NOT NULL REFERENCES games(id),
  staff_id    INTEGER NOT NULL REFERENCES staff(id),
  stake       INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'playing' CHECK (status IN ('playing','done','void')),
  result      TEXT,                            -- JSON。押したボタン・段数など
  payout      INTEGER NOT NULL DEFAULT 0,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX ix_plays_user ON plays (user_id, id DESC);
CREATE INDEX ix_plays_open ON plays (status) WHERE status = 'playing';

-- 占い1回分。心付け（bribe）は始めに受け取り、位（rank）が決まる
CREATE TABLE readings (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  staff_id    INTEGER NOT NULL REFERENCES staff(id),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','void')),
  bribe       INTEGER NOT NULL DEFAULT 0,
  rank        TEXT,                            -- mu | sho | dai | kaizan
  sou_id      TEXT,
  sou_name    TEXT,
  kizashi_id  TEXT,
  kizashi_name TEXT,
  answers     TEXT,                            -- JSON {judge:[9], mention:[10]}
  script      TEXT,                            -- JSON。組み立てた台本
  oracle      TEXT,                            -- シェア画像に載る一行
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE INDEX ix_readings_user ON readings (user_id, id DESC);
CREATE INDEX ix_readings_done ON readings (status, bribe DESC);

-- 誰がいつ何をしたか
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY,
  staff_id   INTEGER REFERENCES staff(id),
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
