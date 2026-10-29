// お客さん向けのあそびかた動画（縦 1080×1920）。実際の画面を操作しながら、ナレーションと字幕で説明する
const path = require('path');
const { open, staffApi, reset, sleep, encode, addAudio } = require('./lib');

(async () => {
  await reset();
  const staff = await staffApi('見本スタッフ');
  const teller = await staffApi('見本占い師');
  const s = await open('phone');
  const P = 'phone';

  // タイトル
  await s.title(true, '運命、賄賂で<br>買いませんか？', 'あそびかた', '', '収穫祭 2026　2年C組');
  await sleep(600);
  s.say('運命、わいろで買いませんか。二年C組の、あそびかたを紹介します。');
  await s.waitSay(600);

  // ① 登録
  await s.load(P, '/?new');
  await s.cap('① 受付', '受付のQRを読んで、<br>ニックネームを決める', 'はじめに <b>100縁</b>（えん）がもらえます。<br>縁は、この出し物の中だけで使えるお金。');
  await s.title(false);
  s.say('受付のQRを、スマホで読みます。ニックネームを入れると、はじめに百えん、もらえます。えんは、この出し物の中だけで使える、お金です。');
  await sleep(2600);
  await s.type(P, '#nick', 'たろう');
  await s.tap(P, '#go', { after: 300 });
  await s.wait(P, '#v-main');
  await s.quiet(P);
  s.sfx('coin');
  await s.waitSay(300);

  // ② マイページ
  await s.cap('② マイページ', 'このページが、<br>あなたの財布', '名前・残高・QRがいつも出ています。<br>ゲームや占いの前に、<b>QRをスタッフに見せる</b>。');
  s.say('これが、マイページ。あなたのお財布です。ゲームや占いの前に、このQRを、スタッフに見せてください。');
  await sleep(2800);
  await s.tap(P, '#qr-plate', { after: 2400 });
  await s.tap(P, '#qr-close', { after: 400 });
  await s.waitSay(300);

  // ③ ゲーム
  await s.cap('③ ミニゲーム', 'QRを見せて、<br>ゲームに挑戦', 'スタッフが始めると参加費が引かれ、<br>結果に応じて<b>縁が増える</b>。ルールも見られます。');
  s.say('ミニゲームに挑戦します。スタッフがQRを読むと、参加費がひかれて、結果に応じて、えんが増えます。ルールは、マイページで見られます。');
  await s.scroll(P, 360, 1200);
  await s.tap(P, '.game .btn', { after: 1800 });
  await s.tap(P, '#info-close', { after: 300 });
  await s.scroll(P, 0, 700);
  const me = (await staff('/lookup?q=たろう')).results[0];
  const play = await staff('/plays', 'POST', { userId: me.id, gameId: 1, requestId: 'video:play:1' });
  await s.tap(P, '#refresh', { after: 500 });
  await s.waitText(P, '#state-t', 'プレイ中');
  await s.waitSay(200);
  await s.cap('③ ミニゲーム', '的当て、ど真ん中！', '参加費 10縁 → 払い戻し <b>50縁</b>。<br>何回でも遊べます。');
  s.say('的当てで、まんなかに当たりました。五十えん、もどってきます。ゲームは、何回でも遊べます。');
  await sleep(1200);
  await staff('/plays/' + play.id + '/finish', 'POST', { result: { outcome: 4 } });
  await s.tap(P, '#refresh', { after: 300 });
  await s.waitText(P, '#bal', '140');
  s.sfx('coin');
  await s.waitSay(600);

  // ④ 占い
  await s.cap('④ 占い', '占い師に、<br>賄賂（わいろ）を渡す', '渡した額で、占いのランクが変わります。' +
    '<div class="ranks"><div><b>無</b><small>0〜</small></div><div><b>小</b><small>100〜</small></div><div><b>大</b><small>500〜</small></div><div class="kz"><b>改竄</b><small>2,000〜</small></div></div>');
  s.say('占いの部屋では、占い師に、わいろを渡します。渡した額で、占いのランクが変わります。いまの残高で、どのランクまで受けられるかは、マイページでわかります。');
  await s.scroll(P, 300, 1400);
  await sleep(1400);
  await s.tap(P, '[data-hint="rank"]', { after: 2600 });
  await s.tap(P, '#info-close', { after: 300 });
  await s.scroll(P, 0, 700);
  const r = await teller('/readings', 'POST', { userId: me.id });
  await teller('/readings/' + r.id + '/bribe', 'POST', { amount: 100, requestId: 'video:bribe:1' });
  await s.tap(P, '#refresh', { after: 300 });
  await s.waitText(P, '#state-t', '占いの最中');
  await s.waitSay(200);
  await s.cap('④ 占い', '2,000縁以上なら<br>「改竄」', '鈴が鳴って、占い師が<br>結果を<b>最高のものに書き換え</b>ます。');
  s.say('二千えん以上なら、かいざん。すずが鳴って、占い師が、結果を、最高のものに書きかえます。');
  await sleep(1600);
  s.sfx('bell');
  await teller('/readings/' + r.id, 'PUT', { judge: [4, 5, 4, 2, 2, 1, 5, 4, 4], mention: [5, 2, 3, 4, 1, 3, 5, 2, 4, 3], kizashiId: 'tomoshibi' });
  await s.waitSay(500);
  await teller('/readings/' + r.id + '/finish', 'POST');

  // ⑤ 結果
  await s.cap('⑤ 結果', '結果の画像が、<br>スマホに届く', '保存して、シェアしよう。<br>占いは<b>何回でも</b>受けられます。');
  s.say('占いが終わると、結果の画像が、マイページに届きます。保存して、シェアしてください。占いは、何回でも受けられます。');
  await s.tap(P, '#refresh', { after: 300 });
  await s.wait(P, '#card-sheet:not([hidden]) #card-img');
  s.sfx('coin');
  await sleep(3600);
  await s.tap(P, '#card-close', { after: 500 });
  await s.tap(P, '[data-pg="results"]', { after: 1200 });
  await s.waitSay(300);

  // ⑥ ランキング
  await s.cap('⑥ ランキング', '賄賂ランキングと、<br>お金持ちランキング', 'たくさん渡した人が上。<br>自分の順位もすぐわかります。');
  s.say('わいろランキングと、お金持ちランキングも、チェックしてみてね。');
  await s.tap(P, '[data-pg="rank"]', { after: 1600 });
  await s.tap(P, '[data-board="balance"]', { after: 1400 });
  await s.waitSay(400);

  // おわり
  await s.title(true, '運命、賄賂で<br>買いませんか？', 'あなたの運命、いくらで買う？', 'HR棟3F 2C<br><span style="font-size:18px">moneytalks-uranai.com　Instagram @keioshiki2c79</span>', '収穫祭 2026　2年C組');
  s.say('あなたの運命、いくらで買いますか。二年C組で、お待ちしています。');
  await s.waitSay(1800);

  const dir = await s.close();
  const silent = encode(dir, path.join(__dirname, 'out', 'customer-silent.mp4'));
  console.log('out', addAudio(dir, silent, path.join(__dirname, 'out', 'customer.mp4'), 'customer'));
})().catch((e) => { console.error(e); process.exit(1); });
