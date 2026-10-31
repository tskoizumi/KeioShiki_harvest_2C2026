-- 占いを全員ができるようにする（決まりの組み合わせにも入れた：src/auth.js の PERMS）
-- 1人ずつ決めてあったスタッフと、まだ使える招待にも「占い」を足す
UPDATE staff SET perms = json_insert(perms, '$[#]', 'fortune') WHERE perms IS NOT NULL AND perms NOT LIKE '%"fortune"%';
UPDATE staff_invites SET perms = json_insert(perms, '$[#]', 'fortune') WHERE perms IS NOT NULL AND perms NOT LIKE '%"fortune"%';
