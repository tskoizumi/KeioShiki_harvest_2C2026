// スタッフの認証（合言葉 → 署名付きクッキー）と、客のマイページの鍵
//  - 合言葉は PBKDF2 で保存する。平文は残さない
//  - セッションは HMAC で署名したクッキー。SESSION_SECRET がなければ誰も入れない
//  - 権限はピラミッド型。level 以上なら OK

import { ApiError, b64url } from './util.js';

export const LEVEL = { staff: 1, teller: 2, manager: 3, admin: 4 };
export const LEVEL_NAME = { 1: 'スタッフ', 2: '占い師', 3: '責任者', 4: '管理者' };
const COOKIE = 'mt_staff';
const SESSION_HOURS = 20;

const enc = new TextEncoder();

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text))));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
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
  const s = await env.DB.prepare('SELECT id, name, level, active FROM staff WHERE id = ?').bind(Number(id)).first();
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
   鍵 = HMAC(secret, "u:" + token)。以後はURLと鍵で本人とみなす。 */

export async function userKey(env, token) {
  if (!env.SESSION_SECRET) throw new ApiError('NO_SECRET', 'SESSION_SECRET が設定されていません', 500);
  return hmac(env.SESSION_SECRET, 'u:' + token);
}

export async function checkUserKey(env, token, key) {
  if (!key) return false;
  const want = await userKey(env, token);
  return timingSafeEqual(want, String(key));
}
