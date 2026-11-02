'use strict';
/* بيانات الشركات: مخزن سجلات بنسخ (rev) مع كشف التعارض وتوزيع الأرقام */
const { P, tx, now } = require('./db');

const COLLS = new Set(['settings', 'mapping', 'coa', 'parties', 'items', 'prices', 'tx', 'man', 'closings', 'emps']);
const MAX_ROW = 400 * 1024, MAX_SETTINGS = 2 * 1024 * 1024;
class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const bad = (m) => new HttpError(400, m);

const newCounters = () => ({ tx: 1, man: 1, jno: 2, doc: {}, nextRow: {} });
function getCompany(cid) {
  const c = P('co_get', 'SELECT id,name,rev,epoch,counters,disabled FROM companies WHERE id=?').get(cid);
  if (!c) return null;
  let k; try { k = JSON.parse(c.counters); } catch (e) { k = {}; }
  const d = newCounters(); c.counters = Object.assign(d, k); c.counters.doc = c.counters.doc || {}; c.counters.nextRow = c.counters.nextRow || {};
  return c;
}
const saveCounters = (cid, k) => P('co_cnt', 'UPDATE companies SET counters=? WHERE id=?').run(JSON.stringify(k), cid);
const maxMerge = (dst, src) => { if (!src || typeof src !== 'object') return; for (const k of Object.keys(src)) { const v = Number(src[k]); if (Number.isFinite(v) && v >= 0 && v < 1e12 && k.length < 40 && (dst[k] || 0) < v) dst[k] = Math.floor(v); } };

/* ---------- الانتظار لحدوث تغيير (long-poll) ---------- */
const waiters = new Map();
function notify(cid) { const s = waiters.get(cid); if (!s) return; waiters.delete(cid); s.forEach(f => f()); }
function waitChange(cid, ms) {
  return new Promise(res => {
    let s = waiters.get(cid); if (!s) { s = new Set(); waiters.set(cid, s); }
    const f = () => { clearTimeout(t); res(); }; const t = setTimeout(() => { s.delete(f); res(); }, ms); s.add(f);
  });
}

/* ---------- ترقيم المستندات ---------- */
const DOC_RE = /^(.*?)(\d+)$/;
function splitDoc(doc) { const m = DOC_RE.exec(doc || ''); return m ? { pre: m[1], n: parseInt(m[2], 10), w: /^0/.test(m[2]) ? m[2].length : 0 } : null; }
const padN = (n, w) => (w ? String(n).padStart(w, '0') : String(n));
const likeEsc = s => s.replace(/[\\%_]/g, c => '\\' + c);
function docTaken(cid, doc) { return !!P('doc_taken', "SELECT 1 FROM records WHERE company_id=? AND aux=? AND coll IN ('tx','man') AND deleted=0 LIMIT 1").get(cid, doc); }
function nextFreeDoc(cid, doc, counters, used) {
  const sp = splitDoc(doc);
  if (!sp) { let i = 2, d; do { d = doc + '-' + (i++); } while (docTaken(cid, d) || used.has(d)); return d; }
  let n = Math.max(counters.doc[sp.pre] || 0, sp.n) + 1, d;
  for (; ;) { d = sp.pre + padN(n, sp.w); if (!docTaken(cid, d) && !used.has(d)) break; n++; }
  return d;
}
function bumpDocCounter(counters, doc) { const sp = splitDoc(doc); if (sp && sp.pre.length < 20 && (counters.doc[sp.pre] || 0) < sp.n && sp.n < 1e9) counters.doc[sp.pre] = sp.n; }
function nextFreeCode(cid, coll, keyOf, code, used) {
  const sp = splitDoc(code);
  if (!sp) { let i = 2, c; do { c = code + '-' + (i++); } while (P('rec_exists', 'SELECT 1 FROM records WHERE company_id=? AND coll=? AND key=? AND deleted=0').get(cid, coll, keyOf(c)) || used.has(keyOf(c))); return c; }
  const ks = keyOf(sp.pre); const rows = P('rec_like', "SELECT key FROM records WHERE company_id=? AND coll=? AND key LIKE ? ESCAPE '\\' AND deleted=0").all(cid, coll, likeEsc(ks) + '%');
  let mx = sp.n; rows.forEach(r => { const m = DOC_RE.exec(r.key); if (m && m[1] === ks) mx = Math.max(mx, parseInt(m[2], 10)); });
  used.forEach(k => { const m = DOC_RE.exec(k); if (m && m[1] === ks) mx = Math.max(mx, parseInt(m[2], 10)); });
  return sp.pre + padN(mx + 1, sp.w);
}

/* ---------- كتابة تعديلات ---------- */
function mutate(cid, user, body) {
  const ops = body && body.ops; if (!Array.isArray(ops) || !ops.length) throw bad('مفيش تعديلات.');
  if (ops.length > 20000) throw bad('عدد التعديلات كبير جدًا.');
  const out = tx(() => {
    const co = getCompany(cid); if (!co) throw new HttpError(404, 'الشركة مش موجودة.');
    const K = co.counters, rev = co.rev + 1;
    const plan = [], conflicts = [], usedKeys = new Map(), usedDocs = new Set();
    // 1) تحقق وتحميل السجلات الحالية
    for (const op of ops) {
      if (!op || !COLLS.has(op.coll) || typeof op.key !== 'string' || !op.key || op.key.length > 200) throw bad('تعديل غير صالح.');
      const isDel = op.data === null || op.data === undefined;
      if (!isDel && (typeof op.data !== 'object' || Array.isArray(op.data) && op.coll !== 'closings')) throw bad('بيانات غير صالحة.');
      const ex = P('rec_get', 'SELECT data,rev,deleted FROM records WHERE company_id=? AND coll=? AND key=?').get(cid, op.coll, op.key);
      const live = ex && !ex.deleted; const base = Number(op.baseRev) || 0;
      const p = { op, coll: op.coll, key: op.key, del: isDel, ex, live, patch: null, newKey: null, data: isDel ? null : op.data };
      if (isDel) { if (!live) continue; if (base !== ex.rev) { conflicts.push({ coll: op.coll, key: op.key }); continue; } }
      else if (live) {
        if (base !== ex.rev) { if (!base && (op.coll === 'parties' || op.coll === 'items')) p.collide = true; else { conflicts.push({ coll: op.coll, key: op.key }); continue; } }
      } else if (base) { conflicts.push({ coll: op.coll, key: op.key }); continue; }
      plan.push(p);
    }
    if (conflicts.length) throw new HttpError(409, 'تعارض: حد تاني عدّل نفس البيانات.', { conflicts });
    const patch = p => (p.patch || (p.patch = {}));
    // 2) تعارض أكواد العملاء/الموردين/الأصناف الجديدة (إعادة ترقيم تلقائي)
    for (const p of plan) {
      if (!p.collide) continue;
      const d = p.data, isParty = p.coll === 'parties';
      const keyOf = isParty ? (c => d.type + '|' + c) : (c => c);
      const used = usedKeys.get(p.coll) || new Set(); usedKeys.set(p.coll, used);
      const old = d.code, nc = nextFreeCode(cid, p.coll, keyOf, old, used);
      used.add(keyOf(nc)); d.code = nc; patch(p).code = nc; p.newKey = keyOf(nc);
      for (const q of plan) {
        if (q.del || !q.data) continue;
        if (q.coll === 'tx') {
          if (isParty && q.data.partyType === d.type && q.data.partyCode === old) { q.data.partyCode = nc; patch(q).partyCode = nc; }
          if (!isParty && q.data.itemCode === old) { q.data.itemCode = nc; patch(q).itemCode = nc; }
        } else if (q.coll === 'man' && isParty && Array.isArray(q.data.lines)) {
          let ch = false; q.data.lines.forEach(l => { if (l && l.pc === old) { l.pc = nc; ch = true; } }); if (ch) patch(q).lines = q.data.lines;
        }
      }
    }
    // 3) تعارض أرقام المستندات الجديدة (فاتورتين بنفس الرقم من مستخدمين مختلفين)
    const fresh = new Map();
    for (const p of plan) { if (!p.del && p.op.fresh && !p.live && (p.coll === 'tx' || p.coll === 'man') && p.data.doc) { const g = fresh.get(p.data.doc) || []; g.push(p); fresh.set(p.data.doc, g); } }
    for (const [doc, g] of fresh) {
      if (!docTaken(cid, doc)) { usedDocs.add(doc); continue; }
      const nd = nextFreeDoc(cid, doc, K, usedDocs); usedDocs.add(nd);
      g.forEach(p => { p.data.doc = nd; patch(p).doc = nd; });
    }
    // 4) أرقام القيود + الكتابة
    const sIns = P('rec_up', 'INSERT INTO records(company_id,coll,key,data,rev,deleted,aux) VALUES(?,?,?,?,?,0,?) ON CONFLICT(company_id,coll,key) DO UPDATE SET data=excluded.data, rev=excluded.rev, deleted=0, aux=excluded.aux');
    const sDel = P('rec_del', 'UPDATE records SET data=NULL, deleted=1, rev=?, aux=NULL WHERE company_id=? AND coll=? AND key=?');
    const applied = []; let newName = null;
    for (const p of plan) {
      if (p.del) { sDel.run(rev, cid, p.coll, p.key); applied.push({ coll: p.coll, key: p.key, rev, del: 1 }); continue; }
      const d = p.data;
      if (p.coll === 'tx' || p.coll === 'man') {
        if (p.live) { try { d.jno = JSON.parse(p.ex.data).jno || 0; } catch (e) { d.jno = 0; } }
        else { d.jno = K.jno++; patch(p).jno = d.jno; }
        if (d.doc) bumpDocCounter(K, String(d.doc));
      }
      const txt = JSON.stringify(d);
      if (txt.length > (p.coll === 'settings' ? MAX_SETTINGS : MAX_ROW)) throw bad('حجم السجل كبير جدًا.');
      if (txt.includes('"__proto__"')) throw bad('بيانات غير صالحة.');
      const key = p.newKey || p.key;
      sIns.run(cid, p.coll, key, txt, rev, (p.coll === 'tx' || p.coll === 'man') && d.doc ? String(d.doc).slice(0, 80) : null);
      const a = { coll: p.coll, key: p.key, rev }; if (p.newKey) a.newKey = p.newKey; if (p.patch) a.patch = p.patch; applied.push(a);
      if (p.coll === 'settings' && key === 'main' && typeof d.company === 'string' && d.company.trim()) newName = d.company.trim().slice(0, 120);
    }
    const bc = body.counters || {}; maxMerge(K.doc, bc.docCounters); maxMerge(K.nextRow, bc.nextRow);
    saveCounters(cid, K);
    P('co_rev', 'UPDATE companies SET rev=?, updated_at=? WHERE id=?').run(rev, now(), cid);
    if (newName) P('co_name', 'UPDATE companies SET name=? WHERE id=?').run(newName, cid);
    log(cid, user, 'mutate', String(body.note || '').slice(0, 160) + (body.note ? ' ' : '') + '(' + plan.length + ')');
    return { rev, applied, counters: K };
  });
  notify(cid);
  return out;
}

/* ---------- قراءة ---------- */
function changes(cid, since) {
  const co = getCompany(cid); if (!co) throw new HttpError(404, 'الشركة مش موجودة.');
  since = Number(since) || 0;
  if (since < co.epoch || since > co.rev) return JSON.stringify({ full: true, rev: co.rev });
  if (since === co.rev) return JSON.stringify({ rev: co.rev, ops: [], counters: co.counters });
  const rows = P('chg', 'SELECT coll,key,data,rev,deleted FROM records WHERE company_id=? AND rev>? ORDER BY rev, rowid LIMIT 20001').all(cid, since);
  if (rows.length > 20000) return JSON.stringify({ full: true, rev: co.rev });
  const parts = rows.map(r => '{"coll":' + JSON.stringify(r.coll) + ',"key":' + JSON.stringify(r.key) + ',"rev":' + r.rev + (r.deleted ? ',"data":null}' : ',"data":' + r.data + '}'));
  return '{"rev":' + co.rev + ',"counters":' + JSON.stringify(co.counters) + ',"ops":[' + parts.join(',') + ']}';
}
function snapshot(cid, role) {
  const co = getCompany(cid); if (!co) throw new HttpError(404, 'الشركة مش موجودة.');
  const rows = P('snap', 'SELECT coll,key,data,rev FROM records WHERE company_id=? AND deleted=0 ORDER BY rowid').all(cid);
  const by = {}; rows.forEach(r => { (by[r.coll] || (by[r.coll] = [])).push('{"key":' + JSON.stringify(r.key) + ',"rev":' + r.rev + ',"data":' + r.data + '}'); });
  const colls = [...COLLS].map(c => JSON.stringify(c) + ':[' + (by[c] || []).join(',') + ']').join(',');
  return '{"rev":' + co.rev + ',"company":{"id":' + co.id + ',"name":' + JSON.stringify(co.name) + '},"role":' + JSON.stringify(role) + ',"counters":' + JSON.stringify(co.counters) + ',"empty":' + (by.settings ? 'false' : 'true') + ',"records":{' + colls + '}}';
}
function alloc(cid, kind, n) {
  if (kind !== 'tx' && kind !== 'man') throw bad('نوع غير صالح.');
  n = Math.max(1, Math.min(5000, parseInt(n, 10) || 300));
  return tx(() => { const co = getCompany(cid); const K = co.counters; const start = K[kind] || 1; K[kind] = start + n; saveCounters(cid, K); return { start, end: start + n }; });
}

/* ---------- استبدال كل البيانات (استيراد / استعادة) ---------- */
function restore(cid, user, body) {
  const recs = body && body.records; if (!Array.isArray(recs)) throw bad('بيانات الاستعادة غير صالحة.');
  const out = tx(() => {
    const co = getCompany(cid); if (!co) throw new HttpError(404, 'الشركة مش موجودة.');
    const rev = co.rev + 1; const K = newCounters();
    P('rec_wipe', 'DELETE FROM records WHERE company_id=?').run(cid);
    const ins = P('rec_ins', 'INSERT INTO records(company_id,coll,key,data,rev,deleted,aux) VALUES(?,?,?,?,?,0,?)');
    let newName = null, jmax = 1;
    for (const r of recs) {
      if (!r || !COLLS.has(r.coll) || typeof r.key !== 'string' || !r.key || r.key.length > 200 || !r.data || typeof r.data !== 'object') throw bad('سجل غير صالح في الاستعادة.');
      const d = r.data, txt = JSON.stringify(d);
      if (txt.length > (r.coll === 'settings' ? MAX_SETTINGS : MAX_ROW)) throw bad('سجل كبير جدًا في الاستعادة.');
      if (txt.includes('"__proto__"')) throw bad('بيانات غير صالحة.');
      if (r.coll === 'tx') { const id = Number(d.id); if (Number.isFinite(id) && id >= K.tx) K.tx = Math.floor(id) + 1; }
      if (r.coll === 'tx' || r.coll === 'man') { const j = Number(d.jno) || 0; if (j > jmax) jmax = j; if (d.doc) bumpDocCounter(K, String(d.doc)); }
      if (r.coll === 'man') { const s = Number(d.seq) || 0; if (s >= 4e6 && s < 5e6 && s - 4e6 >= K.man) K.man = s - 4e6 + 1; K.man = Math.max(K.man, 1); }
      try { ins.run(cid, r.coll, r.key, txt, rev, (r.coll === 'tx' || r.coll === 'man') && d.doc ? String(d.doc).slice(0, 80) : null); } catch (e) { throw bad('مفتاح مكرر في الاستعادة: ' + r.coll + '/' + r.key); }
      if (r.coll === 'settings' && r.key === 'main' && typeof d.company === 'string' && d.company.trim()) newName = d.company.trim().slice(0, 120);
    }
    K.jno = Math.max(K.jno, jmax + 1); const c = body.counters || {};
    maxMerge(K.doc, c.docCounters); maxMerge(K.nextRow, c.nextRow);
    for (const k of ['tx', 'man', 'jno']) { const v = Number(c[k]); if (Number.isFinite(v) && v > K[k] && v < 1e12) K[k] = Math.floor(v); }
    saveCounters(cid, K);
    P('co_re', 'UPDATE companies SET rev=?, epoch=?, updated_at=? WHERE id=?').run(rev, rev, now(), cid);
    if (newName) P('co_name', 'UPDATE companies SET name=? WHERE id=?').run(newName, cid);
    log(cid, user, 'restore', 'استيراد/استعادة كل البيانات (' + recs.length + ' سجل)');
    return { rev, counters: K };
  });
  notify(cid); return out;
}
function wipe(cid, user) {
  const out = tx(() => {
    const co = getCompany(cid); const rev = co.rev + 1;
    P('rec_wipe', 'DELETE FROM records WHERE company_id=?').run(cid); saveCounters(cid, newCounters());
    P('co_re', 'UPDATE companies SET rev=?, epoch=?, updated_at=? WHERE id=?').run(rev, rev, now(), cid);
    log(cid, user, 'wipe', 'مسح كل بيانات الدفاتر'); return { rev };
  });
  notify(cid); return out;
}

/* ---------- سجل النشاط ---------- */
function log(cid, user, action, detail) {
  P('act_ins', 'INSERT INTO activity(company_id,user_id,email,ts,action,detail) VALUES(?,?,?,?,?,?)').run(cid, user ? user.userId : null, user ? user.email : '', now(), action, String(detail || '').slice(0, 300));
  if (Math.random() < 0.02) P('act_trim', 'DELETE FROM activity WHERE company_id=? AND id < (SELECT id FROM activity WHERE company_id=? ORDER BY id DESC LIMIT 1 OFFSET 5000)').run(cid, cid);
}

module.exports = { COLLS, HttpError, bad, getCompany, newCounters, saveCounters, mutate, changes, snapshot, alloc, restore, wipe, log, waitChange, notify };
