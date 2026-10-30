-- ミニゲームの名前を変える：的当て→ストラックアウト、積み→ブラックボックス、神経衰弱→ラッキーパネル
-- 並び：ストラックアウト・チンチロ・ブラックボックス・ラッキーパネル
-- ラッキーパネルは、取った点・引かれた点をその場で足し引きして払い戻す（config.score）
-- 管理画面で名前やルールを変えていたら、そのまま残す

UPDATE games SET name = 'ストラックアウト', kana = 'すとらっくあうと',
  rules = 'ボールを投げて、パネルを狙います。当たった場所で払い戻しが決まります。
・参加費 10縁
・はずれ 0縁／外側 20縁／中 30縁／内側 40縁／中心 50縁
・投げる位置はスタッフが案内します'
 WHERE slug = 'matoate' AND name = '的当て';

UPDATE games SET name = 'ブラックボックス', kana = 'ぶらっくぼっくす'
 WHERE slug = 'tsumi' AND name = '積み';
UPDATE games SET rules = 'ルールは担当のスタッフが説明します。
・参加費 100縁'
 WHERE slug = 'tsumi' AND rules LIKE 'ブロックを1つずつ積んでいき%';

UPDATE games SET name = 'ラッキーパネル', kana = 'らっきーぱねる',
  config = '{"score":true,"levels":[{"name":"難易度1","memorize":20,"miss":-10},{"name":"難易度2","memorize":30,"miss":-20},{"name":"難易度3","memorize":40,"miss":-30}],"plus":[10,20,30,50]}',
  rules = 'カードを覚えて、同じカードを2枚めくるとポイントゲット。
・参加費 50縁。取ったポイントが、そのまま縁で戻ります（マイナスなら、さらに引かれます）
・ドラキーをめくると減点：難易度1 −10／難易度2 −20／難易度3 −30
・違うカードをめくったり、ドラキーをめくったりするとお手つき
・ラッキーカードを取ると、お手つきしてもいい回数が増えます
・覚える時間：難易度1 20秒／難易度2 30秒／難易度3 40秒'
 WHERE slug = 'shinkei' AND name = '神経衰弱';

UPDATE games SET sort = 1 WHERE slug = 'matoate';
UPDATE games SET sort = 2 WHERE slug = 'chinchiro';
UPDATE games SET sort = 3 WHERE slug = 'tsumi';
UPDATE games SET sort = 4 WHERE slug = 'shinkei';
