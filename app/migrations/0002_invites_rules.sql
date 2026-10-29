-- スタッフの招待（QRを読んだ人が自分で登録する）と、ゲームのルール

-- 招待。管理する人が権限を決めて作り、そのQR（/staff/join?c=code）を配る
CREATE TABLE staff_invites (
  id         INTEGER PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  level      INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
  created_by INTEGER REFERENCES staff(id),
  max_uses   INTEGER NOT NULL DEFAULT 50,
  uses       INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 招待から登録した人を残す
ALTER TABLE staff ADD COLUMN invite_id INTEGER REFERENCES staff_invites(id);

-- ゲームのルール（客の画面とスタッフの画面の「ルール」に出る。管理画面で直せる）
ALTER TABLE games ADD COLUMN rules TEXT NOT NULL DEFAULT '';
UPDATE games SET rules = '的にボールを投げて、当たった場所で払い戻しが決まります。
・参加費 10縁
・はずれ 0縁／外側 20縁／中 30縁／内側 40縁／中心 50縁
・投げる位置はスタッフが案内します' WHERE slug = 'matoate';
UPDATE games SET rules = '裏返したカードを2枚ずつめくって、同じ絵をそろえます。
・参加費 50縁
・そろえた組の数で払い戻し：0組 0縁／1組 50縁／2組 100縁／3組 150縁／4組以上 200縁
・制限時間はスタッフが伝えます' WHERE slug = 'shinkei';
UPDATE games SET rules = 'ブロックを1つずつ積んでいき、崩れたところで終わりです。
・参加費 100縁
・崩れる前に積めた段数 × 50縁が戻ります（最大 20段）
・友達と交代で積んでもかまいません' WHERE slug = 'tsumi';
UPDATE games SET rules = 'サイコロを3つ振って、出た目で勝負します。
・賭け金は自分で決めます（10縁から）
・負け 0倍／目なし（引き分け）1倍／勝ち 2倍／ゾロ目 3倍／4-5-6 4倍／ピンゾロ（1が3つ）5倍
・賭け金 × 倍率が戻ります' WHERE slug = 'chinchiro';
