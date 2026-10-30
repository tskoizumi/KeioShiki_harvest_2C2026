// 純粋なロジックのテスト（`npm test`）。D1 は使わない
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORACLE } from '../src/oracle.js';
import { computePayout } from '../src/plays.js';
import { rankOf, normalizeCode, cleanNickname, shortCode, taxDiv, taxedMult } from '../src/util.js';

test('占い：8タイプ × 10カード × 4ランク の全部で台本が組める', () => {
  let n = 0;
  for (const sou of ORACLE.SOU) for (const kz of ORACLE.KIZASHI) for (const rank of ['mu', 'sho', 'dai', 'kaizan']) {
    const m = ORACLE.pickMentions([5, 1, 3, 4, 2, 3, 3, 5, 1, 3], 2, n + 1);
    const r = ORACLE.compose(sou, kz, rank, m);
    const at = `${sou.id}/${kz.id}/${rank}`;
    assert.ok(r.oracle && r.before.parts.length === 4, at);
    assert.ok(!/undefined/.test(JSON.stringify(r)), at);
    // 年表は3つ（答え2つ＋カード）。年齢の順
    const ages = r.timeline.map((t) => t.age);
    assert.deepEqual(ages, [...ages].sort((a, b) => a - b), at);
    const changed = r.timeline.filter((t) => t.after).length;
    if (r.after) assert.equal(r.after.oracle, r.oracle, at);
    if (rank === 'mu') { assert.equal(r.after, null); assert.equal(changed, 0); assert.equal(r.oracle, r.oracleBefore); }
    if (rank === 'sho') assert.equal(changed, 1, at);                 // カードの転機だけ
    if (rank === 'dai') assert.equal(changed, 3, at);                 // 全部
    if (rank === 'kaizan') { assert.equal(changed, 4, at); assert.equal(r.oracle, sou.kaizan); }   // 全部＋伝説
    n++;
  }
  assert.equal(n, 320);
});

test('占い：年表に使う答えは 1・5 → 2・4 → 3 の順。空欄は使わず、足りなければタイプの出来事で埋める', () => {
  const pick = (answers, seed = 7) => ORACLE.pickMentions(answers, 2, seed);
  // 5 と 1 があればそれを使う
  assert.deepEqual(pick([3, 5, 2, 3, 1, 4, 3, 3, 3, 3]).map((m) => m.i).sort(), [1, 4]);
  // 5・1 が1つしかなければ、もう1つは 2 か 4
  const one = pick([3, 5, 2, 3, 3, 3, 3, 3, 3, 3]);
  assert.equal(one[0].i, 1); assert.equal(one[1].i, 2);
  // 全部3なら 3 の出来事（どちらでもない）
  const mid = pick([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
  assert.equal(mid.length, 2); assert.ok(mid.every((m) => m.event === ORACLE.MENTION[m.i].mid));
  // 空欄だけなら0個 → compose がタイプの出来事で埋める（年表は2つ）
  assert.equal(pick([]).length, 0);
  const sou = ORACLE.SOU[0], kz = ORACLE.KIZASHI[0];
  const r = ORACLE.compose(sou, kz, 'mu', pick([]));
  assert.equal(r.timeline.length, 2);
  assert.ok(r.timeline.some((t) => t.before === ORACLE.SOU_EVENT[sou.id].base));
  // 答えが1つだけなら、答え1つ＋タイプ＋カード
  assert.equal(ORACLE.compose(sou, kz, 'mu', pick([null, null, 5])).timeline.length, 3);
});

test('占い：答えが同じ強さなら、いつも1問目（ラーメン）にはならない', () => {
  const first = ORACLE.MENTION[0].text.replace(/。$/, '');
  const pick = (answers, seed) => ORACLE.pickMentions(answers, 1, seed)[0].quote;
  // 全部3のとき、100回の占いでラーメンが選ばれるのは一部だけ
  let ramen = 0;
  const seen = new Set();
  const threes = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
  for (let id = 1; id <= 100; id++) { const q = pick(threes, id); seen.add(q); if (q.includes(first)) ramen++; }
  assert.ok(ramen < 30, `ラーメンが ${ramen}/100 回`);
  assert.ok(seen.size >= 8, `選ばれた質問は ${seen.size} 種類`);
  // 1 や 5 と答えた質問は、3 の質問より必ず先に選ばれる
  for (let id = 1; id <= 50; id++) assert.ok(pick([3, 3, 3, 3, 3, 3, 3, 5, 3, 3], id).includes(ORACLE.MENTION[7].text.replace(/。$/, '')));
  // 同じ占い（同じ番号）なら、組み直しても同じ
  assert.equal(pick([5, 5, 5, 1, 1, 3, 3, 3, 3, 3], 42), pick([5, 5, 5, 1, 1, 3, 3, 3, 3, 3], 42));
  // 5 が何個もあるときも、占いごとに選ばれる質問が変わる
  const many = new Set(); for (let id = 1; id <= 40; id++) many.add(pick([5, 5, 5, 5, 5, 3, 3, 3, 3, 3], id));
  assert.ok(many.size >= 4);
});

test('占い：全部3なら「種」、全部5なら「焚き火」', () => {
  assert.equal(ORACLE.judge([3, 3, 3, 3, 3, 3, 3, 3, 3]).name, '種');
  assert.equal(ORACLE.judge([5, 5, 5, 5, 5, 5, 5, 5, 5]).name, '焚き火');
});

test('払い戻し：ラッキーパネルは入れた点の合計（マイナスもある）', () => {
  const lp = { kind: 'score', config: { score: true, levels: [{ name: '難易度1', memorize: 20, miss: -10 }, { name: '難易度2', memorize: 30, miss: -20 }], plus: [10, 20] } };
  assert.deepEqual(computePayout(lp, 50, { level: 1, points: [20, 20, -20, 30] }), { payout: 50, label: '難易度2・+50点' });
  assert.equal(computePayout(lp, 50, { level: 0, points: [-10, -10] }).payout, -20);
  assert.equal(computePayout(lp, 50, { points: [] }).label, '0点');
  assert.throws(() => computePayout(lp, 50, { points: [1.5] }));
});

test('払い戻し：固定・段数・倍率', () => {
  const fixed = { kind: 'fixed', config: { outcomes: [{ label: 'はずれ', payout: 0 }, { label: '中心', payout: 50 }] } };
  assert.equal(computePayout(fixed, 10, { outcome: 1 }).payout, 50);
  assert.throws(() => computePayout(fixed, 10, { outcome: 9 }));
  const stack = { kind: 'stack', config: { per_level: 50, max_level: 20 } };
  assert.equal(computePayout(stack, 100, { level: 7 }).payout, 350);
  assert.equal(computePayout(stack, 100, { level: 99 }).payout, 1000, '最大段数で頭打ち');
  const bet = { kind: 'bet', config: { outcomes: [{ label: '負け', mult: 0 }, { label: 'ピンゾロ', mult: 5 }] } };
  assert.equal(computePayout(bet, 120, { outcome: 1 }).payout, 600);
  assert.equal(computePayout(bet, 120, { outcome: 0 }).payout, 0);
});

test('資産区分：残高で区分が決まり、倍率はその数で割る（1倍より下にはしない）', () => {
  const s = { tax_brackets: '1000,3000,6000,10000' };
  assert.equal(taxDiv(0, s), 1);
  assert.equal(taxDiv(999, s), 1);
  assert.equal(taxDiv(1000, s), 2);
  assert.equal(taxDiv(5999, s), 3);
  assert.equal(taxDiv(10000, s), 5);
  assert.equal(taxDiv(99999, { tax_brackets: '' }), 1, '境目がなければ区分1');
  assert.equal(taxedMult(10, 5), 2, '10倍は区分5で2倍');
  assert.equal(taxedMult(2, 2), 1);
  assert.equal(taxedMult(3, 5), 1, '1倍より下にはしない');
  assert.equal(taxedMult(5, 2), 2.5);
  assert.equal(taxedMult(1, 5), 1, '目なしはそのまま');
  assert.equal(taxedMult(0, 5), 0);
  assert.equal(taxedMult(-2, 5), -2, 'マイナスは割らない');
});

test('チンチロ：マイナスの倍率と資産区分の払い戻し', () => {
  const bet = { kind: 'bet', config: { outcomes: [{ label: 'ヒフミ', mult: -2 }, { label: 'ションベン', mult: -1 }, { label: '勝ち', mult: 2 }, { label: '大当たり', mult: 10 }] } };
  assert.equal(computePayout(bet, 100, { outcome: 0 }).payout, -200, 'ヒフミは賭け金の2倍を追加で払う');
  assert.equal(computePayout(bet, 100, { outcome: 1 }).payout, -100);
  assert.equal(computePayout(bet, 100, { outcome: 2 }, 1).payout, 200);
  assert.equal(computePayout(bet, 100, { outcome: 2 }, 3).payout, 100, '区分3なら勝ちでも賭け金が戻るだけ');
  assert.equal(computePayout(bet, 100, { outcome: 3 }, 5).payout, 200, '10倍が区分5で2倍');
  assert.equal(computePayout(bet, 100, { outcome: 0 }, 5).payout, -200, 'マイナスは区分で軽くならない');
});

test('心付けの位は閾値で決まる', () => {
  const s = { rank_sho: '100', rank_dai: '500', rank_kaizan: '2000' };
  assert.equal(rankOf(0, s), 'mu');
  assert.equal(rankOf(99, s), 'mu');
  assert.equal(rankOf(100, s), 'sho');
  assert.equal(rankOf(1999, s), 'dai');
  assert.equal(rankOf(2000, s), 'kaizan');
});

test('札の番号は紛らわしい文字を使わず、入力は大文字に整える', () => {
  for (let i = 0; i < 200; i++) assert.match(shortCode(6), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(normalizeCode(' k7q-2xm '), 'K7Q2XM');
  assert.equal(normalizeCode('Ｋ７Ｑ２ＸＭ'), 'K7Q2XM');
});

test('ニックネームは全角を半角に、空白をまとめる', () => {
  assert.equal(cleanNickname('　ぽんず　 ２ '), 'ぽんず 2');
});
