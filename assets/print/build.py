"""印刷物を作る：HTML を書き出し、build.js が A4 の PDF にする。

  python3 assets/print/build.py   → assets/print/src/*.html
  node assets/print/build.js      → assets/print/*.pdf と 全部まとめた all.pdf

中身（兆のカード・質問・ルール）は app/src/oracle.js と migrations から取る。文言を直すときはそちらを直してから作り直す。
"""
import json, os, subprocess, html, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(HERE, 'src')
os.makedirs(SRC, exist_ok=True)

# 占いのデータ（oracle.js）
O = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', """
import { ORACLE } from './app/src/oracle.js';
console.log(JSON.stringify({ k: ORACLE.KIZASHI.map(k => ({ id: k.id, name: k.name, omen: k.omen, base: k.base })), judge: ORACLE.JUDGE.map(q => q.text), mention: ORACLE.MENTION.map(q => q.text), dir: ORACLE.DIRECTION }));
"""], cwd=ROOT))

APP = 'https://app.moneytalks-uranai.com'
TRAIN = 'https://training.moneytalks-uranai.com/training'
LP = 'https://moneytalks-uranai.com/'
e = html.escape

from build_head import HEAD  # noqa: E402

MARK = '../../mark-alpha.webp'
BRAND = f'<div class="brand"><img src="{MARK}" alt="">運命、賄賂で買いませんか？</div>'


def write(name, title, body, css=''):
    with open(os.path.join(SRC, name + '.html'), 'w') as f:
        f.write(HEAD.replace('{title}', e(title)).replace('{css}', css).replace('{body}', body))


# ============================================================
# 1. 兆のカード（タロット大 70×120mm、A4に4枚。表と裏）
# ============================================================
SYM = {
    # 紙を切って貼ったような、平らな形で描く
    'tomoshibi': '<rect x="38" y="52" width="24" height="34" rx="3" fill="#1c1a1b"/><rect x="34" y="84" width="32" height="6" rx="2" fill="#663661"/><path d="M50 14 C62 30 64 40 50 50 C36 40 38 30 50 14Z" fill="#e0352b"/><path d="M50 28 C55 36 55 42 50 47 C45 42 45 36 50 28Z" fill="#f6c96b"/><line x1="50" y1="47" x2="50" y2="53" stroke="#1c1a1b" stroke-width="2"/>',
    'sakeme': '<circle cx="50" cy="52" r="34" fill="#bcdce8"/><path d="M50 18 L44 34 L56 44 L42 58 L54 68 L46 86" fill="none" stroke="#1c1a1b" stroke-width="5" stroke-linejoin="miter"/><path d="M56 44 L68 46 M42 58 L30 54" stroke="#1c1a1b" stroke-width="3"/>',
    'chinmoku': '<circle cx="50" cy="50" r="34" fill="#d9b8dc"/><path d="M30 56 Q50 64 70 56" fill="none" stroke="#1c1a1b" stroke-width="5" stroke-linecap="round"/><rect x="46" y="38" width="8" height="34" rx="4" fill="#9f1111"/><path d="M34 40 Q38 36 42 40 M58 40 Q62 36 66 40" fill="none" stroke="#1c1a1b" stroke-width="3" stroke-linecap="round"/>',
    'suzu': '<path d="M50 10 Q56 10 56 18" fill="none" stroke="#9f1111" stroke-width="4"/><rect x="40" y="14" width="20" height="6" rx="3" fill="#663661"/><circle cx="50" cy="52" r="30" fill="#e0b84a"/><path d="M24 54 L76 54" stroke="#1c1a1b" stroke-width="4"/><circle cx="50" cy="66" r="5" fill="#1c1a1b"/><path d="M50 71 L50 80" stroke="#1c1a1b" stroke-width="4"/><path d="M40 84 Q50 96 60 84" fill="#9f1111"/>',
    'kagi': '<circle cx="34" cy="34" r="18" fill="#e0b84a"/><circle cx="34" cy="34" r="8" fill="#fefefc"/><rect x="44" y="42" width="10" height="48" rx="3" transform="rotate(-45 49 66)" fill="#e0b84a"/><path d="M62 70 L74 58 L80 64 L68 76 Z M70 78 L80 68 L86 74 L76 84 Z" fill="#1c1a1b"/>',
    'tori': '<path d="M14 58 Q30 40 52 46 Q66 30 88 30 Q74 40 70 52 Q66 70 44 72 L30 84 L32 70 Q20 68 14 58Z" fill="#1c1a1b"/><path d="M52 46 Q60 54 70 52" fill="none" stroke="#663661" stroke-width="3"/><circle cx="76" cy="36" r="2.5" fill="#fefefc"/>',
    'tsuki': '<circle cx="52" cy="50" r="34" fill="#f6c96b"/><circle cx="66" cy="42" r="30" fill="#fefefc"/><circle cx="28" cy="22" r="2.5" fill="#663661"/><circle cx="78" cy="78" r="3" fill="#663661"/><circle cx="20" cy="80" r="2" fill="#663661"/>',
    'suna': '<rect x="26" y="12" width="48" height="6" rx="2" fill="#663661"/><rect x="26" y="82" width="48" height="6" rx="2" fill="#663661"/><path d="M32 18 L68 18 L52 50 L68 82 L32 82 L48 50 Z" fill="#bcdce8" stroke="#1c1a1b" stroke-width="3" stroke-linejoin="round"/><path d="M38 26 L62 26 L50 46Z" fill="#e0b84a"/><path d="M36 82 Q50 62 64 82Z" fill="#e0b84a"/><line x1="50" y1="48" x2="50" y2="70" stroke="#e0b84a" stroke-width="2" stroke-dasharray="2 3"/>',
    'ashioto': '<ellipse cx="36" cy="66" rx="10" ry="16" fill="#1c1a1b"/><circle cx="30" cy="44" r="3.5" fill="#1c1a1b"/><circle cx="37" cy="42" r="3.5" fill="#1c1a1b"/><circle cx="44" cy="45" r="3" fill="#1c1a1b"/><ellipse cx="64" cy="40" rx="10" ry="16" fill="#9f1111"/><circle cx="58" cy="18" r="3.5" fill="#9f1111"/><circle cx="65" cy="16" r="3.5" fill="#9f1111"/><circle cx="72" cy="19" r="3" fill="#9f1111"/>',
    'ito': '<rect x="30" y="20" width="40" height="8" rx="2" fill="#663661"/><rect x="30" y="66" width="40" height="8" rx="2" fill="#663661"/><rect x="35" y="28" width="30" height="38" fill="#e0352b"/><path d="M35 34 H65 M35 40 H65 M35 46 H65 M35 52 H65 M35 58 H65" stroke="#9f1111" stroke-width="2"/><path d="M65 48 C84 52 86 78 66 84 C50 88 40 80 22 90" fill="none" stroke="#e0352b" stroke-width="3" stroke-linecap="round"/>',
}
OMEN = {'good': '吉', 'bad': '凶', 'mixed': '半'}
NUM = ['壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖', '拾']
CARD_CSS = """
  .sheet { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(2, 70mm); grid-template-rows: repeat(2, 120mm); column-gap: 14mm; row-gap: 12mm; justify-content: center; align-content: center; }
  .card { position: relative; width: 70mm; height: 120mm; overflow: hidden; }
  .crop { position: absolute; width: 5mm; height: 5mm; border-color: #999; border-style: solid; border-width: 0; }
  .front { background: var(--paper); border: 0.3mm solid #e6e0e2; }
  .front .frame { position: absolute; inset: 4mm; border: 0.5mm solid var(--ink); border-radius: 2mm; }
  .front .frame::after { content: ""; position: absolute; inset: 1.2mm; border: 0.25mm solid var(--red); border-radius: 1.4mm; }
  .front .no { position: absolute; top: 8mm; left: 0; right: 0; text-align: center; font-family: var(--mincho); font-weight: 800; font-size: 11pt; letter-spacing: 0.4em; color: var(--red); }
  .front .sym { position: absolute; top: 18mm; left: 10mm; width: 50mm; height: 50mm; }
  .front .nm { position: absolute; top: 70mm; left: 0; right: 0; text-align: center; font-family: var(--mincho); font-weight: 800; font-size: 34pt; line-height: 1; letter-spacing: 0.06em; }
  .front .yomi { position: absolute; top: 86mm; left: 0; right: 0; text-align: center; font-size: 8pt; letter-spacing: 0.3em; color: var(--muted); }
  .front .ln { position: absolute; top: 93mm; left: 10mm; right: 10mm; text-align: center; font-family: var(--mincho); font-weight: 600; font-size: 8.5pt; line-height: 1.7; }
  .front .om { position: absolute; bottom: 8.5mm; left: 0; right: 0; text-align: center; font-size: 6.5pt; letter-spacing: 0.3em; color: var(--muted); }
  .back { background: var(--ink); }
  .back .pat { position: absolute; inset: 0; background-image: radial-gradient(circle at 50% 50%, rgba(217,184,220,0.18) 0 1.1mm, transparent 1.2mm), linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25% 75%, rgba(255,255,255,0.04) 75%), linear-gradient(-45deg, rgba(255,255,255,0.04) 25%, transparent 25% 75%, rgba(255,255,255,0.04) 75%); background-size: 7mm 7mm, 7mm 7mm, 7mm 7mm; }
  .back .frame { position: absolute; inset: 4mm; border: 0.5mm solid #e0b84a; border-radius: 2mm; }
  .back .frame::after { content: ""; position: absolute; inset: 1.2mm; border: 0.25mm solid #e0352b; border-radius: 1.4mm; }
  .back .disc { position: absolute; left: 50%; top: 50%; width: 40mm; height: 40mm; transform: translate(-50%, -50%); border-radius: 50%; background: radial-gradient(circle, #fefefc 58%, #d9b8dc 59% 62%, transparent 63%); display: grid; place-items: center; }
  .back .disc img { width: 30mm; height: 30mm; }
  .back .k { position: absolute; left: 0; right: 0; text-align: center; font-family: var(--mincho); font-weight: 800; color: #e0b84a; }
  .back .k.t { top: 13mm; font-size: 20pt; }
  .back .k.b { bottom: 12mm; font-size: 7pt; letter-spacing: 0.25em; color: #d9b8dc; font-weight: 600; }
  .guide { position: absolute; left: 0; right: 0; bottom: 4mm; text-align: center; font-size: 7pt; color: #999; }
"""


def crops():
    # 四隅のトンボ（切る目印）
    s = 'border-color:#aaa;border-style:solid;'
    return (f'<i class="crop" style="left:-6mm;top:-0.15mm;width:5mm;height:0;border-top-width:0.2mm;{s}"></i>'
            f'<i class="crop" style="left:-0.15mm;top:-6mm;width:0;height:5mm;border-left-width:0.2mm;{s}"></i>'
            f'<i class="crop" style="right:-6mm;top:-0.15mm;width:5mm;height:0;border-top-width:0.2mm;{s}"></i>'
            f'<i class="crop" style="right:-0.15mm;top:-6mm;width:0;height:5mm;border-left-width:0.2mm;{s}"></i>'
            f'<i class="crop" style="left:-6mm;bottom:-0.15mm;width:5mm;height:0;border-top-width:0.2mm;{s}"></i>'
            f'<i class="crop" style="left:-0.15mm;bottom:-6mm;width:0;height:5mm;border-left-width:0.2mm;{s}"></i>'
            f'<i class="crop" style="right:-6mm;bottom:-0.15mm;width:5mm;height:0;border-top-width:0.2mm;{s}"></i>'
            f'<i class="crop" style="right:-0.15mm;bottom:-6mm;width:0;height:5mm;border-left-width:0.2mm;{s}"></i>')


YOMI = {'tomoshibi': 'ともしび', 'sakeme': 'さけめ', 'chinmoku': 'ちんもく', 'suzu': 'すず', 'kagi': 'かぎ', 'tori': 'とり', 'tsuki': 'つき', 'suna': 'すな', 'ashioto': 'あしおと', 'ito': 'いと'}


def card_front(i, k):
    first = k['base'].split('。')[1] + '。' if len(k['base'].split('。')) > 2 else k['base'].split('。')[0] + '。'
    return (f'<div class="card front">{crops()}<div class="frame"></div><p class="no">第{NUM[i]}の兆</p>'
            f'<svg class="sym" viewBox="0 0 100 100">{SYM[k["id"]]}</svg>'
            f'<p class="nm">{e(k["name"])}</p><p class="yomi">{YOMI[k["id"]]}</p><p class="ln">{e(first)}</p>'
            f'<p class="om">{OMEN[k["omen"]]}　運命、賄賂で買いませんか？</p></div>')


def card_back():
    return (f'<div class="card back">{crops()}<div class="pat"></div><div class="frame"></div><p class="k t">兆</p>'
            f'<div class="disc"><img src="{MARK}" alt=""></div><p class="k b">運命、賄賂で買いませんか？</p></div>')


cards = O['k']
pages = []
for p in range(0, len(cards), 4):
    chunk = cards[p:p + 4]
    pages.append('<section class="page"><div class="sheet">' + ''.join(card_front(p + j, k) for j, k in enumerate(chunk)) + '</div>'
                 f'<p class="guide">兆のカード　表 {p // 4 + 1}/3　トンボ（四隅の線）に合わせて切る</p></section>')
    # 裏面：両面印刷（長辺とじ）で表の裏に来るよう、左右を入れ替えて並べる（裏はどれも同じ柄）
    backs = [card_back() for _ in chunk]
    if len(backs) % 2:
        backs.append('<div></div>')
    rows = [backs[r:r + 2][::-1] for r in range(0, len(backs), 2)]
    pages.append('<section class="page"><div class="sheet">' + ''.join(''.join(r) for r in rows) + '</div>'
                 f'<p class="guide">兆のカード　裏 {p // 4 + 1}/3（両面印刷・長辺とじ）</p></section>')
write('01-cards', '兆のカード', ''.join(pages), CARD_CSS)

# ============================================================
# 2. 質問票（A5 を2枚。A4を半分に切る）
# ============================================================
Q_CSS = """
  .half { position: absolute; left: 0; right: 0; height: 148.5mm; padding: 9mm 11mm 8mm; }
  .half.b { top: 148.5mm; }
  .cut { position: absolute; left: 0; right: 0; top: 148.5mm; border-top: 0.25mm dashed #bbb; }
  .cut span { position: absolute; left: 50%; top: -2.2mm; transform: translateX(-50%); background: var(--paper); padding: 0 3mm; font-size: 6.5pt; color: #999; letter-spacing: 0.2em; }
  .hd { display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm; }
  .hd h1 { font-family: var(--mincho); font-weight: 800; font-size: 17pt; line-height: 1.1; }
  .hd h1 small { display: block; font-family: var(--gothic); font-weight: 700; font-size: 7.5pt; letter-spacing: 0.25em; color: var(--red); margin-bottom: 1.5mm; }
  .nm { display: flex; gap: 3mm; align-items: flex-end; font-size: 8pt; font-weight: 700; }
  .nm i { display: inline-block; width: 42mm; border-bottom: 0.3mm solid var(--ink); height: 7mm; }
  .lead { margin-top: 2.5mm; font-size: 7.6pt; color: var(--muted); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 3mm; }
  .col h2 { font-size: 7.5pt; font-weight: 900; letter-spacing: 0.15em; color: var(--plum); border-bottom: 0.3mm solid var(--ink); padding-bottom: 1mm; display: flex; justify-content: space-between; }
  .col h2 span { font-weight: 700; color: var(--muted); letter-spacing: 0; }
  .q { display: grid; grid-template-columns: 6mm 1fr auto; gap: 1.5mm; align-items: center; padding: 1.35mm 0; border-bottom: 0.2mm solid var(--line); font-size: 7.8pt; line-height: 1.35; }
  .q b { font-family: var(--mincho); font-weight: 800; color: var(--red); font-size: 8pt; }
  .dots { display: flex; gap: 1mm; }
  .dots i { width: 4.6mm; height: 4.6mm; border: 0.3mm solid var(--ink); border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 6pt; color: var(--muted); }
  .scale { display: flex; justify-content: flex-end; gap: 1mm; font-size: 6pt; color: var(--muted); }
  .scale span { width: 4.6mm; text-align: center; }
  .ft { position: absolute; left: 11mm; right: 11mm; bottom: 6mm; display: flex; justify-content: space-between; font-size: 6.5pt; color: var(--muted); }
"""


def qcol(prefix, title, qs):
    rows = ''.join(f'<div class="q"><b>{prefix}{i + 1}</b><span>{e(t)}</span><span class="dots">' + ''.join(f'<i>{n}</i>' for n in range(1, 6)) + '</span></div>' for i, t in enumerate(qs))
    return (f'<div class="col"><h2>{title}<span>1 ちがう ←→ そう 5</span></h2>{rows}</div>')


def qsheet(cls):
    return (f'<div class="half {cls}"><div class="hd"><h1><small>占いの前に</small>あなたについての質問</h1>'
            '<div class="nm">ニックネーム<i></i></div></div>'
            '<p class="lead">直感で、1〜5 のどれかに丸をつけてください。むずかしく考えなくて大丈夫です。書いたら、占いの部屋で占い師に渡してください。</p>'
            '<div class="cols">' + qcol('A', '質問 A', O['judge']) + qcol('B', '質問 B', O['mention']) + '</div>'
            '<div class="ft"><span>運命、賄賂で買いませんか？　2年C組</span><span>答えは占いにだけ使います</span></div></div>')


write('02-questions', '質問票', '<section class="page">' + qsheet('a') + '<div class="cut"><span>ここで切る</span></div>' + qsheet('b') + '</section>', Q_CSS)

# ============================================================
# 3. 受付のQR（掲示）
# ============================================================
ENTRY_CSS = """
  .wrap { position: absolute; inset: 0; padding: 22mm 20mm; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .k { font-size: 12pt; font-weight: 900; letter-spacing: 0.4em; color: var(--red); margin-top: 10mm; }
  h1 { font-family: var(--mincho); font-weight: 800; font-size: 34pt; line-height: 1.3; margin-top: 3mm; }
  .qr { width: 118mm; margin-top: 10mm; padding: 6mm; border: 0.6mm solid var(--ink); border-radius: 6mm; background: #fff; }
  .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin-top: 11mm; width: 100%; }
  .st { padding: 4mm 3mm; border-radius: 4mm; background: #f3eef0; }
  .st b { display: grid; place-items: center; width: 9mm; height: 9mm; margin: 0 auto 2mm; border-radius: 50%; background: var(--ink); color: var(--paper); font-family: var(--mincho); font-size: 13pt; }
  .st p { font-size: 11pt; font-weight: 700; line-height: 1.5; }
  .note { margin-top: 8mm; font-size: 10.5pt; color: var(--muted); line-height: 1.7; }
"""
write('03-entry-qr', '受付のQR',
      f'<section class="page"><div class="wrap">{BRAND}<p class="k">受付</p><h1>スマホのカメラで<br>読んでください</h1>'
      f'<div class="qr" data-qr="{APP}/" data-ec="H"></div>'
      '<div class="steps"><div class="st"><b>1</b><p>QRを読む</p></div><div class="st"><b>2</b><p>ニックネームを<br>入れる</p></div><div class="st"><b>3</b><p>100縁<br>もらえる</p></div></div>'
      '<p class="note">縁（えん）は、この出し物の中だけで使えるお金です。<br>スマホがない人は、受付のスタッフに声をかけてください（QRカードを渡します）。</p>'
      f'</div><p class="foot">{APP.replace("https://", "")}</p></section>', ENTRY_CSS)

# ============================================================
# 4. ゲームのルール（各卓に1枚）
# ============================================================
GAMES = [
    ('的当て', 'まとあて', '参加費 10縁', '的にボールを投げて、当たった場所で戻る縁が決まります。',
     [('はずれ', '0縁'), ('外側', '20縁'), ('中', '30縁'), ('内側', '40縁'), ('中心', '50縁')], ['投げる位置はスタッフが案内します', '何回でも遊べます'], None),
    ('神経衰弱', 'しんけいすいじゃく', '参加費 50縁', '裏返したカードを2枚ずつめくって、同じ絵をそろえます。',
     [('0組', '0縁'), ('1組', '50縁'), ('2組', '100縁'), ('3組', '150縁'), ('4組以上', '200縁')], ['制限時間はスタッフが伝えます', '何回でも遊べます'], None),
    ('積み', 'つみ', '参加費 100縁', 'ブロックを1つずつ積んでいき、崩れたところで終わりです。',
     [('崩れる前に積めた段数', '1段 × 50縁'), ('いちばん多いとき', '20段 ＝ 1,000縁')], ['友達と交代で積んでもかまいません', '何回でも遊べます'], None),
    ('チンチロ', 'ちんちろ', '賭け金は自由（10縁から）', 'サイコロを3つ振って、出た目で勝負します。戻る縁 ＝ 賭け金 × 倍率。',
     [('ピンゾロ（1が3つ）', '×5'), ('4-5-6', '×4'), ('ゾロ目', '×3'), ('勝ち', '×2'), ('目なし（引き分け）', '×1'), ('負け', '×0'), ('ションベン（器から出た）', '×−1　さらに払う'), ('ヒフミ（1-2-3）', '×−2　さらに払う')],
     ['マイナスは、賭け金を失ったうえ、さらに払います（残高より多くは取りません）'],
     [('〜999縁', 'そのまま'), ('1,000〜2,999縁', '÷2'), ('3,000〜5,999縁', '÷3'), ('6,000〜9,999縁', '÷4'), ('10,000縁〜', '÷5')]),
]
GAME_CSS = """
  .wrap { position: absolute; inset: 0; padding: 18mm 20mm; }
  .k { margin-top: 12mm; font-size: 11pt; font-weight: 900; letter-spacing: 0.4em; color: var(--red); }
  h1 { font-family: var(--mincho); font-weight: 800; font-size: 60pt; line-height: 1.1; margin-top: 2mm; }
  .yomi { font-size: 11pt; letter-spacing: 0.3em; color: var(--muted); }
  .fee { display: inline-block; margin-top: 6mm; padding: 2.5mm 7mm; border-radius: 99mm; background: var(--ink); color: var(--paper); font-weight: 900; font-size: 17pt; }
  .how { margin-top: 7mm; font-size: 14pt; font-weight: 700; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; margin-top: 6mm; }
  th, td { padding: 3.2mm 2mm; border-bottom: 0.3mm solid var(--line); font-size: 14pt; text-align: left; }
  td:last-child { text-align: right; font-family: var(--mincho); font-weight: 800; font-size: 16pt; }
  td.neg { color: var(--red); }
  th { font-size: 9.5pt; color: var(--muted); font-weight: 700; letter-spacing: 0.1em; border-bottom: 0.5mm solid var(--ink); }
  .notes { margin-top: 6mm; font-size: 11.5pt; line-height: 1.8; }
  .notes li { margin-left: 5mm; }
  .tax { margin-top: 6mm; padding: 4mm 5mm; border-radius: 4mm; background: #f3eef0; }
  .tax h2 { font-size: 11pt; font-weight: 900; }
  .tax p { font-size: 9.5pt; color: var(--muted); margin-top: 1mm; line-height: 1.6; }
  .tax table { margin-top: 2mm; }
  .tax td, .tax th { font-size: 10.5pt; padding: 1.6mm 2mm; }
  .tax td:last-child { font-size: 12pt; }
  .qrbox { position: absolute; right: 20mm; top: 30mm; width: 32mm; text-align: center; font-size: 7pt; color: var(--muted); }
  /* 結果が多いページ（チンチロ）は詰める */
  .compact .k { margin-top: 6mm; }
  .compact h1 { font-size: 44pt; }
  .compact .fee { margin-top: 3mm; font-size: 14pt; }
  .compact .how { margin-top: 4mm; font-size: 12pt; }
  .compact table { margin-top: 3mm; }
  .compact th, .compact td { padding: 1.9mm 2mm; font-size: 12pt; }
  .compact td:last-child { font-size: 13pt; }
  .compact .tax { margin-top: 4mm; padding: 3mm 4mm; }
  .tg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2mm; margin-top: 2.5mm; }
  .tg div { display: grid; gap: 1mm; text-align: center; padding: 2.5mm 1mm; background: #fff; border-radius: 2mm; }
  .tg span { font-size: 9pt; }
  .tg b { font-family: var(--mincho); font-weight: 800; font-size: 15pt; color: var(--red); }
  .compact .notes { margin-top: 4mm; font-size: 10.5pt; line-height: 1.7; }
"""
gpages = []
for name, yomi, fee, how, table, notes, tax in GAMES:
    t = ''.join(f'<tr><td>{e(a)}</td><td class="{"neg" if "−" in b else ""}">{e(b)}</td></tr>' for a, b in table)
    taxh = ''
    if tax:
        taxh = ('<div class="tax"><h2>お金持ちほど、勝ちの倍率が下がります</h2><p>始めたときの残高で決まります。×1 より大きい倍率だけを割り、×1 より下にはなりません。</p><div class="tg">'
                + ''.join(f'<div><span>{e(a)}</span><b>{e(b)}</b></div>' for a, b in tax) + '</div></div>')
    gpages.append(f'<section class="page"><div class="wrap{" compact" if tax else ""}">{BRAND}<p class="k">ミニゲーム</p><h1>{e(name)}</h1><p class="yomi">{yomi}</p>'
                  f'<span class="fee">{e(fee)}</span><p class="how">{e(how)}</p>'
                  f'<table><tr><th>結果</th><th>{"倍率" if tax else "戻る縁"}</th></tr>{t}</table>{taxh}'
                  '<ul class="notes">' + ''.join(f'<li>{e(n)}</li>' for n in notes) + '<li>はじめる前に、マイページのQRをスタッフに見せてください</li></ul>'
                  f'</div></section>')
write('04-game-rules', 'ゲームのルール', ''.join(gpages), GAME_CSS)

# ============================================================
# 5. 占いの部屋：料金表（お客さん向け）
# ============================================================
PRICE_CSS = """
  .wrap { position: absolute; inset: 0; padding: 18mm 18mm; display: flex; flex-direction: column; }
  .k { margin-top: 12mm; text-align: center; font-size: 11pt; font-weight: 900; letter-spacing: 0.4em; color: var(--red); }
  h1 { text-align: center; font-family: var(--mincho); font-weight: 800; font-size: 31pt; line-height: 1.35; margin-top: 3mm; }
  .lead { text-align: center; margin-top: 5mm; font-size: 12.5pt; line-height: 1.8; }
  .ranks { display: grid; gap: 4mm; margin-top: 9mm; }
  .r { display: grid; grid-template-columns: 30mm 46mm 1fr; gap: 5mm; align-items: center; padding: 5mm 6mm; border-radius: 4mm; border: 0.4mm solid var(--line); }
  .r .seal { display: grid; place-items: center; width: 22mm; height: 22mm; border: 0.9mm solid var(--red); border-radius: 2mm; color: var(--red); font-family: var(--mincho); font-weight: 800; font-size: 26pt; transform: rotate(-5deg); }
  .r .amt { font-family: var(--mincho); font-weight: 800; font-size: 17pt; }
  .r .txt { font-size: 12pt; line-height: 1.6; }
  .r.mu .seal { border-color: #a29b9e; color: #a29b9e; }
  .r.kz { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .r.kz .seal { background: var(--hot); border-color: var(--hot); color: #fff; font-size: 16pt; }
  .end { margin-top: auto; text-align: center; font-size: 11pt; color: var(--muted); line-height: 1.8; }
"""
write('05-price', '占いの料金表',
      f'<section class="page"><div class="wrap">{BRAND}<p class="k">占いの部屋</p><h1>占いの中身は、<br>賄賂（わいろ）で決まる。</h1>'
      '<p class="lead">占い師に渡す縁の額で、ランクが変わります。<br>額はあなたが決めてください。</p><div class="ranks">'
      '<div class="r mu"><span class="seal">無</span><span class="amt">0〜99縁</span><span class="txt">事実だけを、短く。そっけない。</span></div>'
      '<div class="r"><span class="seal">小</span><span class="amt">100〜499縁</span><span class="txt">普通に、丁寧に占う。少しアドバイスつき。</span></div>'
      '<div class="r"><span class="seal">大</span><span class="amt">500〜1,999縁</span><span class="txt">とても丁寧に。とにかく、ほめてくれる。</span></div>'
      '<div class="r kz"><span class="seal">改竄</span><span class="amt">2,000縁〜</span><span class="txt">鈴が鳴り、占い師が結果を<b>最高のものに書き換える</b>。</span></div>'
      '</div><p class="end">占いは何回でも受けられます。結果の画像はマイページに届きます。<br>※ 改竄の額は、混み具合で変わることがあります</p></div></section>', PRICE_CSS)

# ============================================================
# 6. 占い師の早見表
# ============================================================
TELL_CSS = """
  .wrap { position: absolute; inset: 0; padding: 14mm 16mm; }
  h1 { font-family: var(--mincho); font-weight: 800; font-size: 22pt; margin-top: 5mm; }
  h2 { font-size: 10.5pt; font-weight: 900; color: var(--plum); letter-spacing: 0.12em; margin-top: 6mm; border-bottom: 0.4mm solid var(--ink); padding-bottom: 1mm; }
  ol.steps { list-style: none; display: grid; grid-template-columns: repeat(5, 1fr); gap: 3mm; margin-top: 3mm; }
  ol.steps li { padding: 3mm; border-radius: 3mm; background: #f3eef0; font-size: 9pt; line-height: 1.55; }
  ol.steps b { display: block; font-family: var(--mincho); font-size: 13pt; margin-bottom: 1mm; }
  table { width: 100%; border-collapse: collapse; margin-top: 2mm; }
  td { padding: 2.4mm 2mm; border-bottom: 0.25mm solid var(--line); font-size: 9.5pt; line-height: 1.6; vertical-align: top; }
  td:first-child { width: 22mm; font-family: var(--mincho); font-weight: 800; font-size: 14pt; color: var(--red); white-space: nowrap; }
  td:nth-child(2) { width: 30mm; font-weight: 700; white-space: nowrap; }
  .kz td { background: #fbeceb; }
  .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2mm; margin-top: 3mm; }
  .cards div { padding: 2mm; border: 0.3mm solid var(--line); border-radius: 2mm; text-align: center; }
  .cards b { display: block; font-family: var(--mincho); font-size: 14pt; }
  .cards span { font-size: 7.5pt; color: var(--muted); }
  ul.rules { margin-top: 2mm; padding-left: 5mm; font-size: 9.5pt; line-height: 1.75; }
"""
dirs = O['dir']
amt = {'mu': '0〜99縁', 'sho': '100〜499縁', 'dai': '500〜1,999縁', 'kaizan': '2,000縁〜'}
rows = ''.join(f'<tr class="{"kz" if r == "kaizan" else ""}"><td>{n}</td><td>{amt[r]}</td><td><b>{e(dirs[r]["change"])}</b><br>{e(dirs[r]["note"])}</td></tr>' for r, n in [('mu', '無'), ('sho', '小'), ('dai', '大'), ('kaizan', '改竄')])
omtxt = {'good': '良いカード', 'bad': '悪いカード', 'mixed': 'どちらとも'}
cardh = ''.join(f'<div><b>{e(k["name"])}</b><span>{omtxt[k["omen"]]}</span></div>' for k in O['k'])
write('06-teller', '占い師の早見表',
      f'<section class="page"><div class="wrap">{BRAND}<h1>占い師の早見表</h1>'
      '<h2>手順（スタッフ画面の「占い」）</h2><ol class="steps">'
      '<li><b>1 質問</b>質問票の A1〜A9、B1〜B10 を押す。A でタイプ、B の 1・5 から人生の大事件が2つ決まる。</li>'
      '<li><b>2 カード</b>お客さんが引いたカードを選ぶ。カードは人生の「転機」になる。</li>'
      '<li><b>3 占う</b>賄賂なしの、ふつうの占い。真顔で読む。最後に「この運命、書き換えることもできますが」。</li>'
      '<li><b>4 賄賂</b>払った額を入れて「受け取る」。払わないなら「賄賂なしで終える」。</li>'
      '<li><b>5 言い直し</b>ランクに合わせて書き直した運命を読む。「占いを終える」で年表が届く。</li></ol>'
      f'<h2>賄賂のランクで変わること・演じ方</h2><table>{rows}</table>'
      f'<h2>兆のカード（10枚）</h2><div class="cards">{cardh}</div>'
      '<h2>決まり</h2><ul class="rules"><li>質問できついことは聞かない。本人が嫌がる話題には踏み込まない</li><li>台本の極端さは演技で出す。本気で傷つけない</li><li>改竄のときは鈴を鳴らしてから、台本の「改竄」を読む</li><li>言い直しのあと、さらに賄賂を足して上のランクにしてもいい（画面の「← 賄賂を足す」）</li><li>同じお客さんを何回でも占える（終わった画面の「もう一度占う」）</li><li>困ったら画面を閉じずに責任者を呼ぶ。取りやめれば賄賂は返る</li></ul>'
      '</div></section>', TELL_CSS)

# ============================================================
# 7. スタッフ用のQR
# ============================================================
STAFF_CSS = """
  .wrap { position: absolute; inset: 0; padding: 20mm; }
  h1 { font-family: var(--mincho); font-weight: 800; font-size: 26pt; margin-top: 8mm; text-align: center; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 14mm; }
  .box { text-align: center; }
  .box .qr { width: 72mm; margin: 0 auto; padding: 4mm; border: 0.5mm solid var(--ink); border-radius: 4mm; background: #fff; }
  .box h2 { font-family: var(--mincho); font-weight: 800; font-size: 18pt; margin-top: 5mm; }
  .box p { font-size: 10.5pt; line-height: 1.7; margin-top: 2mm; color: var(--muted); }
  .box code { font-size: 8.5pt; color: var(--ink); }
  .note { margin-top: 16mm; padding: 6mm; border-radius: 4mm; background: #f3eef0; font-size: 11pt; line-height: 1.9; }
"""
write('07-staff-qr', 'スタッフ用QR',
      f'<section class="page"><div class="wrap">{BRAND}<h1>スタッフ用</h1><div class="two">'
      f'<div class="box"><div class="qr" data-qr="{APP}/staff"></div><h2>スタッフ画面（本番）</h2><p>当日はこちら。名前とパスワードでログイン。<br><code>{APP.replace("https://", "")}/staff</code></p></div>'
      f'<div class="box"><div class="qr" data-qr="{TRAIN}"></div><h2>研修モード（練習）</h2><p>何をしても本番に影響しません。<br><code>{TRAIN.replace("https://", "")}</code></p></div>'
      '</div><div class="note"><b>はじめての人</b>：管理する人から「招待のQR」をもらって読み、自分で名前とパスワードを決めて登録します。<br>'
      '<b>困ったら</b>：画面を閉じずに責任者を呼ぶ。ゲームの取り消しはいつでもできます。<br>'
      '<b>縁の増減は必ず画面を通す</b>。口約束で足さない。</div></div></section>', STAFF_CSS)

# ============================================================
# 8. 写真展：写真の受け取りのQR（撮影する場所に貼る）
# ============================================================
PHOTO = 'https://photo.moneytalks-uranai.com/'
PHOTO_CSS = """
  .wrap { position: absolute; inset: 0; padding: 26mm 22mm; text-align: center; background: #f7f6f3; }
  .k { font-size: 10pt; letter-spacing: 0.4em; color: var(--muted); }
  h1 { margin-top: 6mm; font-family: var(--mincho); font-weight: 800; font-size: 34pt; line-height: 1.3; }
  .rule { width: 14mm; height: 0.3mm; background: var(--ink); margin: 8mm auto 0; }
  .qr { width: 92mm; margin: 14mm auto 0; padding: 6mm; background: #fff; border: 0.3mm solid var(--line); border-radius: 4mm; }
  .url { margin-top: 5mm; font-size: 12pt; letter-spacing: 0.04em; }
  ol { list-style: none; margin: 14mm auto 0; max-width: 140mm; text-align: left; display: grid; gap: 5mm; }
  ol li { display: grid; grid-template-columns: 11mm 1fr; align-items: baseline; font-size: 13pt; line-height: 1.6; }
  ol b { font-family: var(--mincho); font-size: 18pt; }
  .small { margin-top: 12mm; font-size: 9.5pt; color: var(--muted); line-height: 1.8; }
"""
write('08-photo-qr', '写真の受け取り',
      '<section class="page"><div class="wrap"><p class="k">PHOTOGRAPHS</p><h1>撮った写真は、<br>スマホで受け取れます</h1><div class="rule"></div>'
      f'<div class="qr" data-qr="{PHOTO}"></div><p class="url">{PHOTO.replace("https://", "").rstrip("/")}</p>'
      '<ol><li><b>1</b><span>撮影の前に、QRを読んで「はじめての方」から<strong>名前とパスワード</strong>を決める</span></li>'
      '<li><b>2</b><span>撮影係に、その名前を伝える</span></li>'
      '<li><b>3</b><span>撮り終わると、ページに写真が届く。あとで見るときも、同じ名前とパスワードで</span></li></ol>'
      '<p class="small">スマホがない方は、撮影係の端末で登録できます。写真は展示の終了後に削除します。</p></div></section>', PHOTO_CSS)

print('wrote', sorted(os.listdir(SRC)))
