// スタッフが使うAPI。権限は2つ
//   1 スタッフ : 客を探す・ランキングは全員。あとはスタッフごとにオン・オフ（auth.js の PERMS）
//                受付／ゲーム／占い（特殊権限。決まりではオフ）／残高を直す／QRカード／写真展
//   4 管理者   : 全部 ＋ 設定とゲームの変更、スタッフの招待と管理、概要、記録、書き出し

import { ApiError, json, readJson, randomToken, cleanNickname, normalizeCode, allSettings, audit, RANK_NAME } from '../util.js';
import { LEVEL, LEVEL_NAME, PERMS, DEFAULT_PERMS, permsOf, cleanPerms, needPerm, hashCode, validCode, makeSession, sessionCookie, require as needLevel } from '../auth.js';
import { applyDelta, history } from '../ledger.js';
import { listGames, shapeGame, startPlay, finishPlay, voidPlay, getPlay, openPlays } from '../plays.js';
import { openReading, getReading, addBribe, updateReading, finishReading, voidReading, ORACLE_PUBLIC } from '../readings.js';
import { rankings, positions } from '../rankings.js';
import { validateNickname, uniqueShortCode, grantStart } from './public.js';
import { SITE } from '../site.js';

const SETTING_KEYS = ['starting_en', 'registration_open', 'max_users', 'rank_sho', 'rank_dai', 'rank_kaizan', 'first_title', 'rich_title', 'ranking_size', 'tax_brackets'];

/* ============================================================
   ログイン・初期設定
============================================================ */

export async function setup(request, env) {
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM staff').first()).n;
  if (n > 0) throw new ApiError('DONE', '初期設定は済んでいます', 409);
  const b = await readJson(request);
  if (!env.SETUP_CODE || String(b.setupCode || '') !== env.SETUP_CODE) throw new ApiError('SETUP_CODE', '初期設定のパスワード（SETUP_CODE）が違います', 403);
  const name = cleanNickname(b.name) || '管理者';
  if (!validCode(b.code)) throw new ApiError('CODE', 'パスワードは6文字以上にしてください');
  const { hash, salt } = await hashCode(b.code);
  const ins = await env.DB.prepare('INSERT INTO staff (name, level, code_hash, code_salt) VALUES (?, 4, ?, ?)').bind(name, hash, salt).run();
  await audit(env.DB, ins.meta.last_row_id, '初期設定', `staff:${ins.meta.last_row_id}`, '最初の管理者を作成');
  return finishLogin(request, env, ins.meta.last_row_id);
}

export async function login(request, env) {
  const b = await readJson(request);
  const code = String(b.code || '');
  const name = cleanNickname(b.name);
  if (!name || !code) throw new ApiError('LOGIN', '名前とパスワードを入れてください');
  const s = await env.DB.prepare('SELECT * FROM staff WHERE name = ? AND active = 1').bind(name).first();
  // 名前が違っても同じ時間をかける（名前の存在を当てられないように）
  if (!s) {
    await hashCode(code, undefined);
    throw new ApiError('LOGIN', '名前かパスワードが違います', 401);
  }
  if (s.locked_until && new Date(s.locked_until) > new Date()) throw new ApiError('LOCKED', '失敗が続いたので1分待ってください', 429);
  const { hash } = await hashCode(code, s.code_salt);
  if (hash !== s.code_hash) {
    const fails = s.fail_count + 1;
    const lock = fails >= 5 ? new Date(Date.now() + 60000).toISOString() : null;
    await env.DB.prepare('UPDATE staff SET fail_count = ?, locked_until = ? WHERE id = ?').bind(lock ? 0 : fails, lock, s.id).run();
    throw new ApiError('LOGIN', '名前かパスワードが違います', 401);
  }
  await env.DB.prepare('UPDATE staff SET fail_count = 0, locked_until = NULL WHERE id = ?').bind(s.id).run();
  return finishLogin(request, env, s.id);
}

async function finishLogin(request, env, staffId) {
  const sid = await makeSession(env, staffId);
  const s = await env.DB.prepare('SELECT id, name, level, perms FROM staff WHERE id = ?').bind(staffId).first();
  return json(shapeStaff(s), 200, { 'set-cookie': sessionCookie(sid, request) });
}

export function logout(request) {
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', request, 0) });
}

function shapeStaff(s) {
  return { id: s.id, name: s.name, level: s.level, levelName: LEVEL_NAME[s.level], perms: permsOf(s), active: s.active == null ? true : !!s.active, createdAt: s.created_at, viaInvite: s.invite_id != null };
}

export async function bootstrapState(env) {
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM staff').first()).n;
  return json({ needsSetup: n === 0, site: SITE });
}

/* ============================================================
   振り分け（ログイン済み）
============================================================ */

export async function handle(request, env, url, staff) {
  const p = url.pathname.replace(/^\/api\/staff/, '');
  const m = request.method;
  const db = env.DB;
  const body = () => readJson(request);
  let mm;

  if (p === '/me' && m === 'GET') {
    return json({ ...shapeStaff(staff), games: await listGames(db, true), settings: await allSettings(db), oracle: ORACLE_PUBLIC, site: SITE, levels: LEVEL_NAME, permDefs: PERMS });
  }

  /* ---------- 客を探す ---------- */
  if (p === '/lookup' && m === 'GET') {
    needLevel(staff, LEVEL.staff);
    return json({ results: await lookup(db, url.searchParams.get('q') || '') });
  }
  if ((mm = p.match(/^\/users\/(\d+)$/)) && m === 'GET') {
    needLevel(staff, LEVEL.staff);
    return json(await userDetail(db, Number(mm[1])));
  }

  /* ---------- 受付 ---------- */
  if (p === '/register' && m === 'POST') {
    needPerm(staff, 'reception');
    const b = await body();
    const nickname = cleanNickname(b.nickname);
    validateNickname(nickname);
    const s = await allSettings(db);
    const code = normalizeCode(b.code);
    let userId;
    if (code) {
      // 印刷QRの札に名前を紐づける
      const card = await db.prepare('SELECT id, nickname FROM users WHERE short_code = ?').bind(code).first();
      if (!card) throw new ApiError('NOT_FOUND', 'その番号のQRカードはありません', 404);
      if (card.nickname != null) throw new ApiError('CLAIMED', `その札はもう「${card.nickname}」さんのものです`, 409);
      await db.prepare("UPDATE users SET nickname = ?, source = 'card', claimed_at = datetime('now') WHERE id = ?").bind(nickname, card.id).run();
      userId = card.id;
    } else {
      const token = randomToken();
      const sc = await uniqueShortCode(db);
      const ins = await db
        .prepare("INSERT INTO users (token, short_code, nickname, source, claimed_at) VALUES (?, ?, ?, 'staff', datetime('now'))")
        .bind(token, sc, nickname)
        .run();
      userId = ins.meta.last_row_id;
    }
    await grantStart(db, userId, Number(s.starting_en), staff.id);
    await audit(db, staff.id, '受付で登録', `user:${userId}`, nickname);
    return json(await userDetail(db, userId), 201);
  }

  /* ---------- ゲーム ---------- */
  if (p === '/plays' && m === 'POST') {
    needPerm(staff, 'games');
    const b = await body();
    if (!b.requestId) throw new ApiError('REQUEST_ID', 'requestId が必要です');
    const play = await startPlay(db, { userId: Number(b.userId), gameId: Number(b.gameId), stake: b.stake, staffId: staff.id, requestId: String(b.requestId) });
    return json(play, 201);
  }
  if (p === '/plays/open' && m === 'GET') {
    needPerm(staff, 'games');
    return json({ results: await openPlays(db) });
  }
  if ((mm = p.match(/^\/plays\/(\d+)$/)) && m === 'GET') {
    needPerm(staff, 'games');
    return json(await getPlay(db, Number(mm[1])));
  }
  if ((mm = p.match(/^\/plays\/(\d+)\/finish$/)) && m === 'POST') {
    needPerm(staff, 'games');
    const b = await body();
    const play = await finishPlay(db, Number(mm[1]), b.result || {}, staff.id);
    return json(play);
  }
  if ((mm = p.match(/^\/plays\/(\d+)\/void$/)) && m === 'POST') {
    needPerm(staff, 'games');
    const play = await voidPlay(db, Number(mm[1]), staff.id);
    await audit(db, staff.id, 'ゲーム取消', `play:${play.id}`, `${play.gameName} ${play.stake}縁を返金`);
    return json(play);
  }

  /* ---------- 占い ---------- */
  if (p === '/readings' && m === 'POST') {
    needPerm(staff, 'fortune');
    const b = await body();
    return json(await openReading(db, Number(b.userId), staff.id), 201);
  }
  if (p === '/readings/open' && m === 'GET') {
    needPerm(staff, 'fortune');
    const r = await db
      .prepare("SELECT r.id, r.user_id, r.bribe, r.rank, r.started_at, r.staff_id, u.nickname, u.short_code FROM readings r JOIN users u ON u.id = r.user_id WHERE r.status = 'open' ORDER BY r.id DESC LIMIT 30")
      .all();
    return json({ results: r.results.map((x) => ({ id: x.id, userId: x.user_id, nickname: x.nickname, shortCode: x.short_code, bribe: x.bribe, rank: x.rank, rankName: x.rank ? RANK_NAME[x.rank] : null, staffId: x.staff_id, startedAt: x.started_at })) });
  }
  if ((mm = p.match(/^\/readings\/(\d+)$/)) && m === 'GET') {
    needPerm(staff, 'fortune');
    return json(await getReading(db, Number(mm[1])));
  }
  if ((mm = p.match(/^\/readings\/(\d+)\/bribe$/)) && m === 'POST') {
    needPerm(staff, 'fortune');
    const b = await body();
    if (!b.requestId) throw new ApiError('REQUEST_ID', 'requestId が必要です');
    return json(await addBribe(db, Number(mm[1]), Number(b.amount), staff.id, String(b.requestId)));
  }
  if ((mm = p.match(/^\/readings\/(\d+)$/)) && m === 'PUT') {
    needPerm(staff, 'fortune');
    const b = await body();
    return json(await updateReading(db, Number(mm[1]), { judge: b.judge, mention: b.mention, kizashiId: b.kizashiId, souId: b.souId }));
  }
  if ((mm = p.match(/^\/readings\/(\d+)\/finish$/)) && m === 'POST') {
    needPerm(staff, 'fortune');
    const r = await finishReading(db, Number(mm[1]));
    await audit(db, staff.id, '占い終了', `reading:${r.id}`, `${r.nickname} ${r.bribe}縁 ${r.rankName}`);
    return json(r);
  }
  if ((mm = p.match(/^\/readings\/(\d+)\/void$/)) && m === 'POST') {
    needPerm(staff, 'fortune');
    const r = await voidReading(db, Number(mm[1]), staff.id);
    await audit(db, staff.id, '占い取りやめ', `reading:${r.id}`, `${r.bribe}縁を返金`);
    return json(r);
  }

  /* ---------- 残高の修正・使えなくする・設定 ---------- */
  if (p === '/adjust' && m === 'POST') {
    needPerm(staff, 'adjust');
    const b = await body();
    const note = cleanNickname(b.note);
    if (!note) throw new ApiError('NOTE', '理由を入れてください');
    const delta = Number(b.delta);
    if (!Number.isInteger(delta) || delta === 0) throw new ApiError('DELTA', '増減の額が不正です');
    const r = await applyDelta(db, { userId: Number(b.userId), delta, type: 'adjust', staffId: staff.id, note, requestId: String(b.requestId || '') });
    await audit(db, staff.id, '残高調整', `user:${b.userId}`, `${delta > 0 ? '+' : ''}${delta} ${note}`);
    return json(r);
  }
  if ((mm = p.match(/^\/users\/(\d+)\/status$/)) && m === 'POST') {
    needPerm(staff, 'adjust');
    const b = await body();
    const st = b.status === 'disabled' ? 'disabled' : 'active';
    await db.prepare('UPDATE users SET status = ? WHERE id = ?').bind(st, Number(mm[1])).run();
    await audit(db, staff.id, st === 'disabled' ? '客を無効化' : '客を有効化', `user:${mm[1]}`, null);
    return json(await userDetail(db, Number(mm[1])));
  }
  if (p === '/settings' && m === 'PUT') {
    needLevel(staff, LEVEL.admin);
    const b = await body();
    const changed = {};
    for (const k of SETTING_KEYS) {
      if (!(k in b)) continue;
      let v = String(b[k]).trim();
      if (k === 'registration_open') v = b[k] === true || v === '1' ? '1' : '0';
      else if (k === 'tax_brackets') {
        const nums = v.replace(/[、，\s]+/g, ',').split(',').filter(Boolean).map(Number);
        if (nums.some((n) => !Number.isInteger(n) || n <= 0)) throw new ApiError('SETTING', '資産区分の境目は、1以上の数字をカンマで区切って入れてください（例：1000,3000,6000）');
        v = [...new Set(nums)].sort((a, b) => a - b).join(',');
      } else if (!/title/.test(k)) {
        if (!/^\d+$/.test(v)) throw new ApiError('SETTING', `${k} は数字で入れてください`);
      }
      await db.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(v, k).run();
      changed[k] = v;
    }
    await audit(db, staff.id, '設定変更', 'settings', changed);
    return json({ settings: await allSettings(db) });
  }
  if (p === '/games' && m === 'GET') {
    needLevel(staff, LEVEL.admin);
    return json({ results: await listGames(db, false) });
  }
  if ((mm = p.match(/^\/games\/(\d+)$/)) && m === 'PUT') {
    needLevel(staff, LEVEL.admin);
    const b = await body();
    const g = await db.prepare('SELECT * FROM games WHERE id = ?').bind(Number(mm[1])).first();
    if (!g) throw new ApiError('NOT_FOUND', 'そのゲームはありません', 404);
    const cfg = validateGameConfig(JSON.parse(g.config).score ? 'score' : g.kind, b.config ?? JSON.parse(g.config));
    await db
      .prepare('UPDATE games SET name = ?, fee = ?, min_bet = ?, max_bet = ?, config = ?, role_label = ?, enabled = ?, rules = ? WHERE id = ?')
      .bind(
        cleanNickname(b.name) || g.name,
        toInt(b.fee, g.fee),
        toInt(b.minBet, g.min_bet),
        toInt(b.maxBet, g.max_bet),
        JSON.stringify(cfg),
        b.roleLabel == null ? g.role_label : String(b.roleLabel).trim(),
        b.enabled == null ? g.enabled : b.enabled ? 1 : 0,
        b.rules == null ? g.rules || '' : String(b.rules).slice(0, 2000),
        g.id,
      )
      .run();
    await audit(db, staff.id, 'ゲーム設定変更', `game:${g.id}`, b);
    return json(shapeGame(await db.prepare('SELECT * FROM games WHERE id = ?').bind(g.id).first()));
  }
  if (p === '/cards' && m === 'POST') {
    needPerm(staff, 'cards');
    const b = await body();
    const n = Math.min(500, Math.max(1, Number(b.n) || 0));
    const made = [];
    for (let i = 0; i < n; i++) {
      const token = randomToken();
      const code = await uniqueShortCode(db);
      await db.prepare("INSERT INTO users (token, short_code, source) VALUES (?, ?, 'card')").bind(token, code).run();
      made.push({ token, shortCode: code });
    }
    await audit(db, staff.id, 'QRカードを発行', 'cards', `${n}枚`);
    return json({ results: made }, 201);
  }
  // 手元で作って印刷したQRカードを登録する（番号は公開リポジトリに置かず、管理画面のリンクから取り込む）
  if (p === '/cards/import' && m === 'POST') {
    needPerm(staff, 'cards');
    const b = await body();
    const list = Array.isArray(b.cards) ? b.cards.slice(0, 500) : [];
    let added = 0, already = 0;
    for (const c of list) {
      const token = String(c.token || ''), code = normalizeCode(c.shortCode);
      if (!/^[A-Za-z0-9_-]{20,40}$/.test(token) || !/^[A-Z0-9]{4,10}$/.test(code)) throw new ApiError('BAD_INPUT', 'カードの番号の形がおかしいです', 400);
      const r = await db.prepare("INSERT OR IGNORE INTO users (token, short_code, source) VALUES (?, ?, 'card')").bind(token, code).run();
      if (r.meta.changes) added++;
      else if (await db.prepare('SELECT 1 FROM users WHERE token = ? AND short_code = ?').bind(token, code).first()) already++;
      else throw new ApiError('CONFLICT', `番号 ${code} が別のカードとかぶっています`, 409);
    }
    if (added) await audit(db, staff.id, '印刷済みQRカードを登録', 'cards', `${added}枚`);
    return json({ added, already });
  }
  if (p === '/cards' && m === 'GET') {
    needPerm(staff, 'cards');
    const r = await db.prepare('SELECT token, short_code, nickname, created_at FROM users WHERE source = ? ORDER BY id').bind('card').all();
    return json({ results: r.results.map((x) => ({ token: x.token, shortCode: x.short_code, nickname: x.nickname, createdAt: x.created_at })) });
  }
  /* ---------- スタッフの招待（管理者だけ。招待で作れるのはスタッフ） ---------- */
  if (p === '/invites' && m === 'GET') {
    needLevel(staff, LEVEL.admin);
    const r = await db
      .prepare('SELECT i.*, s.name AS by_name FROM staff_invites i LEFT JOIN staff s ON s.id = i.created_by ORDER BY i.id DESC LIMIT 50')
      .all();
    const joined = await db.prepare('SELECT invite_id, COUNT(*) AS n FROM staff WHERE invite_id IS NOT NULL GROUP BY invite_id').all();
    const n = Object.fromEntries(joined.results.map((x) => [x.invite_id, x.n]));
    return json({ results: r.results.map((i) => shapeInvite(i, n[i.id] || 0)) });
  }
  if (p === '/invites' && m === 'POST') {
    needLevel(staff, LEVEL.admin);
    const b = await body();
    const level = LEVEL.staff;   // 管理者は招待では作らない（一覧で権限を変える）
    const perms = cleanPerms(Array.isArray(b.perms) ? b.perms : DEFAULT_PERMS);
    const hours = Math.min(24 * 14, Math.max(1, Number(b.hours) || 72));
    const maxUses = Math.min(200, Math.max(1, Number(b.maxUses) || 50));
    const code = inviteCode();
    const exp = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    const ins = await db.prepare('INSERT INTO staff_invites (code, level, perms, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(code, level, perms, staff.id, maxUses, exp).run();
    await audit(db, staff.id, '招待を作成', `invite:${ins.meta.last_row_id}`, `${LEVEL_NAME[level]}（${permNames(perms)}） ${maxUses}人まで ${hours}時間`);
    const i = await db.prepare('SELECT i.*, s.name AS by_name FROM staff_invites i LEFT JOIN staff s ON s.id = i.created_by WHERE i.id = ?').bind(ins.meta.last_row_id).first();
    return json(shapeInvite(i, 0), 201);
  }
  if ((mm = p.match(/^\/invites\/(\d+)\/stop$/)) && m === 'POST') {
    needLevel(staff, LEVEL.admin);
    await db.prepare('UPDATE staff_invites SET active = 0 WHERE id = ?').bind(Number(mm[1])).run();
    await audit(db, staff.id, '招待を止める', `invite:${mm[1]}`, null);
    return json({ ok: true });
  }

  if (p === '/rankings' && m === 'GET') {
    needLevel(staff, LEVEL.staff);
    return json(await rankings(db));
  }

  /* ---------- 管理者 ---------- */
  if (p === '/accounts' && m === 'GET') {
    needLevel(staff, LEVEL.admin);
    const r = await db.prepare('SELECT id, name, level, perms, active, created_at, invite_id FROM staff ORDER BY level DESC, id').all();
    return json({ results: r.results.map(shapeStaff) });
  }
  if (p === '/accounts' && m === 'POST') {
    needLevel(staff, LEVEL.admin);
    const b = await body();
    const name = cleanNickname(b.name);
    const level = Number(b.level);
    if (!name) throw new ApiError('NAME', '名前を入れてください');
    if (!LEVEL_NAME[level]) throw new ApiError('LEVEL', '権限が不正です');
    if (!validCode(b.code)) throw new ApiError('CODE', 'パスワードは6文字以上にしてください');
    const dup = await db.prepare('SELECT 1 FROM staff WHERE name = ?').bind(name).first();
    if (dup) throw new ApiError('DUP', 'その名前のスタッフはもういます', 409);
    const { hash, salt } = await hashCode(b.code);
    const ins = await db.prepare('INSERT INTO staff (name, level, perms, code_hash, code_salt) VALUES (?, ?, ?, ?, ?)').bind(name, level, cleanPerms(b.perms), hash, salt).run();
    await audit(db, staff.id, 'スタッフ追加', `staff:${ins.meta.last_row_id}`, `${name} ${LEVEL_NAME[level]}`);
    return json(shapeStaff(await db.prepare('SELECT id, name, level, perms, active, created_at, invite_id FROM staff WHERE id = ?').bind(ins.meta.last_row_id).first()), 201);
  }
  if ((mm = p.match(/^\/accounts\/(\d+)$/)) && m === 'PATCH') {
    needLevel(staff, LEVEL.admin);
    const id = Number(mm[1]);
    const b = await body();
    const t = await db.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first();
    if (!t) throw new ApiError('NOT_FOUND', 'そのスタッフはいません', 404);
    if (id === staff.id && (b.active === false || (b.level != null && Number(b.level) < 4))) throw new ApiError('SELF', '自分の管理者権限は外せません');
    if (b.level != null) {
      const level = Number(b.level);
      if (!LEVEL_NAME[level]) throw new ApiError('LEVEL', '権限が不正です');
      await db.prepare('UPDATE staff SET level = ? WHERE id = ?').bind(level, id).run();
    }
    if (b.active != null) await db.prepare('UPDATE staff SET active = ? WHERE id = ?').bind(b.active ? 1 : 0, id).run();
    if (Array.isArray(b.perms)) await db.prepare('UPDATE staff SET perms = ? WHERE id = ?').bind(cleanPerms(b.perms), id).run();
    if (b.code != null) {
      if (!validCode(b.code)) throw new ApiError('CODE', 'パスワードは6文字以上にしてください');
      const { hash, salt } = await hashCode(b.code);
      await db.prepare('UPDATE staff SET code_hash = ?, code_salt = ?, fail_count = 0, locked_until = NULL WHERE id = ?').bind(hash, salt, id).run();
    }
    await audit(db, staff.id, 'スタッフ変更', `staff:${id}`, { level: b.level, active: b.active, perms: Array.isArray(b.perms) ? permNames(cleanPerms(b.perms)) : undefined, code: b.code != null ? '変更' : undefined });
    return json(shapeStaff(await db.prepare('SELECT id, name, level, perms, active, created_at, invite_id FROM staff WHERE id = ?').bind(id).first()));
  }
  if (p === '/audit' && m === 'GET') {
    needLevel(staff, LEVEL.admin);
    const r = await db
      .prepare('SELECT a.id, a.created_at, s.name AS staff, a.action, a.target, a.detail FROM audit_log a LEFT JOIN staff s ON s.id = a.staff_id ORDER BY a.id DESC LIMIT 300')
      .all();
    return json({ results: r.results });
  }
  if (p === '/stats' && m === 'GET') {
    needLevel(staff, LEVEL.admin);
    const [users, bal, plays, readings, bribe] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS n FROM users WHERE nickname IS NOT NULL AND status = 'active'").first(),
      db.prepare("SELECT COALESCE(SUM(balance), 0) AS n FROM users WHERE status = 'active'").first(),
      db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(stake), 0) AS stake, COALESCE(SUM(payout), 0) AS payout FROM plays WHERE status = 'done'").first(),
      db.prepare("SELECT COUNT(*) AS n FROM readings WHERE status = 'done'").first(),
      db.prepare("SELECT COALESCE(SUM(bribe), 0) AS n, SUM(CASE WHEN rank = 'kaizan' THEN 1 ELSE 0 END) AS kaizan FROM readings WHERE status = 'done'").first(),
    ]);
    return json({ users: users.n, totalBalance: bal.n, plays: plays.n, stakes: plays.stake, payouts: plays.payout, readings: readings.n, bribes: bribe.n, kaizan: bribe.kaizan || 0 });
  }
  if (p === '/export' && m === 'GET') {
    needLevel(staff, LEVEL.admin);
    return exportCsv(db, url.searchParams.get('what') || 'users');
  }

  throw new ApiError('NOT_FOUND', 'そのAPIはありません', 404);
}

function toInt(v, fallback) {
  if (v == null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new ApiError('NUMBER', '数字が不正です');
  return n;
}

function validateGameConfig(kind, cfg) {
  if (kind === 'score') {
    if (!Array.isArray(cfg.levels) || cfg.levels.length < 1 || cfg.levels.length > 6) throw new ApiError('CONFIG', '難易度を1〜6個入れてください');
    const levels = cfg.levels.map((l) => {
      const name = String(l.name || '').trim(), memorize = Number(l.memorize), miss = Number(l.miss);
      if (!name) throw new ApiError('CONFIG', '難易度の名前が空です');
      if (!Number.isInteger(memorize) || memorize < 0 || !Number.isInteger(miss) || miss > 0 || miss < -1000) throw new ApiError('CONFIG', '覚える秒数は0以上、減点は0以下の数字で');
      return { name, memorize, miss };
    });
    const plus = (Array.isArray(cfg.plus) ? cfg.plus : []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 1000).slice(0, 8);
    if (!plus.length) throw new ApiError('CONFIG', '足す点のボタンを1つ以上入れてください');
    return { score: true, levels, plus };
  }
  if (kind === 'stack') {
    const per = Number(cfg.per_level), max = Number(cfg.max_level);
    if (!Number.isInteger(per) || per < 0 || !Number.isInteger(max) || max < 1) throw new ApiError('CONFIG', '段あたりの縁と最大段数を数字で');
    return { per_level: per, max_level: max };
  }
  if (!Array.isArray(cfg.outcomes) || cfg.outcomes.length < 1) throw new ApiError('CONFIG', '結果を1つ以上入れてください');
  const outcomes = cfg.outcomes.map((o) => {
    const label = String(o.label || '').trim();
    if (!label) throw new ApiError('CONFIG', '結果の名前が空です');
    if (kind === 'bet') {
      const mult = Number(o.mult);
      if (!Number.isFinite(mult) || mult < -10 || mult > 100) throw new ApiError('CONFIG', '倍率は −10 から 100 までで入れてください');
      return { label, mult };
    }
    const payout = Number(o.payout);
    if (!Number.isInteger(payout) || payout < 0) throw new ApiError('CONFIG', '払い戻しが不正です');
    return { label, payout };
  });
  return { outcomes };
}

/* ---------- 招待 ---------- */

const INVITE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function inviteCode() {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += INVITE_ALPHABET[x % INVITE_ALPHABET.length];
  return s;
}
function inviteState(i) {
  if (!i.active) return 'stopped';
  if (new Date(i.expires_at) < new Date()) return 'expired';
  if (i.uses >= i.max_uses) return 'full';
  return 'open';
}
function permNames(json) {
  return permsOf({ level: LEVEL.staff, perms: json }).map((k) => PERMS.find((p) => p.key === k).name).join('・') || 'なし';
}
function shapeInvite(i, joined) {
  return { id: i.id, code: i.code, url: `/staff/join?c=${i.code}`, level: i.level, levelName: LEVEL_NAME[i.level], perms: permsOf(i), permNames: permNames(i.perms), maxUses: i.max_uses, uses: i.uses, joined, expiresAt: i.expires_at, state: inviteState(i), byName: i.by_name || null, createdAt: i.created_at };
}

// 招待のQRを開いたとき（ログイン不要）
export async function inviteInfo(env, code) {
  const i = await env.DB.prepare('SELECT * FROM staff_invites WHERE code = ?').bind(code).first();
  if (!i) throw new ApiError('NOT_FOUND', 'この招待は見つかりません。QRを作った人に確認してください', 404);
  const st = inviteState(i);
  return json({ level: i.level, levelName: LEVEL_NAME[i.level], permNames: permNames(i.perms), state: st, expiresAt: i.expires_at, site: SITE });
}

// 招待から自分で登録する（ログイン不要）
export async function join(request, env, code) {
  const db = env.DB;
  const i = await db.prepare('SELECT * FROM staff_invites WHERE code = ?').bind(code).first();
  if (!i) throw new ApiError('NOT_FOUND', 'この招待は見つかりません', 404);
  const st = inviteState(i);
  if (st !== 'open') throw new ApiError('INVITE', { stopped: 'この招待は止められています', expired: 'この招待は期限が切れています', full: 'この招待はもう定員です' }[st], 403);
  const b = await readJson(request);
  const name = cleanNickname(b.name);
  if (!name || name.length > 20) throw new ApiError('NAME', '名前を1〜20文字で入れてください');
  if (!validCode(b.code)) throw new ApiError('CODE', 'パスワードは6文字以上にしてください');
  const dup = await db.prepare('SELECT 1 FROM staff WHERE name = ?').bind(name).first();
  if (dup) throw new ApiError('DUP', 'その名前はもう使われています。名字を足すなど、別の名前にしてください', 409);
  // 使った数を先に増やす（同時に押されても定員を超えない）
  const upd = await db.prepare('UPDATE staff_invites SET uses = uses + 1 WHERE id = ? AND active = 1 AND uses < max_uses').bind(i.id).run();
  if (!upd.meta.changes) throw new ApiError('INVITE', 'この招待はもう定員です', 403);
  const { hash, salt } = await hashCode(b.code);
  const ins = await db.prepare('INSERT INTO staff (name, level, perms, code_hash, code_salt, invite_id) VALUES (?, ?, ?, ?, ?, ?)').bind(name, i.level, i.perms, hash, salt, i.id).run();
  await audit(db, ins.meta.last_row_id, '招待から登録', `staff:${ins.meta.last_row_id}`, `${name} ${LEVEL_NAME[i.level]}（招待 ${i.id}）`);
  return finishLogin(request, env, ins.meta.last_row_id);
}

/* ---------- 客の検索と詳細 ---------- */

// q は、札の番号／マイページのURLかトークン／ニックネーム／#番号 のどれでもいい
export async function lookup(db, q) {
  q = String(q).trim();
  if (!q) return [];
  const tokenMatch = q.match(/\/u\/([A-Za-z0-9_-]{16,})/) || q.match(/^([A-Za-z0-9_-]{20,})$/);
  if (tokenMatch) {
    const u = await db.prepare('SELECT * FROM users WHERE token = ?').bind(tokenMatch[1]).first();
    return u ? [shapeUser(u)] : [];
  }
  if (/^#?\d+$/.test(q)) {
    const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(Number(q.replace('#', ''))).first();
    return u ? [shapeUser(u)] : [];
  }
  const code = normalizeCode(q);
  if (/^[A-Z0-9]{6}$/.test(code)) {
    const u = await db.prepare('SELECT * FROM users WHERE short_code = ?').bind(code).first();
    if (u) return [shapeUser(u)];
  }
  const r = await db.prepare('SELECT * FROM users WHERE nickname LIKE ? ORDER BY id DESC LIMIT 20').bind(`%${cleanNickname(q)}%`).all();
  return r.results.map(shapeUser);
}

function shapeUser(u) {
  return { id: u.id, nickname: u.nickname, shortCode: u.short_code, token: u.token, url: `/u/${u.token}`, balance: u.balance, status: u.status, source: u.source, createdAt: u.created_at, claimed: u.nickname != null };
}

export async function userDetail(db, id) {
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!u) throw new ApiError('NOT_FOUND', 'その客は見つかりません', 404);
  const [openPlay, openReading, hist, readings, pos] = await Promise.all([
    db.prepare("SELECT id FROM plays WHERE user_id = ? AND status = 'playing' LIMIT 1").bind(id).first(),
    db.prepare("SELECT id FROM readings WHERE user_id = ? AND status = 'open' LIMIT 1").bind(id).first(),
    history(db, id, 15),
    db.prepare("SELECT id, bribe, rank, sou_name, kizashi_name, oracle, finished_at FROM readings WHERE user_id = ? AND status = 'done' ORDER BY id DESC LIMIT 10").bind(id).all(),
    positions(db, id),
  ]);
  return {
    ...shapeUser(u),
    openPlay: openPlay ? await getPlay(db, openPlay.id) : null,
    openReading: openReading ? await getReading(db, openReading.id) : null,
    history: hist,
    readings: readings.results.map((r) => ({ id: r.id, bribe: r.bribe, rank: r.rank, rankName: RANK_NAME[r.rank], sou: r.sou_name, kizashi: r.kizashi_name, oracle: r.oracle, finishedAt: r.finished_at })),
    position: pos,
  };
}

/* ---------- 書き出し ---------- */

function csv(rows, head) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [head.map(cell).join(',')].concat(rows.map((r) => head.map((h) => cell(r[h])).join(',')));
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="export.csv"', 'cache-control': 'no-store' } });
}

async function exportCsv(db, what) {
  if (what === 'ledger') {
    const r = await db.prepare('SELECT l.id, l.created_at, u.nickname, u.short_code, l.type, l.delta, l.balance_after, l.note, s.name AS staff FROM ledger l JOIN users u ON u.id = l.user_id LEFT JOIN staff s ON s.id = l.staff_id ORDER BY l.id').all();
    return csv(r.results, ['id', 'created_at', 'nickname', 'short_code', 'type', 'delta', 'balance_after', 'note', 'staff']);
  }
  if (what === 'readings') {
    const r = await db.prepare('SELECT r.id, r.finished_at, u.nickname, u.short_code, r.bribe, r.rank, r.sou_name, r.kizashi_name, r.oracle, s.name AS teller FROM readings r JOIN users u ON u.id = r.user_id JOIN staff s ON s.id = r.staff_id WHERE r.status = ? ORDER BY r.id').bind('done').all();
    return csv(r.results, ['id', 'finished_at', 'nickname', 'short_code', 'bribe', 'rank', 'sou_name', 'kizashi_name', 'oracle', 'teller']);
  }
  const r = await db.prepare('SELECT u.id, u.created_at, u.nickname, u.short_code, u.balance, u.status, u.source, (SELECT COALESCE(SUM(bribe),0) FROM readings WHERE user_id = u.id AND status = ?) AS bribe_total FROM users u ORDER BY u.id').bind('done').all();
  return csv(r.results, ['id', 'created_at', 'nickname', 'short_code', 'balance', 'status', 'source', 'bribe_total']);
}
