// スタッフ研修の動画（横 1920×1080）。管理者でログインして、全部の画面と機能を順に見せる。ナレーションつき
const path = require('path');
const { open, state, reset, sleep, encode, addAudio } = require('./lib');

(async () => {
  const st = await reset();
  const s = await open('staff');
  const T = 'staff', P = 'phone';

  // 横にお客さんのスマホを出す（名前でログインして開く）
  async function phoneOf(name) {
    const u = (await state()).customers.find((c) => c.nickname === name);
    await s.load(P, u.url);
    const f = await s.frame(P);
    await f.waitForFunction(() => !document.getElementById('v-login').hidden || !document.getElementById('v-main').hidden, null, { timeout: 15000 });
    if (await f.isVisible('#v-login')) {
      await s.type(P, '#login-nick', name);
      await s.tap(P, '#login-go', { after: 300, before: 100 });
    }
    await s.wait(P, '#v-main');
    await s.quiet(P);
  }
  const refreshPhone = async (text) => { await s.tap(P, '#refresh', { after: 400, before: 150 }); if (text) await s.waitText(P, '#state-t', text); };
  const search = async (name) => {
    const f = await s.frame(T);
    if (await f.isVisible('[data-act="close"]')) await s.tap(T, '[data-act="close"]', { after: 400 });
    await s.set(T, '#q', '');
    await s.type(T, '#q', name);
    await s.tap(T, '#find-form button', { after: 700 });
    await s.wait(T, '#cust-name');
  };

  /* ---------- タイトル ---------- */
  await s.title(true, 'スタッフ研修', 'お客さん・ゲーム・占い・受付・管理　— ぜんぶの画面と使い方', '', '運命、賄賂で買いませんか？');
  await sleep(500);
  s.say('スタッフ研修です。受付、ゲーム、占いのシステムの使い方を、順番に説明します。');
  await s.waitSay(500);

  /* ---------- 1. ログイン ---------- */
  await s.load(T, '/staff');
  await s.title(false);
  s.sfx('whoosh');
  await s.cap('1　ログイン', '名前とパスワードで<br>ログイン', 'スタッフの登録は、管理する人が作る<br><b>招待のQR</b>を読むだけ。<br><br>権限は4つ：<br>スタッフ ＜ 占い師 ＜ 責任者 ＜ 管理者');
  s.say('スタッフは、名前とパスワードでログインします。スタッフの登録は、管理する人が作る、招待のQRを読むだけです。権限は四つあって、上の人は、下の人のできることを、全部できます。');
  await sleep(2500);
  await s.type(T, '#l-name', '見本管理者');
  await s.type(T, '#l-code', 'kenshu-admin');
  await s.tap(T, '#l-go', { after: 500 });
  await s.wait(T, '#tabbar:not([hidden])');
  await s.waitSay(200);
  await s.cap('1　ログイン', '下のタブが<br>仕事のぜんぶ', '<b>お客さん</b>　探す・ゲームを始める<br><b>ゲーム中</b>　結果を待っている人<br><b>占い</b>　占い師の画面<br><b>受付</b>　登録・QRカード<br><b>管理</b>　設定・スタッフ<br><br>困ったら右上の <b>?</b> で使い方が出ます。');
  s.say('下のタブが、仕事のぜんぶです。困ったら、右上のはてなを押すと、その画面の使い方が出ます。');
  await sleep(2600);
  await s.tap(T, '#help', { after: 2600 });
  await s.tap(T, '#modal-close', { after: 300 });
  await s.waitSay(300);

  /* ---------- 2. お客さんを探す ---------- */
  await s.cap('2　お客さんを探す', 'QRを読むか、<br>番号・名前で探す', 'カメラが使えない端末は<br>「写真で読む」でもOK。');
  s.say('まず、お客さんのQRを読みます。読めないときは、番号か名前で探します。');
  await search('ねこ');
  await s.waitSay(200);
  await s.cap('2　お客さんを探す', '名前と残高が<br>大きく出る', 'いまやることだけが、<br>大きなボタンで出ます。');
  s.say('お客さんの名前と残高が、大きく出ます。いまやることだけが、大きなボタンで出ます。');
  await s.waitSay(300);

  /* ---------- 3. ゲーム ---------- */
  await phoneOf('ねこ');
  await s.duo(true);
  await s.cap('3　ゲーム', 'ゲームを<br>始める', '参加費が引かれ、<br>お客さんのスマホも<br>「プレイ中」に。<br><br>間違えたら<br><b>取り消す</b>。');
  s.say('ゲームを押すと、参加費がひかれて、お客さんのスマホも、プレイ中になります。まちがえたら、すぐ出る、取り消すボタンで戻せます。');
  await sleep(1400);
  await s.tap(T, '[data-act="start"][data-game="1"]', { after: 700 });
  await refreshPhone('プレイ中');
  await s.waitSay(200);
  await s.cap('3　ゲーム', '結果を<br>入れる', '結果のボタンを<br>押すだけ。<br>払い戻しは<br>自動で入ります。');
  s.say('ゲームが終わったら、結果のボタンを押すだけ。払い戻しは、自動でお客さんに入ります。');
  await sleep(1600);
  await s.tap(T, '[data-act="finish"][data-outcome="4"]', { after: 700 });
  s.sfx('coin');
  await refreshPhone('次は');
  await s.waitText(P, '#bal', '140');
  await s.waitSay(400);

  await s.cap('3　ゲーム', 'ルールと<br>賭け金', 'ゲームの右上の <b>?</b> で<br>ルールが出ます。<br><br>チンチロは<br>賭け金を決めて<br>から始めます。');
  s.say('ルールは、ゲームの右上の、はてなで見られます。チンチロは、賭け金を決めてから始めます。');
  await s.tap(T, '.tile [data-rules="4"]', { after: 2200 });
  await s.tap(T, '#modal-close', { after: 300 });
  await s.tap(T, '[data-act="start"][data-game="4"]', { after: 600 });
  await s.tap(T, '[data-act="bet-n"][data-n="50"]', { after: 400 });
  await s.tap(T, '[data-act="bet-go"]', { after: 700 });
  await refreshPhone('プレイ中');
  await s.tap(T, '[data-act="finish"][data-outcome="3"]', { after: 700 });
  s.sfx('coin');
  await refreshPhone('次は');
  await s.waitSay(400);
  await s.duo(false);

  /* ---------- 4. ゲーム中 ---------- */
  await s.cap('4　ゲーム中', '結果を待っている<br>お客さんの一覧', '別のスタッフが始めた分も出ます。<br>「積み」は段数を入れて決定。1段50縁。');
  s.say('ゲーム中のタブには、結果を待っているお客さんが、全員ならびます。積みは、段数を入れて決定します。');
  await s.tap(T, '[data-view="games"]', { after: 900 });
  await s.tap(T, '[data-open]', { after: 900 });
  await s.tap(T, '[data-act="lv-set"][data-n="8"]', { after: 600 });
  await s.tap(T, '[data-act="finish-stack"]', { after: 900 });
  s.sfx('coin');
  await s.waitSay(400);

  /* ---------- 5. 占い ---------- */
  await s.cap('5　占い', '4つの手順で<br>進める', '<b>1 賄賂</b>　置かれた額を受け取る<br><b>2 質問</b>　質問票の答えを押す<br><b>3 カード</b>　引いたカードを選ぶ<br><b>4 台本</b>　読み上げて、終える');
  s.say('占い師は、四つの手順で進めます。わいろ、質問、カード、台本です。');
  await s.tap(T, '[data-view="teller"]', { after: 700 });
  await s.type(T, '#t-q', 'ねこ');
  await s.tap(T, '#t-form button', { after: 900 });
  await s.wait(T, '#bribe-amt');
  await s.waitSay(200);
  await s.cap('5　占い', '① 賄賂', 'お客さんが置いた額を入れて「受け取る」。<br>合計で<b>ランク</b>が決まります。<br><br>無 0〜 ／ 小 100〜 ／ 大 500〜 ／ 改竄 2,000〜');
  s.say('まず、お客さんが置いた、わいろの額を入れて、受け取ります。合計の額で、ランクが決まります。');
  await s.tap(T, '[data-bq="100"]', { after: 400 });
  await s.tap(T, '[data-bq="50"]', { after: 700 });
  await s.tap(T, '#bribe-go', { after: 900 });
  s.sfx('coin');
  await s.waitSay(200);
  await s.cap('5　占い', '② 質問', '質問票の答え（1〜5）を押すと、<br>お客さんの<b>タイプ</b>が決まります。<br>きつい質問はしません。');
  s.say('次に、質問票の答えを押します。お客さんのタイプが決まります。');
  await s.tap(T, '#to-step2', { after: 700 });
  for (const [i, v] of [[0, 5], [1, 4], [2, 5], [3, 2]]) await s.tap(T, `[data-q="judge"][data-i="${i}"][data-v="${v}"]`, { after: 300, before: 200 });
  await s.waitSay(200);
  await s.cap('5　占い', '③ カード', 'お客さんが引いたカードを選ぶと、<br>台本ができます。');
  s.say('お客さんが引いたカードを選ぶと、');
  await s.tap(T, '#to-step3', { after: 700 });
  await s.tap(T, '[data-kz="tsuki"]', { after: 500 });
  await s.waitSay(0);
  await s.cap('5　占い', '④ 台本', 'ランクに合わせた<b>演じ方</b>と台本。<br>読み終えたら「占いを終える」で、<br>お客さんのスマホに結果が届きます。');
  s.say('ランクに合わせた、演じ方と台本が出ます。読み終えたら、占いを終える。結果が、お客さんのスマホに届きます。');
  await s.tap(T, '#to-step4', { after: 1200 });
  await s.scroll(T, 400, 1500);
  await s.scroll(T, 900, 1500);
  await s.tap(T, '#finish', { after: 900 });
  await phoneOf('ねこ');
  await s.duo(true);
  s.sfx('coin');
  await s.waitSay(800);
  await s.duo(false);
  await s.cap('5　占い', '何回でも<br>占える', '終わった画面の<br>「もう一度占う」で、<br>同じお客さんを続けて占えます。');
  s.say('同じお客さんを、何回でも占えます。');
  await s.waitSay(800);

  /* ---------- 6. 改竄 ---------- */
  await s.cap('6　改竄', '2,000縁以上は<br>「改竄」', '鈴を鳴らして、<br>台本の「改竄」の部分を読みます。<br>結果が最高のものに書き換わります。');
  s.say('二千えん以上なら、かいざん。すずを鳴らして、台本の、かいざんの部分を読みます。');
  await s.tap(T, '#leave2', { after: 600 });
  await s.type(T, '#t-q', 'もち');
  await s.tap(T, '#t-form button', { after: 900 });
  await s.wait(T, '#bribe-amt');
  await s.set(T, '#bribe-amt', '2000');
  await s.tap(T, '#bribe-go', { after: 1000 });
  await s.tap(T, '#to-step2', { after: 400 });
  await s.tap(T, '#to-step3', { after: 400 });
  await s.tap(T, '[data-kz="suzu"]', { after: 400 });
  await s.tap(T, '#to-step4', { after: 1000 });
  s.sfx('bell');
  await s.scroll(T, 3000, 2000);
  await s.waitSay(800);
  await s.tap(T, '#finish', { after: 700 });

  /* ---------- 7. 受付 ---------- */
  await s.cap('7　受付', 'スマホがある人も、<br>ない人も', '<b>受付用のQR</b>を見せて、自分で登録。<br>スマホがない人には<b>QRカード</b>を渡して、<br>番号と名前を入れます。');
  s.say('受付では、受付用のQRを見せて、お客さんに自分で登録してもらいます。スマホがない人には、QRカードを渡して、番号と名前を入れます。');
  await s.tap(T, '[data-view="reception"]', { after: 700 });
  await s.tap(T, '#show-entry', { after: 2200 });
  await s.tap(T, '#sheet-close', { after: 400 });
  await s.type(T, '#card-code', st.cards[0].shortCode);
  await s.type(T, '#card-nick', 'じろう');
  await s.tap(T, '#card-form button[type="submit"]', { after: 1200 });
  await s.waitSay(400);

  /* ---------- 8. 責任者 ---------- */
  await s.cap('8　責任者', '残高の修正は<br>奥のメニュー', '理由を書いて、<b>2回押して確定</b>。<br>記録に残ります。<br>ゲームの景品は、必ずゲームの結果で。');
  s.say('残高の修正は、責任者メニューの奥にあります。理由を書いて、二回押して、確定します。');
  await s.tap(T, '[data-view="cust"]', { after: 500 });
  await search('じろう');
  await s.tap(T, 'details.mgr summary', { after: 600 });
  await s.type(T, '#adj-amt', '50');
  await s.type(T, '#adj-note', '受付で配り忘れ');
  await s.tap(T, '[data-act="adjust"]', { after: 700 });
  await s.tap(T, '[data-act="adjust"]', { after: 1000 });
  await s.waitSay(400);

  /* ---------- 9. 管理 ---------- */
  await s.cap('9　管理', '設定とゲーム', 'ランクの境目、受付の開け閉め、<br>参加費や払い戻し、<b>ルールの文章</b>を<br>ここで変えられます。');
  s.say('管理のタブでは、ランクの境目や、受付の開け閉め、ゲームの参加費やルールを、変えられます。');
  await s.tap(T, '[data-view="admin"]', { after: 1000 });
  await s.tap(T, '[data-sub="settings"]', { after: 1400 });
  await s.tap(T, '[data-sub="games"]', { after: 1400 });
  await s.scroll(T, 500, 1200);
  await s.waitSay(300);
  await s.cap('9　管理', 'スタッフの招待', '権限を選んで<b>招待のQR</b>を作り、<br>クラスの人に読んでもらう。<br>名前とパスワードを決めれば登録完了。');
  s.say('スタッフのタブで、招待のQRを作ります。クラスの人が読むと、自分で名前とパスワードを決めて、登録できます。');
  await s.tap(T, '[data-sub="staff"]', { after: 900 });
  await s.tap(T, '#inv-make', { after: 2600 });
  await s.tap(T, '#sheet-close', { after: 500 });
  await s.waitSay(400);

  /* ---------- おわり ---------- */
  await s.title(true, '困ったら、<br>責任者を呼ぶ', '取り消しはいつでもできる。縁の増減は必ず画面を通す。', '練習は 研修モード（training.moneytalks-uranai.com）', 'スタッフ研修');
  s.say('困ったら、画面を閉じずに、責任者を呼んでください。練習は、研修モードで、いつでもできます。');
  await s.waitSay(1800);

  const dir = await s.close();
  const silent = encode(dir, path.join(__dirname, 'out', 'staff-silent.mp4'));
  console.log('out', addAudio(dir, silent, path.join(__dirname, 'out', 'staff.mp4'), 'staff'));
})().catch((e) => { console.error(e); process.exit(1); });
