'use strict';
/* اختبار وضع REQUIRE_VERIFY: التسجيل يحتاج تفعيل الإيميل */
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'siyada-v-'));
Object.assign(process.env, { DATA_DIR: tmp, PORT: '0', HOST: '127.0.0.1', REQUIRE_VERIFY: '1', ALLOW_REGISTRATION: '1' });
const S = require('../server.js'); let fails = 0, pass = 0; const ok = (n, c, x) => { if (c) pass++; else { fails++; console.log('FAIL ' + n, x === undefined ? '' : JSON.stringify(x)); } };
(async () => {
  const srv = await S.start(); const B = 'http://127.0.0.1:' + srv.address().port; let cookie = '';
  const call = async (m, p, b) => { const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'siyada', Cookie: cookie }, body: m === 'GET' ? undefined : JSON.stringify(b || {}) }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => null) }; };
  let r = await call('POST', '/api/register', { email: 'v@x.com', password: 'Verify#1234', company: 'ش' + 'ركة' });
  ok('register needs verify', r.s === 200 && r.j.needVerify === true, r); ok('no session yet', (await call('GET', '/api/me')).s === 401);
  r = await call('POST', '/api/login', { email: 'v@x.com', password: 'Verify#1234' }); ok('login blocked until verified', r.s === 403 && r.j.needVerify === true, r);
  await new Promise(x => setTimeout(x, 150));
  const f = fs.readdirSync(path.join(tmp, 'outbox')).find(x => x.includes('v@x.com')); const tok = /\?verify=([\w-]+)/.exec(fs.readFileSync(path.join(tmp, 'outbox', f), 'utf8'))[1];
  r = await call('POST', '/api/verify', { token: 'bad' }); ok('bad token', r.s === 400);
  r = await call('POST', '/api/verify', { token: tok }); ok('verify ok', r.s === 200, r);
  r = await call('POST', '/api/login', { email: 'v@x.com', password: 'Verify#1234' }); ok('login after verify', r.s === 200 && r.j.user.verified === true, r);
  console.log(pass + ' passed, ' + fails + ' failed'); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
