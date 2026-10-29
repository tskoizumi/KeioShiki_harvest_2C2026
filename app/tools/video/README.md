# 説明動画を作り直す

画面を変えたら、ここで動画を作り直す。研修モードのサーバーを Playwright で実際に操作しながら録り、ナレーション・BGM・効果音を重ねる。

```bash
cd app
npm run dev:training                         # 別の端末で。http://127.0.0.1:8789（研修モード）
pip install pyopenjtalk-plus numpy           # ナレーション（Open JTalk）と音の合成
node tools/video/customer.js                 # お客さん向け（縦）→ tools/video/out/customer.mp4
node tools/video/staff.js                    # スタッフ研修（横）→ tools/video/out/staff.mp4
```

- `ffmpeg`（libx264 と aac が入ったもの）が PATH にあること。別の場所なら `FFMPEG=/path/to/ffmpeg`
- Python が `python3` でないときは `TTS_PY=/path/to/python`
- Playwright と Chromium（`npx playwright install chromium`）
- できた mp4 は `docs/video/` に置き換える

## 中身

| ファイル | 役目 |
| --- | --- |
| `studio.html` | 舞台。字幕・端末の枠・タイトル・タップの波紋 |
| `lib.js` | 録画（CDP の screencast）、iframe の中の操作、ナレーションと効果音の時刻を記録 |
| `audio.py` | ナレーションの合成（Open JTalk）、BGM と効果音の合成（numpy）、ミックス（声の間は BGM を下げる） |
| `customer.js` / `staff.js` | 台本。`s.cap()` が字幕、`s.say()` がナレーション、`s.sfx()` が効果音 |

## 音について

- **ナレーション**は Open JTalk の合成音声。読み方がおかしいところは、台本の文をひらがなにすると直る（例：縁 → えん、改竄 → かいざん）
- **BGM** は `audio.py` の `bgm()` がその場で作るオリジナル（Dマイナーのゆっくりした曲）。著作権の心配はない
- 自分の曲に差し替えるときは、`audio.py mix` の `music = bgm(...)` を、曲の wav を読む処理に変える
- **自分の声に差し替える**：[`docs/video/narration-script.md`](../../../docs/video/narration-script.md) の番号どおりに録音して、`voice-human/c01.m4a` のように置いてから動画を作り直す。前後の無音は自動で切り、音量もそろえる。録音のない行は合成音声のまま。読む速さに合わせて画面の録画も自動で伸び縮みする
- `voice-human/` は `.gitignore` 済み（声は公開リポジトリに入れない）
