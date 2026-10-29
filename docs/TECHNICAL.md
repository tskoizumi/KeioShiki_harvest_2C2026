# 技術資料

収穫祭2026 2年C組「運命、賄賂で買いませんか？」公式サイトの技術的なことをまとめる。
担当・連絡のルール・開発のルールは [README](../README.md) に書いてある。

- リポジトリ: `tskoizumi/KeioShiki_harvest_2C2026`（**公開リポジトリ**、本番ブランチ `main`）
- 公開先: Cloudflare Pages。独自ドメインは **`https://moneytalks-uranai.com/`**（Cloudflare で購入済み）。受付システムは `https://app.moneytalks-uranai.com/` に置く予定
- 公式アカウント: Instagram `@keioshiki2c79`／LP制作: `@tskoizumi`

---

## 1. 担当と全体像

| 部分 | 場所 | 状態 |
| --- | --- | --- |
| LP（`index.html` `config.js` `assets/`） | リポジトリのルート → Cloudflare Pages（`moneytalks-uranai.com`） | できている |
| 客のマイページ（残高・QR・履歴・占い結果のカード・番付） | `app/public/u.html` | できている（手元で検証済み、本番は未デプロイ） |
| 登録（スマホ）と印刷用の札 | `app/public/index.html`・`cards.html` | 同上 |
| スタッフ画面（QR読取・ゲーム・占い師・受付・管理） | `app/public/staff.html` | 同上 |
| サーバー（台帳・ゲーム・占い・番付・認証） | `app/src/` → Cloudflare Workers ＋ D1（`app.moneytalks-uranai.com`） | 同上 |

```
 客のスマホ                      スタッフの端末（/staff）
┌───────────────┐             ┌──────────────────────────┐
│ /   登録        │             │ 客（QR読取→開始・結果）   │
│ /u/<token>      │◀──残高・結果──│ 卓（進行中のゲーム）       │
│  マイページ     │             │ 占（心付け→質問→兆→台本） │
│  残高・QR・履歴 │             │ 受（登録・札の紐づけ）     │
│  占いカード・番付│             │ 管（設定・ゲーム・スタッフ）│
└───────┬───────┘             └────────────┬─────────────┘
        │  /api/u/*  /api/rankings          │  /api/staff/*（クッキー）
        ▼                                   ▼
┌──────────────────────────────────────────────────────┐
│ app/src/index.js（Worker）                            │
│  ledger.js 台帳 ／ plays.js ゲーム ／ readings.js 占い │
│  rankings.js 番付 ／ auth.js 認証 ／ oracle.js 台本    │
└───────────────────────────┬──────────────────────────┘
                            ▼  D1（SQLite）
    users / ledger / games / plays / readings / staff / settings / audit_log

 LP（moneytalks-uranai.com）──rankingUrl──▶ /api/ranking   resultUrl ──▶ /
```

LPと `app/` は、`config.js` の `resultUrl` と `rankingUrl` の2つでつながる（→ [5. LPとのつなぎ目](#5-lpとのつなぎ目)）。`app/` の中身・API・運用は [app/README.md](../app/README.md)。

以前のたたき台は [`archive/full-system` ブランチ](https://github.com/tskoizumi/KeioShiki_harvest_2C2026/tree/archive/full-system)（結果ページ・占い師画面・質問票）と [`qr/reception-system` ブランチ](https://github.com/tskoizumi/KeioShiki_harvest_2C2026/tree/qr/reception-system)（`soma1218` の受付システム）に残してある。占いの中身（`oracle.js`）と台帳の作り（冪等・楽観ロック）は `app/` に引き継いだ。

---

## 2. 技術スタック（LP）

| 項目 | 内容 |
| --- | --- |
| 構成 | 静的サイト。HTML / CSS / JavaScript だけ。**ビルドなし・依存パッケージなし** |
| JavaScript | 素のJS（ES5相当、`var` と `function`）。`index.html` の末尾に直書き。設定だけ `config.js` に分けている |
| CSS | `index.html` の `<style>` に直書き。色は `:root` の変数でロゴにそろえている |
| フォント | Google Fonts の Shippori Mincho B1（700・800）。本文はOS標準のゴシック |
| ブラウザ機能 | IntersectionObserver（浮かび上がり）、`backdrop-filter`（すりガラス）、CSSアニメーション |
| ホスティング | Cloudflare Pages（GitHub連携、`main` へのpushで自動デプロイ） |
| 対応 | スマホが主。PCでも崩れない。`prefers-reduced-motion` で動きを止める |

QR・結果まわりの技術は担当が自由に選んでいい。LP側を巻き込む変更（ビルドの追加など）だけ相談する。

---

## 3. ファイル構成

```
/
├── index.html           LP（公式サイト）
├── config.js            設定。LPが読む。他のページから読んでもいい
├── assets/
│   ├── logo.png         ロゴ原本（印刷用、1254px）
│   ├── logo.webp/.jpg   ロゴ（1000px）
│   ├── layer-ball.webp  ロゴを分解したレイヤー：水晶玉と布（1000px・背景透過）
│   ├── layer-hand.webp  　　〃　：手と硬貨
│   ├── layer-copy.webp  　　〃　：「運命、賄賂で買いませんか？」の文字
│   ├── mark-alpha.webp  水晶玉と手だけのマーク（背景透過）
│   ├── ogp.jpg          SNSに貼ったときの画像（1200×630）
│   └── favicon.png / apple-touch-icon.png
├── docs/TECHNICAL.md    この文書
├── README.md            担当・開発のルール・運用
└── .gitignore           秘密のファイル（.dev.vars など）を除外
```

`assets/` の画像は、QR・結果側のページやシェア画像でも自由に使っていい。

---

## 4. 公開・デプロイ

| 項目 | 値 |
| --- | --- |
| フレームワークプリセット | なし |
| ビルドコマンド | （空欄） |
| ビルド出力ディレクトリ | `/` |
| 本番ブランチ | `main` |

- `main` にpushすると数十秒〜1分で本番に反映される
- `main` 以外のブランチは、プレビュー用のURL（`https://<ブランチ名>.<プロジェクト名>.pages.dev`）に出る
- Pages Functions（`functions/` フォルダ）や D1 を足しても、このプロジェクトのまま動く。ビルドが必要な仕組みにするなら、上の設定を変えて README も直す

**QRに焼き込むURL（ドメイン・パス・パラメータ名）は、刷ったあとに変えると全部読めなくなる。** ドメインは `moneytalks-uranai.com` に決まったので、刷る前に Pages（LP）と受付システム（`app.` のサブドメイン）の両方をつなぎ終える。LPの `og:image` と `og:url` はこのドメインの絶対URLにしてある（相対URLだと一部のSNSで画像が出ない）。

---

## 5. LPとのつなぎ目

### `resultUrl`

「神託を受け取る」ボタンの行き先。LPの2か所（ナビの赤いボタン、ページ下の「結果の紙を、お持ちですか。」セクション）に使う。

- 空文字のあいだは、2か所とも隠れる
- 入れると表示され、`href` がこの値になる（例: `"share.html"`、`"/result"`、別ドメインのURLでも可）

### `rankingUrl`

番付のデータのURL。LPがページを開くたびに読みに行く（キャッシュしない）。空のあいだは「開場後に更新します」のまま。`app/` の `GET /api/ranking` がこの形で返す（CORS 許可済み）。

#### 番付のデータ

**JSON**（先頭が `{` ならJSONとして読む）：

```json
{
  "updatedAt": "2026-11-03T13:00:00+09:00",
  "firstTitle": "神託を買った者",
  "entries": [
    { "name": "ぽんず", "amount": 3200 },
    { "name": "たかし", "amount": 1800 }
  ]
}
```

| 項目 | 内容 |
| --- | --- |
| `updatedAt` | 更新時刻（ISO 8601）。「11月3日 13:00 更新」と日本時間で出る。なくてもいい |
| `firstTitle` | 1位の人につける称号。なくてもいい |
| `entries` | `name`（ニックネーム）と `amount`（心付けの額、整数）。順不同でいい。LPが額の降順に並べて上位10件を出す |

**CSV**（それ以外はCSVとして読む。Googleスプレッドシートの「ウェブに公開 → CSV」のURLをそのまま入れられる）：

```
name,amount,title,updatedAt
ぽんず,3200,神託を買った者,2026-11-03T13:00:00+09:00
たかし,1800,,
```

`title` と `updatedAt` は、最初に値が入っている行のものを使う。`amount` の「,」などの記号は無視して数字だけ読む。

- 額が `kaizanThreshold` 以上の行は赤く出る
- 番付を「1人1回の最高額」にするか「同じニックネームの合計」にするかは、データを作る側で決める
- 別ドメインから返す場合は、CORS（`Access-Control-Allow-Origin`）を許可しておく

### `config.js` の他の値

QR・結果側のページも `<script src="config.js">` で `window.SITE` を読めば、出し物名・クラス名・改竄の閾値・位の名前などをLPとそろえられる。

| キー | 内容 |
| --- | --- |
| `name` `tagline` `className` `event` `date` `place` | 出し物の基本情報 |
| `instagram` `credit` | アカウント（`@`なし） |
| `kaizanThreshold` | 改竄の閾値（2000）。当日の昼に変える可能性がある |
| `startingEn` | 受付で配る縁（100） |
| `games` | ミニゲーム4種 |
| `ranks` | 心付けの位4つ（`mu` `sho` `dai` `kaizan`）。`name` `min` `attitude`。改竄の下限は `kaizanThreshold` |
| `resultUrl` `rankingUrl` | つなぎ目 |

`window.parseCsv(text)` も入っている（1行目を見出しにしたオブジェクトの配列を返す）。

---

## 6. LPの仕組み（`index.html`）

上から：ヒーロー → 「神託は、心付け次第。」 → 遊び方 → ミニゲーム → 心付けの位（黒地） → 番付 → ご案内 → 結果を受け取る（`resultUrl` があるときだけ） → フッター。

- **ヒーロー**: ロゴを3枚のレイヤー（玉・手・文字）に分けて重ね、読み込み直後にCSSアニメーションで時間差で組み上げる（玉 0s → 手 0.55s → 光 1.25s → 文字 1.55s）。スクロールすると層ごとに違う速さで動かす（パララックス）。画面を固定するスクロールは使っていない
- **背景色の移り変わり**: `data-bg="#rrggbb"` を持つ表示中のセクションの位置を `measure()` で測り、画面中央の位置から `bgAt()` で色を補間して、固定の `#bg` に塗る。背景が暗くなるとナビも黒くなる
- **色のにじみ**: `#bg` の中のぼかした円4つをスクロール量に応じて漂わせる。暗い場面では赤だけ灯る
- **ミニゲーム・心付けの位**: `config.js` の `games` `ranks` から描画する。アイコンはSVGに `#felt` フィルタでフェルトの質感をつけている
- **番付**: `loadRanking()` が `rankingUrl` を読み、`renderRanking()` で描く
- スクロール処理は `requestAnimationFrame` で間引き、`transform` と `opacity` しか動かさない

---

## 7. デザインのそろえ方

QR・結果側のページをLPと同じ見た目にしたいときの目安。

| 項目 | 値 |
| --- | --- |
| 紙（背景） | `#fefefc` |
| 墨（文字） | `#1c1a1b` |
| 賄賂の赤（強調・ボタン） | `#9f1111`（暗い背景では `#e0352b`） |
| 布の紫 | `#663661` |
| 薄紫・水色（にじみ） | `#d9b8dc`・`#bcdce8` |
| 見出しの書体 | Shippori Mincho B1 の 800 |
| 角丸 | カード 28px、ボタンは丸（999px） |
| すりガラス | `background: rgba(255,255,255,0.55); backdrop-filter: blur(28px) saturate(170%); border: 1px solid rgba(255,255,255,0.8);` |

改竄だけは黒地に赤（`#0d0b0c` と `#e0352b`）に反転させると、LPの演出と合う。

---

## 8. 手元で動かす

```sh
git clone https://github.com/tskoizumi/KeioShiki_harvest_2C2026.git
cd KeioShiki_harvest_2C2026
python3 -m http.server 8765      # → http://localhost:8765/
```

`file://` で直接開くと `fetch`（番付の読み込み）が動かないので、必ず何かのサーバーで開く。Pages Functions を足したら `npx wrangler pages dev .` で関数ごと動かせる。

---

## 9. 注意点

- **このリポジトリは公開されている。** 合言葉・Cloudflareのトークン・APIキーは絶対にコミットしない。Cloudflareの環境変数（Secret）か、手元なら `.dev.vars`（`.gitignore` 済み）に入れる
- **コミットにメールアドレスを載せない。** GitHub の Settings → Emails で「Keep my email addresses private」をオンにする
- **縁は会場内だけの通貨**（現金・景品と交換しない）とLPに明記している。チンチロが止められたら `config.js` の `enabled: false` で消せる
- 番付は公開される。ニックネーム以外を載せない

---

## 10. 未決・TODO

- [x] 独自ドメインを買う → `moneytalks-uranai.com`。`og:image` / `og:url` を絶対URLに
- [ ] Pages（LP）の Custom domains に `moneytalks-uranai.com` をつなぐ
- [ ] `app/` を本番にデプロイする（GitHub の Secrets を4つ入れると `main` への push で自動。→ app/README.md）
- [ ] デプロイ後、`/staff` で最初の管理者を作り、スタッフを追加する
- [ ] デプロイ後、`https://training.moneytalks-uranai.com/training` が開くことを確かめ、スタッフに共有する（研修モード。本番とは別のデータ）
- [ ] 動画（`docs/video/`）に BGM を重ねる。お客さん向けは Instagram に
- [ ] LP の `config.js` の `resultUrl` に `https://app.moneytalks-uranai.com/` を入れる（`rankingUrl` は入れてある）
- [ ] 印刷用の札（`/staff/cards`）を刷る
- [ ] 改竄の閾値を、LP の `config.js` と `app/` の管理画面の両方で合わせる
- [ ] 日時を `config.js` の `date` に入れる
- [ ] 改竄の閾値（2000）を当日の縁の増え方を見て調整
