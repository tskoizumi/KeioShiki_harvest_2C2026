-- 印刷したQRカード30枚（assets/print/qr-cards.py で作ったもの）を、登録リンクなしで使えるようにする
-- QRの中身（マイページの鍵になる文字列）は公開リポジトリに置けないので、その SHA-256 だけを 'h:' を付けて入れておく
-- カードのQRが初めて読まれたとき、サーバーが照合して本物の文字列に置き換える（src/routes/public.js の findUserByToken）
-- 番号はカードに印刷されているもの。受付で番号を入れて名前をつけることもできる
-- すでに登録リンクで入れていたカードは、番号が同じなので入れない（OR IGNORE）
INSERT OR IGNORE INTO users (token, short_code, source) VALUES
  ('h:905df2e7072d5832f8f0d7afec4d3765d842f6af74d119ba12ac2420569f0369', 'ADDYBJ', 'card'),
  ('h:3db9407e6aecb7b7495e6def93377a714154e665fe7aaf623a17145ed15d795e', 'R9VN2N', 'card'),
  ('h:cbaea4fc4430a3b738b305bde931366e63fe65474db3e699ef4fa4270ddb126b', 'X35YWE', 'card'),
  ('h:200f6e4c86ab310e8fc2b916746bab0f8fab1c7a2bc44c3fa38cedf3233d3b33', 'HHNUZ8', 'card'),
  ('h:fb169fffa0068601827100a361d16e9248424141b1dfc19ec734ab1913d93a91', 'P5H29N', 'card'),
  ('h:960f53cd9165fc53bbb9323b25d74456eedd4a46148786926d6e2f53e976447f', 'UEMH5T', 'card'),
  ('h:613a88e8251de2853f7481a145aec5a5ae3f67d3075655d5e3e942717c5e9b7e', 'RS7B7F', 'card'),
  ('h:fc52c25f033098a1423497c1fbc60dd6c113ddeb758d81e2cee23eb8d963a6a7', 'X757X9', 'card'),
  ('h:32345925d8d2477c9d82e59e2f7095071fdf7b31175710c74e9e1e6a26ac070e', 'CVHEHC', 'card'),
  ('h:4bfc5a71771769f66fec64ecda5392d77d856d3110ab67a0f8f14d1515692853', 'US3YWT', 'card'),
  ('h:1256fe77eadfe8eea6a562658eac0d373e21d7442904362088d1909b65459766', 'WKB8RD', 'card'),
  ('h:e9603a3d40f698be5d2b35ddd0544956be615b4f327e9009f1acbe193982f843', 'QJX6XV', 'card'),
  ('h:37a683d69ee50d8060a850d6f44a4fc1c2d8d86c99c6a4e5934f98ff4f9bad92', '6QZ8KE', 'card'),
  ('h:eefe3012821bbb7e5cbae9496e64080e2453b0c2edd28ad081c977dc325a6d4a', 'FRB8FJ', 'card'),
  ('h:dde798c3fbddd922eafac9c9c5d37cf35881ca34542f38e58645562b39d50f60', '53F9SU', 'card'),
  ('h:6c0b8f85c3f90a43fa6eb337da73c22c5e32557e56c6bdf2785bf34c248b8a21', '7HBQ6C', 'card'),
  ('h:a25666a538c6980629be953fbb08fc205ffd884b95ba5d2beb493c63cd56675b', 'V72B7E', 'card'),
  ('h:304e1d867ec5ee7d1ec251a5951ce5b69b3384da288d40dc8ba511b56e887c7d', '9B2FW8', 'card'),
  ('h:d1f105b3a8aa864b9bad0012917f4d8e97f6a66e4214d9cc74988b0a8983a003', 'ZRPNHB', 'card'),
  ('h:53c3c0cfb45af8fe95d4b224344e3d8b10934c5c1ab412eab25474aa744064bd', 'G8FVE2', 'card'),
  ('h:c27e20ab3d323e9759ae89b1e3931490c189e5bade060242285aa6a9332c526d', 'KATFCJ', 'card'),
  ('h:7ca67523ea3bd99efd9bc6636c8e6c6fdcafa4011787dd8c572b38d314c6d33d', 'BPA2V5', 'card'),
  ('h:77282c9c3354774646c9912c5679ece46a27e819aa15824f3391740bf82d50b5', 'GA8KQH', 'card'),
  ('h:c84274beda8d98f9a4d890fba1c96fc0910023d987c9080b6c15a726ce4df79f', 'QSG6K7', 'card'),
  ('h:30d23e81f42f26a11538ce1b982b3c779172ebb8e1aa432fd11d2b2414cdee0c', 'BWNKGQ', 'card'),
  ('h:b127592457002e92876df1dc35139f48404544798ce0d6abd9e4ca597187074d', 'HMWWXG', 'card'),
  ('h:8feee04ad42d6f201093df33d4f7a8f6c602b10e49bccb2cd4d9b049c6bbbe61', 'Z6NRDS', 'card'),
  ('h:65ed8db05b763c2423cde5eaea4b1ff09def4f6e54e96a497623677d12600e7d', 'JD6DQ6', 'card'),
  ('h:fb770aed43c786c50b73d9956e8d9f4ce9f8fe519ba41969bf969e0439e5af41', 'TYE234', 'card'),
  ('h:fa0f943793142ec9d49788890fd7b9a4fe04cef747b1976ed097c45fb3bf2746', '3SZABW', 'card');
