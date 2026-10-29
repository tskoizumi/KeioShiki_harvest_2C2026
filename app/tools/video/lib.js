// 録画の共通部品：スタジオページ（1080×1920 / 1920×1080、中身は zoom:2 で 2 倍にくっきり描く）を開き、
// 字幕を切り替え、iframe の中を evaluate で操作し、CDP の screencast でフレームを保存する。
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const APP = process.env.APP_URL || 'http://127.0.0.1:8789';          // 研修モードのサーバー（npm run dev:training）
const STUDIO = 'file://' + path.join(__dirname, 'studio.html');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(mode) {
  const vp = mode === 'phone' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'ja-JP' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(STUDIO + '?mode=' + mode, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(400);
  const rec = await startRecorder(page, ctx, vp);
  const events = [];
  const now = () => (rec.wall0() ? (Date.now() - rec.wall0()) / 1000 : 0);
  let sayEnd = 0, sayN = 0;

  const frameOf = async (which) => (await page.$('#' + which)).contentFrame();
  const s = {
    browser, ctx, page, sleep,
    cap: (chapter, cap, sub) => page.evaluate(([a, b, c]) => window.studio.cap(a, b, c), [chapter, cap, sub || '']),
    title: (show, h, p, big, k) => page.evaluate(([show, h, p, big, k]) => window.studio.title(show, h, p, big, k), [show, h ?? null, p ?? null, big ?? null, k ?? null]),
    duo: (on) => page.evaluate((on) => window.studio.duo(on), on),
    dark: (on) => page.evaluate((on) => window.studio.dark(on), on),
    frame: frameOf,
    load: async (which, url) => {
      await page.evaluate(([w, u]) => window.studio.load(w, u), [which, APP + url]);
      await s.quiet(which);
      await sleep(300);
    },
    // 研修モードの帯を消す（本番と同じ見た目にする）
    quiet: async (which) => {
      const f = await frameOf(which);
      try { await f.addStyleTag({ content: '#mt-training{display:none!important}' }); } catch (e) {}
    },
    // 画面の中に要素が出るまで待つ
    wait: async (which, sel, timeout = 15000) => {
      const f = await frameOf(which);
      try { await f.waitForSelector(sel, { state: 'visible', timeout }); }
      catch (e) { await page.screenshot({ path: path.join(OUT, 'fail.png') }); console.log('FAIL at', sel, 'toast:', await f.evaluate(() => (document.getElementById('toast') || {}).textContent || '').catch(() => '')); throw e; }
    },
    // 文字が出るまで待つ
    waitText: async (which, sel, text, timeout = 15000) => {
      const f = await frameOf(which);
      await f.waitForFunction(([sel, text]) => { const e = document.querySelector(sel); return e && e.textContent.includes(text); }, [sel, text], { timeout });
    },
    // 波紋を出してから押す（iframe の中の要素）
    tap: async (which, sel, opts = {}) => {
      const f = await frameOf(which);
      await f.waitForSelector(sel, { state: 'visible', timeout: opts.timeout || 15000 });
      const r = await f.evaluate((sel) => {
        const el = document.querySelector(sel);
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }, sel);
      await sleep(opts.settle ?? 250);
      const fb = await (await page.$('#' + which)).boundingBox();
      const sc = await page.evaluate((w) => window.studio.scale(w), which);
      await page.evaluate(([x, y]) => window.studio.tap(x, y), [fb.x / 2 + (r.x + r.w / 2) * sc, fb.y / 2 + (r.y + r.h / 2) * sc]);
      events.push({ type: 'tap', t: now() });
      await sleep(opts.before ?? 380);
      await f.evaluate((sel) => document.querySelector(sel).click(), sel);
      await sleep(opts.after ?? 900);
    },
    type: async (which, sel, text) => {
      const f = await frameOf(which);
      await f.waitForSelector(sel, { state: 'visible' });
      await f.evaluate((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: 'center' }); el.focus(); }, sel);
      await sleep(250);
      await page.keyboard.type(text, { delay: 120 });
      await sleep(400);
    },
    set: async (which, sel, value) => {
      const f = await frameOf(which);
      await f.evaluate(([sel, v]) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, value]);
    },
    scroll: async (which, y, ms = 1000) => {
      const f = await frameOf(which);
      await f.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y);
      await sleep(ms);
    },
    // ナレーション。読み終わるまで待たずに次の操作に進める（waitSay で待つ）
    // id を渡すと、その番号の録音を使う（途中の行を抜いたときなど）。渡さなければ台本の順番
    say: (text, id) => {
      sayN++;
      const dur = narration(text, id || (mode === 'phone' ? 'c' : 's') + String(sayN).padStart(2, '0'));
      events.push({ type: 'say', t: now() + 0.15, file: dur.file, text });
      sayEnd = Date.now() + 150 + dur.sec * 1000;
      return dur.sec;
    },
    waitSay: async (extra = 400) => { const w = sayEnd - Date.now() + extra; if (w > 0) await sleep(w); },
    sfx: (type) => events.push({ type, t: now() }),
    close: async () => {
      const dir = await rec.stop();
      fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events, null, 1));
      await browser.close();
      return dir;
    },
  };
  return s;
}

// CDP の screencast でフレームを保存する。各フレームの表示時間は次のフレームまでの間
async function startRecorder(page, ctx, vp) {
  const dir = fs.mkdtempSync(path.join(OUT, 'rec-'));
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  let n = 0;
  let wall0 = 0;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    if (!wall0) wall0 = Date.now();
    const file = path.join(dir, `f${String(n++).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: vp.width, maxHeight: vp.height, everyNthFrame: 1 });
  return {
    wall0: () => wall0,
    stop: async () => {
      await sleep(300);
      await cdp.send('Page.stopScreencast').catch(() => {});
      await sleep(300);
      const lines = ['ffconcat version 1.0'];
      for (let i = 0; i < frames.length; i++) {
        const d = i + 1 < frames.length ? Math.max(0.01, frames[i + 1].t - frames[i].t) : 1.0;
        lines.push(`file '${path.basename(frames[i].file)}'`, `duration ${d.toFixed(4)}`);
      }
      if (frames.length) lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`);
      fs.writeFileSync(path.join(dir, 'list.txt'), lines.join('\n') + '\n');
      console.log('frames', frames.length, 'seconds', frames.length ? (frames[frames.length - 1].t - frames[0].t).toFixed(1) : 0);
      return dir;
    },
  };
}

// ナレーション。voice-human/<番号>.m4a など（自分で録音した声）があればそれを使い、なければ合成する
//   番号は お客さん向けが c01, c02 …、スタッフ研修が s01, s02 …（台本の s.say() の順）
function narration(text, id) {
  const { execFileSync } = require('child_process');
  const crypto = require('crypto');
  const human = path.join(__dirname, 'voice-human');
  const ext = ['m4a', 'mp3', 'wav', 'aac', 'caf', 'ogg', 'webm', 'mp4', 'mov'].find((e) => id && fs.existsSync(path.join(human, id + '.' + e)));
  if (ext) {
    const src = path.join(human, id + '.' + ext);
    const out = path.join(__dirname, 'voice', 'human-' + id + '.wav');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs) {
      // 前後の無音を切り、声の大きさをそろえ、低いノイズを落とす
      const FF = process.env.FFMPEG || 'ffmpeg';
      execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-ac', '1', '-ar', '48000',
        '-af', 'highpass=f=80,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,loudnorm=I=-16:TP=-1.5:LRA=11',
        out]);
    }
    return { file: out, sec: wavSeconds(out), human: true };
  }
  const dir = path.join(__dirname, 'voice'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, crypto.createHash('md5').update(text).digest('hex').slice(0, 12) + '.wav');
  const meta = file + '.txt';
  if (!fs.existsSync(meta)) {
    const sec = execFileSync(process.env.TTS_PY || 'python3', [path.join(__dirname, 'audio.py'), 'tts', text, file], { encoding: 'utf8' }).trim().split('\n').pop();
    fs.writeFileSync(meta, sec);
  }
  return { file, sec: Number(fs.readFileSync(meta, 'utf8')) };
}

function wavSeconds(file) {
  const b = fs.readFileSync(file);
  const rate = b.readUInt32LE(24), ch = b.readUInt16LE(22), bits = b.readUInt16LE(34);
  let off = 12;
  while (off < b.length - 8) { const id = b.toString('ascii', off, off + 4), size = b.readUInt32LE(off + 4); if (id === 'data') return size / (rate * ch * bits / 8); off += 8 + size; }
  return 0;
}

// 映像に音を重ねる
function addAudio(dir, video, out, mood) {
  const { execFileSync } = require('child_process');
  execFileSync(process.env.TTS_PY || 'python3', [path.join(__dirname, 'audio.py'), 'mix', dir, video, out, mood], { stdio: 'inherit' });
  return out;
}

// スタッフのAPIを node から叩く（客向け動画で、裏でスタッフが操作する分）
async function staffApi(name) {
  const r = await fetch(APP + '/api/training/login-as', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return async (p, method = 'GET', body) => {
    const res = await fetch(APP + '/api/staff' + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const d = await res.json();
    if (!res.ok) throw new Error(p + ' ' + JSON.stringify(d));
    return d;
  };
}

async function state() { return (await fetch(APP + '/api/training/state')).json(); }
async function reset() { await fetch(APP + '/api/training/reset', { method: 'POST' }); return state(); }

// フレーム → mp4（H.264、どのスマホでも再生できる形）
function encode(dir, outFile) {
  const { execFileSync } = require('child_process');
  const FF = process.env.FFMPEG || 'ffmpeg';
  execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-movflags', '+faststart', '-an', outFile]);
  return outFile;
}

module.exports = { open, staffApi, state, reset, sleep, encode, addAudio, APP, OUT };
