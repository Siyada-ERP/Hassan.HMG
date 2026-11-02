'use strict';
/* كلمات المرور (scrypt)، الجلسات، الرموز المؤقتة، تحديد المحاولات */
const crypto = require('crypto');
const cfg = require('./config');
const { P, now } = require('./db');

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const rnd = n => crypto.randomBytes(n || 32).toString('base64url');

/* ---------- كلمات المرور ---------- */
const N = 16384, R = 8, PAR = 1, KEYLEN = 64;
function scrypt(pw, salt, n, r, p) {
  return new Promise((res, rej) => crypto.scrypt(pw, salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (e, k) => (e ? rej(e) : res(k))));
}
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const k = await scrypt(String(pw).normalize('NFKC'), salt, N, R, PAR);
  return ['scrypt', N, R, PAR, salt.toString('base64'), k.toString('base64')].join('$');
}
async function verifyPassword(pw, stored) {
  try {
    const [alg, n, r, p, s, h] = String(stored).split('$'); if (alg !== 'scrypt') return false;
    const k = await scrypt(String(pw).normalize('NFKC'), Buffer.from(s, 'base64'), +n, +r, +p);
    const want = Buffer.from(h, 'base64'); return want.length === k.length && crypto.timingSafeEqual(want, k);
  } catch (e) { return false; }
}
let DUMMY = null;
async function dummyVerify(pw) { if (!DUMMY) DUMMY = await hashPassword('dummy-password'); await verifyPassword(pw, DUMMY); }
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'كلمة المرور لازم تكون ٨ حروف على الأقل.';
  if (pw.length > 200) return 'كلمة المرور طويلة جدًا.';
  if (/^(.)\1+$/.test(pw) || /^(12345678|password|11111111|qwertyui)/i.test(pw)) return 'كلمة المرور ضعيفة، اختار كلمة أصعب.';
  return '';
}
const EMAIL_RE = /^[^\s@<>()\[\]\\,;:"]+@[^\s@<>()\[\]\\,;:"]+\.[^\s@<>()\[\]\\,;:"]{2,}$/;
const normEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => e.length <= 160 && EMAIL_RE.test(e);

/* ---------- الجلسات ---------- */
const COOKIE = 'siyada_sid';
function parseCookies(h) {
  const o = {}; String(h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) { try { o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { } } }); return o;
}
function createSession(userId, ip, ua) {
  const token = rnd(32), t = Date.now();
  P('sess_ins', 'INSERT INTO sessions(id,user_id,created_at,expires_at,last_seen,ip,ua) VALUES(?,?,?,?,?,?,?)').run(sha(token), userId, now(), t + cfg.sessionDays * 864e5, t, ip || '', String(ua || '').slice(0, 200));
  return token;
}
function sessionFromReq(req) {
  const tok = parseCookies(req.headers.cookie)[COOKIE]; if (!tok) return null;
  const id = sha(tok);
  const s = P('sess_get', 'SELECT s.id, s.user_id, s.expires_at, s.last_seen, u.email, u.name, u.verified, u.is_admin, u.disabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?').get(id);
  if (!s) return null;
  const t = Date.now();
  if (s.expires_at < t || s.disabled) { P('sess_del', 'DELETE FROM sessions WHERE id=?').run(id); return null; }
  if (t - s.last_seen > 3600e3) P('sess_touch', 'UPDATE sessions SET last_seen=?, expires_at=? WHERE id=?').run(t, t + cfg.sessionDays * 864e5, id);
  return { id, userId: s.user_id, email: s.email, name: s.name, verified: !!s.verified, admin: !!s.is_admin };
}
function cookieHeader(req, token, maxAgeSec) {
  const secure = isHttps(req);
  return COOKIE + '=' + (token ? encodeURIComponent(token) : '') + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (token ? maxAgeSec : 0) + (secure ? '; Secure' : '');
}
function isHttps(req) { return !!(req.socket && req.socket.encrypted) || (cfg.trustProxy && /https/i.test(String(req.headers['x-forwarded-proto'] || ''))) || /^https:/i.test(cfg.baseUrl); }
function clientIp(req) {
  if (cfg.trustProxy) { const x = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (x) return x; const r = req.headers['x-real-ip']; if (r) return String(r); }
  return (req.socket && req.socket.remoteAddress) || '';
}
function killSessions(userId, exceptId) {
  P('sess_kill', 'DELETE FROM sessions WHERE user_id=? AND id<>?').run(userId, exceptId || '');
}

/* ---------- رموز مؤقتة (تفعيل الإيميل / استرجاع كلمة المرور) ---------- */
function makeToken(userId, kind, ttlMs) {
  const t = rnd(32);
  P('tok_clean', 'DELETE FROM tokens WHERE user_id=? AND kind=?').run(userId, kind);
  P('tok_ins', 'INSERT INTO tokens(hash,user_id,kind,expires_at) VALUES(?,?,?,?)').run(sha(t), userId, kind, Date.now() + ttlMs);
  return t;
}
function useToken(token, kind) {
  const h = sha(token); const r = P('tok_get', 'SELECT user_id, expires_at, used_at FROM tokens WHERE hash=? AND kind=?').get(h, kind);
  if (!r || r.used_at || r.expires_at < Date.now()) return 0;
  P('tok_use', 'UPDATE tokens SET used_at=? WHERE hash=?').run(Date.now(), h);
  return r.user_id;
}

/* ---------- تحديد المحاولات (في الذاكرة) ---------- */
const buckets = new Map();
function hit(key, max, windowMs) {
  const t = Date.now(); let b = buckets.get(key);
  if (!b || b.reset < t) { b = { n: 0, reset: t + windowMs }; buckets.set(key, b); }
  b.n++; return b.n <= max;
}
function peek(key, max) { const b = buckets.get(key); return !b || b.reset < Date.now() || b.n < max; }
function clearKey(key) { buckets.delete(key); }
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60e3).unref();
setInterval(() => { try { const t = Date.now(); P('sess_clean', 'DELETE FROM sessions WHERE expires_at<?').run(t); P('tok_clean2', 'DELETE FROM tokens WHERE expires_at<?').run(t - 864e5); } catch (e) { } }, 3600e3).unref();

module.exports = { sha, rnd, hashPassword, verifyPassword, dummyVerify, passwordProblem, normEmail, validEmail, COOKIE, parseCookies, createSession, sessionFromReq, cookieHeader, isHttps, clientIp, killSessions, makeToken, useToken, hit, peek, clearKey };
