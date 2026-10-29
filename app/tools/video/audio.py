"""動画の音：ナレーション（Open JTalk）、BGM と効果音（numpy で合成）、ミックス。

  python audio.py tts "<text>" out.wav        → 長さ（秒）を出力
  python audio.py mix rec_dir video.mp4 out.mp4 [mood]
      rec_dir/events.json の say / tap / coin / bell / whoosh を時刻どおりに置き、BGM を下に敷く
"""
import sys, os, json, wave, math, subprocess
import numpy as np

SR = 48000
FF = os.environ.get('FFMPEG', 'ffmpeg')


def write_wav(path, x, ch=1):
    x = np.clip(x, -1, 1)
    w = wave.open(path, 'wb'); w.setnchannels(ch); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((x * 32767).astype(np.int16).tobytes()); w.close()


def read_wav(path):
    w = wave.open(path, 'rb'); n = w.getnframes(); ch = w.getnchannels(); sr = w.getframerate()
    x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    w.close()
    if ch == 2: x = x.reshape(-1, 2).mean(axis=1)
    if sr != SR:
        t = np.arange(int(len(x) * SR / sr)) * sr / SR
        x = np.interp(t, np.arange(len(x)), x)
    return x


# ---------- ナレーション ----------
def tts(text, out):
    import pyopenjtalk
    x, sr = pyopenjtalk.tts(text, speed=1.08, half_tone=0.0)
    x = x.astype(np.float32) / 32768
    if sr != SR:
        t = np.arange(int(len(x) * SR / sr)) * sr / SR
        x = np.interp(t, np.arange(len(x)), x)
    # 頭と尻の無音を詰めて、音量をそろえる
    a = np.abs(x); idx = np.where(a > 0.01)[0]
    if len(idx): x = x[max(0, idx[0] - 800): idx[-1] + 2400]
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.85
    # 角を丸める（声を少しやわらかく：軽いローパス）
    k = np.ones(3) / 3; x = np.convolve(x, k, mode='same')
    write_wav(out, x)
    return len(x) / SR


# ---------- 効果音 ----------
def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    e = np.minimum(1, t / a) * np.exp(-t / d)
    return e


def sfx_tap():
    n = int(0.06 * SR); rng = np.random.default_rng(1)
    x = rng.standard_normal(n) * env(n, 0.0005, 0.008)
    x = np.convolve(x, np.ones(6) / 6, mode='same')
    t = np.arange(n) / SR
    x += 0.5 * np.sin(2 * np.pi * 1800 * t) * env(n, 0.0005, 0.012)
    return x * 0.35


def sfx_coin():
    out = np.zeros(int(0.7 * SR))
    for i, f in enumerate([1975, 2637]):
        n = int(0.55 * SR); t = np.arange(n) / SR
        s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.01 * t)) * env(n, 0.001, 0.12)
        o = int(i * 0.075 * SR); out[o:o + n] += s
    return out * 0.32


def sfx_bell():
    n = int(3.5 * SR); t = np.arange(n) / SR; f0 = 880
    x = np.zeros(n)
    for r, a, d in [(1, 1.0, 1.6), (2.76, 0.5, 0.9), (5.4, 0.25, 0.5), (8.93, 0.12, 0.3), (0.5, 0.3, 2.2)]:
        x += a * np.sin(2 * np.pi * f0 * r * t + r) * np.exp(-t / d)
    x *= np.minimum(1, t / 0.002)
    # 鈴らしく小さく震わせる
    x *= 1 + 0.15 * np.sin(2 * np.pi * 7 * t)
    return x / np.max(np.abs(x)) * 0.45


def sfx_whoosh():
    n = int(0.45 * SR); rng = np.random.default_rng(3); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    # だんだん高くなる帯域ノイズ（簡易）
    y = np.zeros(n); a = 0.0
    for i in range(n):
        c = 0.02 + 0.25 * (i / n)
        a = a + c * (x[i] - a); y[i] = a
    e = np.sin(np.pi * t / t[-1]) ** 2
    return y * e * 0.25


# ---------- BGM ----------
def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def bgm(seconds, mood='customer'):
    """ゆっくりした神秘的なループ。Dマイナーの進行に、オルゴールの分散和音と低いドローン。"""
    n = int(seconds * SR); out = np.zeros((n, 2))
    bpm = 84 if mood == 'customer' else 76
    beat = 60 / bpm; bar = beat * 4
    # Dm - B♭ - F - C  ／  Dm - Gm - B♭ - A
    prog = [[62, 65, 69], [58, 62, 65], [65, 69, 72], [60, 64, 67], [62, 65, 69], [55, 58, 62], [58, 62, 65], [57, 61, 64]]
    rng = np.random.default_rng(7)
    t_all = np.arange(n) / SR
    # ドローン（D）
    drone = 0.05 * (np.sin(2 * np.pi * note(38) * t_all) + 0.5 * np.sin(2 * np.pi * note(50) * t_all + 0.3))
    drone *= 0.75 + 0.25 * np.sin(2 * np.pi * t_all / 9)
    out[:, 0] += drone; out[:, 1] += drone
    nb = int(seconds / bar) + 1
    for b in range(nb):
        ch = prog[b % len(prog)]; t0 = b * bar
        # パッド（和音を長くのばす）
        L = int(bar * 1.15 * SR); s0 = int(t0 * SR)
        if s0 >= n: break
        tt = np.arange(L) / SR
        e = np.minimum(1, tt / 0.8) * np.minimum(1, (bar * 1.15 - tt) / 0.8)
        pad = np.zeros(L)
        for m in ch:
            f = note(m - 12)
            pad += np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2 * tt + 1) + 0.15 * np.sin(2 * np.pi * f * 1.003 * tt)
        pad *= e * 0.035
        seg = out[s0:s0 + L]; m_ = len(seg)
        seg[:, 0] += pad[:m_] * 1.0; seg[:, 1] += pad[:m_] * 0.85
        # オルゴール（8分の分散和音）
        pattern = [0, 1, 2, 1, 2, 0, 1, 2] if b % 2 == 0 else [2, 1, 0, 1, 2, 1, 0, 2]
        for k, idx in enumerate(pattern):
            m = ch[idx] + 12 + (12 if (k == 4 and b % 4 == 3) else 0)
            f = note(m); s = int((t0 + k * beat / 2) * SR)
            if s >= n: break
            Lk = int(1.6 * SR); tk = np.arange(Lk) / SR
            v = (np.sin(2 * np.pi * f * tk) + 0.25 * np.sin(2 * np.pi * f * 3.01 * tk)) * np.minimum(1, tk / 0.003) * np.exp(-tk / 0.45)
            v *= 0.05 * (0.8 + 0.4 * rng.random())
            seg2 = out[s:s + Lk]; m2 = len(seg2)
            pan = 0.5 + 0.35 * math.sin(k)
            seg2[:, 0] += v[:m2] * (1 - pan) * 1.6; seg2[:, 1] += v[:m2] * pan * 1.6
        # 軽いシェイカー（裏拍）
        for k in range(8):
            if k % 2 == 1:
                s = int((t0 + k * beat / 2) * SR); Ls = int(0.05 * SR)
                if s + Ls >= n: break
                hh = rng.standard_normal(Ls) * np.exp(-np.arange(Ls) / SR / 0.012) * 0.012
                hh = hh - np.convolve(hh, np.ones(4) / 4, mode='same')
                out[s:s + Ls, 0] += hh; out[s:s + Ls, 1] += hh
    # 簡単な残響
    d = int(0.21 * SR)
    for c, g in [(0, 0.28), (1, 0.32)]:
        y = out[:, c].copy(); y[d:] += g * out[:-d, c]; y[2 * d:] += g * g * out[:-2 * d, c]; out[:, c] = y
    # はじめと終わりのフェード
    f = int(2.0 * SR); out[:f] *= np.linspace(0, 1, f)[:, None]; out[-f * 2:] *= np.linspace(1, 0, f * 2)[:, None]
    return out / (np.max(np.abs(out)) + 1e-9) * 0.9


# ---------- ミックス ----------
def mix(rec_dir, video, out, mood):
    ev = json.load(open(os.path.join(rec_dir, 'events.json')))
    p = subprocess.run([FF, '-i', video], capture_output=True, text=True).stderr
    h, m, s = p.split('Duration: ')[1].split(',')[0].split(':'); dur = int(h) * 3600 + int(m) * 60 + float(s)
    n = int((dur + 0.5) * SR)
    voice = np.zeros(n); fx = np.zeros(n)
    sounds = {'tap': sfx_tap(), 'coin': sfx_coin(), 'bell': sfx_bell(), 'whoosh': sfx_whoosh()}
    for e in ev:
        s = int(e['t'] * SR)
        if s >= n: continue
        if e['type'] == 'say':
            x = read_wav(e['file'])
        else:
            x = sounds.get(e['type'])
            if x is None: continue
        L = min(len(x), n - s)
        (voice if e['type'] == 'say' else fx)[s:s + L] += x[:L]
    # 声があるところだけ BGM を下げる（ダッキング）
    a = np.abs(voice); win = int(0.25 * SR)
    envv = np.convolve(a, np.ones(win) / win, mode='same')
    duck = np.where(envv > 0.01, 0.38, 1.0)
    duck = np.convolve(duck, np.ones(int(0.3 * SR)) / int(0.3 * SR), mode='same')
    music = bgm(dur + 0.5, mood) * 0.42
    music *= duck[:, None]
    mixed = music + voice[:, None] * 0.95 + fx[:, None] * 0.9
    peak = np.max(np.abs(mixed))
    if peak > 0.98: mixed *= 0.98 / peak
    wav = os.path.join(rec_dir, 'mix.wav')
    write_wav(wav, mixed.reshape(-1), ch=2)
    subprocess.check_call([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out])
    print(out)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'tts': print('%.3f' % tts(sys.argv[2], sys.argv[3]))
    elif cmd == 'mix': mix(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) > 5 else 'customer')
    elif cmd == 'bgm':
        x = bgm(float(sys.argv[2]), sys.argv[4] if len(sys.argv) > 4 else 'customer'); write_wav(sys.argv[3], x.reshape(-1), ch=2)
    elif cmd == 'sfx':
        for k, f in [('tap', sfx_tap), ('coin', sfx_coin), ('bell', sfx_bell), ('whoosh', sfx_whoosh)]: write_wav(os.path.join(sys.argv[2], k + '.wav'), f())
