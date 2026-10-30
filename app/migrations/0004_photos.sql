-- 写真展：撮った写真をお客さんに渡す（photo.moneytalks-uranai.com）
-- お客さんは名前とパスワードを自分で決める。写真の中身は Durable Object（PhotoStore）に置き、ここには目録だけ

CREATE TABLE photo_guests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash     TEXT NOT NULL,
  pass_salt     TEXT NOT NULL,
  created_by    INTEGER REFERENCES staff(id),   -- 撮影係の端末で登録したとき
  fail_count    INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE photos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id    INTEGER NOT NULL REFERENCES photo_guests(id),
  staff_id    INTEGER REFERENCES staff(id),
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  bytes       INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_photos_guest ON photos (guest_id, id);

INSERT OR IGNORE INTO settings (key, value) VALUES ('photo_title', '写真展');
