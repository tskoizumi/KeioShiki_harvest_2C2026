// 純粋なロジックのテスト（`npm test`）。D1 は使わない
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORACLE } from '../src/oracle.js';
import { computePayout } from '../src/plays.js';
import { rankOf, normalizeCode, cleanNickname, shortCode } from '../src/util.js';

test('占い：8相 × 10兆 × 4位 の全部で台本が組める', () => {
  let n = 0;
  for (const sou of ORACLE.SOU) for (const kz of ORACLE.KIZASHI) for (const rank of ['mu', 'sho', 'dai', 'kaizan']) {
    const m = ORACLE.pickMentions([5, 1, 3, 4, 2, 3, 3, 5, 1, 3], ORACLE.DIRECTION[rank].mentions);
    const r = ORACLE.compose(sou, kz, rank, m);
    assert.ok(r.oracle && r.parts.length >= 3, `${sou.id}/${kz.id}/${rank}`);
    assert.ok(!/undefined|null/.test(JSON.stringify(r)));
    if (rank === 'kaizan') assert.equal(r.oracle, sou.kaizan);
    n++;
  }
  assert.equal(n, 320);
});

test('占い：答えが同じ強さなら、いつも1問目（ラーメン）にはならない', () => {
  const first = ORACLE.MENTION[0].text.replace(/。$/, '');
  const pick = (answers, seed) => ORACLE.pickMentions(answers, 1, seed)[0].quote;
  // 何も答えていない（全部3）とき、100回の占いでラーメンが選ばれるのは一部だけ
  let ramen = 0;
  const seen = new Set();
  for (let id = 1; id <= 100; id++) { const q = pick([], id); seen.add(q); if (q.includes(first)) ramen++; }
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

test('払い戻し：固定・段数・倍率', () => {
  const fixed = { kind: 'fixed', config: { outcomes: [{ label: 'はずれ', payout: 0 }, { label: '中心', payout: 50 }] } };
  assert.deepEqual(computePayout(fixed, 10, { outcome: 1 }), { payout: 50, label: '中心' });
  assert.throws(() => computePayout(fixed, 10, { outcome: 9 }));
  const stack = { kind: 'stack', config: { per_level: 50, max_level: 20 } };
  assert.equal(computePayout(stack, 100, { level: 7 }).payout, 350);
  assert.equal(computePayout(stack, 100, { level: 99 }).payout, 1000, '最大段数で頭打ち');
  const bet = { kind: 'bet', config: { outcomes: [{ label: '負け', mult: 0 }, { label: 'ピンゾロ', mult: 5 }] } };
  assert.equal(computePayout(bet, 120, { outcome: 1 }).payout, 600);
  assert.equal(computePayout(bet, 120, { outcome: 0 }).payout, 0);
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
