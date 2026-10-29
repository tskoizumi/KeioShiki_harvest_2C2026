/* ============================================================
   シェア画像（1080×1920）をブラウザの中で描く。
   マイページとスタッフ画面が使う。window.ShareCard.render(...) → Promise<Blob>
   無・小・大は白い紙、改竄は黒地に赤。
============================================================ */
window.ShareCard = (function () {
  var site = { name: "", event: "", className: "" };
  var W = 1080, H = 1920;
  var MINCHO = '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif';

  var $ = function (id) { return document.getElementById(id); };
  document.querySelectorAll("[data-site]").forEach(function (n) {
    var v = S[n.dataset.site];
    if (v != null) n.textContent = v;
  });
  function show(id) {
    ["st-form", "st-loading", "st-result"].forEach(function (s) { $(s).hidden = s !== id; });
    $("st-mark").hidden = id === "st-result";
  }
  function yen(n) { return Number(n).toLocaleString("ja-JP"); }

  /* ============================================================
     データ取得
  ============================================================ */
  function lookup(id) {
    if (S.resultsCsvUrl) {
      return fetch(S.resultsCsvUrl, { cache: "no-store" })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          var rows = window.parseCsv(t);
          for (var i = 0; i < rows.length; i++) {
            if (rows[i].id.toUpperCase() === id) return rows[i];
          }
          return null;
        });
    }
    return fetch("data/results.json", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (all) { return all[id] || null; });
  }

  /* ============================================================
     描画ヘルパー
  ============================================================ */
  function font(weight, size) { return weight + " " + size + "px " + MINCHO; }

  // 指定幅に収まる最大サイズを返す
  function fit(ctx, text, weight, max, width) {
    var size = max;
    ctx.font = font(weight, size);
    while (size > 24 && ctx.measureText(text).width > width) {
      size -= 4;
      ctx.font = font(weight, size);
    }
    return size;
  }

  // 日本語の折り返し（行頭禁則だけ見る）
  var NO_HEAD = "、。，．」』）！？・ーっゃゅょァィゥェォッャュョ…";
  function wrap(ctx, text, width) {
    var lines = [], line = "";
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (ctx.measureText(line + c).width > width && line && NO_HEAD.indexOf(c) < 0) {
        lines.push(line);
        line = c;
      } else {
        line += c;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // 行数を変えずに幅を詰めて、最終行だけ短くなるのを防ぐ
  function wrapBalanced(ctx, text, width) {
    var lines = wrap(ctx, text, width);
    if (lines.length < 2) return lines;
    var best = lines;
    for (var w = width - 10; w > width * 0.5; w -= 10) {
      var l = wrap(ctx, text, w);
      if (l.length > lines.length) break;
      best = l;
    }
    return best;
  }

  function spaced(ctx, text, x, y, spacing, align) {
    // letter-spacing 付きで1行描く（align: "center" | "left"）
    var w = 0, i;
    for (i = 0; i < text.length; i++) w += ctx.measureText(text[i]).width + (i ? spacing : 0);
    var cx = align === "center" ? x - w / 2 : x;
    var prev = ctx.textAlign;
    ctx.textAlign = "left";
    for (i = 0; i < text.length; i++) {
      ctx.fillText(text[i], cx, y);
      cx += ctx.measureText(text[i]).width + spacing;
    }
    ctx.textAlign = prev;
  }

  function noise(ctx, alpha) {
    var img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (Math.random() - 0.5) * 255 * alpha;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  function seal(ctx, text, x, y, size, color, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size * 0.06;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.lineWidth = size * 0.02;
    ctx.strokeRect(-size / 2 + size * 0.07, -size / 2 + size * 0.07, size * 0.86, size * 0.86);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (text.length === 1) {
      ctx.font = font(800, size * 0.62);
      ctx.fillText(text, 0, size * 0.03);
    } else {
      ctx.font = font(800, size * 0.36);
      ctx.fillText(text[0], 0, -size * 0.19);
      ctx.fillText(text[1], 0, size * 0.21);
    }
    ctx.restore();
  }

  /* ============================================================
     通常デザイン（無・小・大）— ロゴと同じ白い紙
  ============================================================ */
  var PAPER = "#fefefc", INK = "#1c1a1b", RED = "#9f1111", PLUM = "#663661";
  var THEMES = {
    mu:  { band: "#9a9396", accent: "#9a9396", seal: "#9a9396" },
    sho: { band: RED,       accent: RED,       seal: RED },
    dai: { band: PLUM,      accent: PLUM,      seal: RED },
  };

  function drawNormal(ctx, d, rank, mark) {
    var t = THEMES[rank.id];
    var cx = W / 2;

    // 紙
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    var v = ctx.createRadialGradient(cx, H / 2, W * 0.4, cx, H / 2, H * 0.8);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(60,40,50,0.12)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);

    // 上下の色帯（位で色が変わる）
    ctx.fillStyle = t.band;
    ctx.fillRect(0, 0, W, 18);
    ctx.fillRect(0, H - 18, W, 18);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // マーク
    if (mark) ctx.drawImage(mark, cx - 160, 70, 320, 320);
    ctx.fillStyle = INK;
    ctx.font = font(800, 34);
    spaced(ctx, site.name, cx, 440, 14, "center");

    // 相
    ctx.fillStyle = t.accent;
    ctx.font = font(700, 32);
    spaced(ctx, "あなたの相", cx, 560, 12, "center");
    ctx.fillStyle = INK;
    var souSize = fit(ctx, d.sou, 800, 240, W - 240);
    ctx.font = font(800, souSize);
    spaced(ctx, d.sou, cx, 580 + souSize * 1.0, souSize * 0.08, "center");

    // 兆
    var ky = 930;
    ctx.strokeStyle = "rgba(28,26,27,0.18)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 300, ky); ctx.lineTo(cx + 300, ky); ctx.stroke();
    ctx.fillStyle = t.accent;
    ctx.font = font(700, 32);
    spaced(ctx, "引いた兆", cx, ky + 80, 12, "center");
    ctx.fillStyle = INK;
    var kSize = fit(ctx, d.kizashi, 800, 96, W - 300);
    ctx.font = font(800, kSize);
    spaced(ctx, d.kizashi, cx, ky + 90 + kSize * 1.05, 10, "center");

    // 心付け
    var my = 1270;
    ctx.fillStyle = t.accent;
    ctx.font = font(700, 32);
    spaced(ctx, "心付け", cx - 110, my, 12, "center");
    ctx.fillStyle = INK;
    var amt = yen(d.amount);
    ctx.font = font(800, 120);
    var aw = ctx.measureText(amt).width;
    ctx.font = font(700, 48);
    var uw = ctx.measureText("縁").width;
    var ax = cx - 110 - (aw + uw + 8) / 2;
    ctx.textAlign = "left";
    ctx.font = font(800, 120);
    ctx.fillText(amt, ax, my + 136);
    ctx.font = font(700, 48);
    ctx.fillText("縁", ax + aw + 8, my + 136);
    ctx.textAlign = "center";
    seal(ctx, rank.name, cx + 250, my + 70, 170, t.seal, -0.08);

    // 神託
    var oy = 1560;
    ctx.fillStyle = INK;
    ctx.font = font(800, 54);
    var lines = wrapBalanced(ctx, "「" + d.oracle + "」", W - 260).slice(0, 3);
    lines.forEach(function (ln, i) { ctx.fillText(ln, cx, oy + i * 84); });

    // フッタ
    ctx.fillStyle = "#5c5658";
    ctx.font = font(700, 26);
    var foot = (d.name ? d.name + "　" : "") + site.event + "　" + site.className;
    spaced(ctx, foot, cx, H - 80, 4, "center");

    noise(ctx, 0.04);
  }

  /* ============================================================
     改竄デザイン — 白い紙を墨で塗りつぶす。明らかに別物に見せる
  ============================================================ */
  function drawKaizan(ctx, d, mark) {
    var cx = W / 2;
    var BLACK = "#141213", LIGHT = "#f4efe6", HOT = "#e0352b", CYAN = "rgba(120,200,230,0.6)";

    // 墨
    ctx.fillStyle = BLACK; ctx.fillRect(0, 0, W, H);
    var r = ctx.createRadialGradient(cx, 300, 0, cx, 300, 700);
    r.addColorStop(0, "rgba(224,53,43,0.28)"); r.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);

    // 走査線とずれ（書き換えの痕）
    ctx.fillStyle = "rgba(224,53,43,0.06)";
    for (var y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
    for (var i = 0; i < 9; i++) {
      var gy = 120 + Math.random() * (H - 240);
      ctx.fillStyle = i % 2 ? "rgba(224,53,43,0.22)" : "rgba(120,200,230,0.14)";
      ctx.fillRect(0, gy, W, 4 + Math.random() * 14);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // マーク（ずらし二重刷り）
    if (mark) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(mark, cx - 150 - 14, 60, 300, 300);
      ctx.drawImage(mark, cx - 150 + 14, 64, 300, 300);
      ctx.globalAlpha = 1;
      ctx.drawImage(mark, cx - 150, 62, 300, 300);
    }

    ctx.fillStyle = HOT;
    ctx.font = font(800, 40);
    spaced(ctx, "改 竄 済", cx, 430, 28, "center");

    // 相
    ctx.fillStyle = LIGHT;
    ctx.globalAlpha = 0.6;
    ctx.font = font(700, 30);
    spaced(ctx, "あなたの相", cx, 530, 12, "center");
    ctx.globalAlpha = 1;
    var souSize = fit(ctx, d.sou, 800, 230, W - 260);
    ctx.font = font(800, souSize);
    var sy = 550 + souSize;
    ctx.fillStyle = CYAN;
    spaced(ctx, d.sou, cx - 10, sy, souSize * 0.08, "center");
    ctx.fillStyle = "rgba(224,53,43,0.85)";
    spaced(ctx, d.sou, cx + 10, sy + 4, souSize * 0.08, "center");
    ctx.fillStyle = LIGHT;
    spaced(ctx, d.sou, cx, sy, souSize * 0.08, "center");

    // 取り消された兆
    var ky = 940;
    ctx.fillStyle = LIGHT;
    ctx.globalAlpha = 0.45;
    ctx.font = font(700, 30);
    spaced(ctx, "引いた兆", cx, ky, 12, "center");
    var kSize = fit(ctx, d.kizashi, 800, 90, W - 320);
    ctx.font = font(800, kSize);
    var kw = ctx.measureText(d.kizashi).width + (d.kizashi.length - 1) * 10;
    spaced(ctx, d.kizashi, cx, ky + 20 + kSize, 10, "center");
    ctx.globalAlpha = 1;
    ctx.strokeStyle = HOT; ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx - kw / 2 - 30, ky + 20 + kSize * 0.62);
    ctx.lineTo(cx + kw / 2 + 30, ky + 20 + kSize * 0.5);
    ctx.stroke();

    ctx.fillStyle = HOT;
    ctx.font = font(800, 52);
    ctx.fillText("「この兆は、誤りでした。」", cx, ky + 200);

    // 新しい神託
    var oy = 1290;
    ctx.fillStyle = LIGHT;
    ctx.font = font(700, 30);
    spaced(ctx, "新しい神託", cx, oy, 12, "center");
    ctx.font = font(800, 60);
    var lines = wrapBalanced(ctx, d.oracle, W - 240).slice(0, 3);
    lines.forEach(function (ln, i) { ctx.fillText(ln, cx, oy + 100 + i * 88); });

    // 心付け
    var my = 1700;
    ctx.textAlign = "left";
    ctx.font = font(700, 30);
    ctx.fillText("心付け", 120, my - 60);
    ctx.font = font(800, 96);
    var amt = yen(d.amount);
    ctx.fillText(amt, 120, my + 40);
    var aw = ctx.measureText(amt).width;
    ctx.font = font(700, 44);
    ctx.fillText("縁", 120 + aw + 10, my + 40);
    ctx.textAlign = "center";

    // 大きな朱印
    seal(ctx, "改竄", W - 250, my - 10, 260, HOT, -0.14);

    // フッタ
    ctx.fillStyle = LIGHT;
    ctx.globalAlpha = 0.55;
    ctx.font = font(500, 24);
    var foot = (d.name ? d.name + "　" : "") + site.name + "　" + site.event + "　" + site.className;
    spaced(ctx, foot, cx, H - 64, 4, "center");
    ctx.globalAlpha = 1;

    noise(ctx, 0.06);
  }


  function loadMark(url) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { res(null); };
      img.src = url;
    });
  }

  // d: { name, sou, kizashi, amount, oracle, rank }  rank: "mu" | "sho" | "dai" | "kaizan"
  function render(d, opts) {
    opts = opts || {};
    site = opts.site || site;
    var data = { name: d.name || "", sou: d.sou || "—", kizashi: d.kizashi || "—", amount: Number(d.amount) || 0, oracle: d.oracle || "" };
    var rank = { id: d.rank || "mu", name: { mu: "無", sho: "小", dai: "大", kaizan: "改竄" }[d.rank] || "無" };
    var text = [site.name, site.event, site.className, data.name, data.sou, data.kizashi, data.oracle,
                "あなたの相引いた兆心付け縁新しい神託この兆は、誤りでした。改竄済無小大0123456789,「」の　"].join("");
    var fontsReady = document.fonts
      ? Promise.all([document.fonts.load(font(800, 100), text), document.fonts.load(font(700, 100), text), document.fonts.load(font(500, 100), text)])
      : Promise.resolve();
    var timeout = new Promise(function (res) { setTimeout(res, 4000); });
    var cv = opts.canvas || document.createElement("canvas");
    cv.width = W; cv.height = H;
    return Promise.all([Promise.race([fontsReady, timeout]), loadMark(opts.markUrl || "/assets/mark-alpha.webp")]).then(function (r) {
      var ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      if (rank.id === "kaizan") drawKaizan(ctx, data, r[1]); else drawNormal(ctx, data, rank, r[1]);
      return new Promise(function (res) { cv.toBlob(res, "image/png"); });
    });
  }

  return { render: render, W: W, H: H };
})();
