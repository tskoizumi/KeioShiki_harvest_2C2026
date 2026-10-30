# 印刷物（A4）

| ファイル | 中身 | 印刷 |
| --- | --- | --- |
| `all.pdf` | 下の全部とポスターをまとめたもの（18ページ） | |
| `01-cards.pdf` | 兆のカード10枚（70×120mm、A4に4枚）。表・裏・表・裏…の順 | **両面・長辺とじ**。厚紙がおすすめ。トンボ（四隅の線）で切る |
| `02-questions.pdf` | 質問票（A5を2枚。A4を半分に切る） | 片面。人数分 |
| `03-entry-qr.pdf` | 受付のQR（登録ページ） | 片面。受付に貼る |
| `04-game-rules.pdf` | ゲームのルール（的当て・神経衰弱・積み・チンチロ） | 片面。各卓に貼る |
| `05-price.pdf` | 占いの料金表（賄賂のランク） | 片面。占いの部屋の入口に |
| `06-teller.pdf` | 占い師の早見表 | 片面。占い師の手元に |
| `07-staff-qr.pdf` | スタッフ画面と研修モードのQR | 片面。スタッフ用 |
| `08-photo-qr.pdf` | 写真展：写真の受け取りのQR（photo.moneytalks-uranai.com） | 片面。撮影する場所に貼る |
| `../poster/poster-a4.pdf` | ポスター | |

**QRカード（スマホがないお客さん用のマイページ）はここにはない**。QRの中身がマイページの鍵なので、公開リポジトリに置かない。
手元で作る：

1. `python3 assets/print/qr-cards.py 30 && node assets/print/build.js private` → `assets/print/private/qr-cards.pdf`（名刺サイズ、A4に10枚。片面）
2. 印刷したら、責任者以上でスタッフ画面にログインしてから `assets/print/private/import-link.txt` のリンクを開き「登録する」を押す（同じリンクを2回開いても二重にはならない）
3. 登録するまで、そのカードのQRは使えない。もう一度 `qr-cards.py` を実行しても同じカードのまま（枚数を増やすと足りない分だけ足す）

`private/qr-cards.json` を消すと番号が作り直しになるので、印刷したあとは消さない。
スタッフ画面の「受付 → 印刷のページを開く」で、本番で発行して印刷することもできる。

作り直すとき：`python3 assets/print/build.py && node assets/print/build.js`（カードの名前・質問は `app/src/oracle.js` から取る）。
ゲームの倍率や改竄の額を変えたら、`build.py` の表も合わせて直す。
