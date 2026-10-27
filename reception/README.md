# 受付システム（文化祭・クラス出し物用）

Cloudflare Workers + D1 + R2 + Workers Static Assets で動く受付・ポイントシステムです。
QRから利用者が登録すると、内部ID（自動採番）と個人URLが発行され、個人ページで
ポイント・キャラクター（60体）を確認できます。ポイントはゲーム担当・ボーナス担当・管理者が付与します。

## 構成

| パス | 内容 |
|---|---|
| `src/worker.js` | APIとページ振り分け（公開API・スタッフAPI・管理者API） |
| `src/points.js` | ポイント台帳（冪等・楽観ロック・占い済みロック）、監査ログ |
| `src/auth.js` | スタッフ判定と権限チェック（`can`） |
| `migrations/0001_init.sql` | D1のスキーマと初期データ（ゲーム4種・ボーナス2箇所・キャラ60体） |
| `public/index.html` | 登録ページ（QR→登録） |
| `public/u.html` | 個人ページ（`/u/:token` で同一テンプレートを配信） |
| `public/terminal.html` | 付与端末（ゲーム担当・ボーナス担当・管理者） |
| `public/admin.html` | 管理画面（管理者のみ） |
| `public/shared.css` | 共通スタイル（FIATイエロー基調、Noto Sans JP） |

## 権限モデル

| 種別 | できること |
|---|---|
| 管理者（admin） | すべて。`/admin`、`/terminal`、全API |
| ゲーム担当（game） | 担当ゲームの付与（最大5枠）。`fortune_perm` を付けた担当は占い完了も可能 |
| ボーナス担当（bonus） | ボーナス付与のみ（理由必須）。管理者寄りの別権限 |

- 利用者ページ（`/`、`/u/*`、`/api/register`、`/api/me/*`、`/img/*`）は公開。
- ポイント更新は「占い済み」の利用者には行えません。解除できるのは管理者のみ。
- 同じ `request_id` の付与は二重に反映されません（冪等）。
- ポイントは 0〜3000pt の範囲にクランプされます。すでに上限（3000）なら加算、下限（0）なら減算は「反映なし」としてエラー（POINT_MAX / POINT_MIN）になります。

## 0. 手元で動かす（開発）

このリポジトリでは、**`reception/` フォルダの中で**コマンドを実行します（サイト本体のLPとは別のプログラム）。Node.js 18 以上が必要です。

```bash
cd reception
npm install                             # wrangler（Cloudflareの開発ツール）を入れる
```

HTMLを直接開かず、必ず Worker 経由で開きます（`/api/*` が動くため）。

```bash
cp .dev.vars.example .dev.vars          # DEV_AUTH_EMAIL を自分のメールアドレスに書き換える
npm run db:migrate:local                # ローカルDBに 0001・0002 を適用
npx wrangler d1 execute reception-db --local --command \
  "INSERT INTO staff (access_identity, display_name, role, fortune_perm) VALUES ('owner@example.com', '管理者', 'admin', 0);"
npx wrangler dev                        # http://localhost:8787 を開く（管理画面は /admin）
```

- `DEV_AUTH_EMAIL` は、localhost で開いたときだけ有効です。デプロイ後の本番URLでは使われません。
- `.dev.vars` は Git に入れないでください。本番の認証には使いません。
- `/admin.html` や `/terminal.html` を直接開いた場合は、`/admin` `/terminal` へ転送されます。

## 1. 初期セットアップ

```bash
npm install

# D1 を作成し、表示された database_id を wrangler.toml の REPLACE_WITH_D1_DATABASE_ID に入れる
npx wrangler d1 create reception-db

# R2 バケットを作成（キャラクター画像用）
npx wrangler r2 bucket create reception-images

# スキーマ投入（本番）
npm run db:migrate:remote
```

### Claude（AI）にデプロイを頼むとき

ログインが要るので、次のどちらかで動いている Claude に頼む。

- **自分のPCの Claude**（Claude Desktop、またはリポジトリのフォルダで `claude remote-control`）。PCで `npx wrangler login` 済みならそのまま使える
- **クラウドの Claude Code**：環境の設定（セッション上部の環境メニュー → Edit）に、環境変数 `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を入れてから新しいセッションを始める。トークンはチャットに貼らない。権限は最小限に：
  - アカウント：Workers Scripts 編集、D1 編集、Workers R2 Storage 編集、Account Settings 読み取り
  - 独自ドメインを使うなら、そのゾーンの Workers Routes 編集・DNS 編集
  - 文化祭が終わったらトークンを削除する

頼む内容：「`reception/README.md` の 1〜2 を実行して `npm run deploy` までやって。最初の管理者のメールは〇〇」。Access（3）は Cloudflare のダッシュボードで設定する。

> **R2 の注意**：R2 を初めて使うときは、Cloudflare のダッシュボードで R2 を有効にする（無料枠でも支払い方法の登録を求められる）。できない場合は、キャラクター画像の機能を外す必要がある。

## 2. 最初の管理者を登録

`staff` テーブルは手で投入します。`access_identity` は Cloudflare Access がログイン時に渡すメールアドレス（小文字）です。

```bash
npx wrangler d1 execute reception-db --remote --command \
  "INSERT INTO staff (access_identity, display_name, role, fortune_perm) VALUES ('owner@example.com', '管理者', 'admin', 0);"
```

ゲーム担当・ボーナス担当の追加は、登録後に管理画面（スタッフ）から行えます。

## 3. Cloudflare Access（必須）

Access のアプリケーションを次のパスに設定し、スタッフのメールアドレスだけを許可します。

- `/admin*`（管理者）
- `/terminal*`（付与端末）
- `/api/staff/*`、`/api/points/*`（スタッフAPI）
- `/api/admin/*`（管理者API）

以下は Access の対象外（公開）にします。

- `/`、`/u/*`、`/api/register`、`/api/me/*`、`/img/*`、`/shared.css`、`/vendor/*`（QRを作るライブラリ。外部CDNに頼らないよう同梱）

作ったら、Access の設定画面にある次の2つを `wrangler.toml` の `[vars]` に入れてデプロイし直します（どちらも秘密ではありません）。

| 変数 | 入れるもの |
|---|---|
| `ACCESS_TEAM_DOMAIN` | Zero Trust のチームのドメイン（例：`keioshiki2c.cloudflareaccess.com`） |
| `ACCESS_AUD` | Access アプリケーションの「Application Audience (AUD) Tag」 |

`auth.js` は、Access が付ける署名付きのJWT（`Cf-Access-Jwt-Assertion`）を公開鍵で検証し、宛先（aud）・発行元・期限を確かめてからメールアドレスを使います。偽装できる `Cf-Access-Authenticated-User-Email` ヘッダーは信用しません。2つの変数が空のあいだは、本番では誰もスタッフになれません（安全側に倒している）。

> **独自ドメインが必要。** Access をパスごと（`/admin*` だけ等）に掛けるには、Cloudflare に登録した独自ドメインでこの Worker を公開する必要があります。`*.workers.dev` のままだと、Access は「サイト全体」にしか掛けられず、お客さんが登録できなくなります。

## 4. 登録の保護（レート制限）

Cloudflare の Rate Limiting Rules で `POST /api/register` に制限を掛けてください（例：同一IPから 1分あたり 10 回まで）。
人数上限と受付停止は、Worker 側の `settings`（`max_users` / `registration_open`）で管理されます。

## 5. デプロイ

```bash
npm run deploy          # 本番
npx wrangler dev        # ローカル確認（ローカルDBは db:migrate:local で作成）
```

## 6. 運用

- **QRの印刷**：各利用者の個人QRは、個人ページ（`/u/<token>`）上に自動表示されます。登録直後に表示されたQRを保存・印刷してください。
- **URL再発行**：管理画面の利用者詳細から行えます。旧URLは無効になるため、QRの印刷し直しが必要です。
- **占い完了の解除**：管理者のみ。理由は操作ログに残ります。
- **配色**：管理画面の「受付・テーマ」で「利用者の変更」をオンにすると、利用者が個人ページで7種類のプリセットから選べます。オフのときは全体テーマが全員に適用されます。占い済みの人は変更できません（サーバー側でも拒否）。
- **バックアップ**：`npx wrangler d1 export reception-db --remote --output backup.sql` を定期的に実行してください。
- **ログ**：管理画面の「ログ・出力」に直近200件の操作が表示されます。

## 7. 既知の未対応・注意点

- Access の JWT 検証は実装済み（上記3）。`[vars]` の2つを入れるまで、本番ではスタッフ画面が使えない。
- ボーナス付与は「取得記録」と「ポイント反映」の2段階で、途中失敗時は取得記録を戻す補償処理です（D1 のバッチ化を検討の余地あり）。
- 占いは `games` テーブルの行ではなく、`fortune_perm` を持つゲーム担当が完了させる操作です。
- 占い担当はゲーム担当の5枠の中に含めてください（枠数は `role = 'game'` の人数で数えます）。
- 管理画面のキャラクター画像は PNG / WebP、2MB 以下です。
- 個人URLは推測されにくいランダムトークンです。ページ自体は公開のため、URL（QR）を持つ人は誰でも閲覧できます。

## 8. 検証状況

**2026-10-27 手元（`wrangler dev`・ローカルのD1/R2）で動作確認済み。** 登録→個人ページ→付与端末でゲーム付与→同じ request_id の二重送信→ボーナス1回限り→3000上限→占い完了でロック→管理者の解除→キャラ画像のアップロードと表示、を実際に操作して確認した。その際に直したもの：

- `/u/<token>`・`/terminal`・`/admin` が開けなかった（静的ファイルを `.html` 付きで取り出すと、Cloudflare 側が `.html` なしのURLへ転送するため。個人ページはトークンが消え、端末と管理画面は無限に転送されていた）→ `.html` なしで取り出すよう修正（`src/worker.js`）
- QRを作るライブラリを外部CDNから読んでいたため、CDNに届かない回線では登録は済むのにQRとURLが表示されず、二重登録の原因になった → `public/vendor/qrcode.js` に同梱（qrcode-generator 1.4.4・MIT）
- 付与端末で「占い済み」の札と占い完了ボタンが常に出ていた（`hidden` が CSS の `display` に負けていた）→ `shared.css` に `[hidden]` の指定を追加
- 付与端末で「付与しました」がすぐ消えていた → 付与後の読み直しでは消さないよう修正
- 付与端末の検索結果でニックネームをHTMLとして表示していた → エスケープして表示

以下は元の記載：

- 構文チェック（`node --check`）は全ファイルで通過。
- D1・R2・Access を実際に接続した動作確認は未実施です。デプロイ後にステージング（別の D1・R2）で、登録・付与・占い完了・上限到達・ボーナス重複の各操作を確認してください。
