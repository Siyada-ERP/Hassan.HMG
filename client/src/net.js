/* =====================================================================
   SIYADA - server mode: sessions, snapshot load, diff-based sync, long-poll, roles
   (the same HTML still works offline from a file: this layer only turns on when /api/ping answers)
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP, E = root.SiyadaEngine;
const { $, $$, esc } = APP;
const net = Object.assign(APP.net, { on: false, ready: false, me: null, cid: 0, role: '', coName: '', rev: 0, dirty: false, pushing: false, online: true, stale: false, note: '', S: null, ping: null, stateKey: 'ok' });
const shadow = new Map();               // 'coll|key' -> { coll, key, sig, rev, doc }
let pollTok = 0, pushT = 0, retryMs = 0, inflight = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LS = { get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { } } };
const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const ROLE_AR = { owner: 'مالك', accountant: 'محاسب', viewer: 'عرض فقط' };
net.ROLE_AR = ROLE_AR;

/* ---------- http ---------- */
net.detect = async () => {
  if (!/^https?:$/.test(location.protocol)) return false;
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 3000);
    const r = await fetch('/api/ping', { cache: 'no-store', signal: c.signal }); clearTimeout(t);
    if (!r.ok) return false; const j = await r.json(); if (j && j.app === 'siyada-server') { net.ping = j; return true; } return false;
  } catch (e) { return false; }
};
async function api(method, path, body, opt) {
  opt = opt || {};
  const init = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' };
  if (method !== 'GET') { init.headers['Content-Type'] = 'application/json'; init.headers['X-Requested-With'] = 'siyada'; init.body = typeof body === 'string' ? body : JSON.stringify(body || {}); }
  let ctl = null, timer = 0; if (opt.timeout) { ctl = new AbortController(); init.signal = ctl.signal; timer = setTimeout(() => ctl.abort(), opt.timeout); }
  let r; try { r = await fetch(path, init); } catch (e) { clearTimeout(timer); const er = new Error('مفيش اتصال بالسيرفر.'); er.network = true; throw er; }
  clearTimeout(timer);
  let j = null; try { j = await r.json(); } catch (e) { if (r.ok) { const er = new Error('رد غير متوقع من السيرفر.'); er.network = true; throw er; } }
  if (!r.ok) {
    const er = new Error((j && j.error) || ('خطأ ' + r.status)); er.status = r.status; er.data = j || {};
    if (r.status === 401 && !opt.noAuth) net.onUnauth(); throw er;
  }
  return j;
}
net.api = api;

/* ---------- record model: state <-> server records ---------- */
function keyOf(coll, o) {
  switch (coll) { case 'coa': case 'items': return String(o.code); case 'parties': return o.type + '|' + o.code; case 'prices': return String(o.name); case 'emps': return String(o.code); case 'tx': return String(o.id); case 'man': return String(o.uid); default: return 'main'; }
}
function sigOf(coll, o) { if (coll === 'tx' || coll === 'man') { const c = Object.assign({}, o); delete c.jno; return JSON.stringify(c); } return JSON.stringify(o); }
function recs(S) {
  const m = new Map();
  const put = (coll, o, key) => { key = key || keyOf(coll, o); m.set(coll + '|' + key, { coll, key, data: o, sig: sigOf(coll, o) }); };
  if (S.settings) put('settings', S.settings, 'main'); put('mapping', S.mapping, 'main');
  S.coa.forEach(a => put('coa', a)); S.parties.forEach(p => put('parties', p)); S.items.forEach(i => put('items', i)); (S.warehouses || []).forEach(w => put('warehouses', w, w.id)); (S.stockTransfers || []).forEach(t => put('stockTransfers', t, t.id || t.doc)); (S.priceLists || []).forEach(l => put('prices', l)); (S.employees || []).forEach(e => put('emps', e));
  S.transactions.forEach(t => put('tx', t));
  const used = new Set();
  S.manual.forEach(x => { if (!x.uid || used.has(x.uid)) { let u = 'N' + (x.seq || 0), i = 0; while (used.has(u)) u = 'N' + (x.seq || 0) + '_' + (++i); x.uid = u; } used.add(x.uid); put('man', x); });
  const cl = S.meta.closings || []; if (cl.length || shadow.has('closings|main')) put('closings', { list: cl }, 'main');
  return m;
}
function arrOf(S, coll) { return coll === 'coa' ? S.coa : coll === 'parties' ? S.parties : coll === 'items' ? S.items : coll === 'warehouses' ? S.warehouses : coll === 'stockTransfers' ? S.stockTransfers : coll === 'prices' ? S.priceLists : coll === 'emps' ? (S.employees || (S.employees = [])) : coll === 'tx' ? S.transactions : coll === 'man' ? S.manual : null; }
function diff() {
  const S = APP.S, cur = recs(S), ops = [], sent = [];
  const known = new Set(); shadow.forEach(sh => { if (sh.doc) known.add(sh.doc); });
  cur.forEach((r, k) => {
    const sh = shadow.get(k);
    if (!sh) { const op = { coll: r.coll, key: r.key, data: r.data, baseRev: 0 }; if ((r.coll === 'tx' || r.coll === 'man') && r.data.doc && !known.has(r.data.doc)) op.fresh = true; ops.push(op); sent.push({ k, sig: r.sig, coll: r.coll, key: r.key }); }
    else if (sh.sig !== r.sig) { ops.push({ coll: r.coll, key: r.key, data: r.data, baseRev: sh.rev }); sent.push({ k, sig: r.sig, coll: r.coll, key: r.key }); }
  });
  shadow.forEach((sh, k) => { if (!cur.has(k)) { ops.push({ coll: sh.coll, key: sh.key, data: null, baseRev: sh.rev }); sent.push({ k, del: true }); } });
  return { ops, sent };
}

/* ---------- id blocks (so two users never create the same tx id) ---------- */
const blk = { tx: { cur: 0, end: 0, spare: null, busy: false }, man: { cur: 0, end: 0, spare: null, busy: false } };
const legacyNextId = APP.nextId;
APP.nextId = function (kind) {
  if (!net.on) return legacyNextId(kind);
  const k = kind === 'tx' ? 'tx' : 'man', b = blk[k];
  if (!b.end) return legacyNextId(kind);
  if (b.cur >= b.end && b.spare) { b.cur = b.spare.start; b.end = b.spare.end; b.spare = null; }
  const v = b.cur++;
  if (b.end - b.cur < 120 && !b.spare && !b.busy) { b.busy = true; api('POST', '/api/c/' + net.cid + '/alloc', { kind: k, n: 300 }).then(r => { b.spare = r; }).catch(() => { }).then(() => { b.busy = false; }); }
  return v;
};
async function ensureBlocks() {
  blk.tx.end = blk.man.end = 0; blk.tx.spare = blk.man.spare = null;
  if (net.role === 'viewer') return;
  for (const k of ['tx', 'man']) { const r = await api('POST', '/api/c/' + net.cid + '/alloc', { kind: k, n: 300 }); const b = blk[k]; b.cur = r.start; b.end = r.end; }
}

/* ---------- state load ---------- */
function mergeCounters(K) {
  const S = APP.S; if (!S || !K) return;
  const mx = (dst, src) => { Object.keys(src || {}).forEach(k => { if ((dst[k] || 0) < src[k]) dst[k] = src[k]; }); };
  mx(S.meta.docCounters, K.doc); mx(S.meta.nextRow, K.nextRow); if (K.jno && (S.meta.nextJno || 0) < K.jno) S.meta.nextJno = K.jno;
}
function buildState(snap) {
  const R = snap.records, d = c => (R[c] || []).map(x => x.data);
  const S = { ver: 1, settings: (R.settings[0] || {}).data, coa: d('coa'), mapping: (R.mapping[0] || {}).data, parties: d('parties'), items: d('items'), warehouses: d('warehouses'), stockTransfers: d('stockTransfers'), priceLists: d('prices'), employees: d('emps'), transactions: d('tx'), manual: d('man'), meta: {} };
  const K = snap.counters || {};
  S.meta = { nextJno: K.jno || 2, nextTxId: K.tx || 1, nextManual: K.man || 1, docCounters: Object.assign({}, K.doc), nextRow: Object.assign({}, K.nextRow), closings: ((R.closings[0] || {}).data || {}).list || [], changes: 0, lastBackup: '' };
  APP.normalizeState(S);
  shadow.clear();
  net.COLLS.forEach(c => { const arr = arrOf(S, c); (R[c] || []).forEach((x, i) => {
    const o = c === 'settings' || c === 'mapping' ? S[c] : c === 'closings' ? { list: S.meta.closings } : arr[i];
    shadow.set(c + '|' + x.key, { coll: c, key: x.key, rev: x.rev, sig: sigOf(c, o), doc: (c === 'tx' || c === 'man') ? o.doc : '' });
  }); });
  return S;
}
net.COLLS = ['settings', 'mapping', 'coa', 'parties', 'items', 'warehouses', 'stockTransfers', 'prices', 'emps', 'tx', 'man', 'closings'];
function rebuildEngine() { if (!APP.S) return; try { APP.R = E.build(APP.S); APP.index(); } catch (e) { console.error(e); } }
async function loadSnapshot() {
  const snap = await api('GET', '/api/c/' + net.cid + '/snapshot', null, { timeout: 120000 });
  net.role = snap.role; net.coName = snap.company.name; net.rev = snap.rev; net.counters = snap.counters;
  if (snap.empty) { APP.S = null; APP.R = null; net.S = null; shadow.clear(); APP.UI.prefillCompany = net.coName; }
  else { APP.S = buildState(snap); net.S = APP.S; rebuildEngine(); }
  await ensureBlocks();
  applyRoleUi();
  return snap;
}
function applyRoleUi() {
  const b = document.body; b.classList.add('srv'); b.classList.toggle('ro', net.role === 'viewer'); b.classList.toggle('owner', net.role === 'owner');
  if (APP.buildNav && $('#mnav')) APP.buildNav();
}

/* ---------- save state / banner ---------- */
function setState(k) { net.stateKey = k; const el = $('#savest'); if (!el) return; el.className = k === 'off' ? 'bad' : ''; el.textContent = k === '...' ? 'جارٍ الحفظ…' : k === 'off' ? '⚠ مفيش اتصال — هيتحفظ لما يرجع' : k === 'stale' ? '🔄 فيه تحديثات من مستخدم تاني' : '✔ اتحفظ على السيرفر'; }
const legacySS = APP.setSaveState; APP.setSaveState = s => { if (!net.on) return legacySS(s); setState(s === 'bad' ? 'off' : s); };
net.banner = function () {
  setState(net.stateKey);
  let h = '';
  if (!net.online) h += '<div class="bn bad"><span><b>مفيش اتصال بالسيرفر.</b> التعديلات الجديدة هتتبعت أول ما الاتصال يرجع — ما تقفلش الصفحة.</span></div>';
  if (net.role === 'viewer') h += '<div class="bn"><span>صلاحيتك على الشركة دي: <b>عرض فقط</b> — تقدر تشوف التقارير والبيانات بس مش تعدّل.</span></div>';
  if (net.stale) h += '<div class="bn"><span>فيه تعديلات من مستخدم تاني اتحفظت — اضغط لتحديث الشاشة.</span><button class="btn s primary" data-act="netRefresh">تحديث</button></div>';
  return h;
};
APP.acts.netRefresh = () => { net.stale = false; setState('ok'); APP.rerender(); };
APP.navFilter = function (menu) {
  if (!net.on) return menu;
  const out = net.role === 'viewer' ? APP.menuPrune(menu, r => !WRITE.has(r)) : menu.slice();
  const u = net.me && net.me.user; const items = [];
  if (u) items.push(['-', '<bdi>' + esc(u.email) + '</bdi> — ' + esc(ROLE_AR[net.role] || '')]);
  items.push(['team', 'الفريق والصلاحيات']); if (net.role !== 'viewer') items.push(['activity', 'سجل النشاط']); items.push(['account', 'حسابي']); if (u && u.admin) items.push(['admin', 'إدارة الخدمة']);
  items.push(['-', ''], ['!switchCo', 'تبديل الشركة'], ['!logout', 'تسجيل الخروج']);
  out.push(['الحساب', items, { end: true }]);
  return out;
};
const WRITE = new Set(['sale', 'salret', 'purchase', 'purret', 'receipt', 'payment', 'expense', 'income', 'transfer', 'stocktransfer', 'manual', 'closing', 'mapping', 'import', 'empadv', 'payroll']);
const FORM_ROUTES = new Set([...WRITE, 'settings', 'prices', 'backup']);
APP.guardRoute = r => {
  if (!net.on) return true;
  if (net.role === 'viewer' && WRITE.has(r)) return false;
  if (r === 'activity' && net.role === 'viewer') return false;
  if (r === 'admin' && !(net.me && net.me.user.admin)) return false;
  return true;
};

/* ---------- pushing local changes ---------- */
net.pushSoon = function () { net.dirty = true; setState('...'); clearTimeout(pushT); pushT = setTimeout(push, 250); };
async function push() {
  clearTimeout(pushT);
  if (net.pushing || !net.on || !net.ready) return;
  if (net.role === 'viewer') { net.dirty = false; return; }
  net.pushing = true; net.dirty = false; let retry = 0;
  try {
    if (APP.S && APP.S !== net.S && !inflight) { await doRestore(); }
    else if (APP.S) {
      let job = inflight;
      if (!job) {
        const d = diff();
        if (!d.ops.length) { setState('ok'); return; }
        const S = APP.S, reqId = rid();
        job = inflight = { sent: d.sent, body: JSON.stringify({ reqId, note: net.note.slice(0, 150), ops: d.ops, counters: { docCounters: S.meta.docCounters, nextRow: S.meta.nextRow } }) }; net.note = '';
      }
      const res = await api('POST', '/api/c/' + net.cid + '/mutate', job.body, { timeout: 90000 });
      inflight = null; net.online = true; retryMs = 0;
      applyResult(job, res); if (!net.dirty) setState('ok');
    } else { setState('ok'); }
  } catch (e) {
    if (e.network) { net.dirty = true; net.online = false; setState('off'); retryMs = Math.min(15000, retryMs ? retryMs * 2 : 2000); retry = retryMs; refreshBanner(); }
    else if (e.status === 429) { net.dirty = true; retry = 3000; }
    else if (e.status === 401) { /* onUnauth handled */ }
    else { inflight = null; const msg = e.status === 409 ? 'مستخدم تاني عدّل نفس البيانات في نفس اللحظة، فاتحدّثت الشاشة بآخر نسخة. راجع تعديلاتك وأعد اللي ناقص.' : (e.message || 'حصل خطأ أثناء الحفظ.'); net.pushing = false; await reload(msg); }
  } finally { net.pushing = false; if (retry) pushT = setTimeout(push, retry); else if (net.dirty) pushT = setTimeout(push, 120); }
}
function refreshBanner() { const el = $('#banner'); if (el && net.ready) el.innerHTML = net.banner(); }
async function doRestore() {
  if (net.role !== 'owner') { APP.toast('الاستيراد والاستعادة وإعداد الشركة للمالك فقط.', 'bad'); net.pushing = false; await reload(); return; }
  const S = APP.S, cur = recs(S), records = []; cur.forEach(r => records.push({ coll: r.coll, key: r.key, data: r.data }));
  await api('POST', '/api/c/' + net.cid + '/restore', { records, counters: { docCounters: S.meta.docCounters, nextRow: S.meta.nextRow, tx: S.meta.nextTxId, man: S.meta.nextManual, jno: S.meta.nextJno } }, { timeout: 300000 });
  net.online = true; net.pushing = false; await reload(null);
}
function applyResult(job, res) {
  const S = APP.S; let rebuild = false; const docRen = new Map();
  const sentBy = new Map(job.sent.map(s => [s.k, s])); const maps = {};
  const find = (coll, key) => {
    if (coll === 'settings') return S.settings; if (coll === 'mapping') return S.mapping;
    const m = maps[coll] || (maps[coll] = new Map(arrOf(S, coll).map(o => [keyOf(coll, o), o]))); return m.get(key);
  };
  (res.applied || []).forEach(a => {
    const k = a.coll + '|' + a.key, s = sentBy.get(k); if (!s) return;
    if (a.del) { shadow.delete(k); return; }
    let sig = s.sig, doc = '';
    if (a.patch) {
      const o = find(a.coll, a.key);
      const sentObj = JSON.parse(s.sig); if (a.patch.doc && sentObj.doc && a.patch.doc !== sentObj.doc) docRen.set(sentObj.doc, a.patch.doc); Object.assign(sentObj, a.patch); if (a.patch.lines) sentObj.lines = a.patch.lines; sig = JSON.stringify(sentObj);
      if (o) { Object.keys(a.patch).forEach(f => { if (o[f] !== a.patch[f]) { if (f !== 'jno' || !o.jno || o.jno !== a.patch.jno) rebuild = true; o[f] = a.patch[f]; } }); }
      doc = sentObj.doc || '';
    } else { try { doc = JSON.parse(s.sig).doc || ''; } catch (e) { } }
    shadow.set(a.coll + '|' + (a.newKey || a.key), { coll: a.coll, key: a.newKey || a.key, rev: a.rev, sig, doc: a.coll === 'tx' || a.coll === 'man' ? doc : '' });
    if (a.newKey) shadow.delete(k);
  });
  if (res.counters) mergeCounters(res.counters);
  if (docRen.size) {
    const msgs = []; docRen.forEach((to, from) => msgs.push(from + ' ← ' + to));
    const c = APP.cur(); docRen.forEach((to, from) => { if (c.route === 'doc' && c.arg === from) history.replaceState(null, '', '#/doc/' + encodeURIComponent(to)); });
    rebuildEngine(); net.stale = false; APP.rerender();
    APP.alert('رقم المستند اتغيّر تلقائيًا لأن مستخدم تاني سجّل مستند بنفس الرقم في نفس اللحظة:\n' + [...docRen].map(x => x[0] + '  ←  اتحوّل إلى  ' + x[1]).join('\n') + '\nاستخدم الرقم الجديد في أي مطبوعات.');
  } else if (rebuild) { rebuildEngine(); softRender(); }
}
net.flush = async function () {
  if (!net.on || !net.ready) return true; clearTimeout(pushT);
  for (let i = 0; i < 400; i++) {
    if (net.pushing) { await sleep(50); continue; }
    if (!net.dirty && !inflight && (APP.S === net.S)) break;
    net.dirty = true; await push();
  }
  return !net.dirty && !inflight;
};

/* ---------- applying changes from other users ---------- */
function busyUI() {
  const m = $('#modal'); if (m && m.classList.contains('open')) return true; if ($('#frm')) return true;
  const r = APP.cur().route; if (FORM_ROUTES.has(r)) return true;
  const ae = document.activeElement; return !!(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && $('#main') && $('#main').contains(ae));
}
function softRender() { if (!net.ready) return; if (busyUI()) { net.stale = true; setState('stale'); refreshBanner(); } else { net.stale = false; APP.rerender(); } }
function applyOps(ops) {
  const S = APP.S; let changed = false; const idx = {};
  const ix = coll => idx[coll] || (idx[coll] = new Map(arrOf(S, coll).map(o => [keyOf(coll, o), o])));
  for (const op of ops) {
    const k = op.coll + '|' + op.key, sh = shadow.get(k);
    if (sh && sh.rev >= op.rev) continue;
    if (op.data === null) {
      if (!sh) continue;
      const arr = arrOf(S, op.coll);
      if (arr) { const o = ix(op.coll).get(op.key); if (o) { const i = arr.indexOf(o); if (i >= 0) arr.splice(i, 1); ix(op.coll).delete(op.key); } }
      else if (op.coll === 'closings') S.meta.closings = [];
      shadow.delete(k); changed = true; continue;
    }
    let o;
    if (op.coll === 'settings') { S.settings = Object.assign(E.defaultSettings(), op.data); o = S.settings; }
    else if (op.coll === 'mapping') { S.mapping = Object.assign({ types: [], methods: [], expenses: [], incomes: [] }, op.data); o = S.mapping; }
    else if (op.coll === 'closings') { S.meta.closings = op.data.list || []; o = { list: S.meta.closings }; }
    else {
      const m = ix(op.coll), ex = m.get(op.key);
      if (ex) { Object.keys(ex).forEach(f => { delete ex[f]; }); Object.assign(ex, op.data); o = ex; }
      else { arrOf(S, op.coll).push(op.data); m.set(op.key, op.data); o = op.data; }
    }
    shadow.set(k, { coll: op.coll, key: op.key, rev: op.rev, sig: sigOf(op.coll, o), doc: (op.coll === 'tx' || op.coll === 'man') ? o.doc : '' });
    changed = true;
  }
  return changed;
}
async function applyRemote(r) {
  for (let i = 0; (net.dirty || net.pushing || inflight) && i < 600; i++) { await sleep(150); if (!net.on) return; }
  if (r.role && r.role !== net.role) { net.role = r.role; applyRoleUi(); net.me.companies.forEach(c => { if (c.id === net.cid) c.role = r.role; }); await reload(); return; }
  if (r.full || (r.ops && r.ops.length > 400) || (!APP.S && r.ops && r.ops.length)) { await reload(); return; }
  let changed = false;
  if (r.ops && r.ops.length) changed = applyOps(r.ops);
  net.rev = r.rev; if (r.counters) mergeCounters(r.counters);
  if (changed) { rebuildEngine(); if ($('#brand')) APP.applyCompany(); softRender(); }
}
async function pollLoop(tok) {
  let back = 0;
  while (net.on && net.ready && pollTok === tok) {
    try {
      const r = await api('GET', '/api/c/' + net.cid + '/changes?since=' + net.rev + '&wait=1', null, { timeout: 50000 });
      if (pollTok !== tok) return;
      back = 0; if (!net.online) { net.online = true; refreshBanner(); setState(net.dirty ? '...' : 'ok'); }
      await applyRemote(r);
    } catch (e) {
      if (pollTok !== tok) return;
      if (e.status === 401) return;
      if (e.status === 403 || e.status === 404) { await lost(e); return; }
      if (e.name === 'AbortError' || e.network) { if (e.network) { net.online = false; refreshBanner(); } }
      back = Math.min(15000, back ? back * 2 : 2000); await sleep(back);
    }
  }
}
function startPoll() { const tok = ++pollTok; pollLoop(tok); }
function stopPoll() { pollTok++; }
net.stopPoll = stopPoll;

async function reload(msg) {
  inflight = null; net.dirty = false; clearTimeout(pushT);
  try { await loadSnapshot(); } catch (e) { if (e.network) { net.online = false; refreshBanner(); return; } return lost(e); }
  net.online = true; net.stale = false;
  if (!APP.S && net.role !== 'owner') { net.ui.showWaiting(); return; }
  if ($('#brand')) APP.applyCompany();
  APP.render(true); setState('ok');
  if (msg) APP.alert(msg);
}
net.reload = reload;
async function lost(e) {
  stopPoll(); net.ready = false;
  try { net.me = await api('GET', '/api/me'); } catch (x) { return; }
  const still = net.me.companies.find(c => c.id === net.cid && !c.disabled);
  net.ui.showPicker(still ? (e && e.message) : 'مبقاش ليك صلاحية على الشركة دي أو اتوقفت.');
}
net.onUnauth = function () {
  if (!net.ready && !net.me) return;
  stopPoll(); net.ready = false; net.me = null; net.S = null; APP.S = null; shadow.clear(); inflight = null;
  net.ui.showLogin('انتهت الجلسة — ادخل تاني.');
};

/* ---------- opening a company ---------- */
net.open = async function (cid) {
  stopPoll(); net.ready = false; net.cid = cid; net.stale = false; net.online = true; inflight = null; net.dirty = false;
  LS.set('siyada_co', String(cid)); $('#root').innerHTML = '<div id="setup"><div class="form"><h1>جارٍ فتح الشركة…</h1><div class="sub">بنحمّل البيانات من السيرفر.</div></div></div>';
  try { await loadSnapshot(); } catch (e) { if (e.network) { net.ui.showError('مفيش اتصال بالسيرفر.'); return; } net.me = await api('GET', '/api/me').catch(() => net.me); net.ui.showPicker(e.message); return; }
  net.ready = true; startPoll();
  if (!APP.S && net.role !== 'owner') { net.ui.showWaiting(); return; }
  $('#root').innerHTML = ''; if (!location.hash || /^#\/(login|)$/.test(location.hash)) history.replaceState(null, '', '#/dashboard');
  APP.render(true); setState('ok');
};
net.afterLogin = async function (me, want) {
  net.me = me; const cos = me.companies.filter(c => !c.disabled);
  let cid = want || parseInt(LS.get('siyada_co') || '0', 10); if (!cos.find(c => c.id === cid)) cid = cos.length === 1 ? cos[0].id : 0;
  if (cid) return net.open(cid); return net.ui.showPicker();
};
net.boot = async function () {
  root.addEventListener('beforeunload', e => { if (net.on && net.ready && (net.dirty || net.pushing || inflight)) { e.preventDefault(); e.returnValue = ''; return ''; } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && net.on && net.ready && !net.online) { pushT = setTimeout(push, 50); } });
  const q = new URLSearchParams(location.search); let me = null;
  try { me = await api('GET', '/api/me', null, { noAuth: true }); } catch (e) { if (e.network) return net.ui.showError('مفيش اتصال بالسيرفر.'); }
  net.me = me;
  const strip = () => history.replaceState(null, '', location.pathname + location.hash);
  if (q.get('reset')) { const t = q.get('reset'); strip(); return net.ui.showReset(t); }
  if (q.get('verify')) { const t = q.get('verify'); strip(); return net.ui.doVerify(t); }
  if (q.get('invite')) { const t = q.get('invite'); strip(); return net.ui.showInvite(t); }
  if (!me) return net.ui.showLogin();
  return net.afterLogin(me);
};

/* ---------- hooks into the app ---------- */
const legacySaveSoon = APP.saveSoon, legacySaveNow = APP.saveNow;
APP.saveSoon = function () { if (!net.on) return legacySaveSoon(); net.pushSoon(); };
APP.saveNow = async function () { if (!net.on) return legacySaveNow(); return net.flush(); };
const legacyCommit = APP.commit;
APP.commit = function (msg) {
  if (net.on && net.role === 'viewer') { APP.toast('صلاحيتك عرض فقط — مفيش تعديل.', 'bad'); reload(); return false; }
  if (net.on && typeof msg === 'string' && msg) net.note = (net.note ? net.note + ' | ' : '') + msg;
  return legacyCommit.apply(this, arguments);
};
const legacyWipe = APP.acts.wipe;
APP.acts.wipe = function () {
  if (!net.on) return legacyWipe();
  if (net.role !== 'owner') return APP.alert('مسح البيانات للمالك فقط.');
  APP.modal('<div class="mbody"><p class="mmsg">هتتمسح <b>كل</b> بيانات الدفاتر من السيرفر لكل المستخدمين ومش هتتسترجع (غير من نسخة JSON أخدتها قبل كده).<br>اكتب اسم الشركة للتأكيد:</p><input class="in" id="wpName" autocomplete="off"><div id="wpErr" class="err"></div></div><div class="mfoot"><button class="btn danger" id="wpOk">مسح كل البيانات</button><button class="btn" data-act="mclose">إلغاء</button></div>');
  $('#wpOk').onclick = async () => {
    if ($('#wpName').value.trim() !== (APP.S ? APP.S.settings.company : net.coName)) { $('#wpErr').textContent = 'الاسم مش مطابق.'; return; }
    try { await net.flush(); await api('POST', '/api/c/' + net.cid + '/wipe', {}); APP.acts.mclose(); await reload(); } catch (e) { $('#wpErr').textContent = e.message; }
  };
};
})(window);
