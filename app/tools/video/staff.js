// スタッフ研修の動画（横 1920×1080）。管理者でログインして、全部のタブと機能を順に見せる
const { open, state, reset, sleep, encode } = require('./lib');

(async () => {
  const st = await reset();
  const byName = (n) => st.customers.find((c) => c.nickname === n);
  const s = await open('staff');
  const hold = (ms) => sleep(ms);
  const T = 'staff', P = 'phone';

  // 客のスマホを横に出す（名前でログインして開く）
  async function phoneOf(name) {
    const u = byName(name) || (await state()).customers.find((c) => c.nickname === name);
    await s.load(P, u.url);
    await s.type(P, '#login-nick', name);
    await s.tap(P, '#login-go', { after: 300, before: 100 });
    await s.wait(P, '#v-main');
    await s.quiet(P);
  }
  const refreshPhone = async (text) => { await s.tap(P, '#refresh', { after: 500, before: 150 }); if (text) await s.waitText(P, '#status', text); };

  /* ---------- タイトル ---------- */
  await s.title(true, 'スタッフ研修', '受付・縁（えん）・占いのシステム　— ぜんぶの画面と機能', '', '運命、賄賂で買いませんか？');
  await hold(3600);

  /* ---------- 1. ログイン ---------- */
  await s.load(T, '/staff');
  await s.title(false);
  await s.cap('1　ログイン', '名前と合言葉で<br>ログイン', '権限は<b>ピラミッド型</b>。上は下のできることを全部できる。<br><br>スタッフ ＜ 占い師 ＜ 責任者 ＜ 管理者<br><br>この動画は管理者で進める。');
  await hold(2200);
  await s.type(T, '#l-name', '見本管理者');
  await s.type(T, '#l-code', 'kenshu-admin');
  await s.tap(T, '#l-go', { after: 600 });
  await s.wait(T, '#tabbar:not([hidden])');
  await hold(1200);
  await s.cap('1　ログイン', '下の5つのタブが<br>仕事の全部', '<b>客</b>　探す・ゲームを始める<br><b>卓</b>　進行中のゲームに結果を入れる<br><b>占</b>　占い師の画面<br><b>受</b>　受付（登録・札）<br><b>管</b>　責任者と管理者の設定');
  await hold(4200);

  /* ---------- 2. 客を探す ---------- */
  await s.cap('2　客を探す', '名前・札の番号・<br>QRのどれでも', '「カメラ」で客のQRを読むのが基本。<br>読めないときは、札の番号（6文字）か名前を入れて「探す」。');
  await hold(1800);
  await s.type(T, '#q', 'ねこ');
  await s.tap(T, '#q-go', { after: 900 });
  await s.wait(T, '#cust-panel .card');
  await hold(1500);
  await s.cap('2　客を探す', '客のパネル', '残高・状態・履歴がひと目で分かる。<br>ここからゲームを始める。');
  await hold(2400);

  /* ---------- 3. ゲーム（客のスマホを横に） ---------- */
  await phoneOf('ねこ');
  await s.duo(true);
  await s.cap('3　ゲーム', 'ゲームを<br>始める', '参加費が引かれ、客のスマホは「プレイ中」になる。');
  await hold(1800);
  await s.tap(T, '[data-act="start"][data-game="1"]', { after: 900 });
  await refreshPhone('プレイ中');
  await hold(2200);
  await s.cap('3　ゲーム', '結果を<br>入れる', '結果のボタンを押すだけ。払い戻しは自動で客に入る。');
  await hold(1200);
  await s.tap(T, '[data-act="finish"][data-outcome="4"]', { after: 900 });
  await refreshPhone('待機中');
  await s.waitText(P, '#bal', '140');
  await hold(2400);

  await s.cap('3　ゲーム', '賭け金の<br>ゲーム', 'チンチロは額を決めて開始。結果の倍率を掛けて払い戻す。');
  await hold(1200);
  await s.tap(T, '[data-act="start"][data-game="4"]', { after: 700 });
  await s.tap(T, '[data-act="bet-quick"][data-n="50"]', { after: 500 });
  await s.tap(T, '[data-act="bet-go"]', { after: 900 });
  await refreshPhone('プレイ中');
  await hold(1400);
  await s.tap(T, '[data-act="finish"][data-outcome="3"]', { after: 900 });
  await refreshPhone('待機中');
  await s.waitText(P, '#bal', '240');
  await hold(2200);
  await s.duo(false);

  /* ---------- 4. 卓 ---------- */
  await s.cap('4　卓', '進行中のゲームは<br>ここに全部', '別のスタッフが始めたゲームも出る。<br>「積み」は段数を入れて確定。1段50縁。');
  await s.tap(T, '[data-view="games"]', { after: 900 });
  await hold(1800);
  await s.tap(T, '[data-act="lv-set"][data-n="8"]', { after: 500 });
  await s.tap(T, '[data-act="finish-stack"]', { after: 1200 });
  await hold(2000);

  /* ---------- 5. 取消 ---------- */
  await s.cap('5　取消', '間違えたら<br>取消して返金', '参加費は客に戻る。履歴は消さず、逆の行が足される。');
  await s.tap(T, '[data-view="cust"]', { after: 600 });
  await s.tap(T, '[data-act="start"][data-game="2"]', { after: 1000 });
  await hold(800);
  await s.tap(T, '[data-act="void"]', { after: 1200 });
  await hold(2000);

  /* ---------- 6. 占い ---------- */
  await s.cap('6　占い', '心付け → 質問 →<br>兆 → 台本', '占い師以上。客を探して「占いを始める」か、<br>「占」タブの進行中から続きを開く。');
  await s.tap(T, '[data-view="teller"]', { after: 900 });
  await hold(1600);
  await s.type(T, '#t-q', 'ねこ');
  await s.tap(T, '#t-go', { after: 1000 });
  await s.wait(T, '#bribe-amount');
  await s.cap('6　占い', '① 心付け', '客が盆に置いた額を入れて「受け取る」。<br>何回かに分けてもいい。<b>合計で位が決まる</b>。<br>無 0〜 / 小 100〜 / 大 500〜 / 改竄 2,000〜');
  await hold(1600);
  await s.type(T, '#bribe-amount', '200');
  await hold(800);
  await s.tap(T, '#bribe-go', { after: 1200 });
  await s.tap(T, '#to-step2', { after: 900 });
  await s.cap('6　占い', '② 質問', '質問票の答えを 1〜5 で押す。相（そう）が決まる。<br>きつい質問はしない。');
  await hold(1200);
  await s.tap(T, '[data-q="judge"][data-i="0"][data-v="5"]', { after: 350 });
  await s.tap(T, '[data-q="judge"][data-i="1"][data-v="4"]', { after: 350 });
  await s.tap(T, '[data-q="judge"][data-i="3"][data-v="5"]', { after: 350 });
  await s.tap(T, '[data-q="mention"][data-i="2"][data-v="1"]', { after: 350 });
  await s.tap(T, '[data-q="mention"][data-i="6"][data-v="5"]', { after: 600 });
  await s.tap(T, '#to-step3', { after: 900 });
  await s.cap('6　占い', '③ 兆（きざし）', '客が引いた札を選ぶ。');
  await hold(1000);
  await s.tap(T, '[data-kz="tsuki"]', { after: 600 });
  await s.tap(T, '#to-step4', { after: 1200 });
  await s.cap('6　占い', '④ 台本', '位に合わせた「演じ方」と台本が出る。<br>読んだら「占い終了」。客のマイページにカードが届く。');
  await hold(1800);
  await s.scroll(T, 420, 1400);
  await s.scroll(T, 840, 1400);
  await hold(600);
  await s.tap(T, '#finish', { after: 1200 });
  await s.duo(true);
  await refreshPhone('待機中');
  await s.tap(P, '[data-tab="readings"]', { after: 800 });
  await s.tap(P, '#readings button', { after: 1400 });
  await hold(2600);
  await s.duo(false);
  await s.tap(T, '#leave', { after: 800 });

  /* ---------- 7. 改竄 ---------- */
  await s.cap('7　改竄', '2,000縁以上の心付けは<br>「改竄」', '鈴を鳴らして、神託を書き換える。<br>台本に「改竄」の部が足される。');
  await s.type(T, '#t-q', 'もち');
  await s.tap(T, '#t-go', { after: 1000 });
  await s.wait(T, '#bribe-amount');
  await s.type(T, '#bribe-amount', '2000');
  await hold(1000);
  await s.tap(T, '#bribe-go', { after: 1400 });
  await hold(800);
  await s.tap(T, '#to-step2', { after: 700 });
  await s.tap(T, '#to-step3', { after: 700 });
  await s.tap(T, '[data-kz="suzu"]', { after: 500 });
  await s.tap(T, '#to-step4', { after: 1200 });
  await s.scroll(T, 1200, 1600);
  await hold(1600);
  await s.tap(T, '#finish', { after: 1000 });
  await s.tap(T, '#leave', { after: 600 });

  /* ---------- 8. 受付 ---------- */
  await s.cap('8　受付', 'スマホを持っていない客を<br>代わりに登録', '名前を入れて登録。出てきたQRを客に読んでもらう。<br>基本は、客が自分のスマホで受付のQRを読む。');
  await s.tap(T, '[data-view="reception"]', { after: 900 });
  await hold(800);
  await s.type(T, '#reg-nick', 'はなこ');
  await s.tap(T, '#reg-form button[type="submit"]', { after: 1200 });
  await s.wait(T, '#qr-sheet:not([hidden])');
  await hold(2400);
  await s.tap(T, '#qr-sheet-close', { after: 800 });
  await s.cap('8　受付', '印刷した札', '札の番号（6文字）と名前を入れると、<br>その札のQRがその客のマイページになる。');
  await hold(1200);
  await s.type(T, '#card-code', st.cards[0].shortCode);
  await s.type(T, '#card-nick', 'じろう');
  await s.tap(T, '#card-form button[type="submit"]', { after: 1400 });
  await hold(2000);

  /* ---------- 9. 責任者 ---------- */
  await s.cap('9　責任者', '残高の調整と<br>客の無効化', '理由は必須。履歴と操作ログに残る。<br>間違いの訂正だけに使う。景品は必ずゲームを通す。');
  await s.tap(T, '[data-view="cust"]', { after: 600 });
  await s.set(T, '#q', '');
  await s.type(T, '#q', 'はなこ');
  await s.tap(T, '#q-go', { after: 1000 });
  await s.wait(T, '#adj-delta');
  await s.type(T, '#adj-delta', '50');
  await s.type(T, '#adj-note', '受付で二重に配った分の訂正');
  await s.tap(T, '[data-act="adjust"]', { after: 1400 });
  await hold(2000);

  /* ---------- 10. 管理 ---------- */
  await s.cap('10　管理', '設定・ゲーム・<br>スタッフ・ログ・CSV', '改竄の閾値は昼に上げ下げできる。<br>公式サイト（config.js）の値も同じに。');
  await s.tap(T, '[data-view="admin"]', { after: 1200 });
  await s.wait(T, '#set-rank_kaizan');
  await hold(1200);
  await s.scroll(T, 260, 1200);
  await s.set(T, '#set-rank_kaizan', '1500');
  await hold(700);
  await s.tap(T, '#save-settings', { after: 1400 });
  await s.cap('10　管理', 'スタッフの追加と権限', '管理者だけ。合言葉は6文字以上。<br>操作ログで「誰がいつ何を」が追える。');
  await s.scroll(T, 2600, 1600);
  await hold(1600);
  await s.scroll(T, 3400, 1600);
  await hold(2000);

  /* ---------- おわり ---------- */
  await s.title(true, '困ったら、<br>責任者を呼ぶ', '取消はいつでもできる。縁の増減は必ず画面を通す。', '練習は training.moneytalks-uranai.com', 'スタッフ研修');
  await hold(4000);

  const dir = await s.close();
  console.log('out', encode(dir, require('path').join(__dirname, 'out', 'staff.mp4')));
})().catch((e) => { console.error(e); process.exit(1); });
