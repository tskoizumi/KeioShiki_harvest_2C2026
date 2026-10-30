// 写真展：撮った写真をお客さんに渡す（photo.moneytalks-uranai.com）
//   お客さん：名前とパスワードを自分で決めて登録 → あとで同じ名前とパスワードで開いて保存する
//   撮影係  ：占いと同じスタッフのアカウントでログイン → お客さんを選んで写真を上げる
//   写真は撮影係の端末で長い辺2560pxに縮めてから届く。中身は PhotoStore、目録は D1

import { ApiError, json, fail, readJson, cleanNickname, setting, audit, nowIso } from './util.js';
import { hashCode, currentStaff, require as needLevel, LEVEL, signText, timingSafeEqual } from './auth.js';
import * as staffRoutes from './routes/staff.js';
import { photoStore } from './photo-do.js';

const COOKIE = 'ph_guest';
const GUEST_DAYS = 60;
const MAX_FULL = 8 * 1024 * 1024;
const MAX_THUMB = 600 * 1024;

export function isPhotoHost(request, env) {
  const host = new URL(request.url).hostname;
  return String(env.PHOTO_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(host);
}

/* ---------- お客さんのログイン（署名付きクッキー） ---------- */

async function guestCookie(env, request, guestId) {
  const exp = Date.now() + GUEST_DAYS * 86400 * 1000;
  const body = `${guestId}.${exp}`;
  const v = `${body}.${await signText(env, 'pg:' + body)}`;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${GUEST_DAYS * 86400}${secure}`;
}

async function currentGuest(request, env) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m || !env.SESSION_SECRET) return null;
  const [id, exp, sig] = m[1].split('.');
  if (!sig || Number(exp) < Date.now()) return null;
  if (!timingSafeEqual(await signText(env, `pg:${id}.${exp}`), sig)) return null;
  return env.DB.prepare('SELECT id, name, created_at FROM photo_guests WHERE id = ?').bind(Number(id)).first();
}

function cleanName(s) {
  const n = cleanNickname(s);
  if (!n) throw new ApiError('NAME', '名前を入れてください');
  if (n.length > 20) throw new ApiError('NAME', '名前は20文字までにしてください');
  return n;
}
function checkPassword(p) {
  const s = String(p || '');
  if (s.length < 4) throw new ApiError('PASSWORD', 'パスワードは4文字以上にしてください');
  if (s.length > 64) throw new ApiError('PASSWORD', 'パスワードは64文字までにしてください');
  return s;
}

// お客さんを作る（本人のスマホからでも、撮影係の端末からでも）
async function createGuest(env, name, password, staffId) {
  const n = cleanName(name), pw = checkPassword(password);
  const dup = await env.DB.prepare('SELECT 1 FROM photo_guests WHERE name = ?').bind(n).first();
  if (dup) throw new ApiError('TAKEN', `「${n}」はもう使われています。数字を足すなどして、別の名前にしてください`, 409);
  const { hash, salt } = await hashCode(pw);
  const r = await env.DB.prepare('INSERT INTO photo_guests (name, pass_hash, pass_salt, created_by) VALUES (?, ?, ?, ?)').bind(n, hash, salt, staffId || null).run();
  return { id: r.meta.last_row_id, name: n };
}

async function guestLogin(request, env) {
  const b = await readJson(request);
  const name = cleanNickname(b.name), pw = String(b.password || '');
  if (!name || !pw) throw new ApiError('LOGIN', '名前とパスワードを入れてください');
  const g = await env.DB.prepare('SELECT * FROM photo_guests WHERE name = ?').bind(name).first();
  if (!g) {
    await hashCode(pw);   // 名前があるかどうかを、かかる時間で当てられないように
    throw new ApiError('LOGIN', '名前かパスワードが違います', 401);
  }
  if (g.locked_until && new Date(g.locked_until) > new Date()) throw new ApiError('LOCKED', '間違いが続いたので、5分待ってからもう一度どうぞ', 429);
  const { hash } = await hashCode(pw, g.pass_salt);
  if (!timingSafeEqual(hash, g.pass_hash)) {
    const fails = g.fail_count + 1;
    const lock = fails >= 8 ? new Date(Date.now() + 5 * 60000).toISOString() : null;
    await env.DB.prepare('UPDATE photo_guests SET fail_count = ?, locked_until = ? WHERE id = ?').bind(lock ? 0 : fails, lock, g.id).run();
    throw new ApiError('LOGIN', '名前かパスワードが違います', 401);
  }
  await env.DB.prepare('UPDATE photo_guests SET fail_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').bind(nowIso(), g.id).run();
  return json({ name: g.name }, 200, { 'set-cookie': await guestCookie(env, request, g.id) });
}

async function photoList(env, guestId) {
  const r = await env.DB.prepare('SELECT id, width, height, bytes, created_at FROM photos WHERE guest_id = ? ORDER BY id DESC').bind(guestId).all();
  return r.results.map((p) => ({ id: p.id, w: p.width, h: p.height, bytes: p.bytes, createdAt: p.created_at }));
}

// 写真を返す。お客さんは自分の写真だけ、撮影係は全部
async function image(request, env, id, size, download) {
  const p = await env.DB.prepare('SELECT id, guest_id FROM photos WHERE id = ?').bind(id).first();
  if (!p) return fail('NOT_FOUND', 'その写真はありません', 404);
  const g = await currentGuest(request, env);
  if (!g || g.id !== p.guest_id) {
    const st = await currentStaff(request, env);
    if (!st) return fail('LOGIN', 'ログインしてください', 401);
  }
  const buf = await photoStore(env).get(`p/${id}/${size}`);
  if (!buf) return fail('NOT_FOUND', 'その写真はありません', 404);
  const h = { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=604800, immutable' };
  if (download) h['content-disposition'] = `attachment; filename="photo-${id}.jpg"`;
  return new Response(buf, { headers: h });
}

function isJpeg(buf) {
  const b = new Uint8Array(buf, 0, 3);
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

async function upload(request, env, staff, guestId) {
  const g = await env.DB.prepare('SELECT id, name FROM photo_guests WHERE id = ?').bind(guestId).first();
  if (!g) throw new ApiError('NOT_FOUND', 'そのお客さんは見つかりません', 404);
  let form;
  try { form = await request.formData(); } catch { throw new ApiError('BAD_INPUT', '写真が届きませんでした'); }
  const full = form.get('full'), thumb = form.get('thumb');
  const w = Number(form.get('w')), h = Number(form.get('h'));
  if (!full || !thumb || typeof full === 'string' || typeof thumb === 'string') throw new ApiError('BAD_INPUT', '写真が届きませんでした');
  const fb = await full.arrayBuffer(), tb = await thumb.arrayBuffer();
  if (fb.byteLength > MAX_FULL || tb.byteLength > MAX_THUMB) throw new ApiError('TOO_BIG', '写真が大きすぎます');
  if (!isJpeg(fb) || !isJpeg(tb)) throw new ApiError('BAD_INPUT', 'JPEGの写真だけ受け付けます');
  if (!(w > 0 && h > 0 && w <= 4096 && h <= 4096)) throw new ApiError('BAD_INPUT', '写真の大きさが読めませんでした');
  const r = await env.DB.prepare('INSERT INTO photos (guest_id, staff_id, width, height, bytes) VALUES (?, ?, ?, ?, ?)').bind(g.id, staff.id, Math.round(w), Math.round(h), fb.byteLength).run();
  const id = r.meta.last_row_id;
  try {
    const store = photoStore(env);
    await store.put(`p/${id}/full`, fb);
    await store.put(`p/${id}/thumb`, tb);
  } catch (e) {
    await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
    throw e;
  }
  return json({ id, w, h, bytes: fb.byteLength }, 201);
}

async function deletePhotos(env, ids) {
  if (!ids.length) return;
  await photoStore(env).del(ids.flatMap((id) => [`p/${id}/full`, `p/${id}/thumb`]));
  for (const id of ids) await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
}

/* ---------- 振り分け ---------- */

export async function photoFetch(request, env) {
  const url = new URL(request.url);
  const p = url.pathname, m = request.method;
  let mm;
  try {
    /* お客さん */
    if (p === '/api/photo/config' && m === 'GET') return json({ title: await setting(env.DB, 'photo_title', '写真展') });
    if (p === '/api/photo/register' && m === 'POST') {
      const b = await readJson(request);
      const g = await createGuest(env, b.name, b.password, null);
      return json({ name: g.name }, 201, { 'set-cookie': await guestCookie(env, request, g.id) });
    }
    if (p === '/api/photo/login' && m === 'POST') return await guestLogin(request, env);
    if (p === '/api/photo/logout' && m === 'POST') return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
    if (p === '/api/photo/me' && m === 'GET') {
      const g = await currentGuest(request, env);
      if (!g) return fail('LOGIN', '名前とパスワードを入れてください', 401);
      return json({ name: g.name, title: await setting(env.DB, 'photo_title', '写真展'), photos: await photoList(env, g.id) });
    }
    if ((mm = p.match(/^\/api\/photo\/img\/(\d+)\/(full|thumb)$/)) && m === 'GET') return await image(request, env, Number(mm[1]), mm[2], url.searchParams.has('dl'));

    /* 撮影係（占いと同じスタッフのアカウント） */
    if (p === '/api/photo/staff/login' && m === 'POST') return await staffRoutes.login(request, env);
    if (p === '/api/photo/staff/logout' && m === 'POST') return staffRoutes.logout(request);
    if (p.startsWith('/api/photo/staff/')) {
      const staff = await currentStaff(request, env);
      if (!staff) return fail('LOGIN', 'スタッフとしてログインしてください', 401);
      return await staffApi(request, env, staff, p.slice('/api/photo/staff'.length), m);
    }
    if (p.startsWith('/api/')) return fail('NOT_FOUND', 'そのAPIはありません', 404);

    /* 画面 */
    if (p === '/' || p === '/index.html') return env.ASSETS.fetch(new Request(new URL('/photo/', url), request));
    if (p === '/staff' || p === '/staff/') return env.ASSETS.fetch(new Request(new URL('/photo/staff', url), request));
    if (p.startsWith('/photo/') || p.startsWith('/vendor/') || p.startsWith('/assets/') || p === '/favicon.ico') return env.ASSETS.fetch(request);
    const nf = await env.ASSETS.fetch(new Request(new URL('/404', url), request));
    return new Response(nf.body, { status: 404, headers: nf.headers });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.code, e.message, e.status);
    console.error(e);
    return fail('INTERNAL', 'サーバーでエラーが起きました', 500);
  }
}

async function staffApi(request, env, staff, p, m) {
  const db = env.DB;
  let mm;
  if (p === '/me' && m === 'GET') return json({ id: staff.id, name: staff.name, level: staff.level, title: await setting(db, 'photo_title', '写真展') });
  if (p === '/guests' && m === 'GET') {
    const q = cleanNickname(new URL(request.url).searchParams.get('q') || '');
    const r = await db
      .prepare(
        `SELECT g.id, g.name, g.created_at, g.last_login_at, COUNT(p.id) AS n
           FROM photo_guests g LEFT JOIN photos p ON p.guest_id = g.id
          WHERE (? = '' OR g.name LIKE '%' || ? || '%')
          GROUP BY g.id ORDER BY g.id DESC LIMIT 60`,
      )
      .bind(q, q)
      .all();
    return json({ results: r.results.map((g) => ({ id: g.id, name: g.name, photos: g.n, createdAt: g.created_at, seen: !!g.last_login_at })) });
  }
  if (p === '/guests' && m === 'POST') {
    const b = await readJson(request);
    const g = await createGuest(env, b.name, b.password, staff.id);
    await audit(db, staff.id, '写真展：お客さんを登録', `photo_guest:${g.id}`, g.name);
    return json(g, 201);
  }
  if ((mm = p.match(/^\/guests\/(\d+)$/)) && m === 'GET') {
    const g = await db.prepare('SELECT id, name, created_at, last_login_at FROM photo_guests WHERE id = ?').bind(Number(mm[1])).first();
    if (!g) throw new ApiError('NOT_FOUND', 'そのお客さんは見つかりません', 404);
    return json({ id: g.id, name: g.name, createdAt: g.created_at, seen: !!g.last_login_at, photos: await photoList(env, g.id) });
  }
  if ((mm = p.match(/^\/guests\/(\d+)\/photos$/)) && m === 'POST') {
    needLevel(staff, LEVEL.staff);
    return await upload(request, env, staff, Number(mm[1]));
  }
  // パスワードを忘れたお客さん：本人だと確かめてから、新しいパスワードを本人に入れてもらう
  if ((mm = p.match(/^\/guests\/(\d+)\/password$/)) && m === 'POST') {
    const b = await readJson(request);
    const pw = checkPassword(b.password);
    const { hash, salt } = await hashCode(pw);
    const r = await db.prepare('UPDATE photo_guests SET pass_hash = ?, pass_salt = ?, fail_count = 0, locked_until = NULL WHERE id = ?').bind(hash, salt, Number(mm[1])).run();
    if (!r.meta.changes) throw new ApiError('NOT_FOUND', 'そのお客さんは見つかりません', 404);
    await audit(db, staff.id, '写真展：パスワードを変更', `photo_guest:${mm[1]}`, '');
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/photos\/(\d+)$/)) && m === 'DELETE') {
    const ph = await db.prepare('SELECT id, guest_id FROM photos WHERE id = ?').bind(Number(mm[1])).first();
    if (!ph) throw new ApiError('NOT_FOUND', 'その写真はありません', 404);
    await deletePhotos(env, [ph.id]);
    await audit(db, staff.id, '写真展：写真を削除', `photo:${ph.id}`, `guest:${ph.guest_id}`);
    return json({ ok: true });
  }
  if ((mm = p.match(/^\/guests\/(\d+)$/)) && m === 'DELETE') {
    needLevel(staff, LEVEL.staff);
    const id = Number(mm[1]);
    const ids = (await db.prepare('SELECT id FROM photos WHERE guest_id = ?').bind(id).all()).results.map((x) => x.id);
    await deletePhotos(env, ids);
    await db.prepare('DELETE FROM photo_guests WHERE id = ?').bind(id).run();
    await audit(db, staff.id, '写真展：お客さんを削除', `photo_guest:${id}`, `写真${ids.length}枚`);
    return json({ ok: true });
  }
  if (p === '/settings' && m === 'PUT') {
    needLevel(staff, LEVEL.admin);
    const b = await readJson(request);
    const title = cleanNickname(b.title).slice(0, 40);
    if (!title) throw new ApiError('BAD_INPUT', '名前を入れてください');
    await db.prepare("INSERT INTO settings (key, value) VALUES ('photo_title', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(title).run();
    await audit(db, staff.id, '写真展：名前を変更', 'settings', title);
    return json({ title });
  }
  // 展示が終わったら、写真とお客さんを全部消す（管理者だけ）
  if (p === '/purge' && m === 'POST') {
    needLevel(staff, LEVEL.admin);
    const b = await readJson(request);
    if (b.confirm !== '全部消す') throw new ApiError('CONFIRM', '確認の言葉が違います');
    await photoStore(env).clear();
    await db.batch([db.prepare('DELETE FROM photos'), db.prepare('DELETE FROM photo_guests')]);
    await audit(db, staff.id, '写真展：全部削除', 'photos', '');
    return json({ ok: true });
  }
  throw new ApiError('NOT_FOUND', 'そのAPIはありません', 404);
}
