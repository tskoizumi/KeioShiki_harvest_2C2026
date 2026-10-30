// 研修モード。本番と同じ画面・同じAPIを、別のホスト名（TRAINING_HOSTS）で、別のデータベース（Durable Object の SQLite）に向けて動かす。
//   - 本番の D1 には触れない。何をしても本番に影響しない
//   - 最初に開いたとき、見本のスタッフ・客・進行中のゲーム・占いの結果まで入った状態で始まる
//   - /training に手引き。POST /api/training/reset でいつでも最初の状態に戻せる
//   - すべての画面の上に「研修モード」の帯を差し込む（本番と見分けがつくように）

import SCHEMA_1 from '../migrations/0001_init.sql';
import SCHEMA_2 from '../migrations/0002_invites_rules.sql';
import SCHEMA_3 from '../migrations/0003_tax_negative.sql';
import SCHEMA_4 from '../migrations/0004_photos.sql';
import SCHEMA_5 from '../migrations/0005_game_names.sql';
import SCHEMA_6 from '../migrations/0006_lucky_fee.sql';
import SCHEMA_7 from '../migrations/0007_two_levels.sql';
import SCHEMA_8 from '../migrations/0008_staff_perms.sql';
import SCHEMA_9 from '../migrations/0009_blackbox.sql';
import SCHEMA_10 from '../migrations/0010_strikeout.sql';
const SCHEMA = [SCHEMA_1, SCHEMA_2, SCHEMA_3, SCHEMA_4, SCHEMA_5, SCHEMA_6, SCHEMA_7, SCHEMA_8, SCHEMA_9, SCHEMA_10].join('\n;\n');
import { trainingDb } from './training-do.js';
import { json, fail, readJson, randomToken, shortCode, audit, cleanNickname } from './util.js';
import { hashCode, makeSession, sessionCookie, userKey, LEVEL_NAME, PERMS, permsOf } from './auth.js';
import { applyDelta } from './ledger.js';
import { startPlay, finishPlay } from './plays.js';
import { openReading, addBribe, updateReading, finishReading } from './readings.js';
import { grantStart } from './routes/public.js';

// 見本の作り方の版。変えると、研修モードを次に開いたときに見本データを作り直す
const SEED_VERSION = '5';

// 見本のスタッフ（管理者・占いもできるスタッフ・ふつうのスタッフ）。研修用なので合言葉は公開
export const DEMO_STAFF = [
  { name: '見本管理者', level: 4, code: 'kenshu-admin', role: 'admin' },
  { name: '見本占い師', level: 1, code: 'kenshu-teller', role: 'teller', perms: ['reception', 'games', 'fortune', 'adjust', 'cards', 'photo'] },
  { name: '見本スタッフ', level: 1, code: 'kenshu-staff', role: 'staff' },
];

export function isTraining(request, env) {
  const hosts = String(env.TRAINING_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!hosts.length) return false;
  const host = new URL(request.url).host.toLowerCase();
  return hosts.includes(host);
}

let seededInThisIsolate = false;

// 研修ホストへの要求をさばく。handle は本番と同じ振り分け関数
export async function trainingFetch(request, env, ctx, handle) {
  const db = trainingDb(env);
  const tenv = Object.assign(Object.create(null), env, { DB: db, TRAINING_MODE: '1' });
  const url = new URL(request.url);
  const p = url.pathname;

  try {
    if (!seededInThisIsolate) {
      if (!(await db.stub.ready(SEED_VERSION))) await resetTraining(tenv);
      seededInThisIsolate = true;
    }

    /* ---------- 研修モードだけのAPI ---------- */
    if (p === '/api/training/state' && request.method === 'GET') return json(await state(tenv), 200, { 'cache-control': 'no-store' });
    if (p === '/api/training/reset' && request.method === 'POST') {
      await resetTraining(tenv);
      return json({ ok: true, ...(await state(tenv)) });
    }
    if (p === '/api/training/login-as' && request.method === 'POST') {
      const b = await readJson(request);
      const want = DEMO_STAFF.find((s) => s.name === cleanNickname(b.name));
      if (!want) return fail('NOT_FOUND', '見本のスタッフにいません', 404);
      const s = await db.prepare('SELECT id, name, level FROM staff WHERE name = ?').bind(want.name).first();
      if (!s) return fail('NOT_FOUND', '見本のスタッフにいません', 404);
      const sid = await makeSession(tenv, s.id);
      return json({ id: s.id, name: s.name, level: s.level, levelName: LEVEL_NAME[s.level] }, 200, { 'set-cookie': sessionCookie(sid, request) });
    }
    if (p === '/training' || p === '/training/') return env.ASSETS.fetch(new Request(new URL('/training', url), request));
  } catch (e) {
    console.error(e);
    return fail('TRAINING', '研修モードの準備に失敗しました：' + (e && e.message), 500);
  }

  const res = await handle(request, tenv, ctx);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html')) return res;
  return new HTMLRewriter()
    .on('html', { element(el) { el.setAttribute('data-training', '1'); } })
    .on('body', { element(el) { el.prepend(BANNER, { html: true }); } })
    .transform(res);
}

const BANNER = `<a id="mt-training" href="/training" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:5px 10px;background:#f2a900;color:#1c1a1b;font:700 11px/1.4 -apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;letter-spacing:0.04em;text-decoration:none;position:relative;z-index:60;white-space:nowrap;overflow:hidden">
<span style="flex-shrink:0;padding:1px 8px;border-radius:999px;background:#1c1a1b;color:#f2a900">研修モード</span><span style="overflow:hidden;text-overflow:ellipsis">練習用。本番には影響しません</span><span style="flex-shrink:0;opacity:.7">手引き ›</span></a>
<style>@media print{#mt-training{display:none!important}}</style>`;

/* ============================================================
   今の状態（手引きページが読む）
============================================================ */
async function state(env) {
  const db = env.DB;
  const [staff, users, cards, open, readings] = await Promise.all([
    db.prepare('SELECT id, name, level, perms, active FROM staff ORDER BY level DESC, id').all(),
    db.prepare("SELECT id, nickname, token, short_code, balance, status, source, claimed_at FROM users WHERE nickname IS NOT NULL ORDER BY id").all(),
    db.prepare("SELECT short_code, token FROM users WHERE nickname IS NULL ORDER BY id").all(),
    db.prepare("SELECT COUNT(*) AS n FROM plays WHERE status = 'playing'").first(),
    db.prepare("SELECT COUNT(*) AS n FROM readings WHERE status = 'open'").first(),
  ]);
  const customers = [];
  for (const u of users.results) {
    const [play, reading, bribe] = await Promise.all([
      db.prepare("SELECT g.name FROM plays p JOIN games g ON g.id = p.game_id WHERE p.user_id = ? AND p.status = 'playing'").bind(u.id).first(),
      db.prepare("SELECT bribe FROM readings WHERE user_id = ? AND status = 'open'").bind(u.id).first(),
      db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(bribe), 0) AS total FROM readings WHERE user_id = ? AND status = 'done'").bind(u.id).first(),
    ]);
    customers.push({
      id: u.id, nickname: u.nickname, token: u.token, url: `/u/${u.token}`, key: await userKey(env, u.token, u.claimed_at),
      shortCode: u.short_code, balance: u.balance, status: u.status, source: u.source,
      playing: play ? play.name : null, reading: reading ? reading.bribe : null, readings: bribe.n, bribeTotal: bribe.total,
    });
  }
  return {
    staff: staff.results.map((s) => ({ id: s.id, name: s.name, level: s.level, levelName: LEVEL_NAME[s.level], permNames: permsOf(s).map((k) => PERMS.find((p) => p.key === k).name).join('・'), active: !!s.active, code: (DEMO_STAFF.find((d) => d.name === s.name) || {}).code || null })),
    customers,
    cards: cards.results.map((c) => ({ shortCode: c.short_code, token: c.token, url: `/u/${c.token}` })),
    openPlays: open.n,
    openReadings: readings.n,
  };
}

/* ============================================================
   見本データ
   本番と同じ関数（台帳・ゲーム・占い）を通して作るので、画面に出る形は本番と同じ
============================================================ */
export async function resetTraining(env) {
  const db = env.DB;
  await db.stub.reset(SCHEMA);

  // スタッフ
  const staffId = {};
  for (const s of DEMO_STAFF) {
    const { hash, salt } = await hashCode(s.code);
    const ins = await db.prepare('INSERT INTO staff (name, level, perms, code_hash, code_salt) VALUES (?, ?, ?, ?, ?)').bind(s.name, s.level, s.perms ? JSON.stringify(s.perms) : null, hash, salt).run();
    staffId[s.role] = ins.meta.last_row_id;
  }
  const admin = staffId.admin, staff = staffId.staff, teller = staffId.teller, manager = admin;
  await audit(db, admin, '初期設定', `staff:${admin}`, '研修用の見本データを作成');

  const user = async (nickname, source = 'self', by = null) => {
    const ins = await db
      .prepare("INSERT INTO users (token, short_code, nickname, source, claimed_at) VALUES (?, ?, ?, ?, datetime('now'))")
      .bind(randomToken(), shortCode(6), nickname, source)
      .run();
    const id = ins.meta.last_row_id;
    await grantStart(db, id, 100, by);
    if (by) await audit(db, by, '受付で登録', `user:${id}`, nickname);
    return id;
  };
  const give = (id, n, note) => applyDelta(db, { userId: id, delta: n, type: 'adjust', staffId: manager, note, requestId: `seed:adjust:${id}:${n}:${note}` });
  const play = async (id, gameId, stake, result) => {
    const p = await startPlay(db, { userId: id, gameId, stake, staffId: staff, requestId: `seed:play:${id}:${gameId}:${Math.random()}` });
    return finishPlay(db, p.id, result, staff);
  };
  const reading = async (id, bribe, kizashiId, judge, mention) => {
    const r = await openReading(db, id, teller);
    if (bribe > 0) await addBribe(db, r.id, bribe, teller, `seed:bribe:${r.id}`);
    await updateReading(db, r.id, { judge, mention, kizashiId });
    const done = await finishReading(db, r.id);
    await audit(db, teller, '占い終了', `reading:${done.id}`, `${done.nickname} ${done.bribe}縁 ${done.rankName}`);
    return done;
  };

  // 1. ぽんず：ゲームを何回か遊び、占いを2回（小→大）。賄賂番付の上のほう
  const ponzu = await user('ぽんず');
  await play(ponzu, 1, null, { points: [50, 10, 0, 30, -20] });   // ストラックアウト 5球 70点 − 25縁 = +45
  await play(ponzu, 2, null, { level: 1, points: [20, 20, -20, 30] });   // ラッキーパネル 難易度2 +50点
  await play(ponzu, 4, 60, { outcome: 3 });          // チンチロ ゾロ目 ×3
  await give(ponzu, 700, 'ゲームの景品（見本）');
  await reading(ponzu, 120, 'tomoshibi', [4, 5, 4, 2, 2, 1, 5, 4, 4], [5, 2, 3, 4, 1, 3, 5, 2, 4, 3]);
  await reading(ponzu, 600, 'tsuki', [4, 5, 4, 2, 2, 1, 5, 4, 4], [1, 5, 3, 2, 4, 5, 2, 3, 1, 4]);

  // 2. みけ：改竄（2000縁以上の心付け）。鈴が鳴る
  const mike = await user('みけ');
  await give(mike, 2400, '両替（見本）');
  await reading(mike, 2100, 'suzu', [2, 1, 2, 5, 4, 5, 1, 2, 1], [4, 4, 2, 5, 3, 1, 2, 5, 4, 3]);

  // 3. たかし：いま「ブラックボックス」をプレイ中（卓の画面に出る）
  const takashi = await user('たかし', 'staff', staff);
  await give(takashi, 300, '両替（見本）');
  await play(takashi, 1, null, { points: [0, 0, 10] });
  await startPlay(db, { userId: takashi, gameId: 3, stake: null, staffId: staff, requestId: `seed:play:${takashi}:open` });

  // 4. さくら：いま占いの最中（ふつうの占いを読み終えて、賄賂チャンスのところ。占い師の画面の続きから練習できる）
  const sakura = await user('さくら');
  await give(sakura, 500, '両替（見本）');
  const sr = await openReading(db, sakura, teller);
  await updateReading(db, sr.id, { judge: [5, 4, 4, 2, 1, 2, 4, 5, 5], mention: [5, null, 2, 1, 5, null, 3, 4, null, 2], kizashiId: 'sakeme' });

  // 5. ねこ：登録したばかり（100縁だけ）
  await user('ねこ', 'staff', staff);

  // 6. いぬ：使えなくした客（スタッフが「使えなくする」とこうなる）
  const inu = await user('いぬ');
  await db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").bind(inu).run();
  await audit(db, manager, '客を無効化', `user:${inu}`, 'なりすましの疑い（見本）');

  // 7. うさぎ：印刷した札で登録した客（source = card）
  const usagi = await user('うさぎ', 'card', staff);
  await play(usagi, 3, null, { outcome: 4 });        // ブラックボックス A 正解 +30
  await reading(usagi, 0, 'chinmoku', [3, 3, 3, 3, 3, 3, 3, 3, 3], [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);   // 無（賄賂なし。全部3でも、年表は「どちらでもない」の出来事で埋まる）

  // 8. 番付を埋める客たち
  const more = [
    ['あんこ', 900, 'kagi', 'dai', 450], ['きなこ', 400, 'tori', 'sho', 150], ['もち', 3600, 'suna', 'dai', 1200],
    ['ごま', 200, 'ashioto', 'sho', 100], ['ゆず', 2500, 'ito', 'kaizan', 2000], ['くり', 600, 'sakeme', 'sho', 250],
    ['まめ', 300, 'tomoshibi', 'mu', 60],
  ];
  for (const [name, give0, kz, , bribe] of more) {
    const id = await user(name);
    await give(id, give0, '両替（見本）');
    const judge = Array.from({ length: 9 }, (_, i) => ((name.charCodeAt(0) + i * 7) % 5) + 1);
    const mention = Array.from({ length: 10 }, (_, i) => ((name.charCodeAt(0) * 3 + i * 5) % 5) + 1);
    await reading(id, bribe, kz, judge, mention);
  }

  // 9. 印刷用の札（まだ誰のものでもない）10枚
  for (let i = 0; i < 10; i++) {
    await db.prepare("INSERT INTO users (token, short_code, source) VALUES (?, ?, 'card')").bind(randomToken(), shortCode(6)).run();
  }
  await audit(db, manager, 'QRカードを発行', 'cards', '10枚');

  // ここまで来たら完成。途中で失敗したら、次に開いたときにもう一度作り直す
  await db.prepare("INSERT INTO settings (key, value) VALUES ('training_seeded', ?)").bind(SEED_VERSION).run();
  return true;
}
