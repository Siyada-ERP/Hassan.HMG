#!/usr/bin/env node
'use strict';
/* SIYADA — سيرفر الحسابات متعدد الشركات والمستخدمين. تشغيل:  node server.js */
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const cfg = require('./lib/config');
const dbm = require('./lib/db');
const A = require('./lib/auth');
const D = require('./lib/data');
const API = require('./lib/api');

/* ---------- صفحة التطبيق (ملف واحد) + سياسة الأمان CSP بالـ hash ---------- */
let page = null;
function pageFile() {
  const own = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(own)) return own;
  // تشغيل من مستودع الكود: ناتج البناء بيكون في ../dist
  const built = path.join(__dirname, '..', 'dist', 'SIYADA.html');
  return fs.existsSync(built) ? built : null;
}
function loadPage() {
  const f = pageFile();
  if (!f) {
    console.error('\n  ✖ صفحة التطبيق مش موجودة (server/public/index.html).\n' +
      '    ده ملف بيتولّد من الكود ومش بيتخزّن في GitHub. شغّل الأمر ده مرة واحدة من المجلد الرئيسي للمشروع:\n' +
      '        npm run build        (أو:  node scripts/build.js)\n' +
      '    وبعدين شغّل السيرفر تاني. لو معاك الحزمة الجاهزة SIYADA_Server.zip فالملف ده موجود فيها.\n');
    process.exit(1);
  }
  const html = fs.readFileSync(f);
  const txt = html.toString('utf8'); const hashes = [];
  const re = /<script>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(txt))) hashes.push("'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
  page = { html, gz: zlib.gzipSync(html, { level: 9 }), etag: '"' + crypto.createHash('sha1').update(html).digest('hex').slice(0, 16) + '"', csp: hashes.join(' ') };
}
const baseHeaders = (req, csp) => {
  const h = {
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cross-Origin-Opener-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; script-src " + (csp || "'none'") + "; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
  };
  if (A.isHttps(req)) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return h;
};

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const cl = parseInt(req.headers['content-length'] || '0', 10);
    if (cl > max) { req.resume(); return reject(new D.HttpError(413, 'الحجم كبير جدًا.')); }
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { reject(new D.HttpError(413, 'الحجم كبير جدًا.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function send(req, res, status, payload, extra) {
  const hdr = Object.assign({ 'Cache-Control': 'no-store' }, baseHeaders(req), extra || {});
  const body = typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload);
  hdr['Content-Type'] = 'application/json; charset=utf-8';
  const big = body.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  if (big) {
    zlib.gzip(body, { level: 4 }, (e, z) => { if (res.destroyed) return; if (e) { res.writeHead(500); return res.end(); } hdr['Content-Encoding'] = 'gzip'; hdr['Vary'] = 'Accept-Encoding'; hdr['Content-Length'] = z.length; res.writeHead(status, hdr); res.end(z); });
  } else { hdr['Content-Length'] = Buffer.byteLength(body); res.writeHead(status, hdr); res.end(body); }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const method = req.method, p = url.pathname;
  if (method === 'GET' || method === 'HEAD') {
    if (p === '/' || p === '/index.html') {
      const h = Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ETag: page.etag, Vary: 'Accept-Encoding' }, baseHeaders(req, page.csp));
      if (req.headers['if-none-match'] === page.etag) { res.writeHead(304, h); return res.end(); }
      const gz = /\bgzip\b/.test(String(req.headers['accept-encoding'] || '')); if (gz) h['Content-Encoding'] = 'gzip';
      const body = gz ? page.gz : page.html; h['Content-Length'] = body.length; res.writeHead(200, h); return res.end(method === 'HEAD' ? undefined : body);
    }
    if (p === '/healthz') { try { dbm.db.prepare('SELECT 1').get(); } catch (e) { return send(req, res, 500, { ok: false }); } return send(req, res, 200, { ok: true }); }
    if (p === '/favicon.ico') { res.writeHead(204, baseHeaders(req)); return res.end(); }
  }
  if (!p.startsWith('/api/')) return send(req, res, 404, { error: 'مش موجود.' });

  const ip = A.clientIp(req);
  if (!A.hit('ip:' + ip, 3000, 60e3)) return send(req, res, 429, { error: 'طلبات كتيرة جدًا.' });
  const m = API.match(method, p);
  if (!m) return send(req, res, method === 'GET' || method === 'POST' ? 404 : 405, { error: 'مش موجود.' });

  // حماية CSRF: الطلبات المغيّرة لازم تيجي من نفس الموقع وبهيدر مخصص
  if (method !== 'GET') {
    if (req.headers['x-requested-with'] !== 'siyada') return send(req, res, 403, { error: 'طلب غير مسموح.' });
    const origin = req.headers.origin;
    if (origin && origin !== 'null') { let oh = ''; try { oh = new URL(origin).host; } catch (e) { } const host = String(req.headers['x-forwarded-host'] && cfg.trustProxy ? req.headers['x-forwarded-host'] : req.headers.host || '').split(',')[0].trim(); if (oh !== host) return send(req, res, 403, { error: 'طلب غير مسموح (origin).' }); }
  }
  let body = {};
  if (method === 'POST') {
    const raw = await readBody(req, m.r.opts.max || cfg.maxJson);
    if (raw.length) { try { body = JSON.parse(raw.toString('utf8')); } catch (e) { return send(req, res, 400, { error: 'JSON غير صالح.' }); } }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(req, res, 400, { error: 'طلب غير صالح.' });
  }
  const ctx = { req, res, url, query: url.searchParams, params: m.params, body, ip, session: A.sessionFromReq(req), setCookie: null };
  const out = await m.r.fn(ctx);
  const extra = ctx.setCookie ? { 'Set-Cookie': ctx.setCookie } : {};
  if (out && out.raw !== undefined) { if (out.role) extra['X-Role'] = out.role; return send(req, res, 200, out.raw, extra); }
  return send(req, res, 200, out === undefined ? { ok: true } : out, extra);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    if (res.headersSent || res.destroyed) { try { res.destroy(); } catch (x) { } return; }
    if (e instanceof D.HttpError) return send(req, res, e.status, Object.assign({ error: e.message }, e.extra || {}));
    console.error('[خطأ]', req.method, req.url, e && e.stack || e);
    send(req, res, 500, { error: 'حصل خطأ في السيرفر.' });
  });
});
server.requestTimeout = 120000; server.headersTimeout = 20000; server.keepAliveTimeout = 65000;

function start() {
  loadPage();
  return new Promise(resolve => server.listen(cfg.port, cfg.host, () => {
    const a = server.address();
    console.log('\n  SIYADA server شغال على  http://' + (cfg.host === '0.0.0.0' ? 'localhost' : cfg.host) + ':' + a.port + '   (بيانات: ' + cfg.dataDir + ')');
    if (!cfg.smtp) console.log('  ملاحظة: إعدادات الإيميل (SMTP) مش متظبطة — رسائل التفعيل والدعوات بتتكتب في ' + path.join(cfg.dataDir, 'outbox') + ' وبتظهر هنا.');
    if (!cfg.baseUrl) console.log('  ملاحظة: BASE_URL مش متظبط — روابط الإيميلات هتتبني من عنوان الطلب. اضبطه لما تنشر على دومين.');
    resolve(server);
  }));
}
function scheduleBackups() {
  const run = () => { try { const f = dbm.backup(); console.log('[نسخة احتياطية] ' + f); } catch (e) { console.error('[نسخة احتياطية] فشلت:', e.message); } };
  const next = () => { const d = new Date(); d.setHours(cfg.backupHour, 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return d - new Date(); };
  const loop = () => setTimeout(() => { run(); loop(); }, next()).unref();
  loop();
}
function shutdown() { console.log('\nإيقاف السيرفر…'); server.close(() => { try { dbm.db.close(); } catch (e) { } process.exit(0); }); setTimeout(() => process.exit(0), 4000).unref(); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));

if (require.main === module) { start().then(scheduleBackups); }
module.exports = { start, server, loadPage };
