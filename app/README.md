# app/ — 受付・縁・占いのシステム

「運命、賄賂で買いませんか？」の、客のマイページ・ミニゲーム・占い・番付・スタッフ画面。
Cloudflare Workers ＋ D1 で動く。ビルドなし（wrangler がそのまま配信する）。

- 本番: `https://app.moneytalks-uranai.com/`
- LP（別サイト）: `https://moneytalks-uranai.com/`（リポジトリのルート）

## 画面

| URL | 誰が | 何をする |
| --- | --- | --- |
| `/` | 客 | ニックネームを入れて登録。マイページのQRがもらえる。登録済みの端末ならマイページへ飛ぶ |
| `/u/<token>` | 客 | マイページ。残高・QR・履歴・占いの結果とシェア用カード・番付。初めて開く端末では名前を入れて本人確認 |
| `/staff` | スタッフ | ログイン → 客を探す（カメラでQR読取）・ゲームの開始と結果・占い・受付・管理 |
| `/staff/cards` | 責任者以上 | スマホを持っていない客に渡す札（QR＋番号）を発行して印刷 |

## 客の流れ

1. **登録**。スマホがある客は受付のQR（`/`）を読んで自分で登録。ない客は、印刷した札を受付で渡し、スタッフが名前を紐づける（客が札のQRを読んで自分で名前を入れてもいい）
2. **ミニゲーム**。客がマイページの「QRを見せる」→ スタッフが読み取る → ゲームを開始（参加費か賭け金をその場で引く）→ 終わったらスタッフが結果ボタンを押す → 払い戻しが残高に入る。マイページは数秒で追いつく
3. **占い**。占い師がQRを読み取り、心付けを受け取る（額で位が決まる）→ 質問の答えと引いた兆を入れる → 台本が出るので読み上げる → 「占い終了」でマイページに結果とカードが出る。何回でも占える
4. **番付**。賄賂（心付けの合計）と所持金。マイページと LP に出る

## スタッフの権限（ピラミッド型）

| level | 名前 | できること |
| --- | --- | --- |
| 1 | スタッフ | 客を探す、受付（登録・札の紐づけ）、ゲームの開始・結果・取消 |
| 2 | 占い師 | ＋ 占い（心付け・質問・兆・台本・終了・取りやめ） |
| 3 | 責任者 | ＋ 残高の調整、客の無効化、ゲームと設定の変更、札の発行 |
| 4 | 管理者 | ＋ スタッフの管理、操作ログ、CSV書き出し |

上の権限は下の権限を全部含む。スタッフは管理画面から追加する（名前と合言葉）。

## 手元で動かす

```bash
cd app
npm install
cp .dev.vars.example .dev.vars        # 手元用の秘密（そのままでも動く）
npm run db:migrate:local               # ローカルのDBを作る
npm run dev                            # http://127.0.0.1:8788
```

初回は `/staff` を開くと「最初の管理者を作る」画面になる。`.dev.vars` の `SETUP_CODE`（既定 `setup-1234`）と、自分の名前・合言葉を入れる。

`npm test` で占いの組み立て・払い戻し・位の計算のテストが走る。

## 本番に出す（GitHub Actions）

`main` に `app/` の変更が入ると、`.github/workflows/deploy-app.yml` が自動でデプロイする。最初に一度だけ、GitHub の **Settings → Secrets and variables → Actions** に4つ入れる。

| Secret | 中身 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token（Custom）。権限：Account の **Workers Scripts: Edit**・**D1: Edit**・**Account Settings: Read**、Zone（moneytalks-uranai.com）の **Workers Routes: Edit**・**DNS: Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | ダッシュボードの Workers & Pages 画面の右側に出ているID |
| `APP_SESSION_SECRET` | 長いランダム文字列（30文字以上）。スタッフのログインの署名に使う |
| `APP_SETUP_CODE` | 最初の管理者を作るときの合言葉。作ったあとは使わない |

ワークフローは、D1 がなければ作り、マイグレーションを当て、Worker を `app.moneytalks-uranai.com` にデプロイし、秘密を入れる。手動で動かすときは Actions → Deploy app → Run workflow。

デプロイ後、`https://app.moneytalks-uranai.com/staff` を開いて最初の管理者を作る。それから LP の `config.js` に次を入れる：

```js
resultUrl:  "https://app.moneytalks-uranai.com/",
rankingUrl: "https://app.moneytalks-uranai.com/api/ranking",
```

`wrangler.toml` は `workers_dev = false`（`*.workers.dev` のURLは閉じている）。独自ドメインの Zone がアカウントにないとデプロイは失敗する。

### 手元から直接デプロイする場合

```bash
npx wrangler login
npx wrangler d1 create moneytalks-db     # 出た database_id を wrangler.toml に入れる
npm run db:migrate:remote
npx wrangler secret put SESSION_SECRET
npx wrangler secret put SETUP_CODE
npm run deploy
```

## 当日の運用

- **改竄の閾値**などの設定は `/staff` の「管理」で変えられる（責任者以上）。LP の表示とは別なので、LP 側の `config.js` の `kaizanThreshold` も合わせる
- **受付を止める**：管理 → 受付のチェックを外す
- **ゲームの点数**：管理 → ゲーム。結果ボタンの名前と払い戻し、チンチロの倍率、積みの1段あたりを変えられる
- **客が縁を使い切った**：責任者が「客」の画面で調整（理由を残す）
- **間違えて結果を入れた**：取消はできない（履歴は消さない）。責任者が調整で直す
- **札をなくした客**：受付で名前を探し、QRを出し直す（マイページのURLは変わらない）
- **バックアップ**：管理 → 書き出し（CSV）。または `npx wrangler d1 export moneytalks-db --remote --output backup.sql`

## API（主なもの）

客（ログイン不要）
- `POST /api/register {nickname}` → `{token, key, url, shortCode}`
- `POST /api/u/:token/login {nickname}` → `{key}`（未登録の札なら登録になる）
- `GET /api/u/:token`（ヘッダ `X-User-Key`）→ 残高・履歴・占い・順位
- `GET /api/rankings` / `GET /api/ranking`（LP用）/ `GET /api/config` — CORS 可

スタッフ（クッキー）
- `POST /api/staff/login` `logout` `setup`、`GET /api/staff/me`
- `GET /api/staff/lookup?q=`、`GET /api/staff/users/:id`、`POST /api/staff/register`
- `POST /api/staff/plays`、`GET /api/staff/plays/open`、`POST /api/staff/plays/:id/finish|void`
- `POST /api/staff/readings`、`GET /api/staff/readings/open`、`POST .../:id/bribe`、`PUT .../:id`、`POST .../:id/finish|void`
- 責任者：`POST /api/staff/adjust`、`PUT /api/staff/settings`、`PUT /api/staff/games/:id`、`POST|GET /api/staff/cards`、`GET /api/staff/stats`
- 管理者：`GET|POST /api/staff/accounts`、`PATCH /api/staff/accounts/:id`、`GET /api/staff/audit`、`GET /api/staff/export?what=users|ledger|readings`

## 設計のメモ

- 残高の増減は必ず `src/ledger.js` を通す。同じ `requestId` は二度反映しない。読んだ残高と同じときだけ更新する（同時操作で狂わない）。残高は 0 を下回れない
- ゲームは「開始で引く → 結果で払い戻す」。取消は返金。払い戻しと返金の `requestId` はプレイ番号から作るので、二度押しても一度しか入らない
- 占いの台本は `src/oracle.js`（相・兆・質問・位ごとの演じ方）。文章を直すのはここだけ
- スタッフのログインは合言葉（PBKDF2）＋ HMAC 署名のクッキー。5回失敗で1分ロック
- 客の本人確認は「マイページのURL（QR）＋名前」。鍵は端末に保存される
