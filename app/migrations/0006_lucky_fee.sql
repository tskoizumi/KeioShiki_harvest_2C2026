-- ラッキーパネルの参加費を10縁にする
UPDATE games SET fee = 10, rules = replace(rules, '参加費 50縁', '参加費 10縁') WHERE slug = 'shinkei';
