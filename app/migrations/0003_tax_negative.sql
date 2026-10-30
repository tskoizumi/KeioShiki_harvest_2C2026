-- 資産区分（お金持ちほどゲームの倍率が下がる）と、マイナスの倍率（ションベン・ヒフミ）

-- プレイを始めたときの資産区分（1, 2, 3 …）。倍率はこの数で割る
ALTER TABLE plays ADD COLUMN tax_div INTEGER NOT NULL DEFAULT 1;

-- 資産区分の境目（残高、縁）。「1000,3000」なら 〜999 が区分1、1000〜2999 が区分2、3000〜 が区分3
INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_brackets', '1000,3000,6000,10000');

-- チンチロにションベンとヒフミを足す（最初のままの設定のときだけ。管理画面で変えていたら触らない）
UPDATE games SET config = '{"outcomes":[{"label":"ヒフミ","mult":-2},{"label":"ションベン","mult":-1},{"label":"負け","mult":0},{"label":"目なし（引き分け）","mult":1},{"label":"勝ち","mult":2},{"label":"ゾロ目","mult":3},{"label":"4-5-6","mult":4},{"label":"ピンゾロ","mult":5}]}'
 WHERE slug = 'chinchiro'
   AND config = '{"outcomes":[{"label":"負け","mult":0},{"label":"目なし（引き分け）","mult":1},{"label":"勝ち","mult":2},{"label":"ゾロ目","mult":3},{"label":"4-5-6","mult":4},{"label":"ピンゾロ","mult":5}]}';

UPDATE games SET rules = 'サイコロを3つ振って、出た目で勝負します。
・賭け金は自分で決めます（10縁から）
・戻る額 ＝ 賭け金 × 倍率
・ヒフミ（1-2-3）×−2／ションベン（サイコロが器から出た）×−1：賭け金を失ったうえ、さらに払う
・負け 0倍／目なし 1倍／勝ち 2倍／ゾロ目 3倍／4-5-6 4倍／ピンゾロ 5倍
・お金持ちほど、勝ったときの倍率が下がります（資産区分）。残高1,000縁から ÷2、3,000縁から ÷3、6,000縁から ÷4、10,000縁から ÷5。ただし勝ちが1倍より下がることはありません'
 WHERE slug = 'chinchiro' AND rules LIKE 'サイコロを3つ振って%';
