// 共通の小道具：JSON応答、エラー、乱数、時刻

export class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export function fail(code, message, status = 400) {
  return json({ error: code, message }, status);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// base64url
export function b64url(bytes) {
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// マイページのトークン（16バイト・約22文字）。推測できない
export function randomToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return b64url(b);
}

// 印刷QRの札に書く短い番号。紛らわしい文字（0 O 1 I L）は使わない
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function shortCode(len = 6) {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += CODE_ALPHABET[x % CODE_ALPHABET.length];
  return s;
}

// 札の番号の入力を整える（大文字に、英数字だけ）
export function normalizeCode(s) {
  return String(s || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// 入力されたニックネームを整える（全角→半角、空白をまとめる）
export function cleanNickname(s) {
  return String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function nowIso() {
  return new Date().toISOString();
}

export async function setting(db, key, fallback = null) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : fallback;
}

export async function settingInt(db, key, fallback = 0) {
  const v = await setting(db, key, null);
  return v == null ? fallback : Number(v) || 0;
}

export async function allSettings(db) {
  const rows = await db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.results.map((r) => [r.key, r.value]));
}

// 心付けの位
export function rankOf(amount, s) {
  if (amount >= Number(s.rank_kaizan)) return 'kaizan';
  if (amount >= Number(s.rank_dai)) return 'dai';
  if (amount >= Number(s.rank_sho)) return 'sho';
  return 'mu';
}
export const RANK_NAME = { mu: '無', sho: '小', dai: '大', kaizan: '改竄' };

export async function audit(db, staffId, action, target, detail) {
  await db
    .prepare('INSERT INTO audit_log (staff_id, action, target, detail) VALUES (?, ?, ?, ?)')
    .bind(staffId ?? null, action, target ?? null, detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail))
    .run();
}
