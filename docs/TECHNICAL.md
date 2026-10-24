# 技術資料

収穫祭2026 2年C組「運命、賄賂で買いませんか？」公式サイトの技術的なことを、ここに全部まとめる。
一緒に開発する人は、最初にこれを読めば全体がわかるようにしてある。運用の手順（番付の更新や当日の流れ）は [README](../README.md) の方に書いてある。

- リポジトリ: `tskoizumi/KeioShiki_harvest_2C2026`（**公開リポジトリ**、本番ブランチ `main`）
- 公開先: Cloudflare Pages（`https://<プロジェクト名>.pages.dev/`）。独自ドメインは未購入（候補: `moneytalks-uranai.com`）
- 公式アカウント: Instagram `@keioshiki2c79`／サイト制作: `@tskoizumi`

---

## 1. 全体像

```
 受付                     占いブース                          客のスマホ
┌──────────────┐        ┌──────────────────────┐          ┌──────────────────────┐
│ 質問票(紙)    │──答え──▶│ teller.html           │          │ index.html            │
│ questionnaire │        │  質問の答え・兆・心付け │          │  公式サイト・番付      │
│ .html で印刷  │        │  → oracle.js が台本   │          └──────────▲───────────┘
│ 番号入りの紙  │        │  → 「記録する」        │                     │ 番付
└──────────────┘        └──────────┬───────────┘                     │
                                   │ 1行 (id,name,sou,kizashi,amount,oracle)
                                   ▼                                  │
                        ┌──────────────────────┐          ┌──────────┴───────────┐
                        │ 結果データ            │◀──id────│ share.html?id=番号    │
                        │  今: results.json か  │          │  結果の紙のQRから開く │
                        │  スプレッドシートCSV  │──1件───▶│  → シェア画像を生成   │
                        │  今後: QRシステム(API) │          └──────────────────────┘
                        └──────────────────────┘
```

1. 受付で、番号入りの結果の紙と質問票を渡す
2. ブースで占い師が `teller.html` に答え・兆・心付けを入れると、`oracle.js` が台本を組み立てる
3. 読み終えたら記録する。その1行が結果データになる
4. 客は結果の紙のQRで `share.html?id=番号` を開き、ブラウザの中でシェア画像を作って保存・シェアする
5. 心付けの額の上位が、トップページの番付に出る

**今いちばん手作業が残っているのは 3 → 結果データ の部分**（書記がCSVをスプレッドシートに貼っている）。QRシステムとつなぐならここ。→ [8. QRシステムとの接続](#8-qrシステムとの接続提案)

---

## 2. 技術スタック

| 項目 | 内容 |
| --- | --- |
| 構成 | 静的サイト。HTML / CSS / JavaScript だけ。**ビルドなし・依存パッケージなし** |
| JavaScript | 素のJS（ES5相当、`var` と `function`）。各HTMLの末尾に直書き。共有部分だけ `config.js` `oracle.js` に分けている |
| CSS | 各HTMLの `<style>` に直書き。変数（`:root` の `--paper` `--red` など）でロゴの色をそろえている |
| フォント | Google Fonts の Shippori Mincho B1（700・800）。本文はOS標準のゴシック |
| 使っているブラウザ機能 | Canvas（シェア画像）、Web Share API（シェアボタン）、IntersectionObserver（浮かび上がり）、`backdrop-filter`（すりガラス）、localStorage（占い師の記録）、Clipboard API |
| ホスティング | Cloudflare Pages（GitHub連携、`main` へのpushで自動デプロイ） |
| 対応 | スマホ（iPhone Safari・Android Chrome）が主。PCでも崩れない。`prefers-reduced-motion` で動きを止める |

---

## 3. ファイル構成

```
/
├── index.html           公式サイト（LP）
├── share.html           結果ページ。QRの行き先。シェア画像を生成
├── teller.html          占い師用の画面（客には見せない）
├── questionnaire.html   受付で配る質問票（A4印刷）
├── config.js            サイト全体の設定。全ページが読む
├── oracle.js            占いの中身とロジック。teller / questionnaire が読む
├── data/
│   ├── ranking.json     番付（スプレッドシートを使わないとき）
│   └── results.json     結果データ（同上）。DEMO01〜03 は見本
├── assets/
│   ├── logo.png         ロゴ原本（印刷用、1254px）
│   ├── logo.webp/.jpg   ロゴ（1000px）
│   ├── layer-ball.webp  ロゴを分解したレイヤー：水晶玉と布（1000px・背景透過）
│   ├── layer-hand.webp  　　〃　：手と硬貨
│   ├── layer-copy.webp  　　〃　：「運命、賄賂で買いませんか？」の文字
│   ├── mark-alpha.webp  水晶玉と手だけのマーク（背景透過）。ナビ・シェア画像で使う
│   ├── ogp.jpg          SNSに貼ったときの画像（1200×630）
│   ├── favicon.png / apple-touch-icon.png
├── docs/TECHNICAL.md    この文書
└── README.md            運用手順
```

3枚のレイヤーは原本と同じ1000×1000の座標で切り出してあるので、重ねるだけで元のロゴに戻る（`position:absolute; inset:0` で重ねている）。

---

## 4. 公開・デプロイ

### Cloudflare Pages の設定

| 項目 | 値 |
| --- | --- |
| フレームワークプリセット | なし |
| ビルドコマンド | （空欄） |
| ビルド出力ディレクトリ | `/` |
| 本番ブランチ | `main` |

- `main` にpushすると数十秒〜1分で本番に反映される
- `main` 以外のブランチにpushすると、ブランチごとにプレビュー用のURL（`https://<ブランチ名>.<プロジェクト名>.pages.dev`）が出る。**大きな変更はブランチで作り、プレビューで確かめてから `main` に入れる**

### URLを変えてはいけない場面

結果の紙のQRには `https://<ドメイン>/share.html?id=<番号>` を焼き込む。**刷ったあとにドメイン・プロジェクト名・`share.html` のファイル名・`id` というパラメータ名を変えると、刷ったQRが全部読めなくなる。** 独自ドメインを買うなら、QRを刷る前に設定まで済ませる。

### 独自ドメイン（予定）

- 候補は `moneytalks-uranai.com`（"money talks" の "s" をつけるかは未決）
- Cloudflare で買えば、そのまま Pages のカスタムドメインにつなげられる
- 独自ドメインをつないでも `pages.dev` のURLは生き続ける
- 決まったら `index.html` の `og:image` を絶対URLにする（相対URLだと一部のSNSで画像が出ない）

---

## 5. 設定（`config.js`）

`window.SITE` に全部入っている。全ページが `<script src="config.js">` で読む。

| キー | 型 | 用途 |
| --- | --- | --- |
| `name` | 文字列 | 出し物名。ナビ・フッター・シェア画像・質問票に入る（トップの大きなロゴは画像なので別） |
| `tagline` | 文字列 | 「神託は、心付け次第。」 |
| `className` `event` | 文字列 | 「2年C組」「収穫祭 2026」 |
| `date` `place` | 文字列 | ご案内に出る日時・場所 |
| `instagram` | 文字列 | 公式アカウント（`@`なし）。空にするとリンクが消える |
| `credit` | 文字列 | 制作者アカウント（`@`なし） |
| `kaizanThreshold` | 数値 | 改竄の閾値（初期値 2000）。**当日の昼に変える可能性がある** |
| `startingEn` | 数値 | 受付で配る縁（100） |
| `games` | 配列 | ミニゲーム4種。`id` `name` `kana` `time` `fee` `payout` `role` `text` `featured` `enabled` |
| `ranks` | 配列 | 心付けの位4つ。`id`（`mu` `sho` `dai` `kaizan`）`name` `min` `attitude`。改竄の下限は `kaizanThreshold` を使う |
| `rankingCsvUrl` | 文字列 | 番付をスプレッドシートのCSVから読むときのURL。空なら `data/ranking.json` |
| `resultsCsvUrl` | 文字列 | 結果をスプレッドシートのCSVから読むときのURL。空なら `data/results.json` |

あわせて2つの関数を出している。

- `window.rankOf(amount)` … 心付け額から位（`ranks` の要素）を返す。サイト・シェア画像・占い師画面の判定はすべてこれ
- `window.parseCsv(text)` … 1行目を見出しにしたオブジェクトの配列を返す（ダブルクォート対応）

---

## 6. データ形式

### 結果（1人分）

結果ページとシェア画像が必要とする項目。

| 項目 | 内容 | 例 |
| --- | --- | --- |
| `id` | 結果の紙の番号。英数字。大文字で照合する | `K7Q2XM` |
| `name` | ニックネーム | `ぽんず` |
| `sou` | 相の名前 | `深海` |
| `kizashi` | 兆の名前 | `沈黙` |
| `amount` | 心付けの額（縁、整数） | `3200` |
| `oracle` | シェア画像に載せる神託の一行（改竄なら新しい神託） | `沈黙は破られた。あなたは浮上する。` |

位（無・小・大・改竄）は保存しない。表示するときに `amount` と `kaizanThreshold` から毎回計算する。

`data/results.json` では `id` をキーにしたオブジェクト：

```json
{ "K7Q2XM": { "name": "ぽんず", "sou": "深海", "kizashi": "沈黙", "amount": 3200, "oracle": "沈黙は破られた。あなたは浮上する。" } }
```

CSV（スプレッドシート）では1行目が `id,name,sou,kizashi,amount,oracle`。

### 番付

```json
{
  "updatedAt": "2026-11-03T13:00:00+09:00",
  "firstTitle": "神託を買った者",
  "entries": [ { "name": "ぽんず", "amount": 3200 } ]
}
```

順不同でいい（表示側で額の降順に並べ、上位10件を出す）。CSVなら見出しは `name,amount`、任意で `title,updatedAt`（最初に値が入っている行を使う）。

### 占い師の記録（`teller.html` の localStorage）

キー `teller-records` に配列で保存。結果の項目に `rank`（位の名前）が足されている。

```json
[{ "id": "K7Q2XM", "name": "ぽんず", "sou": "深海", "kizashi": "沈黙", "amount": 3200, "rank": "改竄", "oracle": "…" }]
```

端末の中にしか残らない。書記が「記録」画面からCSV（`id,name,sou,kizashi,amount,oracle`、BOM付きUTF-8）を持ち出す。

### 番号（id）のルール

- **連番にしない。** `0001` `0002` だと他人の結果をURLの書き換えで覗ける。ランダムな英数字6桁程度
- 紛らわしい文字（`0/O` `1/I/L`）は避けると、手入力のときに楽
- 紙にQRと一緒に文字でも印刷する（`share.html` で手入力できる）

---

## 7. 各ページの仕組み

### `index.html`（公式サイト）

上から：ヒーロー → 「神託は、心付け次第。」 → 遊び方 → ミニゲーム → 心付けの位（黒地） → 番付 → ご案内 → 結果を受け取る → フッター。

- **ヒーロー**: ロゴを3枚のレイヤー（玉・手・文字）に分けて重ね、読み込み直後にCSSアニメーションで時間差で組み上げる（玉 0s → 手 0.55s → 光 1.25s → 文字 1.55s）。スクロールすると、JSで層ごとに違う速さで動かす（パララックス）。画面を固定するスクロール（sticky）は使っていない
- **背景色の移り変わり**: `data-bg="#rrggbb"` を持つセクションの位置を `measure()` で測り、画面中央の位置から `bgAt()` で色を補間して、固定の `#bg` に塗る。境目の前後 40vh だけで色が移る。背景が暗くなるとナビも黒くなる（`.on-dark`）
- **色のにじみ**: `#bg` の中のぼかした円4つ（`.blob`）をスクロール量に応じて漂わせる。暗い場面では赤だけ灯る
- **ミニゲーム・心付けの位**: `config.js` の `games` `ranks` からJSで描画する。アイコンはSVGで、`#felt` フィルタ（feTurbulence＋feDisplacementMap）でフェルトの質感を出している
- **番付**: `loadRanking()` が `rankingCsvUrl` か `data/ranking.json` を読み、`renderRanking()` で描く
- **浮かび上がり**: `.reveal` を IntersectionObserver で監視して `.in` をつける
- スクロール処理は `requestAnimationFrame` で間引いている。`transform` と `opacity` しか動かさない

### `share.html`（結果ページ）

1. `?id=` があれば `lookup(id)` で結果を探す。なければ番号入力のフォームを出す
2. 見つかったら `render()` がフォントとマーク画像の読み込みを待ち、隠し `<canvas>`（1080×1920）に描く
   - 無・小・大 → `drawNormal()`：白い紙。位ごとに上下の色帯と印の色が変わる
   - 改竄 → `drawKaizan()`：黒地に赤。兆に取り消し線、「この兆は、誤りでした。」、新しい神託、大きな朱印
3. canvas を PNG にして `<img>` に出す（長押し保存できるように）。「保存する」はダウンロード、「シェアする」は Web Share API（ファイル共有に対応していなければダウンロード）
4. 見つからなければ「書記の入力を少し待って」と表示

### `teller.html`（占い師用）

黒地（暗いブース用）。4段階＋記録。

1. **入力**: 番号・ニックネーム・判定用9問・言及用10問（1〜5を押す）。相は9問から自動判定、ボタンで直接指定もできる
2. **兆**: 10枚から押す
3. **心付け**: 額を入れると位がその場で出る
4. **台本**: `ORACLE.compose()` の結果を表示。演じ方の指示 → 第一部〜第三部 → （改竄なら）改竄パート。最後に「シェア画像に載る一行」
5. **記録**: 「記録する」で localStorage に保存し、1行をクリップボードにコピー。「記録」画面からCSVのコピー・ダウンロード・全消去

### `questionnaire.html`（質問票）

`ORACLE.JUDGE`（9問）と `ORACLE.MENTION`（10問）から表を作るだけ。A4縦1枚。質問文を `oracle.js` で直せば質問票も変わる。

### `oracle.js`（占いのロジック）

`window.ORACLE` に入っている。

| 名前 | 中身 |
| --- | --- |
| `SOU` | 相8つ。`id` `name`、3つの軸 `hot` `move` `out`（真偽）、`describe`（相の描写）、`kaizan`（改竄の新しい神託） |
| `KIZASHI` | 兆10枚。`id` `name` `omen`（`good` `bad` `mixed`）、`base`（基本の読み）、`ending.{mu,sho,dai}`（結論）、`by.{相のid}`（相ごとの一文。8×10＝80通り） |
| `JUDGE` | 判定用9問。`axis`（`hot` `move` `out`）と `text` |
| `MENTION` | 言及用10問。`text`、`high`（4〜5の人へ）、`low`（1〜2の人へ） |
| `DIRECTION` | 位ごとの演じ方。`mentions`（言及の数）と `note`（指示） |
| `judge(answers)` | 9問の答え（1〜5）から相を返す。軸ごとに3問の合計が10以上ならその軸は真。全部3なら「種」 |
| `pickMentions(answers, n)` | 10問の答えから、3から遠いものを n 個選び `{quote, line}` を返す |
| `compose(sou, kizashi, rankId, mentions)` | 台本を組み立てる。返り値は `{ parts: [{title, lines:[{t, kind}]}], oracle, direction }`。`kind` は `say`（読む）`quote`（言及）`cue`（演出の指示） |

位による違い：無は言及1つ・相ごとの一文なし・「以上。次の方。」。小は言及2つ。大は言及3つ・言及のたびに持ち上げ・悪い兆は「あなたの責任ではない」。改竄は小と同じに読み切ってから、改竄パートで相の `kaizan` を読み、それが `oracle`（シェア画像の一行）になる。

---

## 8. QRシステムとの接続（提案）

> この章はまだ実装していない。QRシステム側と相談して決めるための叩き台。

### 今どうなっているか

| 場所 | 今のやり方 | 困っていること |
| --- | --- | --- |
| 番号の発行 | 決まっていない（ランダムな番号を事前に紙に刷る想定） | 刷る仕組みがない |
| 結果の保存 | `teller.html` の端末内 → 書記がCSVをスプレッドシートに貼る | 手作業。貼るまでQRが開けない |
| 結果の読み出し | `share.html` が `results.json` かスプレッドシートのCSVを丸ごと読んで探す | 全員分の結果が誰でも読める |
| 番付 | `ranking.json` を手で書き換えてpush | 手作業 |

### つなぎ方の案

Cloudflare の同じ Pages プロジェクトに **Pages Functions**（このリポジトリの `functions/` フォルダ）と **D1**（データベース）を足す。サイトと同じドメインで動くので、ドメイン設定もCORSも要らない。

```
functions/
  api/
    results/[id].js   GET  1人分を返す
    results.js        POST 1人分を保存する（占い師のみ）
    ranking.js        GET  番付を返す
```

| API | 用途 | 中身 |
| --- | --- | --- |
| `GET /api/results/:id` | `share.html` が呼ぶ | 200: `{id,name,sou,kizashi,amount,oracle}`／404: なし |
| `POST /api/results` | `teller.html` の「記録する」が呼ぶ | 本文は上と同じ形。ヘッダ `X-Teller-Key` に合言葉。合わなければ 401 |
| `GET /api/ranking` | `index.html` が呼ぶ | `ranking.json` と同じ形 `{updatedAt, firstTitle, entries:[{name,amount}]}` |
| （必要なら）`POST /api/ids` | 番号をまとめて発行してQRを刷る | QRシステム側で決める |

D1のテーブル案：

```sql
CREATE TABLE results (
  id         TEXT PRIMARY KEY,         -- 結果の紙の番号
  name       TEXT NOT NULL,            -- ニックネーム
  sou        TEXT NOT NULL,
  kizashi    TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  oracle     TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

- 合言葉は Pages の環境変数（Secret）に入れ、コードやリポジトリには書かない
- サイト側の変更は小さい：`share.html` の `lookup()`、`teller.html` の「記録する」、`index.html` の `loadRanking()` の3か所だけ。`config.js` に `apiBase` を足し、空なら今のJSON/CSVに戻るようにすれば、APIが落ちても当日は回せる
- 番付を「1人1回の最高額」にするか「同じニックネームの合計」にするかは未決（下の未決事項）

### Cloudflare のアカウント

本番は1つのアカウントにまとめる。別のアカウントのWorkerを呼ぶ形にすると、独自ドメインを片方にしかつなげない。QRシステムを作っている人は、サイトのアカウントにメンバーとして招待する（Manage Account → Members）。

---

## 9. 一緒に開発するとき

### 手元で動かす

```sh
git clone https://github.com/tskoizumi/KeioShiki_harvest_2C2026.git
cd KeioShiki_harvest_2C2026
python3 -m http.server 8765      # → http://localhost:8765/
```

`file://` で直接開くと `fetch`（番付・結果の読み込み）が動かないので、必ず何かのサーバーで開く。Pages Functions を足したあとは `npx wrangler pages dev .` で関数ごと動かせる。

### ルール

- `main` に直接pushしない。ブランチを切って、プルリクエストで合流する（`main` へのpushは即本番）
- ブランチのプレビューURLで、スマホでも確認してから合流する
- 文章（占いの中身）を直すときは `oracle.js` だけ、見た目と設定は `config.js` が先。HTMLに値を直書きしない
- 既存のコードの書き方に合わせる：素のJS、ビルドなし、コメントは日本語、セクションは `/* ===== */` の見出しで区切る
- 個人情報（本名・質問票の答え）は、リポジトリにもデータにも入れない

### 確認のしかた

- スマホ幅（390px）とPC幅（1280px）の両方で見る
- 端末の「視差効果を減らす」をオンにしても読めるか
- `share.html?id=DEMO01`（小）／`DEMO02`（大）／`DEMO03`（改竄）でシェア画像の3パターンが出るか
- `teller.html` で位を変えて台本が4パターン出るか

---

## 10. 注意点

- **このリポジトリは公開されている。** 合言葉・Cloudflareのトークン・APIキーは絶対にコミットしない。Cloudflareの環境変数（Secret）か、手元なら `.dev.vars`（`.gitignore` 済み）に入れる。一度pushすると、消しても履歴とフォークに残る
- **コミットにメールアドレスを載せない。** GitHub の Settings → Emails で「Keep my email addresses private」をオンにし、`git config user.email` を GitHub の noreply アドレスにする
- **データは実質公開。** `results.json` も、公開したスプレッドシートのCSVも、URLを知れば全部読める。ニックネーム以外を入れない（APIにすれば1件ずつしか返さなくなる）
- **占い師画面と質問票は、リンクしていないだけで誰でも開ける。** URLを外に出さない
- **縁は会場内だけの通貨**（現金・景品と交換しない）とサイトに明記している。チンチロが止められたら `config.js` の `enabled: false` で消せる
- SNSのリンクプレビューのため、ドメインは激安TLDを避ける（`.xyz` などは弾かれることがある）

---

## 11. 未決・TODO

- [ ] 独自ドメインを買う（`moneytalk-uranai.com` か `moneytalks-uranai.com` か）→ Pagesにつなぐ → `og:image` を絶対URLに
- [ ] 番号の発行とQRの印刷方法（QRシステム側）
- [ ] 結果の保存・読み出しをAPIにするか、スプレッドシート運用で行くか
- [ ] 番付の集計方法（1人1回の最高額 or ニックネームごとの合計）
- [ ] 本番前に `data/results.json` の `DEMO01`〜`03` を消す
- [ ] 日時を `config.js` の `date` に入れる
- [ ] 占い師が台本をどの端末で見るか（面の下のスマホ／隣の書記）
- [ ] 改竄の閾値（2000）を当日の縁の増え方を見て調整
