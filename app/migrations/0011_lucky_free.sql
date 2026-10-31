-- ラッキーパネルの参加費を0縁にする（取った点・減点がそのまま増減）
UPDATE games SET fee = 0, rules = replace(rules, '参加費 10縁。', '参加費なし。') WHERE slug = 'shinkei';
