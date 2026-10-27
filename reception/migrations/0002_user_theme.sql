-- 0002: 利用者ごとのテーマ（プリセットから選択）
-- users.theme が NULL の人は全体テーマ（settings.theme）に従う
ALTER TABLE users ADD COLUMN theme TEXT;

-- 利用者による配色変更の可否（既定は「不可」。管理画面で有効にする）
INSERT INTO settings (key, value)
SELECT 'allow_user_theme', '0'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'allow_user_theme');
