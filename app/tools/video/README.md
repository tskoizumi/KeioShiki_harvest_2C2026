# 説明動画を作り直す

画面を変えたら、ここで動画を作り直す。研修モードのサーバーを Playwright で実際に操作しながら録るので、動画はいつも今の画面と同じになる。

```bash
cd app
npm run dev:training                 # 別の端末で。http://127.0.0.1:8789（研修モード）
node tools/video/customer.js         # お客さん向け（縦）→ tools/video/out/customer.mp4
node tools/video/staff.js            # スタッフ研修（横）→ tools/video/out/staff.mp4
```

- `ffmpeg` が PATH にあること（別の場所なら `FFMPEG=/path/to/ffmpeg node ...`）。H.264 の mp4 にする
- Playwright と Chromium（`npx playwright install chromium`）
- `studio.html` が舞台。字幕・端末の枠・タイトルカード。`lib.js` が録画と操作の部品
- できた mp4 は `docs/video/` に置き換える。音はないので BGM は後から重ねる

仕組み：スタジオページ（zoom: 2 で 2 倍にくっきり描く）の中に本物の画面を iframe で入れ、CDP の screencast でフレームを保存し、ffmpeg でつなぐ。
