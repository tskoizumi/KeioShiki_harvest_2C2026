-- ブラックボックス：箱の中を見ずに手を入れ、手触りだけで中身を当てる
-- 難易度 C〜S はお客さんが選ぶ。制限時間1分以内に当てれば C 10・B 20・A 30・S 50 縁、時間切れなら同じだけ失う
-- 参加費は 0（得点がそのまま増減）。timer はスタッフ画面のタイマーの秒数
UPDATE games SET kind = 'fixed', fee = 0,
  config = '{"timer":60,"outcomes":[{"label":"C 正解","payout":10},{"label":"C 時間切れ","payout":-10},{"label":"B 正解","payout":20},{"label":"B 時間切れ","payout":-20},{"label":"A 正解","payout":30},{"label":"A 時間切れ","payout":-30},{"label":"S 正解","payout":50},{"label":"S 時間切れ","payout":-50}]}',
  role_label = '運だめし',
  rules = '箱の中を見ずに手を入れて、手触りだけで中身が何かを当てます。
・参加費なし
・難易度は C・B・A・S から自分で選びます
・制限時間は1分。時間内に当てると C 10縁／B 20縁／A 30縁／S 50縁
・時間切れになると、その難易度で当てたときと同じだけ縁を失います'
 WHERE slug = 'tsumi';
