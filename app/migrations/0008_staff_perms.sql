-- スタッフごとに、できることをオン・オフする（perms：JSON の配列。NULL なら決まりの組み合わせ＝占い以外ぜんぶ）
-- 占いは特殊権限：決まりの組み合わせには入らない。管理者は perms に関係なく全部できる
ALTER TABLE staff ADD COLUMN perms TEXT;
ALTER TABLE staff_invites ADD COLUMN perms TEXT;

-- 権限を2つにまとめる前（0007）に「占い師」だった人には、記録から占いを戻す
UPDATE staff SET perms = '["reception","games","fortune","adjust","cards","photo"]'
 WHERE level = 1 AND (
   id IN (SELECT CAST(substr(target, 7) AS INTEGER) FROM audit_log WHERE action = '招待から登録' AND detail LIKE '% 占い師（招待%')
   OR id IN (SELECT CAST(substr(target, 7) AS INTEGER) FROM audit_log WHERE action = 'スタッフ追加' AND detail LIKE '% 占い師')
   OR id IN (SELECT CAST(substr(target, 7) AS INTEGER) FROM audit_log WHERE action = 'スタッフ変更' AND detail LIKE '%"level":2%')
 )
