/* =====================================================================
   SIYADA - defaults for a new company + persistence (IndexedDB, localStorage fallback) + JSON backup
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP, E = root.SiyadaEngine, T = E.T;

/* ---------- default chart of accounts and mapping for a new company ---------- */
const A = (code, name, type, group, fin) => ({ code, name, type, group, fin: !!fin, notes: '' });
APP.defaultCOA = () => [
  A('1101', 'الخزينة النقدية', 'أصول', 'نقدية وبنوك', 1), A('1102', 'محفظة فودافون كاش', 'أصول', 'نقدية وبنوك', 1), A('1103', 'إنستا باي', 'أصول', 'نقدية وبنوك', 1),
  A('1104', 'البنك', 'أصول', 'نقدية وبنوك', 1), A('1105', 'شيكات تحت التحصيل', 'أصول', 'نقدية وبنوك', 1),
  A('1201', 'العملاء', 'أصول', 'ذمم مدينة'), A('1202', 'سلف الموظفين', 'أصول', 'ذمم مدينة'), A('1203', 'ضريبة القيمة المضافة - مدخلات', 'أصول', 'أرصدة مدينة أخرى'),
  A('1301', 'المخزون', 'أصول', 'مخزون'), A('1501', 'الأصول الثابتة والأصول الأخرى', 'أصول', 'أصول ثابتة'),
  A('2101', 'الموردون', 'خصوم', 'ذمم دائنة'), A('2102', 'ضريبة القيمة المضافة - مخرجات', 'خصوم', 'أرصدة دائنة أخرى'), A('2103', 'أرصدة دائنة أخرى', 'خصوم', 'أرصدة دائنة أخرى'),
  A('3101', 'رأس المال والأرصدة الافتتاحية', 'حقوق ملكية', 'حقوق الملكية'), A('3201', 'الأرباح (الخسائر) المرحّلة', 'حقوق ملكية', 'حقوق الملكية'),
  A('4101', 'إيرادات المبيعات', 'إيرادات', 'إيرادات النشاط'), A('4102', 'مردودات المبيعات', 'إيرادات', 'خصومات المبيعات'), A('4103', 'خصم مسموح به', 'إيرادات', 'خصومات المبيعات'),
  A('4201', 'إيرادات أخرى', 'إيرادات', 'إيرادات أخرى'), A('4202', 'خصم مكتسب من الموردين', 'إيرادات', 'إيرادات أخرى'), A('4203', 'عجز محمّل على العملاء', 'إيرادات', 'إيرادات أخرى'),
  A('5101', 'تكلفة البضاعة المباعة', 'مصروفات', 'تكلفة المبيعات'), A('5201', 'مرتبات وأجور', 'مصروفات', 'مصروفات تشغيل'), A('5202', 'كهرباء ومياه وغاز', 'مصروفات', 'مصروفات تشغيل'),
  A('5203', 'صيانة وسائل النقل', 'مصروفات', 'مصروفات تشغيل'), A('5204', 'صيانة ماكينات', 'مصروفات', 'مصروفات تشغيل'), A('5205', 'إيجارات', 'مصروفات', 'مصروفات تشغيل'),
  A('5206', 'وقود سيارات', 'مصروفات', 'مصروفات تشغيل'), A('5207', 'مصروفات أخرى', 'مصروفات', 'مصروفات تشغيل'), A('5208', 'فروق خزينة (عجز / زيادة)', 'مصروفات', 'مصروفات تشغيل'),
  A('5209', 'رسوم تحويل وعمولات', 'مصروفات', 'مصروفات تشغيل'), A('9999', 'حساب معلّق (للمراجعة)', 'أصول', 'حسابات معلّقة')
];
APP.defaultMapping = () => ({
  types: [
    { src: T.sales, tp: T.sale, acc: '4101' }, { src: T.sales, tp: T.coll, acc: 'AUTO' }, { src: T.sales, tp: T.ret, acc: '4102' }, { src: T.sales, tp: T.disc, acc: '4103' },
    { src: T.sales, tp: 'عجز', acc: '4203' }, { src: T.sales, tp: T.pay, acc: 'AUTO' }, { src: T.sales, tp: 'سلفة', acc: '9999' }, { src: T.sales, tp: T.buy, acc: '1301' },
    { src: T.purch, tp: T.buy, acc: '1301' }, { src: T.purch, tp: T.pay, acc: 'AUTO' }, { src: T.purch, tp: T.retBuy, acc: '1301' }, { src: T.purch, tp: T.disc, acc: '4202' }
  ],
  methods: [
    { key: 'فودافون', acc: '1102' }, { key: 'إنستا', acc: '1103' }, { key: 'شيك', acc: '1105' }, { key: 'بنك', acc: '1104' }, { key: 'البنك', acc: '1104' },
    { key: 'تحويل', acc: '1104' }, { key: 'كاش', acc: '1101' }, { key: 'نقد', acc: '1101' }
  ],
  expenses: [
    { key: 'مرتبات وأجور', acc: '5201' }, { key: 'كهرباء ومياه وغاز', acc: '5202' }, { key: 'صيانة وسائل النقل', acc: '5203' }, { key: 'صيانة ماكينات', acc: '5204' },
    { key: 'إيجارات', acc: '5205' }, { key: 'وقود سيارات', acc: '5206' }, { key: 'مصروفات أخرى', acc: '5207' }, { key: 'رسوم تحويل وعمولات', acc: '5209' },
    { key: 'فروق خزينة', acc: '5208' }, { key: 'سلف الموظفين', acc: '1202' }, { key: 'أصول أخرى', acc: '1501' }
  ],
  incomes: [{ key: 'إيرادات أخرى', acc: '4201' }]
});
APP.newState = function (company) {
  const s = E.defaultSettings(); if (company) Object.assign(s, company);
  return { ver: 1, settings: s, coa: APP.defaultCOA(), mapping: APP.defaultMapping(), parties: [], items: [], transactions: [], manual: [], meta: { nextJno: 2, nextTxId: 1, nextManual: 1, docCounters: {}, nextRow: {}, changes: 0, lastBackup: '' } };
};

/* ---------- persistence ---------- */
const DB = 'siyada_accounting_v1', KEY = 'main';
let mode = 'idb'; // idb | ls | mem
function idbOpen() {
  return new Promise((res, rej) => {
    if (!root.indexedDB) return rej(new Error('no idb'));
    let q; try { q = indexedDB.open(DB, 1); } catch (e) { return rej(e); }
    q.onupgradeneeded = () => { q.result.createObjectStore('kv'); };
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    q.onblocked = () => rej(new Error('blocked'));
  });
}
APP.store = {
  mode: () => mode,
  async load() {
    try {
      const db = await idbOpen();
      const v = await new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(KEY); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      mode = 'idb'; db.close(); return v || null;
    } catch (e) {
      try { const v = root.localStorage.getItem(DB); mode = 'ls'; return v ? JSON.parse(v) : null; } catch (e2) { mode = 'mem'; return null; }
    }
  },
  async save(state) {
    if (mode === 'idb') {
      try {
        const db = await idbOpen();
        await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(JSON.parse(JSON.stringify(state)), KEY); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
        db.close(); return true;
      } catch (e) { mode = 'ls'; }
    }
    if (mode === 'ls') { try { root.localStorage.setItem(DB, JSON.stringify(state)); return true; } catch (e) { mode = 'mem'; } }
    return false;
  },
  async wipe() { try { const db = await idbOpen(); await new Promise(r => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(KEY); t.oncomplete = r; t.onerror = r; }); db.close(); } catch (e) { } try { root.localStorage.removeItem(DB); } catch (e) { } }
};
let saveT = 0;
APP.saveSoon = function () {
  APP.setSaveState('...');
  clearTimeout(saveT);
  saveT = setTimeout(async () => { const ok = await APP.store.save(APP.S); APP.setSaveState(ok ? 'ok' : 'bad'); }, 350);
};
APP.saveNow = async function () { clearTimeout(saveT); const ok = await APP.store.save(APP.S); APP.setSaveState(ok ? 'ok' : 'bad'); return ok; };

/* ---------- JSON backup ---------- */
APP.backupJSON = function () {
  const payload = { app: 'SIYADA', format: 1, exportedAt: new Date().toISOString(), company: APP.S.settings.company, state: APP.S };
  const d = new Date(); const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  const safe = (APP.S.settings.company || 'SIYADA').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  APP.download(JSON.stringify(payload), 'SIYADA_' + safe + '_' + stamp + '.json', 'application/json');
  APP.S.meta.lastBackup = new Date().toISOString(); APP.S.meta.changes = 0; APP.saveSoon();
};
APP.parseBackup = function (text) {
  const o = JSON.parse(text);
  if (!o || o.app !== 'SIYADA' || !o.state || !o.state.settings) throw new Error('الملف ده مش نسخة احتياطية من SIYADA.');
  return o.state;
};
// make sure an old/partial state has every field the code expects
APP.normalizeState = function (S) {
  const d = APP.newState();
  S.settings = Object.assign(E.defaultSettings(), S.settings || {});
  ['coa', 'parties', 'items', 'transactions', 'manual'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
  S.mapping = Object.assign({ types: [], methods: [], expenses: [], incomes: [] }, S.mapping || {});
  S.meta = Object.assign(d.meta, S.meta || {});
  if (!S.meta.nextRow) S.meta.nextRow = {};
  if (!Array.isArray(S.priceLists)) S.priceLists = [];
  if (!Array.isArray(S.employees)) S.employees = [];
  if (!Array.isArray(S.meta.closings)) S.meta.closings = [];
  let mid = 0; S.transactions.forEach(t => { if (t.id > mid) mid = t.id; }); if (S.meta.nextTxId <= mid) S.meta.nextTxId = mid + 1;
  const rows = S.meta.nextRow; S.transactions.forEach(t => { if ((rows[t.source] || 0) <= (t.row || 0)) rows[t.source] = (t.row || 0) + 1; });
  return S;
};
})(window);
