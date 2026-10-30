"""印刷物の HTML の土台（フォント・色・QRの描画）。build.py と qr-cards.py で使う。"""

HEAD = """<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@600;800&family=Noto+Sans+JP:wght@500;700;900&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --paper: #fefefc; --ink: #1c1a1b; --muted: #6b6466; --line: #d9d3d5; --red: #9f1111; --hot: #e0352b; --plum: #663661; --lilac: #d9b8dc; --sky: #bcdce8;
    --mincho: "Shippori Mincho B1", "Hiragino Mincho ProN", serif; --gothic: "Noto Sans JP", "Hiragino Sans", sans-serif; }
  html, body { background: #fff; color: var(--ink); font-family: var(--gothic); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; width: 210mm; height: 297mm; overflow: hidden; page-break-after: always; break-after: page; background: var(--paper); }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .mincho { font-family: var(--mincho); font-weight: 800; }
  .qr svg { width: 100%; height: auto; display: block; }
  .foot { position: absolute; left: 0; right: 0; bottom: 9mm; text-align: center; font-size: 8.5pt; color: var(--muted); letter-spacing: 0.2em; }
  .brand { display: flex; align-items: center; justify-content: center; gap: 3mm; font-family: var(--mincho); font-weight: 800; font-size: 11pt; letter-spacing: 0.06em; }
  .brand img { width: 10mm; height: 10mm; }
{css}
</style></head><body>
{body}
<script src="../../../app/public/vendor/qrcode.js"></script>
<script>
  document.querySelectorAll('[data-qr]').forEach(function (el) { var q = qrcode(0, el.dataset.ec || 'M'); q.addData(el.dataset.qr); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); });
  Promise.all([document.fonts.ready].concat(Array.from(document.images).map(function (i) { return i.complete ? 1 : new Promise(function (r) { i.onload = i.onerror = r; }); }))).then(function () { document.body.dataset.ready = '1'; });
</script>
</body></html>"""


def page(title, body, css='', depth=3):
    """depth: リポジトリの一番上から見た、この HTML の深さ（qrcode.js や画像への相対パスに使う）"""
    up = '../' * depth
    return (HEAD.replace('{title}', title).replace('{css}', css).replace('{body}', body)
            .replace('../../../app/', up + 'app/'))
