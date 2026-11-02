'use strict';
/* إعدادات السيرفر — كلها من متغيرات البيئة (أو ملف .env في نفس المجلد) */
const fs = require('fs'), path = require('path');

// تحميل ملف .env بسيط (بدون مكتبات)
function loadEnv(file) {
  let txt = '';
  try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { return; }
  txt.split(/\r?\n/).forEach(line => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) return;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  });
}
loadEnv(path.join(__dirname, '..', '.env'));

const env = process.env;
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

const cfg = {
  port: int(env.PORT, 3000),
  host: env.HOST || '127.0.0.1',
  dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '..', 'data')),
  baseUrl: (env.BASE_URL || '').replace(/\/+$/, ''),
  trustProxy: bool(env.TRUST_PROXY, false),
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  allowRegistration: bool(env.ALLOW_REGISTRATION, true),
  requireVerify: bool(env.REQUIRE_VERIFY, false),
  sessionDays: int(env.SESSION_DAYS, 30),
  backupKeep: int(env.BACKUP_KEEP, 14),
  backupHour: int(env.BACKUP_HOUR, 3),
  smtp: env.SMTP_HOST ? {
    host: env.SMTP_HOST, port: int(env.SMTP_PORT, 587), user: env.SMTP_USER || '', pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || env.SMTP_USER || ('no-reply@' + env.SMTP_HOST), secure: bool(env.SMTP_SECURE, int(env.SMTP_PORT, 587) === 465),
    starttls: bool(env.SMTP_STARTTLS, true), rejectUnauthorized: bool(env.SMTP_REJECT_UNAUTHORIZED, true)
  } : null,
  maxJson: 256 * 1024,
  maxMutate: 8 * 1024 * 1024,
  maxRestore: 120 * 1024 * 1024,
  longPollMs: int(env.LONGPOLL_MS, 20000),
  appName: 'SIYADA'
};
module.exports = cfg;
