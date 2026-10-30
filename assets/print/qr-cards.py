"""スマホがない人用のQRカード（マイページ）を手元で作る。

  python3 assets/print/qr-cards.py [枚数=30]   → assets/print/private/qr-cards.html と import-link.txt
  node assets/print/build.js private          → assets/print/private/qr-cards.pdf

QRの中身はマイページの鍵なので、公開リポジトリには入れない（private/ は .gitignore 済み）。
印刷したら、責任者以上でスタッフ画面にログインしてから import-link.txt のリンクを開き「登録する」を押す。
もう一度実行しても同じカードを使う（足りなければ足す）。
"""
import json, os, secrets, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'private')
os.makedirs(OUT, exist_ok=True)
N = int(sys.argv[1]) if len(sys.argv) > 1 else 30
APP = 'https://app.moneytalks-uranai.com'
ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'   # app/src/util.js の shortCode と同じ（0 O 1 I L なし）

db = os.path.join(OUT, 'qr-cards.json')
cards = json.load(open(db)) if os.path.exists(db) else []
while len(cards) < N:
    code = ''.join(secrets.choice(ALPHA) for _ in range(6))
    if any(c['shortCode'] == code for c in cards):
        continue
    cards.append({'token': secrets.token_urlsafe(16), 'shortCode': code})
json.dump(cards, open(db, 'w'), indent=1)
cards = cards[:N]

CSS = """
  .sheet { position: absolute; top: 11mm; left: 14mm; display: grid; grid-template-columns: repeat(2, 91mm); grid-template-rows: repeat(5, 55mm); }
  .fuda { position: relative; width: 91mm; height: 55mm; padding: 4.5mm 5mm 4.5mm 5mm; display: grid; grid-template-columns: 34mm 1fr; gap: 4.5mm; align-items: center; border: 0.25mm dashed #c9c1c4; background: var(--paper); }
  .fuda::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2mm; background: var(--red); }
  .fuda .qr { width: 34mm; padding: 1.5mm; background: #fff; border: 0.4mm solid var(--ink); border-radius: 1.5mm; }
  .fuda .t { font-size: 6.5pt; letter-spacing: 0.25em; color: var(--red); font-weight: 700; }
  .fuda .nm { margin-top: 1mm; font-family: var(--mincho); font-weight: 800; font-size: 9.5pt; white-space: nowrap; line-height: 1.3; }
  .fuda .lb { margin-top: 2.5mm; font-size: 6pt; color: var(--muted); letter-spacing: 0.15em; }
  .fuda .code { font-family: var(--mincho); font-weight: 800; font-size: 17pt; letter-spacing: 0.16em; line-height: 1.1; }
  .fuda .how { margin-top: 2mm; font-size: 6.3pt; white-space: nowrap; line-height: 1.55; }
  .fuda .how b { color: var(--red); }
  .fuda .meta { position: absolute; right: 4mm; bottom: 3mm; font-size: 5.5pt; color: var(--muted); letter-spacing: 0.15em; }
  .guide { position: absolute; left: 0; right: 0; bottom: 4mm; text-align: center; font-size: 7pt; color: #999; }
"""


def fuda(i, c):
    return (f'<div class="fuda"><div class="qr" data-qr="{APP}/u/{c["token"]}"></div><div>'
            '<p class="t">マイページ</p><p class="nm">運命、<br>賄賂で買いませんか？</p>'
            f'<p class="lb">カード番号</p><p class="code">{c["shortCode"]}</p>'
            '<p class="how">スマホの人：<b>QRを読んで名前を入れる</b><br>スマホがない人：<b>このカードを見せる</b></p></div>'
            f'<p class="meta">収穫祭2026　2年C組　No.{i + 1:02d}</p></div>')


import build_head  # noqa: E402  (build.py と同じ見た目の土台)

pages = []
for p in range(0, len(cards), 10):
    pages.append('<section class="page"><div class="sheet">' + ''.join(fuda(p + j, c) for j, c in enumerate(cards[p:p + 10])) + '</div>'
                 f'<p class="guide">QRカード（スマホがない人用） {p // 10 + 1}/{(len(cards) + 9) // 10}　点線で切る</p></section>')
open(os.path.join(OUT, 'qr-cards.html'), 'w').write(build_head.page('QRカード', ''.join(pages), CSS, depth=3))
link = APP + '/staff/cards#add=' + ','.join(c['token'] + '.' + c['shortCode'] for c in cards)
open(os.path.join(OUT, 'import-link.txt'), 'w').write(link + '\n')
print(f'{len(cards)} 枚', os.path.join(OUT, 'qr-cards.html'))
