// お客さん向けの説明動画（縦 1080×1920）。実際の画面を操作しながら録る
const { open, staffApi, reset, sleep, encode } = require('./lib');

(async () => {
  await reset();
  const staff = await staffApi('見本スタッフ');
  const teller = await staffApi('見本占い師');
  const s = await open('phone');
  const hold = (ms) => sleep(ms);

  // タイトル
  await s.title(true, '運命、賄賂で<br>買いませんか？', 'あそびかた', '', '収穫祭 2026　2年C組');
  await hold(3200);

  // ① 登録
  await s.load('phone', '/?new');
  await s.cap('① とうろく', '受付のQRを読んで、<br>ニックネームを決める', 'はじめに <b>100縁</b>（えん）をもらえる。<br>縁は、この出し物の中だけで使えるお金。');
  await s.title(false);
  await hold(1800);
  await s.type('phone', '#nick', 'たろう');
  await s.tap('phone', '#go', { after: 400 });
  await s.wait('phone', '#v-main');
  await s.quiet('phone');
  await hold(2200);

  // ② マイページ
  await s.cap('② マイページ', 'このページが、<br>あなたの財布', '残高・QR・履歴がぜんぶここに。<br>スタッフには、この <b>QR</b> を見せる。');
  await hold(2000);
  await s.tap('phone', '#show-qr');
  await hold(2400);
  await s.tap('phone', '#qr-close');
  await hold(600);

  // ③ ゲーム
  await s.cap('③ ミニゲーム', 'QRを見せて、<br>ゲームに挑戦', 'スタッフが開始すると <b>参加費</b> が引かれ、<br>結果に応じて <b>縁が増える</b>。');
  const me = (await staff('/lookup?q=たろう')).results[0];
  await hold(1500);
  const play = await staff('/plays', 'POST', { userId: me.id, gameId: 1, requestId: 'video:play:1' });
  await s.tap('phone', '#refresh', { after: 600 });
  await s.waitText('phone', '#status', 'プレイ中');
  await hold(2200);
  await s.cap('③ ミニゲーム', '的当て、ど真ん中！', '参加費 10縁 → 払い戻し <b>50縁</b>。<br>何回でも遊べる。');
  await staff('/plays/' + play.id + '/finish', 'POST', { result: { outcome: 4 } });
  await s.tap('phone', '#refresh', { after: 600 });
  await s.waitText('phone', '#bal', '140');
  await hold(2600);

  // ④ 占い
  await s.cap('④ 占い', '占いの部屋で、<br>心付け（賄賂）を渡す', '額で、占い師の態度が変わる。4つの位。' +
    '<div class="ranks"><div><b>無</b><small>0〜99</small></div><div><b>小</b><small>100〜</small></div><div><b>大</b><small>500〜</small></div><div class="kz"><b>改竄</b><small>2,000〜</small></div></div>');
  await hold(2600);
  const r = await teller('/readings', 'POST', { userId: me.id });
  await teller('/readings/' + r.id + '/bribe', 'POST', { amount: 100, requestId: 'video:bribe:1' });
  await s.tap('phone', '#refresh', { after: 600 });
  await s.waitText('phone', '#status', '占い中');
  await hold(1800);
  await s.cap('④ 占い', '質問に答えて、<br>札を一枚引く', '2,000縁からは <b>改竄</b>。<br>鈴が鳴り、占い師が神託を書き換える。');
  await teller('/readings/' + r.id, 'PUT', { judge: [4, 5, 4, 2, 2, 1, 5, 4, 4], mention: [5, 2, 3, 4, 1, 3, 5, 2, 4, 3], kizashiId: 'tomoshibi' });
  await hold(2800);
  await teller('/readings/' + r.id + '/finish', 'POST');

  // ⑤ 結果
  await s.cap('⑤ 結果', '結果のカードが、<br>マイページに届く', '保存して、シェアしよう。<br><b>@keioshiki2c79</b> をメンションしてくれたらうれしい。');
  await s.tap('phone', '#refresh', { after: 600 });
  await s.waitText('phone', '#status', '待機中');
  await s.tap('phone', '[data-tab="readings"]');
  await hold(1200);
  await s.tap('phone', '#readings button', { after: 1400 });
  await s.wait('phone', '#card-sheet:not([hidden]) #card-img');
  await hold(3400);
  await s.tap('phone', '#card-close');
  await hold(500);

  // ⑥ 番付
  await s.cap('⑥ 番付', '賄賂番付と、<br>所持金番付', '心付けを多く渡した人が上。<br>縁は、貯めても意味がない。');
  await s.tap('phone', '[data-tab="ranking"]');
  await hold(1200);
  await s.scroll('phone', 420, 1400);
  await hold(1600);

  // おわり
  await s.title(true, '運命、賄賂で<br>買いませんか？', 'あなたの運命、いくらで買う？', 'moneytalks-uranai.com<br>Instagram @keioshiki2c79', '収穫祭 2026　2年C組');
  await hold(3800);

  const dir = await s.close();
  console.log('out', encode(dir, require('path').join(__dirname, 'out', 'customer.mp4')));
})().catch((e) => { console.error(e); process.exit(1); });
