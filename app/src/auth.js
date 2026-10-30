// スタッフの認証（合言葉 → 署名付きクッキー）と、客のマイページの鍵
//  - 合言葉は PBKDF2 で保存する。平文は残さない
//  - セッションは HMAC で署名したクッキー。SESSION_SECRET がなければ誰も入れない
//  - 権限は スタッフ（1）と 管理者（4）。level 以上なら OK

import { ApiError, b64url } from './util.js';

// 権限は2つだけ：スタッフ（現場の作業は全部）と管理者（設定・ゲーム・スタッフの管理・記録）
// 数字は前の4段階の名残り（1 と 4 だけを使う）
export const LEVEL = { staff: 1, admin: 4 };
export const LEVEL_NAME = { 1: 'スタッフ', 4: '管理者' };

// スタッフごとにオン・オフできること。def = 何も決めていないスタッフに付く（占いは特殊権限なので付かない）
export const PERMS = [
  { key: 'reception', name: '受付', desc: 'お客さんの登録、QRカードに名前をつける', def: true },
  { key: 'games', name: 'ゲーム', desc: 'ゲームの開始・結果・取り消し', def: true },
  { key: 'fortune', name: '占い', desc: '占いをする（特殊権限）', def: false },
  { key: 'adjust', name: '残高を直す', desc: '残高を直す、お客さんを使えなくする・戻す', def: true },
  { key: 'cards', name: 'QRカード', desc: 'QRカードの発行・印刷', def: true },
  { key: 'photo', name: '写真展', desc: '写真展の撮影係（写真を上げる・お客さんの登録）', def: true },
];
const PERM_KEYS = PERMS.map((p) => p.key);
export const DEFAULT_PERMS = PERMS.filter((p) => p.def).map((p) => p.key);

// このスタッフができること（管理者は全部）
export function permsOf(s) {
  if (!s) return [];
  if (s.level >= LEVEL.admin) return PERM_KEYS.slice();
  try {
    const v = s.perms ? JSON.parse(s.perms) : null;
    if (Array.isArray(v)) return PERM_KEYS.filter((k) => v.includes(k));
  } catch {}
  return DEFAULT_PERMS.slice();
}

// 入ってきた権限のリストを、知っているものだけにして保存用の文字列にする
export function cleanPerms(list) {
  if (!Array.isArray(list)) return null;
  return JSON.stringify(PERM_KEYS.filter((k) => list.includes(k)));
}

export function needPerm(staff, key) {
  if (!staff) throw new ApiError('LOGIN', 'スタッフとしてログインしてください', 401);
  if (!permsOf(staff).includes(key)) {
    const p = PERMS.find((x) => x.key === key);
    throw new ApiError('FORBIDDEN', `「${p ? p.name : key}」の権限がありません。管理者に頼んでください`, 403);
  }
  return staff;
}
const COOKIE = 'mt_staff';
const SESSION_HOURS = 20;

const enc = new TextEncoder();

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text))));
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// SESSION_SECRET で文字列に署名する（写真展のお客さんのログインなどで使う）
export async function signText(env, text) {
  if (!env.SESSION_SECRET) throw new ApiError('NO_SECRET', 'SESSION_SECRET が設定されていません', 500);
  return hmac(env.SESSION_SECRET, text);
}

/* ---------- 合言葉 ---------- */

export async function hashCode(code, saltB64) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return { hash: b64url(new Uint8Array(bits)), salt: b64url(salt) };
}

export function validCode(code) {
  const s = String(code || '');
  return s.length >= 6 && s.length <= 64;
}

/* ---------- セッション ---------- */

export async function makeSession(env, staffId) {
  if (!env.SESSION_SECRET) throw new ApiError('NO_SECRET', 'SESSION_SECRET が設定されていません', 500);
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const body = `${staffId}.${exp}`;
  const sig = await hmac(env.SESSION_SECRET, body);
  return `${body}.${sig}`;
}

export function sessionCookie(value, request, maxAgeSec = SESSION_HOURS * 3600) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

function readCookie(request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? m[1] : null;
}

// ログイン中のスタッフ。いなければ null
export async function currentStaff(request, env) {
  const raw = readCookie(request);
  if (!raw || !env.SESSION_SECRET) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  if (Number(exp) < Date.now()) return null;
  const want = await hmac(env.SESSION_SECRET, `${id}.${exp}`);
  if (!timingSafeEqual(want, sig)) return null;
  const s = await env.DB.prepare('SELECT id, name, level, active, perms FROM staff WHERE id = ?').bind(Number(id)).first();
  if (!s || !s.active) return null;
  return s;
}

// 権限チェック。足りなければ例外
export function require(staff, level) {
  if (!staff) throw new ApiError('LOGIN', 'スタッフとしてログインしてください', 401);
  if (staff.level < level) throw new ApiError('FORBIDDEN', 'この操作の権限がありません', 403);
  return staff;
}

/* ---------- 客のマイページの鍵 ----------
   QRの中身はマイページのURL（token）。開くときに名前を入れると、この鍵を端末に渡す。
   鍵 = HMAC(secret, "u:" + token + "|" + 名前をつけた時刻)。以後はURLと鍵で本人とみなす。
   名前をつけた時刻を混ぜるので、QRカードを名前なしに戻すと、前に開いた端末の鍵は使えなくなる。 */

export async function userKey(env, token, claimedAt) {
  if (!env.SESSION_SECRET) throw new ApiError('NO_SECRET', 'SESSION_SECRET が設定されていません', 500);
  return hmac(env.SESSION_SECRET, 'u:' + token + '|' + (claimedAt || ''));
}

export async function checkUserKey(env, token, key, claimedAt) {
  if (!key) return false;
  const want = await userKey(env, token, claimedAt);
  return timingSafeEqual(want, String(key));
}
