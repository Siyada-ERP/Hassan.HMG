'use strict';
/* اختبار السيرفر: node test/server.test.js */
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'siyada-'));
process.env.DATA_DIR = tmp; process.env.PORT = '0'; process.env.HOST = '127.0.0.1'; process.env.LONGPOLL_MS = '3000'; process.env.ADMIN_EMAIL = 'admin@example.com';
const S = require('../server.js');
let fails = 0, passes = 0;
const ok = (n, c, extra) => { if (c) passes++; else { fails++; console.log('FAIL ' + n + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } };
let BASE;
class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body, hdr) {
    const h = Object.assign({ 'Content-Type': 'application/json' }, hdr || {});
    if (method !== 'GET' && !(hdr && hdr['X-Requested-With'] === null)) h['X-Requested-With'] = 'siyada';
    if (hdr && hdr['X-Requested-With'] === null) delete h['X-Requested-With'];
    if (this.cookie) h.Cookie = this.cookie;
    const r = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) { const v = sc.split(';')[0]; this.cookie = /=$/.test(v) ? '' : v; }
    let j = null; try { j = await r.json(); } catch (e) { }
    return { s: r.status, j, h: r.headers };
  }
  get(p) { return this.req('GET', p); } post(p, b, h) { return this.req('POST', p, b || {}, h); }
}
const tx = (id, o) => Object.assign({ id, date: '2025-03-01', source: 'المبيعات', row: id, doc: 'INV-1', type: 'بيع', partyType: 'عميل', partyCode: 'C-001', partyName: 'x', itemCode: '', itemName: '', qty: 0, price: 0, amount: 100, debit: 100, credit: 0, acc: '', desc: '', jno: 0, seq: 1e7 + id }, o || {});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await S.start(); BASE = 'http://127.0.0.1:' + srv.address().port;
  const A = new Client(), B = new Client(), C = new Client(), X = new Client();
  // --- أساسيات
  let r = await X.get('/api/ping'); ok('ping', r.s === 200 && r.j.app === 'siyada-server');
  const pg = await fetch(BASE + '/'); const html = await pg.text(); ok('index served', pg.status === 200 && html.includes('<div id="root">'));
  const csp = pg.headers.get('content-security-policy'); ok('csp has script hash', /script-src 'sha256-/.test(csp) && /frame-ancestors 'none'/.test(csp), csp);
  ok('nosniff', pg.headers.get('x-content-type-options') === 'nosniff');
  r = await X.get('/healthz'); ok('healthz', r.j.ok === true);
  r = await X.post('/api/login', { email: 'a@b.com', password: 'x' }, { 'X-Requested-With': null }); ok('csrf header required', r.s === 403);
  r = await X.post('/api/login', { email: 'a@b.com', password: 'x' }, { Origin: 'http://evil.example' }); ok('csrf origin', r.s === 403);
  r = await X.get('/api/me'); ok('me anon 401', r.s === 401);
  // --- تسجيل
  r = await A.post('/api/register', { email: 'admin@example.com', password: 'Passw0rd!A', company: 'شركة ألف' }); ok('register A', r.s === 200 && r.j.user.admin === false && r.j.companies.length === 1 && r.j.companies[0].role === 'owner', r.j);
  // الأدمن بيتمنح بعد إثبات الإيميل: نفّذ رابط التفعيل من الـ outbox
  { const ob = fs.readdirSync(path.join(tmp, 'outbox')); const vf = ob.find(f => f.includes('admin@example.com') && fs.readFileSync(path.join(tmp, 'outbox', f), 'utf8').includes('?verify=')); const vt = /\?verify=([\w-]+)/.exec(fs.readFileSync(path.join(tmp, 'outbox', vf), 'utf8'))[1]; r = await A.post('/api/verify', { token: vt }); ok('verify admin email', r.s === 200); r = await A.get('/api/me'); ok('admin granted after email proof', r.j.user.admin === true, r.j); }
  const cidA = r.j.companies[0].id;
  r = await X.post('/api/register', { email: 'admin@example.com', password: 'Passw0rd!A', company: 'x1' }); ok('dup email 409', r.s === 409);
  r = await X.post('/api/register', { email: 'bad', password: 'Passw0rd!A', company: 'x1' }); ok('bad email 400', r.s === 400);
  r = await X.post('/api/register', { email: 'weak@example.com', password: '123', company: 'x1' }); ok('weak pw 400', r.s === 400);
  r = await X.post('/api/register', { email: 'weak@example.com', password: 'Passw0rd!A', company: '' }); ok('no company 400', r.s === 400);
  r = await B.post('/api/register', { email: 'B@Example.com', password: 'Passw0rd!B', company: 'شركة باء' }); ok('register B', r.s === 200 && !r.j.user.admin, r.j);
  const cidB = r.j.companies[0].id;
  r = await B.post('/api/login', { email: 'b@example.com', password: 'Passw0rd!B' }); ok('login case-insens', r.s === 200);
  r = await X.post('/api/login', { email: 'b@example.com', password: 'wrong' }); ok('login wrong 401', r.s === 401);
  r = await A.get('/api/me'); ok('me', r.s === 200 && r.j.user.email === 'admin@example.com');
  // --- عزل الشركات
  r = await B.get('/api/c/' + cidA + '/snapshot'); ok('isolation snapshot 403', r.s === 403);
  r = await B.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'settings', key: 'main', data: { company: 'hack' }, baseRev: 0 }] }); ok('isolation mutate 403', r.s === 403);
  r = await X.get('/api/c/' + cidA + '/snapshot'); ok('anon snapshot 401', r.s === 401);
  // --- بيانات
  r = await A.get('/api/c/' + cidA + '/snapshot'); ok('empty snapshot', r.s === 200 && r.j.empty === true && r.j.role === 'owner' && r.j.rev === 0, r.j);
  r = await A.post('/api/c/' + cidA + '/alloc', { kind: 'tx', n: 100 }); const blkA = r.j; ok('alloc tx', r.s === 200 && blkA.start === 1 && blkA.end === 101, r.j);
  r = await A.post('/api/c/' + cidA + '/alloc', { kind: 'tx', n: 100 }); ok('alloc 2nd block distinct', r.j.start === 101);
  r = await A.post('/api/c/' + cidA + '/mutate', { reqId: 'r1', note: 'إعداد', ops: [
    { coll: 'settings', key: 'main', data: { company: 'شركة ألف للتجارة', startDate: '2025-01-01' }, baseRev: 0 },
    { coll: 'coa', key: '1101', data: { code: '1101', name: 'الخزينة' }, baseRev: 0 },
    { coll: 'parties', key: 'عميل|C-001', data: { type: 'عميل', code: 'C-001', name: 'عميل ١' }, baseRev: 0 },
    { coll: 'tx', key: '1', data: tx(1), baseRev: 0, fresh: true },
    { coll: 'tx', key: '2', data: tx(2, { doc: 'INV-1' }), baseRev: 0, fresh: true } ], counters: { docCounters: { 'INV-': 1 }, nextRow: { 'المبيعات': 3 } } });
  ok('mutate ok', r.s === 200 && r.j.rev === 1 && r.j.applied.length === 5, r.j);
  const jn = r.j.applied.filter(a => a.coll === 'tx').map(a => a.patch.jno); ok('jno assigned unique', jn.length === 2 && jn[0] !== jn[1] && jn[0] >= 2, jn);
  const r1 = r.j; r = await A.post('/api/c/' + cidA + '/mutate', { reqId: 'r1', ops: [{ coll: 'coa', key: '9', data: { code: '9' }, baseRev: 0 }] }); ok('idempotent reqId', r.s === 200 && r.j.rev === 1);
  r = await A.get('/api/c/' + cidA + '/snapshot'); ok('snapshot content', r.j.empty === false && r.j.records.tx.length === 2 && r.j.records.parties.length === 1 && r.j.records.settings[0].data.company === 'شركة ألف للتجارة' && r.j.records.tx[0].data.jno >= 2, Object.keys(r.j.records));
  const cname = (await A.get('/api/me')).j.companies[0].name; ok('company name synced', cname === 'شركة ألف للتجارة', cname);
  const txrev = r.j.records.tx[0].rev;
  // --- تعارض التعديل
  r = await A.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'tx', key: '1', data: tx(1, { amount: 200 }), baseRev: txrev }] }); ok('update ok', r.s === 200 && r.j.rev === 2, r.j);
  r = await A.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'tx', key: '1', data: tx(1, { amount: 300 }), baseRev: txrev }] }); ok('stale update 409', r.s === 409 && r.j.conflicts[0].key === '1', r.j);
  r = await A.get('/api/c/' + cidA + '/snapshot'); const t1 = r.j.records.tx.find(x => x.key === '1'); ok('update kept jno', t1.data.amount === 200 && t1.data.jno === jn[0], t1.data);
  r = await A.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'tx', key: '1', data: null, baseRev: 1 }] }); ok('stale delete 409', r.s === 409);
  r = await A.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'tx', key: '2', data: null, baseRev: r1.applied.find(a => a.key === '2').rev }] }); ok('delete ok', r.s === 200 && r.j.applied[0].del === 1, r.j);
  // --- التغييرات
  r = await A.get('/api/c/' + cidA + '/changes?since=1'); ok('changes since', r.s === 200 && r.j.ops.length === 2 && r.j.ops.find(o => o.key === '2').data === null && r.j.rev === 3, r.j);
  r = await A.get('/api/c/' + cidA + '/changes?since=3'); ok('changes none', r.j.ops.length === 0);
  r = await A.get('/api/c/' + cidA + '/changes?since=99'); ok('changes future → full', r.j.full === true);
  // long-poll
  const t0 = Date.now(); const lp = A.get('/api/c/' + cidA + '/changes?since=3&wait=1'); await sleep(300);
  await A.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'coa', key: '1102', data: { code: '1102', name: 'فودافون' }, baseRev: 0 }] });
  r = await lp; ok('long-poll wakes', r.j.ops.length === 1 && Date.now() - t0 < 2500, { n: r.j.ops && r.j.ops.length, ms: Date.now() - t0 });
  const t2 = Date.now(); r = await A.get('/api/c/' + cidA + '/changes?since=4&wait=1'); ok('long-poll timeout empty', r.j.ops.length === 0 && Date.now() - t2 >= 2500, Date.now() - t2);
  // --- فريق + صلاحيات
  r = await A.post('/api/c/' + cidA + '/invite', { email: 'viewer@example.com', role: 'viewer' }); ok('invite viewer', r.s === 200 && /invite=/.test(r.j.link), r.j);
  const invV = r.j.link.split('invite=')[1];
  r = await X.get('/api/invite/' + invV); ok('invite info', r.s === 200 && r.j.email === 'viewer@example.com' && r.j.role === 'viewer' && r.j.userExists === false, r.j);
  r = await C.post('/api/register', { email: 'other@example.com', password: 'Passw0rd!C', invite: invV }); ok('invite wrong email', r.s === 400, r.j);
  r = await C.post('/api/register', { email: 'viewer@example.com', password: 'Passw0rd!C', invite: invV }); ok('register via invite', r.s === 200 && r.j.companies.length === 1 && r.j.companies[0].id === cidA && r.j.companies[0].role === 'viewer', r.j);
  r = await C.get('/api/c/' + cidA + '/snapshot'); ok('viewer reads', r.s === 200 && r.j.role === 'viewer');
  r = await C.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'coa', key: '5', data: { code: '5' }, baseRev: 0 }] }); ok('viewer cannot write', r.s === 403);
  r = await C.post('/api/c/' + cidA + '/restore', { records: [] }); ok('viewer cannot restore', r.s === 403);
  r = await C.post('/api/c/' + cidA + '/invite', { email: 'z@example.com', role: 'viewer' }); ok('viewer cannot invite', r.s === 403);
  r = await C.get('/api/c/' + cidA + '/activity'); ok('viewer no activity', r.s === 403);
  r = await A.get('/api/c/' + cidA + '/team'); ok('team list', r.s === 200 && r.j.members.length === 2, r.j);
  const viewerId = r.j.members.find(m => m.email === 'viewer@example.com').userId;
  r = await A.post('/api/c/' + cidA + '/member', { userId: viewerId, role: 'accountant' }); ok('role change', r.s === 200);
  r = await C.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'coa', key: '5', data: { code: '5', name: 'ن' }, baseRev: 0 }] }); ok('accountant writes', r.s === 200, r.j);
  r = await C.post('/api/c/' + cidA + '/restore', { records: [] }); ok('accountant cannot restore', r.s === 403);
  r = await C.post('/api/c/' + cidA + '/invite', { email: 'z@example.com', role: 'viewer' }); ok('accountant cannot invite', r.s === 403);
  r = await C.get('/api/c/' + cidA + '/activity'); ok('accountant sees activity', r.s === 200 && r.j.rows.length > 3, r.j.rows && r.j.rows.length);
  // --- مستخدم موجود يقبل دعوة
  r = await A.post('/api/c/' + cidA + '/invite', { email: 'b@example.com', role: 'viewer' }); const invB = r.j.link.split('invite=')[1];
  r = await X.get('/api/invite/' + invB); ok('invite existing user flag', r.j.userExists === true);
  r = await A.post('/api/invite/accept', { token: invB }); ok('accept wrong user 403', r.s === 403);
  r = await B.post('/api/invite/accept', { token: invB }); ok('accept existing', r.s === 200 && r.j.companies.length === 2, r.j);
  r = await B.post('/api/c/' + cidA + '/leave'); ok('leave', r.s === 200 && r.j.companies.length === 1);
  // --- تعارضات متزامنة بين مستخدمين: كود عميل + رقم مستند
  const A2 = new Client(); await A2.post('/api/login', { email: 'viewer@example.com', password: 'Passw0rd!C' });
  const mk = (who, id) => who.post('/api/c/' + cidA + '/mutate', { ops: [
    { coll: 'parties', key: 'عميل|C-005', data: { type: 'عميل', code: 'C-005', name: 'عميل من ' + id }, baseRev: 0 },
    { coll: 'items', key: 'I-009', data: { code: 'I-009', name: 'صنف ' + id }, baseRev: 0 },
    { coll: 'tx', key: String(id), data: tx(id, { doc: 'INV-77', partyCode: 'C-005', itemCode: 'I-009' }), baseRev: 0, fresh: true },
    { coll: 'tx', key: String(id + 1), data: tx(id + 1, { doc: 'INV-77', partyCode: 'C-005', itemCode: 'I-009' }), baseRev: 0, fresh: true } ] });
  const [m1, m2] = [await mk(A, 300), await mk(A2, 400)];
  ok('first writer no rename', m1.s === 200 && !m1.j.applied.some(a => a.newKey || (a.patch && a.patch.doc)), m1.j);
  const pRen = m2.j.applied.find(a => a.coll === 'parties'), iRen = m2.j.applied.find(a => a.coll === 'items'), tRen = m2.j.applied.find(a => a.coll === 'tx');
  ok('party renamed', pRen.newKey === 'عميل|C-006' && pRen.patch.code === 'C-006', pRen);
  ok('item renamed', iRen.newKey === 'I-010' && iRen.patch.code === 'I-010', iRen);
  ok('tx refs rewritten', tRen.patch.partyCode === 'C-006' && tRen.patch.itemCode === 'I-010' && /^INV-\d+$/.test(tRen.patch.doc) && tRen.patch.doc !== 'INV-77', tRen);
  ok('both lines same new doc', m2.j.applied.filter(a => a.coll === 'tx').every(a => a.patch.doc === tRen.patch.doc));
  r = await A.get('/api/c/' + cidA + '/snapshot'); const docs = r.j.records.tx.filter(x => x.data.doc === 'INV-77'); ok('db keeps INV-77 once (2 lines)', docs.length === 2, docs.length);
  ok('renamed doc stored', r.j.records.tx.filter(x => x.data.doc === tRen.patch.doc).length === 2);
  const jnos = r.j.records.tx.map(x => x.data.jno); ok('jno all unique', new Set(jnos).size === jnos.length, jnos);
  // إضافة سطر لمستند موجود (غير fresh) لا يتغير رقمه
  r = await A.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'tx', key: '500', data: tx(500, { doc: 'INV-77' }), baseRev: 0 }] }); ok('extra line keeps doc', r.s === 200 && !(r.j.applied[0].patch && r.j.applied[0].patch.doc));
  // كود مكرر بدون تغيير (تعديل عميل موجود بنسخة قديمة) = تعارض
  r = await A.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'coa', key: '1101', data: { code: '1101', name: 'مختلف' }, baseRev: 0 }] }); ok('coa new-key collision = 409', r.s === 409, r.s);
  // --- alloc بين مستخدمين
  const a1 = (await A.post('/api/c/' + cidA + '/alloc', { kind: 'man', n: 50 })).j, a2 = (await A2.post('/api/c/' + cidA + '/alloc', { kind: 'man', n: 50 })).j; ok('alloc man distinct', a1.end <= a2.start, [a1, a2]);
  r = await C.post('/api/c/' + cidA + '/alloc', { kind: 'bogus', n: 5 }); ok('alloc bad kind', r.s === 400);
  // --- استعادة
  const pre = (await A.get('/api/c/' + cidA + '/snapshot')).j.rev;
  r = await A.post('/api/c/' + cidA + '/restore', { records: [
    { coll: 'settings', key: 'main', data: { company: 'شركة مستعادة' } },
    { coll: 'tx', key: '10', data: tx(10, { jno: 7, doc: 'INV-12' }) }, { coll: 'tx', key: '11', data: tx(11, { jno: 9, doc: 'INV-12' }) },
    { coll: 'man', key: 'M1', data: { uid: 'M1', jno: 8, doc: 'M-0003', seq: 4000005, lines: [] } } ], counters: { docCounters: { 'TS-': 40 } } });
  ok('restore ok', r.s === 200 && r.j.rev === pre + 1 && r.j.counters.tx === 12 && r.j.counters.jno === 10 && r.j.counters.man === 6 && r.j.counters.doc['INV-'] === 12 && r.j.counters.doc['TS-'] === 40 && r.j.counters.doc['M-'] === 3, r.j);
  r = await A.get('/api/c/' + cidA + '/changes?since=' + pre); ok('epoch → full', r.j.full === true);
  r = await A.get('/api/c/' + cidA + '/snapshot'); ok('restored content', r.j.records.tx.length === 2 && r.j.records.parties.length === 0 && r.j.company.name === 'شركة مستعادة', r.j.company);
  r = await A.post('/api/c/' + cidA + '/restore', { records: [{ coll: 'tx', key: '1', data: tx(1) }, { coll: 'tx', key: '1', data: tx(1) }] }); ok('restore dup key 400 (rolled back)', r.s === 400);
  r = await A.get('/api/c/' + cidA + '/snapshot'); ok('restore rollback kept data', r.j.records.tx.length === 2);
  r = await A.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'coa', key: 'p1', data: JSON.parse('{"__proto__":{"x":1},"code":"p1"}'), baseRev: 0 }] }); ok('__proto__ rejected', r.s === 400, r.s);
  r = await A.post('/api/c/' + cidA + '/mutate', { ops: [{ coll: 'bogus', key: 'a', data: {}, baseRev: 0 }] }); ok('bad coll 400', r.s === 400);
  // --- استرجاع كلمة المرور
  r = await X.post('/api/forgot', { email: 'b@example.com' }); ok('forgot generic', r.s === 200 && r.j.ok);
  r = await X.post('/api/forgot', { email: 'nobody@example.com' }); ok('forgot unknown generic', r.s === 200 && r.j.ok);
  await sleep(100);
  const ob = fs.readdirSync(path.join(tmp, 'outbox')); const mailf = ob.find(f => f.includes('b@example.com') && fs.readFileSync(path.join(tmp, 'outbox', f), 'utf8').includes('?reset='));
  ok('reset mail in outbox', !!mailf, ob);
  const tok = /\?reset=([\w-]+)/.exec(fs.readFileSync(path.join(tmp, 'outbox', mailf), 'utf8'))[1];
  r = await X.post('/api/reset', { token: tok, password: 'NewPassw0rd!' }); ok('reset ok', r.s === 200, r.j);
  r = await X.post('/api/reset', { token: tok, password: 'NewPassw0rd!2' }); ok('reset token single-use', r.s === 400);
  r = await B.get('/api/me'); ok('old session killed', r.s === 401);
  r = await B.post('/api/login', { email: 'b@example.com', password: 'NewPassw0rd!' }); ok('login new pw', r.s === 200);
  r = await B.post('/api/password', { old: 'bad', password: 'Another1234' }); ok('change pw wrong old', r.s === 403);
  r = await B.post('/api/password', { old: 'NewPassw0rd!', password: 'Another1234' }); ok('change pw', r.s === 200);
  // --- حد المحاولات
  const Z = new Client(); let last; for (let i = 0; i < 10; i++) last = await Z.post('/api/login', { email: 'ratelimit@example.com', password: 'x' + i }); ok('login rate limit 429', last.s === 429, last.s);
  // --- الإدارة
  r = await B.get('/api/admin/overview'); ok('admin forbidden for user', r.s === 403);
  r = await A.get('/api/admin/overview'); ok('admin overview', r.s === 200 && r.j.users.length >= 3 && r.j.companies.length >= 2, r.j && r.j.users && r.j.users.length);
  const bId = r.j.users.find(u => u.email === 'b@example.com').id;
  r = await A.post('/api/admin/user', { id: bId, action: 'reset' }); ok('admin reset temp', r.s === 200 && r.j.temp.length >= 8);
  const TEMP = r.j.temp; r = await B.post('/api/login', { email: 'b@example.com', password: TEMP }); ok('login with temp', r.s === 200);
  r = await A.post('/api/admin/user', { id: bId, action: 'disable' }); ok('admin disable', r.s === 200);
  r = await B.get('/api/me'); ok('disabled session dead', r.s === 401);
  r = await B.post('/api/login', { email: 'b@example.com', password: TEMP }); ok('disabled cannot login', r.s === 403 || r.s === 401);
  r = await A.post('/api/admin/user', { id: bId, action: 'enable' });
  r = await A.post('/api/admin/company', { id: cidB, action: 'disable' }); await B.post('/api/login', { email: 'b@example.com', password: TEMP }).catch(() => 0);
  const Bn = new Client(); const lr = await Bn.post('/api/login', { email: 'b@example.com', password: TEMP }); r = await Bn.get('/api/c/' + cidB + '/snapshot'); ok('disabled company blocked', lr.s === 200 && r.s === 403, [lr.s, r.s]);
  await A.post('/api/admin/company', { id: cidB, action: 'enable' }); r = await Bn.get('/api/c/' + cidB + '/snapshot'); ok('company re-enabled', r.s === 200);
  // --- حذف الشركة والنقل
  r = await Bn.post('/api/c/' + cidB + '/delete', { password: 'bad', name: 'x' }); ok('delete needs pw', r.s === 403);
  r = await Bn.post('/api/c/' + cidB + '/delete', { password: TEMP, name: 'غلط' }); ok('delete needs name', r.s === 400);
  r = await Bn.post('/api/c/' + cidB + '/delete', { password: TEMP, name: 'شركة باء' }); ok('delete company', r.s === 200 && r.j.companies.length === 0, r.j);
  r = await Bn.post('/api/companies', { name: 'شركة جديدة لباء' }); ok('create 2nd company', r.s === 200 && r.j.companies.length === 1);
  // --- الخروج
  r = await A.post('/api/logout'); r = await A.get('/api/me'); ok('logout', r.s === 401);
  // --- النسخ الاحتياطي
  const bf = require('../lib/db').backup(); ok('backup file', fs.existsSync(bf) && fs.statSync(bf).size > 1000, bf);
  // --- SMTP (سيرفر وهمي)
  const got = []; const fake = net.createServer(s => {
    let inData = false, buf = ''; s.write('220 fake ESMTP\r\n');
    s.on('data', d => { buf += d.toString(); let i; while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (inData) { if (line === '.') { inData = false; s.write('250 queued\r\n'); } else got.push(line); continue; }
      if (/^EHLO/.test(line)) s.write('250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n'); else if (/^AUTH PLAIN/.test(line)) { got.push('AUTH:' + Buffer.from(line.slice(11), 'base64').toString().replace(/\0/g, '|')); s.write('235 ok\r\n'); }
      else if (/^MAIL FROM/.test(line) || /^RCPT TO/.test(line)) { got.push(line); s.write('250 ok\r\n'); } else if (/^DATA/.test(line)) { inData = true; s.write('354 go\r\n'); } else if (/^QUIT/.test(line)) { s.write('221 bye\r\n'); s.end(); } else s.write('250 ok\r\n'); } });
  }); await new Promise(res => fake.listen(0, '127.0.0.1', res));
  const cfg = require('../lib/config'); cfg.smtp = { host: '127.0.0.1', port: fake.address().port, user: 'u', pass: 'p', from: 'SIYADA <no-reply@x.com>', secure: false, starttls: false, rejectUnauthorized: false };
  const M = require('../lib/mail'); const mm = M.T.reset('http://x/?reset=abc'); const sr = await M.sendMail('dest@example.com', mm.subject, mm.text, mm.html, mm.link);
  ok('smtp sent', sr.sent === true && got.includes('AUTH:|u|p') && got.some(l => /^RCPT TO:<dest@example.com>/.test(l)) && got.some(l => l.startsWith('Subject: =?UTF-8?B?')), got.slice(0, 8));
  cfg.smtp = null; fake.close();
  console.log('\n' + passes + ' passed, ' + fails + ' failed');
  srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
