// スタッフの画面の動き（staff.html が読む）
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var S = { me: null, games: [], settings: {}, oracle: null, site: null, view: 'cust', cust: null, reading: null, step: 1, answers: { judge: [], mention: [] }, souOverride: null, kizashiId: null, openPlays: [], openReadings: [], adminTab: 'summary', betFor: null, histAll: false, lv: {}, sc: {}, mgrOpen: false };
  var LV = { staff: 1, teller: 2, manager: 3, admin: 4 };
  var RANK = { mu: '無', sho: '小', dai: '大', kaizan: '改竄' };
  var TITLES = { login: 'スタッフ', cust: 'お客さん', games: 'ゲーム中', teller: '占い', reception: '受付', admin: '管理' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function yen(n) { return Number(n || 0).toLocaleString('ja-JP'); }
  function newId() { return crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random(); }
  function api(path, method, body) {
    var opts = { method: method || 'GET', headers: {} };
    if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
      .catch(function () { return { ok: false, status: 0, d: { message: '通信できませんでした。電波を確かめてください' } }; });
  }
  var toastT;
  function toast(t, opt) {
    opt = opt || {};
    var e = $('toast'), b = $('toast-b');
    $('toast-t').textContent = t;
    e.className = 'toast on' + (opt.err ? ' err' : '');
    if (opt.action) { b.hidden = false; b.textContent = opt.action; b.onclick = function () { e.className = 'toast'; opt.fn(); }; } else b.hidden = true;
    clearTimeout(toastT); toastT = setTimeout(function () { e.className = 'toast'; }, opt.action ? 7000 : 2600);
  }
  function err(t) { toast(t, { err: true }); }
  function can(level) { return S.me && S.me.level >= level; }
  function rankOf(amount) { var s = S.settings; if (amount >= Number(s.rank_kaizan)) return 'kaizan'; if (amount >= Number(s.rank_dai)) return 'dai'; if (amount >= Number(s.rank_sho)) return 'sho'; return 'mu'; }
  function taxDiv(balance) { var marks = String(S.settings.tax_brackets || '').split(',').map(Number).filter(function (x) { return x > 0; }); return 1 + marks.filter(function (m) { return balance >= m; }).length; }
  function taxedMult(m, div) { m = Number(m); if (!(m > 1) || !(div > 1)) return m; return Math.max(1, Math.round(m / div * 100) / 100); }
  function signed(n) { return n > 0 ? '+' + yen(n) : n < 0 ? '−' + yen(-n) : '0'; }
  function toDate(s) { return new Date(String(s).replace(' ', 'T') + (/Z|\+/.test(s) ? '' : 'Z')); }
  function timeOf(s) { if (!s) return ''; var d = toDate(s); return isNaN(d) ? s : d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function clock(s) { if (!s) return ''; var d = toDate(s); return isNaN(d) ? s : d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: '2-digit' }); }
  function ago(s) { var m = Math.round((Date.now() - toDate(s)) / 60000); return m < 1 ? 'いま' : m + '分前'; }
  function modal(title, html, extra) { $('modal-h').textContent = title; $('modal-b').innerHTML = html; $('modal-x').innerHTML = ''; if (extra) $('modal-x').appendChild(extra); $('modal').hidden = false; }
  $('modal-close').addEventListener('click', function () { $('modal').hidden = true; });
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) $('modal').hidden = true; });
  // 2回押して実行（取り消し・使えなくする など）
  function armed(btn, label, fn) {
    if (btn.dataset.armed) { delete btn.dataset.armed; fn(); return; }
    var orig = btn.textContent; btn.dataset.armed = '1'; btn.textContent = label;
    setTimeout(function () { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = orig; } }, 3500);
  }

  /* ============================================================
     使い方（? ボタン）
  ============================================================ */
  var HELP = {
    cust: ['お客さんの画面', '<b>1. お客さんを探す</b>\n「QRを読む」でお客さんのスマホかQRカードを読みます。読めないときは、番号（6文字）か名前で探します。\n\n<b>2. ゲームを始める</b>\nゲームを押すと、参加費がお客さんの残高から引かれます。間違えたら、すぐ出る「取り消す」で戻せます。ゲームの右上の ? でルールが見られます。\n\n<b>3. 結果を入れる</b>\nゲームが終わったら、結果のボタンを押します。払い戻しは自動でお客さんに入ります。\n\n占い師は、ここから「占いを始める」もできます。'],
    games: ['ゲーム中の画面', 'ゲームを始めて、まだ結果を入れていないお客さんの一覧です。別のスタッフが始めた分も出ます。\n\n「結果を入れる」を押すと、そのお客さんの画面が開きます。'],
    teller: ['占いの画面', '<b>1. 質問</b>　質問票の答え（1〜5）を押します。A でお客さんのタイプが決まり、B の答えから人生の大事件が2つ選ばれます。\n<b>2. カード</b>　お客さんが引いたカードを選びます。カードは人生の「転機」になります。\n<b>3. 占う</b>　まずは賄賂なしの、ふつうの占い。台本を真顔で読みます。最後に「この運命、書き換えることもできますが」。\n<b>4. 賄賂</b>　お客さんが払った額を入れて「受け取る」。払わないなら「賄賂なしで終える」。\n<b>5. 言い直し</b>　ランクに合わせて、書き直した運命を読みます。「終える」で、お客さんのスマホに年表が届きます（書き直した所は赤）。\n\n<b>ランクで変わること</b>\n無 = そのまま\n小 = 人生の転機（カードの出来事）だけ書き直す\n大 = 年表を全部書き直して、べた褒め\n改竄 = 鈴を鳴らして運命ごと書き換え。最後に伝説がひとつ増える\n\n言い直しを聞いてから、さらに賄賂を足して上のランクにすることもできます。同じお客さんを何回でも占えます。'],
    reception: ['受付の画面', '<b>スマホがある人</b>　受付用のQRを見せて、自分で登録してもらいます。\n<b>スマホがない人</b>　印刷したQRカードを渡して、カードの番号と名前を入れます。\n<b>自分で登録できない人</b>　名前を入れて代わりに登録し、出てきたQRを読んでもらいます。\n\n登録すると、最初の縁（ふつうは100縁）が入ります。'],
    admin: ['管理の画面', '<b>概要</b>　いまの数字\n<b>設定</b>　ランクの境目、受付の開け閉め、最初に配る縁\n<b>ゲーム</b>　参加費・払い戻し・ルールの文章\n<b>スタッフ</b>　招待のQRを作って配る。権限やパスワードを変える\n<b>記録</b>　誰が何をしたか、CSVの書き出し'],
  };
  $('help').addEventListener('click', function () { var h = HELP[S.view]; if (h) modal(h[0], h[1]); });

  /* ============================================================
     起動・ログイン
  ============================================================ */
  function boot() {
    api('/api/staff/me').then(function (x) {
      if (x.ok) { onLogin(x.d); return; }
      api('/api/staff/bootstrap').then(function (b) {
        var setup = b.ok && b.d.needsSetup;
        $('login-title').textContent = setup ? '最初の管理者を作る' : 'スタッフのログイン';
        $('login-hint').textContent = setup ? 'まだスタッフがいません。初期設定のパスワード（SETUP_CODE）と、自分の名前・パスワード（6文字以上）を入れてください。' : '名前とパスワードを入れてください。まだ登録していない人は、管理する人に招待のQRをもらってください。';
        $('l-setup').hidden = !setup;
        $('l-go').textContent = setup ? '管理者を作ってログイン' : 'ログイン';
        $('l-setup').dataset.setup = setup ? '1' : '';
        show('login');
      });
    });
  }
  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var setup = $('l-setup').dataset.setup === '1';
    var msg = $('l-msg'); msg.className = 'msg'; msg.textContent = '確認しています…';
    $('l-go').disabled = true;
    var body = { name: $('l-name').value, code: $('l-code').value };
    if (setup) body.setupCode = $('l-setup').value;
    api(setup ? '/api/staff/setup' : '/api/staff/login', 'POST', body).then(function (x) {
      $('l-go').disabled = false;
      if (!x.ok) { msg.className = 'msg err'; msg.textContent = x.d.message || 'ログインできません'; return; }
      $('l-code').value = ''; msg.textContent = '';
      api('/api/staff/me').then(function (m) { if (m.ok) onLogin(m.d); });
    });
  });
  $('me-chip').addEventListener('click', function () {
    var box = document.createElement('div');
    box.innerHTML = '<button class="btn danger block" type="button" style="margin-top:16px">ログアウト</button>';
    box.firstChild.addEventListener('click', function () { api('/api/staff/logout', 'POST', {}).then(function () { location.reload(); }); });
    modal(S.me.name, '権限：<b>' + esc(S.me.levelName) + '</b>\n\n' + {
      1: 'お客さんを探す・受付・ゲームの開始と結果ができます。',
      2: 'お客さんを探す・受付・ゲームに加えて、占いができます。',
      3: '占いまでに加えて、残高を直す・お客さんを使えなくする・設定やゲームを変える・QRカードの印刷・スタッフの招待ができます。',
      4: 'ぜんぶできます。スタッフの権限やパスワードを変える・記録を見る・CSVの書き出しも。',
    }[S.me.level], box);
  });

  function onLogin(me) {
    S.me = me; S.games = me.games; S.settings = me.settings; S.oracle = me.oracle; S.site = me.site;
    $('me-chip').hidden = false; $('help').hidden = false;
    $('me-av').textContent = me.name.slice(0, 1); $('me-name').textContent = me.name;
    $('tab-teller').hidden = !can(LV.teller);
    $('tab-admin').hidden = !can(LV.manager);
    $('mgr-cards').hidden = !can(LV.manager);
    $('tabbar').hidden = false;
    var v = 'cust';
    try { v = sessionStorage.getItem('mt:staff:view') || 'cust'; } catch (e) {}
    go(v);
    poll();
  }

  /* ============================================================
     画面の切り替え
  ============================================================ */
  function show(v) { ['login', 'cust', 'games', 'teller', 'reception', 'admin'].forEach(function (k) { $('v-' + k).hidden = k !== v; }); $('title').textContent = TITLES[v]; }
  function go(v, keepScan) {
    if (v === 'teller' && !can(LV.teller)) v = 'cust';
    if (v === 'admin' && !can(LV.manager)) v = 'cust';
    S.view = v; show(v);
    document.querySelectorAll('#tabbar button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === v); });
    try { sessionStorage.setItem('mt:staff:view', v); } catch (e) {}
    if (!keepScan) stopScan();
    setBar(null);
    if (v === 'cust') { if (S.cust) refreshCust(); else renderCust(); }
    if (v === 'games') loadOpenPlays();
    if (v === 'teller') { if (S.reading) renderReading(); else renderTeller(); }
    if (v === 'admin') renderAdmin();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('#tabbar button').forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.view); }); });

  // 下に固定のボタン列（占いの手順）
  var bar = null;
  function setBar(buttons) {
    if (bar) { bar.remove(); bar = null; }
    document.body.classList.toggle('has-bar', !!buttons);
    if (!buttons) return;
    bar = document.createElement('div'); bar.className = 'actionbar';
    var w = document.createElement('div'); w.className = 'wrap';
    buttons.forEach(function (b) { w.appendChild(b); });
    bar.appendChild(w); document.body.appendChild(bar);
  }
  function mkBtn(cls, label, fn, disabled, id) { var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label; if (id) b.id = id; if (disabled) b.disabled = true; b.addEventListener('click', fn); return b; }

  var pollT;
  function poll() {
    clearTimeout(pollT);
    if (!S.me || document.hidden) { pollT = setTimeout(poll, 5000); return; }
    var ps = [api('/api/staff/plays/open')];
    if (can(LV.teller)) ps.push(api('/api/staff/readings/open'));
    Promise.all(ps).then(function (r) {
      if (r[0].ok) { S.openPlays = r[0].d.results; badge('n-plays', S.openPlays.length); if (S.view === 'games') renderOpenPlays(); }
      if (r[1] && r[1].ok) { S.openReadings = r[1].d.results; badge('n-readings', S.openReadings.length); if (S.view === 'teller' && !S.reading) renderTellerList(); }
      var typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (S.view === 'cust' && S.cust && (S.cust.openPlay || S.cust.openReading) && !typing) refreshCust();
    }).finally(function () { pollT = setTimeout(poll, 6000); });
  }
  function badge(id, n) { var e = $(id); e.hidden = !n; e.textContent = n; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });

  /* ============================================================
     お客さんを探す
  ============================================================ */
  function recent() { try { return JSON.parse(sessionStorage.getItem('mt:recent') || '[]'); } catch (e) { return []; } }
  function remember(u) {
    var r = recent().filter(function (x) { return x.id !== u.id; });
    r.unshift({ id: u.id, name: u.nickname || u.shortCode });
    try { sessionStorage.setItem('mt:recent', JSON.stringify(r.slice(0, 6))); } catch (e) {}
  }
  function renderRecent() {
    var r = recent(), box = $('recent'); box.innerHTML = '';
    $('recent-box').hidden = !r.length;
    r.forEach(function (x) { var b = document.createElement('button'); b.type = 'button'; b.textContent = x.name; b.addEventListener('click', function () { openCust(x.id); }); box.appendChild(b); });
  }
  function lookup(q, pick) {
    var ul = $('q-results'); ul.innerHTML = '<li class="empty" style="cursor:default">探しています…</li>';
    return api('/api/staff/lookup?q=' + encodeURIComponent(q)).then(function (x) {
      ul.innerHTML = '';
      if (!x.ok) { err(x.d.message || 'エラー'); return; }
      var rs = x.d.results;
      if (!rs.length) { ul.innerHTML = '<li class="empty" style="cursor:default">見つかりません。番号をもう一度確かめてください</li>'; return; }
      if (rs.length === 1 || pick) { openCust(rs[0].id); return; }
      rs.forEach(function (u) {
        var li = document.createElement('li');
        li.innerHTML = '<b>' + esc(u.nickname || '（名前のないQRカード）') + '</b><span>' + esc(u.shortCode) + '　' + yen(u.balance) + '縁</span>';
        li.addEventListener('click', function () { openCust(u.id); });
        ul.appendChild(li);
      });
    });
  }
  $('find-form').addEventListener('submit', function (e) { e.preventDefault(); var v = $('q').value.trim(); if (v) lookup(v); });
  $('scan').addEventListener('click', function () { startScan(); });

  /* ---------- カメラ ---------- */
  var stream = null, scanRaf = null, scanTarget = null;
  var CAM_REASON = {
    NotAllowedError: 'カメラの許可がオフです。ブラウザのアドレス欄の鍵（または設定 → サイトの許可）でカメラを許可して、もう一度押してください。',
    PermissionDeniedError: 'カメラの許可がオフです。ブラウザの設定でカメラを許可して、もう一度押してください。',
    NotFoundError: 'この端末にカメラが見つかりません。「写真で読む」か、番号を手で入れてください。',
    NotReadableError: 'カメラが他のアプリに使われています。他のアプリを閉じてから、もう一度押してください。',
    SecurityError: 'このブラウザではカメラが使えません。Safari か Chrome で開き直してください（LINE や Instagram の中のブラウザでは使えません）。',
  };
  function startScan(onCode, label) {
    scanTarget = onCode || function (text) { $('q').value = ''; lookup(text, true); };
    $('cam').hidden = false; $('cam-off').hidden = true; $('cam-tools').hidden = false; $('scan').hidden = true;
    if (label) toast(label);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camOff('このブラウザではカメラが使えません。Safari か Chrome で開き直すか、「写真で読む」を使ってください。');
      return;
    }
    var tries = [{ video: { facingMode: { exact: 'environment' } }, audio: false }, { video: { facingMode: 'environment' }, audio: false }, { video: true, audio: false }];
    var lastErr = null;
    (function next(k) {
      if (k >= tries.length) { camOff((lastErr && CAM_REASON[lastErr.name]) || ('カメラを使えませんでした（' + (lastErr && lastErr.name || '不明') + '）。「写真で読む」か、番号を手で入れてください。')); return; }
      navigator.mediaDevices.getUserMedia(tries[k]).then(function (s) {
        stream = s; var v = $('video'); v.srcObject = s;
        var p = v.play(); if (p && p.catch) p.catch(function () {});
        var cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
        var tick = function () {
          if (!stream) return;
          if (v.readyState >= 2 && v.videoWidth) {
            var sc = Math.min(1, 800 / v.videoWidth);
            cv.width = Math.round(v.videoWidth * sc); cv.height = Math.round(v.videoHeight * sc);
            ctx.drawImage(v, 0, 0, cv.width, cv.height);
            var code = decodeCanvas(cv, ctx);
            if (code) { if (navigator.vibrate) navigator.vibrate(60); var cb = scanTarget; stopScan(); cb(code); return; }
          }
          scanRaf = requestAnimationFrame(tick);
        };
        scanRaf = requestAnimationFrame(tick);
      }).catch(function (e) { lastErr = e; if (e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' || e.name === 'SecurityError')) next(tries.length); else next(k + 1); });
    })(0);
  }
  function decodeCanvas(cv, ctx) {
    try { var img = ctx.getImageData(0, 0, cv.width, cv.height); var code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' }); return code && code.data ? code.data : null; } catch (e) { return null; }
  }
  $('cam-file').addEventListener('change', function () {
    var f = this.files && this.files[0]; this.value = ''; if (!f) return;
    var url = URL.createObjectURL(f), im = new Image();
    im.onload = function () {
      URL.revokeObjectURL(url);
      var cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true }), code = null;
      [1000, 1600, 600].some(function (w) { var sc = Math.min(1, w / im.width); cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc); ctx.drawImage(im, 0, 0, cv.width, cv.height); code = decodeCanvas(cv, ctx); return !!code; });
      if (!code) { err('QRが読めませんでした。QR全体が写るように、近づいて撮ってください'); return; }
      var cb = scanTarget || function (text) { lookup(text, true); };
      stopScan(); cb(code);
    };
    im.onerror = function () { URL.revokeObjectURL(url); err('写真を開けませんでした'); };
    im.src = url;
  });
  $('cam-stop').addEventListener('click', function () { stopScan(); });
  function camOff(t) { $('cam-off').hidden = false; $('cam-off').textContent = t; }
  function stopScan() {
    if (scanRaf) cancelAnimationFrame(scanRaf); scanRaf = null;
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    $('cam').hidden = true; $('cam-tools').hidden = true; $('scan').hidden = false;
  }

  /* ============================================================
     お客さんの画面
  ============================================================ */
  function openCust(id) {
    return api('/api/staff/users/' + id).then(function (x) {
      if (!x.ok) { err(x.d.message || 'エラー'); return; }
      S.cust = x.d; S.betFor = null; S.histAll = false; S.mgrOpen = false; remember(x.d);
      $('q-results').innerHTML = ''; $('q').value = '';
      if (S.view !== 'cust') go('cust'); else renderCust();
      window.scrollTo(0, 0);
    });
  }
  function refreshCust() { if (!S.cust) return Promise.resolve(); return api('/api/staff/users/' + S.cust.id).then(function (x) { if (x.ok) { S.cust = x.d; renderCust(); } }); }
  function closeCust() { S.cust = null; S.betFor = null; renderCust(); window.scrollTo(0, 0); }

  function gameOf(id) { return S.games.filter(function (g) { return g.id === id; })[0]; }
  function rulesBtn(g) { return '<span class="q" role="button" tabindex="0" data-rules="' + g.id + '" aria-label="' + esc(g.name) + 'のルール">?</span>'; }
  function showRules(id) { var g = gameOf(id); if (g) modal(g.name + ' のルール', esc(g.rules || 'ルールはまだ書かれていません（管理 → ゲーム で書けます）')); }

  function renderCust() {
    var el = $('cust'), u = S.cust;
    $('finder').hidden = !!u;
    if (!u) { el.innerHTML = ''; renderRecent(); return; }
    var pills = '';
    if (!u.claimed) pills += '<span class="pill">名前のないQRカード</span>';
    if (u.status !== 'active') pills += '<span class="pill">使えなくしてあります</span>';
    if (u.openPlay) pills += '<span class="pill live">' + esc(u.openPlay.gameName) + 'をプレイ中</span>';
    if (u.openReading) pills += '<span class="pill live">占いの最中</span>';
    if (u.readings.length) pills += '<span class="pill gold">占い ' + u.readings.length + '回</span>';
    var h = '<button class="back" type="button" data-act="close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>別のお客さんを探す</button>';
    h += '<div class="who"><p class="nm" id="cust-name">' + esc(u.nickname || '（名前なし）') + (u.nickname ? '<small>さん</small>' : '') + '</p>' +
      '<div class="sub"><span>番号 ' + esc(u.shortCode) + '</span>' + pills + '</div>' +
      '<div class="bal"><p>残高</p><b id="cust-bal">' + yen(u.balance) + '<small>縁</small></b></div></div>';

    if (!u.claimed) {
      h += '<div class="card"><p>このQRカードには、まだ名前がありません。受付で名前をつけてください。</p><button class="btn gold block" data-act="to-reception" style="margin-top:12px">受付で名前をつける</button></div>';
    } else if (u.status !== 'active') {
      h += '<div class="card"><p>このお客さんは使えなくしてあります。' + (can(LV.manager) ? '戻すときは、下の「責任者メニュー」から。' : '責任者に声をかけてください。') + '</p></div>';
    } else if (u.openPlay) {
      h += resultCard(u.openPlay);
    } else if (u.openReading) {
      h += '<div class="card focus"><h3 style="color:var(--gold)">占いの最中です</h3><p>賄賂 ' + yen(u.openReading.bribe) + '縁（ランク ' + RANK[rankOf(u.openReading.bribe)] + '）。終わるまで、ゲームは始められません。</p>' +
        (can(LV.teller) ? '<button class="btn gold block huge" data-act="to-reading" data-id="' + u.openReading.id + '" style="margin-top:14px">占いの画面を開く</button>' : '<p class="hint" style="margin-top:8px">占い師の端末で進めています。</p>') + '</div>';
    } else {
      h += '<h3>ゲームを始める</h3><div class="tiles">' + S.games.map(function (g) {
        var short = g.kind !== 'bet' && u.balance < g.fee;
        var sub = g.kind === 'bet' ? '賭け金を決める' : '参加費 ' + yen(g.fee) + '縁';
        return '<button class="tile' + (S.betFor === g.id ? ' on' : '') + '" data-act="start" data-game="' + g.id + '"' + (short ? ' disabled' : '') + '><b>' + esc(g.name) + '</b><span>' + (short ? '残高が足りません' : sub) + '</span>' + rulesBtn(g) + '</button>';
      }).join('') + '</div>';
      if (S.betFor) h += betCard(gameOf(S.betFor), u);
      if (can(LV.teller)) h += '<h3>占い</h3><button class="btn gold block huge" data-act="reading">占いを始める</button><p class="hint" style="margin-top:6px">同じお客さんを何回でも占えます。</p>';
    }

    h += '<h3>履歴</h3><div class="card tight"><ul class="hist">' + (u.history.length ? u.history.slice(0, S.histAll ? 99 : 5).map(function (r) {
      return '<li><span class="t">' + esc(labelOf(r)) + '</span><span class="a ' + (r.type === 'bribe' ? 'bribe' : r.delta > 0 ? 'plus' : 'minus') + '">' + (r.delta > 0 ? '+' : '') + yen(r.delta) + '</span><span class="s">' + clock(r.created_at) + '</span></li>';
    }).join('') : '<li class="empty">まだ履歴はありません</li>') + '</ul>' + (u.history.length > 5 ? '<button class="link" data-act="hist">' + (S.histAll ? '閉じる' : 'すべて見る') + '</button>' : '') + '</div>';
    if (u.readings.length) h += '<h3>占いの結果</h3><div class="card tight"><ul class="hist">' + u.readings.map(function (r) {
      return '<li><span class="t">' + esc(r.sou) + ' × ' + esc(r.kizashi) + '（' + esc(r.rankName) + '）</span><span class="a bribe">' + yen(r.bribe) + '</span><span class="s">' + esc(r.oracle) + '</span></li>';
    }).join('') + '</ul></div>';

    if (can(LV.manager) && u.claimed) {
      h += '<details class="mgr" id="mgr"' + (S.mgrOpen ? ' open' : '') + '><summary>責任者メニュー（残高を直す・使えなくする）</summary><div>' +
        '<p class="hint">ゲームの景品は、必ずゲームの結果で入れてください。ここは間違いを直すときだけ使います。記録に残ります。</p>' +
        '<div class="sw" style="margin-top:12px"><button type="button" class="on plus" data-sign="1">増やす</button><button type="button" data-sign="-1">減らす</button></div>' +
        '<div class="row" style="margin-top:10px"><input class="in" id="adj-amt" type="number" inputmode="numeric" min="1" placeholder="何縁" style="width:130px"><input class="in grow" id="adj-note" placeholder="理由（必ず書く）"></div>' +
        '<button class="btn block" data-act="adjust" style="margin-top:10px">残高を直す</button>' +
        '<div class="row" style="margin-top:16px;justify-content:space-between"><a class="link" href="' + esc(u.url) + '" target="_blank" rel="noopener">マイページを開く</a>' +
        '<button class="btn danger sm" data-act="status" data-status="' + (u.status === 'active' ? 'disabled' : 'active') + '">' + (u.status === 'active' ? 'このお客さんを使えなくする' : '使えるように戻す') + '</button></div>' +
        '</div></details>';
    }
    el.innerHTML = h;
    var mg = el.querySelector('#mgr'); if (mg) mg.addEventListener('toggle', function () { S.mgrOpen = mg.open; });
    bindCust(el);
  }
  function labelOf(r) {
    if (r.type === 'grant') return '最初の縁';
    if (r.type === 'fee') return (r.game_name || 'ゲーム') + 'の参加費';
    if (r.type === 'payout') return (r.note || 'ゲームの払い戻し').replace('：', ' ') + (r.delta < 0 ? '（追加で払う）' : '');
    if (r.type === 'bribe') return '占いの賄賂';
    if (r.type === 'refund') return '返金' + (r.note ? '（' + r.note + '）' : '');
    if (r.type === 'adjust') return '残高の修正' + (r.note ? '（' + r.note + '）' : '');
    return r.type;
  }

  // 結果を入れるカード
  function resultCard(p) {
    var g = gameOf(p.gameId);
    var h = '<div class="card focus" data-play="' + p.id + '"><h3 style="color:var(--gold)">結果を入れる：' + esc(p.gameName) + (g ? rulesBtn(g) : '') + '</h3>' +
      '<p class="hint">' + (p.stake ? yen(p.stake) + '縁を受け取り済み・' : '') + clock(p.startedAt) + ' に ' + esc(p.staffName) + ' が開始</p>';
    if (!g) {
      h += '<p style="margin-top:10px">このゲームは今は止めてあります。取り消して返金してください。</p>';
    } else if (g.kind === 'score') {
      h += scoreBody(p, g);
    } else if (g.kind === 'stack') {
      var per = g.config.per_level, max = g.config.max_level;
      var lv0 = S.lv[p.id] || 0;
      h += '<div class="stepper" style="margin-top:14px"><button class="btn" data-act="lv" data-d="-1" aria-label="1段へらす">−</button><p class="num"><span data-lv>' + lv0 + '</span><small>段 ＝ <span data-pay>' + yen(lv0 * per) + '</span>縁 戻る</small></p><button class="btn" data-act="lv" data-d="1" aria-label="1段ふやす">＋</button></div>' +
        '<div class="chips">' + [0, 3, 5, 8, 10, 15].map(function (n) { return '<button class="btn" data-act="lv-set" data-n="' + n + '">' + n + '段</button>'; }).join('') + '</div>' +
        '<button class="btn pri block huge" data-act="finish-stack" data-per="' + per + '" data-max="' + max + '" style="margin-top:14px">この段数で決定</button>';
    } else {
      var div = g.kind === 'bet' ? (p.taxDiv || 1) : 1;
      if (div > 1) h += '<p class="hint" style="margin-top:10px;color:var(--gold)">資産区分 ' + div + '：勝ちの倍率が 1/' + div + ' になります（1倍より下にはなりません）</p>';
      h += '<div class="outcomes" style="margin-top:14px">' + g.config.outcomes.map(function (o, i) {
        var m = g.kind === 'bet' ? taxedMult(o.mult, div) : null;
        var pay = g.kind === 'bet' ? Math.round(p.stake * m) : o.payout;
        var multTxt = g.kind === 'bet' ? '（×' + (m !== Number(o.mult) ? o.mult + '→' + m : m) + '）' : '';
        return '<button class="btn ' + (pay > p.stake ? 'win' : pay < 0 ? 'neg' : pay === 0 ? 'lose' : '') + '" data-act="finish" data-outcome="' + i + '">' + esc(o.label) + '<small>' + signed(pay) + '縁' + multTxt + '</small></button>';
      }).join('') + '</div>';
    }
    h += '<div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn danger sm" data-act="void">取り消して ' + yen(p.stake) + '縁を返す</button></div></div>';
    return h;
  }
  // ラッキーパネル：取った点・引かれた点を、その場で1つずつ足していく
  function scoreState(id) {
    if (!S.sc[id]) { var v = null; try { v = JSON.parse(localStorage.getItem('mt:sc:' + id)); } catch (e) {} S.sc[id] = v || { level: 0, pts: [] }; }
    return S.sc[id];
  }
  function saveScore(id) { try { localStorage.setItem('mt:sc:' + id, JSON.stringify(S.sc[id])); } catch (e) {} }
  function scoreBody(p, g) {
    var st = scoreState(p.id), c = g.config, lv = c.levels[st.level] || c.levels[0];
    var total = st.pts.reduce(function (a, n) { return a + n; }, 0);
    var h = '<div class="sc-lv" style="margin-top:14px">' + c.levels.map(function (l, i) { return '<button class="btn' + (i === st.level ? ' on' : '') + '" data-act="sc-lv" data-i="' + i + '"><b>' + esc(l.name) + '</b><small>覚える ' + l.memorize + '秒<br>ドラキー ' + l.miss + '</small></button>'; }).join('') + '</div>';
    h += '<p class="hint" style="margin-top:12px">めくるたびに押します（押しまちがえたら、下の記録の × で消せます）</p>';
    h += '<div class="sc-keys">' + c.plus.map(function (n) { return '<button class="btn win" data-act="sc-add" data-n="' + n + '">+' + n + '</button>'; }).join('') +
      '<button class="btn neg" data-act="sc-add" data-n="' + lv.miss + '">ドラキー ' + lv.miss + '</button></div>';
    h += '<div class="row sc-free"><input class="in" type="number" inputmode="numeric" data-sc-free placeholder="ほかの点"><button class="btn" data-act="sc-free" data-sign="1">＋足す</button><button class="btn" data-act="sc-free" data-sign="-1">−引く</button></div>';
    h += '<div class="sc-log">' + (st.pts.length ? st.pts.map(function (n, k) { return '<button class="' + (n < 0 ? 'neg' : '') + '" data-act="sc-del" data-k="' + k + '" aria-label="この点を消す">' + (n > 0 ? '+' : '') + n + ' ×</button>'; }).join('') : '<span class="hint">まだ点はありません</span>') + '</div>';
    h += '<p class="sc-total ' + (total < 0 ? 'neg' : '') + '">合計 <b>' + (total > 0 ? '+' : '') + total + '</b>点<small>' + (total > 0 ? yen(total) + '縁が戻る' : total < 0 ? 'さらに ' + yen(-total) + '縁を払う' : '払い戻しなし') + '</small></p>';
    h += '<button class="btn pri block huge" data-act="finish-score" style="margin-top:12px">この点数で決定</button>';
    return h;
  }
  function scoreAct(a, b, card, root) {
    var id = Number(card.dataset.play), st = scoreState(id);
    if (a === 'sc-lv') st.level = Number(b.dataset.i);
    if (a === 'sc-add') st.pts.push(Number(b.dataset.n));
    if (a === 'sc-del') st.pts.splice(Number(b.dataset.k), 1);
    if (a === 'sc-free') {
      var inp = card.querySelector('[data-sc-free]'), n = Math.abs(Math.round(Number(inp.value)));
      if (!n) return err('点数を入れてください');
      st.pts.push(Number(b.dataset.sign) * n);
    }
    saveScore(id); renderCust();
  }
  function betCard(g, u) {
    var max = g.maxBet > 0 ? Math.min(g.maxBet, u.balance) : u.balance;
    return '<div class="card focus"><h3 style="color:var(--gold)">' + esc(g.name) + 'の賭け金</h3>' +
      '<div class="amount"><input class="in big" id="bet-amt" type="number" inputmode="numeric" min="' + g.minBet + '" max="' + max + '" value="' + Math.min(max, Math.max(g.minBet, 50)) + '"><span>縁</span></div>' +
      '<div class="chips">' + [10, 50, 100, 500].map(function (n) { return '<button class="btn" data-act="bet-n" data-n="' + n + '">' + n + '</button>'; }).join('') + '<button class="btn" data-act="bet-n" data-n="all">全部（' + yen(max) + '）</button></div>' +
      '<p class="hint" style="margin-top:8px">' + g.minBet + '縁から ' + yen(max) + '縁まで。勝てば賭け金 × 倍率が戻ります。ヒフミやションベンは、さらに払います。</p>' +
      (taxDiv(u.balance) > 1 ? '<p class="hint" style="margin-top:6px;color:var(--gold)">このお客さんは資産区分 ' + taxDiv(u.balance) + '：勝ちの倍率が 1/' + taxDiv(u.balance) + ' になります</p>' : '') +
      '<button class="btn pri block huge" data-act="bet-go" data-game="' + g.id + '" style="margin-top:12px">この額で始める</button></div>';
  }

  var pending = false;
  function bindCust(root) {
    root.querySelectorAll('[data-rules]').forEach(function (q) { q.addEventListener('click', function (e) { e.stopPropagation(); showRules(Number(q.dataset.rules)); }); });
    root.querySelectorAll('[data-sign]').forEach(function (b) { b.addEventListener('click', function () { root.querySelectorAll('[data-sign]').forEach(function (x) { x.className = x === b ? 'on ' + (b.dataset.sign === '1' ? 'plus' : 'minus') : ''; }); }); });
    root.querySelectorAll('[data-act]').forEach(function (b) { b.addEventListener('click', function (e) { if (e.target.closest('[data-rules]')) return; actCust(b, root); }); });
  }
  function actCust(b, root) {
    var a = b.dataset.act, u = S.cust;
    if (a === 'close') { closeCust(); return; }
    if (a === 'hist') { S.histAll = !S.histAll; renderCust(); return; }
    if (a === 'to-reception') { go('reception'); $('card-code').value = u.shortCode; $('card-nick').focus(); return; }
    if (a === 'to-reading') { openReading(Number(b.dataset.id)); return; }
    var card = b.closest('[data-play]');
    if (a === 'sc-lv' || a === 'sc-add' || a === 'sc-del' || a === 'sc-free') { scoreAct(a, b, card, root); return; }
    if (a === 'lv' || a === 'lv-set') { stepLv(card, a === 'lv' ? Number(b.dataset.d) : null, a === 'lv-set' ? Number(b.dataset.n) : null); return; }
    if (a === 'bet-n') { var m = root.querySelector('#bet-amt'); m.value = b.dataset.n === 'all' ? m.max : b.dataset.n; return; }
    if (pending) return;
    if (a === 'start') {
      var g = gameOf(Number(b.dataset.game));
      if (g.kind === 'bet') { S.betFor = S.betFor === g.id ? null : g.id; renderCust(); var bc = $('bet-amt'); if (bc) bc.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      startPlay(g.id, undefined); return;
    }
    if (a === 'bet-go') { startPlay(Number(b.dataset.game), Number(root.querySelector('#bet-amt').value)); return; }
    if (a === 'finish' || a === 'finish-stack' || a === 'finish-score' || a === 'void') { playAction(a, b, card); return; }
    if (a === 'reading') { busy(api('/api/staff/readings', 'POST', { userId: u.id }), function (r) { openReadingData(r); }, function () {}); return; }
    if (a === 'adjust') {
      var sign = Number((root.querySelector('[data-sign].on') || {}).dataset.sign || 1);
      var amt = Number(root.querySelector('#adj-amt').value), note = root.querySelector('#adj-note').value.trim();
      if (!(amt > 0)) return err('何縁かを入れてください');
      if (!note) return err('理由を入れてください');
      armed(b, (sign > 0 ? '+' : '−') + yen(amt) + '縁にします。もう一度押して確定', function () {
        busy(api('/api/staff/adjust', 'POST', { userId: u.id, delta: sign * amt, note: note, requestId: newId() }), function () { toast('残高を直しました'); });
      });
      return;
    }
    if (a === 'status') {
      armed(b, 'もう一度押して確定', function () { busy(api('/api/staff/users/' + u.id + '/status', 'POST', { status: b.dataset.status }), function () { toast(b.dataset.status === 'disabled' ? '使えなくしました' : '使えるように戻しました'); }); });
    }
  }
  function stepLv(card, d, set) {
    var fb = card.querySelector('[data-act=finish-stack]'), el = card.querySelector('[data-lv]');
    var n = set != null ? set : Number(el.textContent) + d;
    n = Math.max(0, Math.min(Number(fb.dataset.max), n));
    el.textContent = n; card.querySelector('[data-pay]').textContent = yen(n * Number(fb.dataset.per));
    S.lv[Number(card.dataset.play)] = n;
  }
  function playAction(a, b, card) {
    var id = Number(card.dataset.play), req;
    if (a === 'finish') req = api('/api/staff/plays/' + id + '/finish', 'POST', { result: { outcome: Number(b.dataset.outcome) } });
    else if (a === 'finish-stack') req = api('/api/staff/plays/' + id + '/finish', 'POST', { result: { level: Number(card.querySelector('[data-lv]').textContent) } });
    else if (a === 'finish-score') { var st = scoreState(id); req = api('/api/staff/plays/' + id + '/finish', 'POST', { result: { level: st.level, points: st.pts } }); req.then(function (x) { if (x.ok) { delete S.sc[id]; try { localStorage.removeItem('mt:sc:' + id); } catch (e) {} } }); }
    else {
      armed(b, 'もう一度押すと取り消し', function () { busy(api('/api/staff/plays/' + id + '/void', 'POST', {}), function () { toast('取り消して返金しました'); }); });
      return;
    }
    busy(req, function (p) { toast(p.nickname + 'さん：' + p.result.label + '　' + (p.payout > 0 ? '+' + yen(p.payout) + '縁' : p.payout < 0 ? 'さらに ' + yen(-p.payout) + '縁を払う' : '払い戻しなし')); });
  }
  function startPlay(gameId, stake) {
    busy(api('/api/staff/plays', 'POST', { userId: S.cust.id, gameId: gameId, stake: stake, requestId: newId() }), function (p) {
      S.betFor = null;
      toast(p.gameName + 'を始めました（' + yen(p.stake) + '縁）', { action: '取り消す', fn: function () { busy(api('/api/staff/plays/' + p.id + '/void', 'POST', {}), function () { toast('取り消して返金しました'); }); } });
    });
  }
  function busy(promise, onOk, after) {
    pending = true;
    return promise.then(function (x) {
      if (!x.ok) { err(x.d.message || 'エラー'); return; }
      onOk(x.d);
    }).then(after || refreshCust).then(poll).finally(function () { pending = false; });
  }

  /* ============================================================
     ゲーム中
  ============================================================ */
  function loadOpenPlays() { api('/api/staff/plays/open').then(function (x) { if (x.ok) { S.openPlays = x.d.results; badge('n-plays', S.openPlays.length); renderOpenPlays(); } }); }
  function renderOpenPlays() {
    var el = $('open-plays');
    if (!S.openPlays.length) { el.innerHTML = '<div class="card"><p class="empty">いま、ゲーム中のお客さんはいません</p></div>'; return; }
    el.innerHTML = S.openPlays.map(function (p) {
      return '<div class="card"><div class="play"><p class="nm">' + esc(p.nickname) + '</p><button class="btn gold" data-open="' + p.userId + '">結果を入れる</button>' +
        '<p class="s">' + esc(p.gameName) + '・' + yen(p.stake) + '縁・' + ago(p.startedAt) + '（' + esc(p.staffName) + '）</p></div></div>';
    }).join('');
    el.querySelectorAll('[data-open]').forEach(function (b) { b.addEventListener('click', function () { openCust(Number(b.dataset.open)); }); });
  }

  /* ============================================================
     占い
  ============================================================ */
  function renderTeller() {
    var el = $('teller');
    setBar(null);
    var h = '<button class="scan-btn" id="t-scan" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/></svg>QRを読んで占いを始める</button>';
    h += '<div class="card tight"><form class="row" id="t-form"><input class="in grow" id="t-q" placeholder="番号か名前で探す" autocomplete="off"><button class="btn" type="submit">探す</button></form></div>';
    h += '<h3>占いの途中</h3><div id="t-list"></div>';
    el.innerHTML = h;
    renderTellerList();
    $('t-form').addEventListener('submit', function (e) { e.preventDefault(); tellerLookup($('t-q').value.trim()); });
    $('t-scan').addEventListener('click', function () { S.cust = null; go('cust', true); startScan(function (text) { tellerLookup(text, true); }, '占うお客さんのQRを読んでください'); });
  }
  // 一覧だけを描き直す（検索欄に入力中の文字を消さないように）
  function renderTellerList() {
    var box = $('t-list'); if (!box) return;
    box.innerHTML = S.openReadings.length ? S.openReadings.map(function (r) {
      return '<div class="card"><div class="play"><p class="nm">' + esc(r.nickname) + '</p><button class="btn gold" data-open="' + r.id + '">続ける</button><p class="s">賄賂 ' + yen(r.bribe) + '縁・ランク ' + RANK[rankOf(r.bribe)] + '・' + ago(r.startedAt) + '</p></div></div>';
    }).join('') : '<div class="card"><p class="empty">いま、占いの途中のお客さんはいません</p></div>';
    box.querySelectorAll('[data-open]').forEach(function (b) { b.addEventListener('click', function () { openReading(Number(b.dataset.open)); }); });
  }
  function tellerLookup(q, fromScan) {
    if (!q) return;
    api('/api/staff/lookup?q=' + encodeURIComponent(q)).then(function (x) {
      if (!x.ok || !x.d.results.length) { if (fromScan) go('teller'); return err('見つかりません'); }
      if (x.d.results.length > 1) { go('cust'); lookup(q); return; }
      var u = x.d.results[0];
      api('/api/staff/readings', 'POST', { userId: u.id }).then(function (r) { if (!r.ok) { if (fromScan) go('teller'); return err(r.d.message); } openReadingData(r.d); });
    });
  }
  function openReading(id) { api('/api/staff/readings/' + id).then(function (x) { if (!x.ok) return err(x.d.message); openReadingData(x.d); }); }
  function openReadingData(r) {
    S.reading = r;
    S.answers = r.answers ? { judge: r.answers.judge.slice(), mention: r.answers.mention.slice() } : { judge: [], mention: [] };
    S.souOverride = r.answers ? r.answers.souOverride : null;
    S.kizashiId = r.kizashi ? r.kizashi.id : null;
    S.step = r.status !== 'open' ? 5 : !(r.script && r.script.before) ? (r.kizashi ? 2 : 1) : r.bribe > 0 ? 5 : 3;
    if (S.view !== 'teller') go('teller'); else renderReading();
    window.scrollTo(0, 0);
  }
  function judgeSou() {
    var O = S.oracle, sum = { hot: 0, move: 0, out: 0 }, axes = ['hot', 'hot', 'hot', 'move', 'move', 'move', 'out', 'out', 'out'];
    axes.forEach(function (a, i) { sum[a] += Number(S.answers.judge[i]) || 3; });
    var hot = sum.hot >= 10, move = sum.move >= 10, out = sum.out >= 10;
    return O.sou.filter(function (s) { return s.hot === hot && s.move === move && s.out === out; })[0] || O.sou[0];
  }
  function leaveReading() { S.reading = null; renderTeller(); poll(); window.scrollTo(0, 0); }

  function renderReading() {
    var r = S.reading, el = $('teller'), O = S.oracle, rank = rankOf(r.bribe), sc = r.script && r.script.before ? r.script : null;
    var h = '<div class="rd-head"><div class="top"><p class="nm">' + esc(r.nickname) + '<small>さん</small></p><span class="rank-seal" data-rank="' + rank + '">' + RANK[rank] + '</span></div>' +
      '<p class="hint" style="margin-top:2px">賄賂 ' + yen(r.bribe) + '縁・残高 ' + yen(r.balance) + '縁</p>' +
      (r.status === 'open' ? '<div class="steps">' + STEPS.map(function (s) { return '<button data-step="' + s[1] + '" class="' + (S.step === s[1] ? 'on' : S.step > s[1] ? 'done' : '') + '"><i>' + s[1] + '</i>' + s[0] + '</button>'; }).join('') + '</div>' : '') + '</div>';
    var barBtns = [];
    var voidBtn = '<div class="row" style="margin-top:16px;justify-content:center"><button class="btn danger sm" id="void-reading">' + (r.bribe > 0 ? '取りやめて ' + yen(r.bribe) + '縁を返す' : '占いを取りやめる') + '</button></div>';

    if (r.status !== 'open') {
      h += '<div class="card done-box"><b>' + (r.status === 'done' ? 'お客さんに結果を送りました' : '取りやめました' + (r.bribe > 0 ? '（賄賂は返金済み）' : '')) + '</b><p class="hint">' + (r.status === 'done' ? 'お客さんのスマホに、年表と結果の画像が届いています。' : '') + '</p>' +
        '<button class="btn gold block huge" id="again" style="margin-top:16px">' + esc(r.nickname) + 'さんをもう一度占う</button>' +
        '<button class="btn block" id="leave2" style="margin-top:10px">占いの一覧に戻る</button></div>';
      if (r.status === 'done' && sc) h += timelineHtml(sc) + partsHtml(sc.before, 'ふつうの占い') + (sc.after ? partsHtml(sc.after, '言い直し（ランク ' + RANK[sc.rank] + '）') : '');
      else if (r.status === 'done' && r.script) h += oldScriptHtml(r);
    } else if (S.step === 1) {
      var auto = judgeSou(), shown = S.souOverride ? O.sou.filter(function (s) { return s.id === S.souOverride; })[0] : auto;
      var answered = S.answers.judge.filter(function (v) { return v; }).length;
      h += '<div class="type-now"><div><p class="hint">いまのタイプ' + (S.souOverride ? '（手で選んだ）' : '') + '</p><b id="sou-live">' + esc(shown.name) + '</b></div><p class="hint" id="judge-n">9問中 ' + answered + '問</p></div>';
      h += '<div class="card"><h3>質問 A（9問）：タイプを決める</h3><p class="hint">質問票の A1〜A9 の答えを押します。答えていない質問は 3 として数えます。</p>' + O.judge.map(function (q, i) { return qRow('judge', i, q); }).join('') + '</div>';
      h += '<div class="card"><h3>質問 B（10問）：人生の年表に使う</h3><p class="hint">質問票の B1〜B10。1 か 5 の答えから順に2つ選んで、人生の大事件にします。1・5 が足りなければ 2・4、それもなければ 3 を使います。空欄が多いときは、タイプの出来事で埋めます。</p>' + O.mention.map(function (q, i) { return qRow('mention', i, q); }).join('') + '</div>';
      h += '<details class="mgr"><summary>タイプを手で選ぶ（ふつうは不要）</summary><div><div class="grid-cards">' + O.sou.map(function (s) { return '<button data-sou="' + s.id + '" class="' + (S.souOverride === s.id ? 'on' : !S.souOverride && s.id === auto.id ? 'auto' : '') + '"><b>' + esc(s.name) + '</b></button>'; }).join('') + '</div></div></details>';
      barBtns.push(mkBtn('pri grow', 'カードを選ぶ →', function () { saveReading().then(function (ok) { if (ok) { S.step = 2; renderReading(); window.scrollTo(0, 0); } }); }, false, 'to-step2'));
    } else if (S.step === 2) {
      h += '<div class="card"><h3>お客さんが引いたカード</h3><div class="grid-cards">' + O.kizashi.map(function (k) { return '<button data-kz="' + k.id + '" class="' + (S.kizashiId === k.id ? 'on' : '') + '"><b>' + esc(k.name) + '</b><span>' + ({ good: '良いカード', bad: '悪いカード', mixed: 'どちらとも' }[k.omen] || '') + '</span></button>'; }).join('') + '</div></div>';
      barBtns.push(mkBtn('', '← 質問', function () { S.step = 1; renderReading(); }));
      barBtns.push(mkBtn('pri grow', '占いの台本を出す →', function () { saveReading().then(function (ok) { if (ok) { S.step = 3; renderReading(); window.scrollTo(0, 0); } }); }, !S.kizashiId, 'to-step3'));
    } else if (S.step === 3) {
      if (!sc) h += '<div class="card"><p class="empty">台本がまだありません。カードを選んでください。</p></div>';
      else h += partsHtml(sc.before, 'ふつうの占い（賄賂なし）');
      h += voidBtn;
      barBtns.push(mkBtn('', '← カード', function () { S.step = 2; renderReading(); }));
      barBtns.push(mkBtn('pri grow', '賄賂チャンスへ →', function () { S.step = 4; renderReading(); window.scrollTo(0, 0); }, !sc, 'to-step4'));
    } else if (S.step === 4) {
      h += '<div class="card"><h3>賄賂チャンス</h3><p class="say-it">「この運命、賄賂で書き換えられます。いくら出しますか？」</p>' +
        '<div class="ranks" id="ranks"></div>' +
        '<div class="amount" style="margin-top:14px"><input class="in big" id="bribe-amt" type="number" inputmode="numeric" min="1" placeholder="0"><span>縁</span></div>' +
        '<div class="chips">' + [10, 50, 100, 500, 1000].map(function (n) { return '<button class="btn" data-bq="' + n + '">+' + n + '</button>'; }).join('') + '<button class="btn" data-bq="all">残高ぜんぶ</button><button class="btn ghost" data-bq="clear">0にする</button></div>' +
        '<p class="hint" style="margin-top:10px" id="bribe-note"></p>' +
        '<button class="btn pri block huge" id="bribe-go" style="margin-top:14px">受け取る</button>' +
        '<p class="hint" style="margin-top:10px">何回かに分けて受け取っても大丈夫です。合計でランクが決まります。払わないなら、下の「賄賂なしで終える」。</p></div>';
      h += voidBtn;
      barBtns.push(mkBtn('', '← 占い', function () { S.step = 3; renderReading(); }));
      if (r.bribe > 0) barBtns.push(mkBtn('pri grow', '言い直しへ →', function () { S.step = 5; renderReading(); window.scrollTo(0, 0); }, false, 'to-step5'));
      else barBtns.push(mkBtn('ok grow', '賄賂なしで終える', function () { finishReading(); }, !sc, 'finish'));
    } else {
      if (!sc || !sc.after) h += '<div class="card"><p class="empty">賄賂が ' + yen(r.bribe) + '縁で、ランクは「無」。運命は変わりません。<br>「← 賄賂を足す」で ' + yen(S.settings.rank_sho) + '縁以上にすると、言い直しができます。</p></div>';
      else h += partsHtml(sc.after, '言い直し') + timelineHtml(sc);
      h += voidBtn;
      barBtns.push(mkBtn('', '← 賄賂を足す', function () { S.step = 4; renderReading(); }, false, 'back-bribe'));
      barBtns.push(mkBtn('ok grow', '終える（結果を送る）', function () { finishReading(); }, !sc, 'finish'));
    }
    el.innerHTML = h;
    setBar(barBtns.length ? barBtns : null);
    bindReading(el);
  }
  var STEPS = [['質問', 1], ['カード', 2], ['占う', 3], ['賄賂', 4], ['言い直し', 5]];
  function partsHtml(sec, label) {
    var h = '<div class="direction"><b>' + esc(label) + '：演じ方</b>' + esc(sec.direction) + '</div>';
    sec.parts.forEach(function (p, i) {
      var k = p.title === '改竄';
      h += '<div class="part' + (k ? ' kaizan' : '') + '"><h4>' + (k ? '改竄（鈴を鳴らしてから読む）' : (sec.parts.length > 1 ? (i + 1) + '. ' : '') + esc(p.title)) + '</h4>' + p.lines.map(function (l) { return '<p class="line ' + (l.kind === 'say' ? '' : l.kind) + '">' + esc(l.t) + '</p>'; }).join('') + '</div>';
    });
    h += '<div class="oracle-box">お客さんのスマホに届く一言<b>' + esc(sec.oracle || '') + '</b></div>';
    return h;
  }
  // 年表：賄賂で何が変わったかを並べる（お客さんのスマホにも同じものが届く）
  function timelineHtml(sc) {
    return '<div class="part tl"><h4>人生の年表（' + (sc.after ? '賄賂で書き直したところは赤' : '賄賂なし。そのまま') + '）</h4>' + sc.timeline.map(function (t) {
      return '<div class="tl-row"><b>' + t.age + '歳</b><div>' + (t.before ? '<p class="' + (t.after ? 'old' : '') + '">' + esc(t.before) + '</p>' : '') + (t.after ? '<p class="new">' + esc(t.after) + '</p>' : '') + '</div></div>';
    }).join('') + '</div>';
  }
  // 古い形の台本（流れを変える前の占い）
  function oldScriptHtml(r) {
    return '<div class="part">' + r.script.parts.map(function (p) { return '<h4>' + esc(p.title) + '</h4>' + p.lines.map(function (l) { return '<p class="line ' + (l.kind === 'say' ? '' : l.kind) + '">' + esc(l.t) + '</p>'; }).join(''); }).join('') + '</div>';
  }
  function qRow(kind, i, text) {
    var v = S.answers[kind][i];
    return '<div class="qa"><p><i>' + (kind === 'judge' ? 'A' : 'B') + (i + 1) + '</i>' + esc(text) + '</p><div class="scale">' + [1, 2, 3, 4, 5].map(function (n) { return '<button data-q="' + kind + '" data-i="' + i + '" data-v="' + n + '" class="' + (v === n ? 'on' : '') + '">' + n + '</button>'; }).join('') + '</div><div class="scale-l"><span>ちがう</span><span>そう</span></div></div>';
  }
  function bindReading(el) {
    var r = S.reading;
    el.querySelectorAll('[data-step]').forEach(function (b) { b.addEventListener('click', function () { var s = Number(b.dataset.step); if (s >= 3 && !r.script) return err('先にカードを選んでください'); var save = S.step === 1 || S.step === 2 ? saveReading() : Promise.resolve(true); save.then(function (ok) { if (ok) { S.step = s; renderReading(); } }); }); });
    var again = el.querySelector('#again');
    if (again) again.addEventListener('click', function () { api('/api/staff/readings', 'POST', { userId: r.userId }).then(function (x) { if (!x.ok) return err(x.d.message); openReadingData(x.d); }); });
    var l2 = el.querySelector('#leave2'); if (l2) l2.addEventListener('click', leaveReading);
    if (r.status !== 'open') return;
    if (S.step === 4) {
      var inp = el.querySelector('#bribe-amt');
      var preview = function () {
        var add = Number(inp.value) || 0, t = r.bribe + add, rk = rankOf(t), s = S.settings;
        el.querySelector('#ranks').innerHTML = [['mu', 0], ['sho', s.rank_sho], ['dai', s.rank_dai], ['kaizan', s.rank_kaizan]].map(function (x) { return '<div data-rank="' + x[0] + '" class="' + (x[0] === rk ? 'on' : '') + '"><b>' + RANK[x[0]] + '</b><span>' + yen(x[1]) + '〜</span><em>' + esc(S.oracle.direction[x[0]].change) + '</em></div>'; }).join('');
        var next = rk === 'mu' ? Number(s.rank_sho) : rk === 'sho' ? Number(s.rank_dai) : rk === 'dai' ? Number(s.rank_kaizan) : null;
        el.querySelector('#bribe-note').textContent = (add ? '受け取ると合計 ' + yen(t) + '縁（ランク ' + RANK[rk] + '）。' : 'いまの合計 ' + yen(r.bribe) + '縁（ランク ' + RANK[rk] + '）。') + (next ? '次のランクまで あと ' + yen(next - t) + '縁。' : '') + (add > r.balance ? '　※残高（' + yen(r.balance) + '縁）より多いです' : '');
      };
      inp.addEventListener('input', preview); preview();
      el.querySelectorAll('[data-bq]').forEach(function (b) { b.addEventListener('click', function () { var q = b.dataset.bq; inp.value = q === 'all' ? r.balance : q === 'clear' ? '' : (Number(inp.value) || 0) + Number(q); preview(); }); });
      el.querySelector('#bribe-go').addEventListener('click', function () {
        var amt = Number(inp.value); if (!amt) return err('額を入れてください');
        if (pending) return; pending = true;
        api('/api/staff/readings/' + r.id + '/bribe', 'POST', { amount: amt, requestId: newId() }).then(function (x) {
          if (!x.ok) return err(x.d.message);
          S.reading = x.d; toast(yen(amt) + '縁を受け取りました（ランク ' + x.d.rankName + '）'); S.step = 5; renderReading(); window.scrollTo(0, 0);
        }).finally(function () { pending = false; });
      });
    }
    if (S.step === 1) {
      el.querySelectorAll('[data-q]').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.dataset.q, i = Number(b.dataset.i), v = Number(b.dataset.v);
          S.answers[k][i] = S.answers[k][i] === v ? undefined : v;
          Array.prototype.forEach.call(b.parentNode.children, function (c) { c.classList.toggle('on', Number(c.dataset.v) === S.answers[k][i]); });
          if (k === 'judge') {
            el.querySelector('#judge-n').textContent = '9問中 ' + S.answers.judge.filter(function (x) { return x; }).length + '問';
            if (!S.souOverride) { var a = judgeSou(); el.querySelector('#sou-live').textContent = a.name; el.querySelectorAll('[data-sou]').forEach(function (c) { c.classList.toggle('auto', c.dataset.sou === a.id); }); }
          }
        });
      });
      el.querySelectorAll('[data-sou]').forEach(function (b) { b.addEventListener('click', function () { S.souOverride = S.souOverride === b.dataset.sou ? null : b.dataset.sou; renderReading(); }); });
    }
    if (S.step === 2) el.querySelectorAll('[data-kz]').forEach(function (b) { b.addEventListener('click', function () { S.kizashiId = b.dataset.kz; renderReading(); }); });
    if (S.step >= 3) {
      var v = el.querySelector('#void-reading');
      if (v) v.addEventListener('click', function () { armed(v, r.bribe > 0 ? 'もう一度押すと取りやめ（' + yen(r.bribe) + '縁を返す）' : 'もう一度押すと取りやめ', function () { api('/api/staff/readings/' + r.id + '/void', 'POST', {}).then(function (x) { if (!x.ok) return err(x.d.message); S.reading = x.d; toast('取りやめて返金しました'); renderReading(); poll(); }); }); });
    }
  }
  function finishReading() {
    var r = S.reading;
    if (pending) return; pending = true;
    api('/api/staff/readings/' + r.id + '/finish', 'POST', {}).then(function (x) {
      if (!x.ok) return err(x.d.message);
      S.reading = x.d; toast('お客さんに結果を送りました'); renderReading(); window.scrollTo(0, 0); poll();
    }).finally(function () { pending = false; });
  }
  function saveReading() {
    var r = S.reading;
    return api('/api/staff/readings/' + r.id, 'PUT', { judge: S.answers.judge, mention: S.answers.mention, kizashiId: S.kizashiId, souId: S.souOverride }).then(function (x) {
      if (!x.ok) { err(x.d.message); return false; }
      S.reading = x.d; return true;
    });
  }

  /* ============================================================
     受付
  ============================================================ */
  function sheet(o) {
    $('sheet-k').textContent = o.k || ''; $('sheet-t').textContent = o.t || ''; $('sheet-s').textContent = o.s || ''; $('sheet-code').textContent = o.code || '';
    var q = qrcode(0, 'M'); q.addData(o.url); q.make(); $('sheet-qr').innerHTML = q.createSvgTag(4, 0);
    $('sheet-copy').hidden = !o.copy;
    $('sheet-copy').onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(o.url).then(function () { toast('コピーしました'); }, function () { window.prompt('URL', o.url); }); else window.prompt('URL', o.url); };
    $('sheet').hidden = false;
  }
  $('sheet-close').addEventListener('click', function () { $('sheet').hidden = true; });
  $('show-entry').addEventListener('click', function () { sheet({ k: '受付', t: 'スマホのカメラで読んでください', url: location.origin + '/', s: 'ニックネームを入れると、すぐに縁がもらえます' }); });
  $('reg-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('reg-msg'); msg.className = 'msg';
    api('/api/staff/register', 'POST', { nickname: $('reg-nick').value }).then(function (x) {
      if (!x.ok) { msg.className = 'msg err'; msg.textContent = x.d.message; return; }
      $('reg-nick').value = ''; msg.textContent = '';
      sheet({ k: 'お客さんのスマホで読んでもらう', t: x.d.nickname + ' さん', url: location.origin + x.d.url, code: x.d.shortCode, s: yen(x.d.balance) + '縁が入っています。読めたら、ブックマークしておいてもらうと安心です' });
    });
  });
  $('card-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('card-msg'); msg.className = 'msg';
    api('/api/staff/register', 'POST', { nickname: $('card-nick').value, code: $('card-code').value }).then(function (x) {
      if (!x.ok) { msg.className = 'msg err'; msg.textContent = x.d.message; return; }
      $('card-nick').value = ''; $('card-code').value = '';
      msg.className = 'msg ok'; msg.textContent = x.d.nickname + ' さんにカード ' + x.d.shortCode + ' を渡しました（' + yen(x.d.balance) + '縁）';
      toast('登録しました');
    });
  });
  $('card-scan').addEventListener('click', function () {
    S.cust = null; go('cust', true);
    startScan(function (text) {
      api('/api/staff/lookup?q=' + encodeURIComponent(text)).then(function (x) {
        go('reception');
        if (x.ok && x.d.results[0]) { $('card-code').value = x.d.results[0].shortCode; $('card-nick').focus(); }
        else err('そのカードは見つかりません');
      });
    }, 'QRカードを読んでください');
  });

  /* ============================================================
     管理
  ============================================================ */
  function renderAdmin() {
    var tabs = [['summary', '概要'], ['settings', '設定'], ['games', 'ゲーム'], ['staff', 'スタッフ']];
    if (can(LV.admin)) tabs.push(['log', '記録']);
    if (!tabs.some(function (t) { return t[0] === S.adminTab; })) S.adminTab = 'summary';
    $('subtabs').innerHTML = tabs.map(function (t) { return '<button data-sub="' + t[0] + '" class="' + (S.adminTab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('');
    $('subtabs').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { S.adminTab = b.dataset.sub; renderAdmin(); }); });
    var el = $('admin'); el.innerHTML = '<p class="empty">読み込み中…</p>';
    ({ summary: adminSummary, settings: adminSettings, games: adminGames, staff: adminStaff, log: adminLog })[S.adminTab](el);
  }
  function adminSummary(el) {
    Promise.all([api('/api/staff/stats'), api('/api/staff/rankings')]).then(function (r) {
      var st = r[0].ok ? r[0].d : {}, rk = r[1].ok ? r[1].d : null;
      var h = '<div class="kpis">' + [['登録したお客さん', st.users, '人'], ['残高の合計', st.totalBalance, '縁'], ['ゲームの回数', st.plays, '回'], ['占いの回数', st.readings, '回'], ['賄賂の合計', st.bribes, '縁'], ['改竄の回数', st.kaizan, '回'], ['ゲームの参加費', st.stakes, '縁'], ['ゲームの払い戻し', st.payouts, '縁']].map(function (k) { return '<div class="kpi"><b>' + yen(k[1]) + '<small>' + k[2] + '</small></b><span>' + k[0] + '</span></div>'; }).join('') + '</div>';
      if (rk) h += '<div class="card"><h3>賄賂ランキング（上位5人）</h3><ul class="list2">' + (rk.bribe.entries.slice(0, 5).map(function (e, i) { return '<li><span class="t">' + (i + 1) + '. ' + esc(e.name) + '</span><span class="r"><b>' + yen(e.amount) + '縁</b></span></li>'; }).join('') || '<li class="empty">まだいません</li>') + '</ul></div>';
      el.innerHTML = h;
    });
  }
  function adminSettings(el) {
    var s = S.settings;
    var num = function (k, label, note) { return '<div class="field"><label for="set-' + k + '">' + label + '</label><input class="in" id="set-' + k + '" type="number" inputmode="numeric" value="' + esc(s[k]) + '">' + (note ? '<p>' + note + '</p>' : '') + '</div>'; };
    var txt = function (k, label) { return '<div class="field"><label for="set-' + k + '">' + label + '</label><input class="in" id="set-' + k + '" value="' + esc(s[k]) + '"></div>'; };
    el.innerHTML =
      '<div class="card"><h3>占いのランクの境目</h3><p class="hint">賄賂がこの額以上なら、そのランクになります。</p><div class="two">' + num('rank_sho', '小') + num('rank_dai', '大') + '</div>' + num('rank_kaizan', '改竄', '変えたら、公式サイトの config.js の kaizanThreshold も同じ値にしてください。') + '</div>' +
      '<div class="card"><h3>受付</h3><label class="toggle">受付中（オフにすると新しい登録を止めます）<input type="checkbox" id="set-registration_open"' + (s.registration_open === '1' ? ' checked' : '') + '></label>' + '<div class="two">' + num('starting_en', '最初に配る縁') + num('max_users', '登録できる人数') + '</div></div>' +
      '<div class="card"><h3>資産区分（チンチロの倍率を下げる）</h3><p class="hint">残高がこの額以上のお客さんは、勝ったときの倍率が 1/2、1/3 … になります。お金持ちが増えすぎないようにするしくみです。マイナスの倍率と、1倍以下の倍率は変わりません。</p>' +
        '<div class="field"><label for="set-tax_brackets">境目の残高（縁・カンマ区切り）</label><input class="in" id="set-tax_brackets" inputmode="numeric" value="' + esc(s.tax_brackets || '') + '"><p id="tax-preview"></p></div></div>' +
      '<div class="card"><h3>ランキング</h3>' + txt('first_title', '賄賂1位の称号') + txt('rich_title', 'お金持ち1位の称号') + num('ranking_size', '表示する人数') + '</div>' +
      '<button class="btn pri block huge" id="save-settings" style="margin-top:14px">設定を保存</button>';
    var tb = el.querySelector('#set-tax_brackets');
    var tp = function () {
      var marks = tb.value.split(/[,、\s]+/).map(Number).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
      var lo = 0, parts = [];
      marks.forEach(function (m, i) { parts.push('区分' + (i + 1) + '：' + yen(lo) + '〜' + yen(m - 1) + '縁' + (i ? '（÷' + (i + 1) + '）' : '（そのまま）')); lo = m; });
      parts.push('区分' + (marks.length + 1) + '：' + yen(lo) + '縁〜' + (marks.length ? '（÷' + (marks.length + 1) + '）' : '（そのまま）'));
      el.querySelector('#tax-preview').textContent = parts.join('　') + (marks.length ? '　例：10倍の当たりは、区分' + (marks.length + 1) + 'だと ' + taxedMult(10, marks.length + 1) + '倍' : '');
    };
    tb.addEventListener('input', tp); tp();
    el.querySelector('#save-settings').addEventListener('click', function () {
      var body = {};
      ['rank_kaizan', 'rank_dai', 'rank_sho', 'starting_en', 'max_users', 'first_title', 'rich_title', 'ranking_size', 'tax_brackets'].forEach(function (k) { body[k] = el.querySelector('#set-' + k).value; });
      body.registration_open = el.querySelector('#set-registration_open').checked;
      api('/api/staff/settings', 'PUT', body).then(function (x) { if (!x.ok) return err(x.d.message); S.settings = x.d.settings; toast('設定を保存しました'); });
    });
  }
  function adminGames(el) {
    api('/api/staff/games').then(function (x) {
      var games = x.ok ? x.d.results : [];
      el.innerHTML = games.map(function (g) { return gameEditor(g); }).join('');
      games.forEach(function (g) { bindGameEditor(el.querySelector('[data-game-card="' + g.id + '"]'), g); });
    });
  }
  function gameEditor(g) {
    var cfg = g.config, h = '<div class="card" data-game-card="' + g.id + '"><div class="row" style="justify-content:space-between"><b style="font-family:var(--mincho);font-size:24px">' + esc(g.name) + '</b><label class="toggle" style="padding:8px 12px">使う<input type="checkbox" data-k="enabled"' + (g.enabled ? ' checked' : '') + '></label></div>';
    h += '<div class="field"><label>ゲームの名前</label><input class="in" data-k="name" maxlength="20" value="' + esc(g.name) + '"></div>';
    if (g.kind === 'bet') h += '<div class="two"><div class="field"><label>賭け金の下限</label><input class="in" data-k="minBet" type="number" value="' + g.minBet + '"></div><div class="field"><label>賭け金の上限</label><input class="in" data-k="maxBet" type="number" value="' + g.maxBet + '"><p>0 = 残高まで</p></div></div>';
    else h += '<div class="field"><label>参加費（縁）</label><input class="in" data-k="fee" type="number" value="' + g.fee + '"></div>';
    if (g.kind === 'score') h += '<div class="orow-h" style="grid-template-columns:1fr 1fr 1fr"><span>難易度の名前</span><span>覚える秒</span><span>ドラキーの点</span></div>' + cfg.levels.map(function (l) { return '<div class="orow" data-lvrow style="grid-template-columns:1fr 1fr 1fr"><input class="in" data-l="name" value="' + esc(l.name) + '"><input class="in" data-l="memorize" type="number" value="' + l.memorize + '"><input class="in" data-l="miss" type="number" value="' + l.miss + '"></div>'; }).join('') +
      '<div class="field"><label>足す点のボタン（カンマ区切り）</label><input class="in" data-k="plus" value="' + esc(cfg.plus.join(',')) + '"></div>';
    else if (g.kind === 'stack') h += '<div class="two"><div class="field"><label>1段で戻る縁</label><input class="in" data-k="per_level" type="number" value="' + cfg.per_level + '"></div><div class="field"><label>最大の段数</label><input class="in" data-k="max_level" type="number" value="' + cfg.max_level + '"></div></div>';
    else h += (g.kind === 'bet' ? '<p class="hint" style="margin-top:12px">倍率は マイナスも入れられます（−1 = 賭け金を失ったうえ、さらに同じ額を払う）。</p>' : '') + '<div class="orow-h"><span>結果の名前</span><span>' + (g.kind === 'bet' ? '倍率' : '戻る縁') + '</span><span></span></div><div data-outs>' + cfg.outcomes.map(function (o) { return outRow(g, o); }).join('') + '</div><button class="btn sm" data-add style="margin-top:10px">結果を足す</button>';
    h += '<div class="field"><label>ルール（お客さんとスタッフの画面に出ます）</label><textarea class="in" data-k="rules">' + esc(g.rules || '') + '</textarea></div>';
    h += '<button class="btn pri block" data-save style="margin-top:14px">' + esc(g.name) + 'を保存</button></div>';
    return h;
  }
  function outRow(g, o) { return '<div class="orow"><input class="in" data-o="label" value="' + esc(o.label) + '"><input class="in" data-o="num" type="number" step="' + (g.kind === 'bet' ? '0.5' : '10') + '" value="' + (g.kind === 'bet' ? o.mult : o.payout) + '"><button class="x" type="button" data-del aria-label="消す">×</button></div>'; }
  function bindGameEditor(card, g) {
    var outs = card.querySelector('[data-outs]');
    var bindDel = function () { card.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { b.parentNode.remove(); }; }); };
    bindDel();
    var add = card.querySelector('[data-add]');
    if (add) add.addEventListener('click', function () { outs.insertAdjacentHTML('beforeend', outRow(g, g.kind === 'bet' ? { label: '', mult: 1 } : { label: '', payout: 0 })); bindDel(); });
    card.querySelector('[data-save]').addEventListener('click', function () {
      var v = function (k) { var i = card.querySelector('[data-k="' + k + '"]'); return i ? (i.type === 'checkbox' ? i.checked : i.value) : undefined; };
      var body = { name: v('name'), enabled: v('enabled'), fee: v('fee'), minBet: v('minBet'), maxBet: v('maxBet'), rules: v('rules') };
      if (g.kind === 'score') {
        body.config = { score: true, plus: String(v('plus')).split(/[,、\s]+/).filter(Boolean).map(Number), levels: [] };
        card.querySelectorAll('[data-lvrow]').forEach(function (r) { var q = function (k) { return r.querySelector('[data-l="' + k + '"]').value; }; body.config.levels.push({ name: q('name').trim(), memorize: Number(q('memorize')), miss: Number(q('miss')) }); });
      } else if (g.kind === 'stack') body.config = { per_level: Number(v('per_level')), max_level: Number(v('max_level')) };
      else {
        var list = [];
        card.querySelectorAll('.orow').forEach(function (r) { var l = r.querySelector('[data-o=label]').value.trim(), n = Number(r.querySelector('[data-o=num]').value); if (l) list.push(g.kind === 'bet' ? { label: l, mult: n } : { label: l, payout: n }); });
        body.config = { outcomes: list };
      }
      api('/api/staff/games/' + g.id, 'PUT', body).then(function (x) {
        if (!x.ok) return err(x.d.message);
        toast(x.d.name + 'を保存しました');
        api('/api/staff/me').then(function (m) { if (m.ok) S.games = m.d.games; });
      });
    });
  }
  function adminStaff(el) {
    var ps = [api('/api/staff/invites')];
    if (can(LV.admin)) ps.push(api('/api/staff/accounts'));
    Promise.all(ps).then(function (r) {
      var invites = r[0].ok ? r[0].d.results : [], accounts = r[1] && r[1].ok ? r[1].d.results : null;
      var maxLv = can(LV.admin) ? 3 : S.me.level - 1;
      var h = '<div class="card"><h3>招待のQRを作る</h3><p class="hint">クラスの人にこのQRを読んでもらうと、自分で名前とパスワードを決めて登録できます。ここで選んだ権限になります。</p>' +
        '<div class="field"><label for="inv-level">権限</label><select class="in" id="inv-level">' + [1, 2, 3].filter(function (l) { return l <= maxLv; }).map(function (l) { return '<option value="' + l + '">' + S.me.levels[l] + '</option>'; }).join('') + '</select></div>' +
        '<div class="two"><div class="field"><label for="inv-hours">使える期間</label><select class="in" id="inv-hours"><option value="24">1日</option><option value="72" selected>3日</option><option value="168">7日</option></select></div>' +
        '<div class="field"><label for="inv-max">登録できる人数</label><select class="in" id="inv-max"><option value="10">10人</option><option value="50" selected>50人</option><option value="100">100人</option></select></div></div>' +
        '<button class="btn gold block huge" id="inv-make" style="margin-top:14px">招待のQRを作る</button></div>';
      h += '<div class="card"><h3>作った招待</h3><ul class="list2">' + (invites.length ? invites.map(function (i) {
        var st = { open: '<span class="pill ok">使える</span>', expired: '<span class="pill">期限切れ</span>', full: '<span class="pill">定員</span>', stopped: '<span class="pill">止めた</span>' }[i.state];
        return '<li><span class="t">' + esc(i.levelName) + st + '</span><span class="r">' + (i.state === 'open' ? '<button class="btn sm" data-inv-show="' + i.id + '">QRを出す</button><button class="btn sm danger" data-inv-stop="' + i.id + '">止める</button>' : '') + '</span>' +
          '<span class="s">' + i.uses + ' / ' + i.maxUses + '人が登録・' + timeOf(i.expiresAt) + 'まで' + (i.byName ? '・' + esc(i.byName) + 'が作成' : '') + '</span></li>';
      }).join('') : '<li class="empty">まだありません</li>') + '</ul></div>';
      if (accounts) {
        h += '<div class="card"><h3>スタッフの一覧（' + accounts.length + '人）</h3><ul class="list2">' + accounts.map(function (a) {
          return '<li><span class="t">' + esc(a.name) + (a.active ? '' : '<span class="pill">止めています</span>') + '</span><span class="r"><select class="in" data-acc-level="' + a.id + '" aria-label="' + esc(a.name) + 'の権限" style="min-height:40px;padding:6px 30px 6px 10px;font-size:14px;width:auto">' + [1, 2, 3, 4].map(function (l) { return '<option value="' + l + '"' + (a.level === l ? ' selected' : '') + '>' + S.me.levels[l] + '</option>'; }).join('') + '</select></span>' +
            '<span class="s">' + (a.viaInvite ? '招待から登録・' : '') + '<button class="link" data-acc-code="' + a.id + '" style="padding:0;font-size:13px">パスワードを変える</button>　<button class="link danger" data-acc-active="' + a.id + '" data-v="' + (a.active ? '0' : '1') + '" style="padding:0;font-size:13px">' + (a.active ? '止める' : '戻す') + '</button></span></li>';
        }).join('') + '</ul>' +
          '<details class="mgr" style="margin-top:14px"><summary>手で追加する</summary><div><div class="field"><input class="in" id="acc-name" placeholder="名前"></div><div class="field"><select class="in" id="acc-level" aria-label="権限">' + [1, 2, 3, 4].map(function (l) { return '<option value="' + l + '">' + S.me.levels[l] + '</option>'; }).join('') + '</select></div><div class="field"><input class="in" id="acc-code" placeholder="パスワード（6文字以上）" autocomplete="new-password"></div><button class="btn pri block" id="acc-add" style="margin-top:12px">追加</button></div></details></div>';
      }
      el.innerHTML = h;
      var showInv = function (i) { sheet({ k: 'スタッフの招待（' + i.levelName + '）', t: 'スマホのカメラで読んでください', url: location.origin + i.url, s: '名前とパスワードを決めると、' + i.levelName + 'として登録されます。' + timeOf(i.expiresAt) + 'まで・あと' + (i.maxUses - i.uses) + '人', copy: true }); };
      el.querySelector('#inv-make').addEventListener('click', function () {
        api('/api/staff/invites', 'POST', { level: Number(el.querySelector('#inv-level').value), hours: Number(el.querySelector('#inv-hours').value), maxUses: Number(el.querySelector('#inv-max').value) }).then(function (x) {
          if (!x.ok) return err(x.d.message);
          showInv(x.d); adminStaff(el);
        });
      });
      el.querySelectorAll('[data-inv-show]').forEach(function (b) { b.addEventListener('click', function () { showInv(invites.filter(function (i) { return i.id === Number(b.dataset.invShow); })[0]); }); });
      el.querySelectorAll('[data-inv-stop]').forEach(function (b) { b.addEventListener('click', function () { armed(b, 'もう一度押す', function () { api('/api/staff/invites/' + b.dataset.invStop + '/stop', 'POST', {}).then(function (x) { if (!x.ok) return err(x.d.message); toast('招待を止めました'); adminStaff(el); }); }); }); });
      var send = function (id, body) { api('/api/staff/accounts/' + id, 'PATCH', body).then(function (x) { if (!x.ok) return err(x.d.message); toast('変更しました'); adminStaff(el); }); };
      el.querySelectorAll('[data-acc-level]').forEach(function (c) { c.addEventListener('change', function () { send(Number(c.dataset.accLevel), { level: Number(c.value) }); }); });
      el.querySelectorAll('[data-acc-active]').forEach(function (c) { c.addEventListener('click', function () { armed(c, 'もう一度押す', function () { send(Number(c.dataset.accActive), { active: c.dataset.v === '1' }); }); }); });
      el.querySelectorAll('[data-acc-code]').forEach(function (c) {
        c.addEventListener('click', function () {
          var box = document.createElement('div');
          box.innerHTML = '<input class="in" placeholder="新しいパスワード（6文字以上）" style="margin-top:12px"><button class="btn pri block" style="margin-top:10px">変える</button>';
          box.querySelector('button').addEventListener('click', function () { $('modal').hidden = true; send(Number(c.dataset.accCode), { code: box.querySelector('input').value }); });
          modal('パスワードを変える', '新しいパスワードを本人に伝えてください。', box);
        });
      });
      var add = el.querySelector('#acc-add');
      if (add) add.addEventListener('click', function () {
        api('/api/staff/accounts', 'POST', { name: el.querySelector('#acc-name').value, level: Number(el.querySelector('#acc-level').value), code: el.querySelector('#acc-code').value }).then(function (x) { if (!x.ok) return err(x.d.message); toast(x.d.name + 'を追加しました'); adminStaff(el); });
      });
    });
  }
  function adminLog(el) {
    api('/api/staff/audit').then(function (x) {
      var rows = x.ok ? x.d.results : [];
      el.innerHTML = '<div class="card"><h3>書き出し（CSV・Excelで開けます）</h3><div class="row"><a class="btn" href="/api/staff/export?what=users">お客さんと残高</a><a class="btn" href="/api/staff/export?what=ledger">縁の出入り</a><a class="btn" href="/api/staff/export?what=readings">占いの結果</a></div></div>' +
        '<div class="card"><h3>誰が何をしたか（新しい順）</h3><ul class="log">' + (rows.slice(0, 150).map(function (l) { return '<li><b>' + esc(l.action) + '</b>　' + esc(l.detail || '') + '<br><span class="s">' + timeOf(l.created_at) + '・' + esc(l.staff || '—') + '</span></li>'; }).join('') || '<li class="empty">まだありません</li>') + '</ul></div>';
    });
  }

  boot();
})();
