-- スタッフの権限を2つにまとめる：スタッフ（1）と管理者（4）
-- 占い師（2）はスタッフに、責任者（3）は管理者に。まだ使える招待は、どれもスタッフの招待にする
UPDATE staff SET level = 1 WHERE level = 2;
UPDATE staff SET level = 4 WHERE level = 3;
UPDATE staff_invites SET level = 1 WHERE level IN (2, 3);
