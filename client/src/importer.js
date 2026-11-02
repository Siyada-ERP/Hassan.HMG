/* =====================================================================
   SIYADA importer - CSV parser + conversion of the exported CSV file set (from the Excel ERP) into app state
   ===================================================================== */
(function (root) {
'use strict';
const I = {};
const E = root.SiyadaEngine;
const T = E.T;
const num = E.num;

/* ---------- CSV parser (BOM, quotes, CRLF, embedded newlines) ---------- */
I.parseCSV = function (text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], f = '', q = false, i = 0; const n = text.length;
  while (i < n) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { row.push(f); f = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; i++; continue; }
    f += c; i++;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
};
I.parseTable = function (text) {
  const rows = I.parseCSV(text);
  if (!rows.length) return [];
  const h = rows[0].map(s => s.trim());
  const out = [];
  for (let k = 1; k < rows.length; k++) {
    const r = rows[k]; if (r.length === 1 && r[0] === '') continue;
    const o = {}; for (let j = 0; j < h.length; j++) o[h[j]] = r[j] === undefined ? '' : r[j];
    out.push(o);
  }
  return out;
};

/* ---------- date normalisation: ISO / dd-mm-yyyy / Excel serial ---------- */
I.normDate = function (s) {
  if (s === null || s === undefined) return '';
  s = String(s).trim().replace(/^"|"$/g, '');
  if (!s) return '';
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(s))) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  if (/^\d+(\.\d+)?$/.test(s)) {
    const v = parseFloat(s);
    if (v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000); return d.toISOString().slice(0, 10); }
  }
  return '';
};

const SET_MAP = {
  'اسم الشركة': ['company', 's'], 'كود الفرع (ETA)': ['branch', 's'], 'تاريخ بداية الدفاتر': ['startDate', 'd'],
  'طريقة تكلفة البضاعة': ['costMode', 's'], 'ضريبة القيمة المضافة': ['vatOn', 'b'], 'نسبة الضريبة الافتراضية %': ['vatRate', 'n'],
  'الأسعار في الفواتير شاملة الضريبة': ['vatIncl', 'y'], 'حساب الخزينة الافتراضي': ['accCash', 's'], 'حساب العملاء': ['accAR', 's'],
  'حساب الموردين': ['accAP', 's'], 'حساب المخزون': ['accInv', 's'], 'حساب تكلفة البضاعة المباعة': ['accCogs', 's'], 'حساب مبيعات': ['accSales', 's'],
  'الحساب المعلّق (للمراجعة)': ['accSusp', 's'], 'حساب رأس المال / الأرصدة الافتتاحية': ['accOpen', 's'], 'حساب الأرباح المرحّلة': ['accRE', 's'],
  'ضريبة القيمة المضافة - مخرجات': ['accVatOut', 's'], 'ضريبة القيمة المضافة - مدخلات': ['accVatIn', 's'],
  'مصروف افتراضي (تصنيف غير معروف)': ['accExp', 's'], 'إيراد افتراضي (تصنيف غير معروف)': ['accInc', 's']
};

/* files: object {name: text} (names without folders, lower-case, e.g. 'transactions.csv') -> new state */
I.fromCSV = function (files, keepSettings) {
  const get = n => files[n] ? I.parseTable(files[n]) : null;
  const S = { ver: 1, settings: E.defaultSettings(), coa: [], mapping: { types: [], methods: [], expenses: [], incomes: [] }, parties: [], items: [], transactions: [], manual: [], meta: { nextJno: 2, nextTxId: 1 } };
  const warn = [];
  // settings
  const sets = get('settings.csv');
  if (sets) sets.forEach(r => {
    const m = SET_MAP[(r.label || '').trim()]; if (!m) return;
    const v = (r.value || '').trim();
    if (m[1] === 's') S.settings[m[0]] = v;
    else if (m[1] === 'n') S.settings[m[0]] = num(v) || S.settings[m[0]];
    else if (m[1] === 'd') S.settings[m[0]] = I.normDate(v) || S.settings[m[0]];
    else if (m[1] === 'b') S.settings[m[0]] = v.indexOf('غير') < 0 && v.length > 0;
    else if (m[1] === 'y') S.settings[m[0]] = v === T.yes;
  });
  if (keepSettings) { const k = keepSettings; ['company', 'taxNo', 'activity', 'gov', 'city', 'street', 'bldg', 'phone', 'logo'].forEach(x => { if (k[x]) S.settings[x] = k[x]; }); }
  // chart of accounts
  const accs = get('accounts.csv');
  if (accs) accs.forEach(r => { if (r.account_code) S.coa.push({ code: r.account_code.trim(), name: r.account_name, type: r.account_type, group: r.account_group, fin: r.is_financial === T.yes, notes: r.notes || '' }); });
  const nameToCode = new Map(); S.coa.forEach(a => { if (!nameToCode.has(a.name)) nameToCode.set(a.name, a.code); });
  // mapping
  const mp = get('mapping_rules.csv');
  if (mp) mp.forEach(r => {
    const k = r.kind;
    if (k === 'type') S.mapping.types.push({ src: r.key, tp: r.key2, acc: r.account_code });
    else if (k === 'payment_method') S.mapping.methods.push({ key: r.key, acc: r.account_code });
    else if (k === 'expense_category') S.mapping.expenses.push({ key: r.key, acc: r.account_code });
    else if (k === 'income_category') S.mapping.incomes.push({ key: r.key, acc: r.account_code });
  });
  // parties
  const pr = get('parties.csv');
  if (pr) pr.forEach(r => { if (r.party_name || r.party_code) S.parties.push({ code: r.party_code, name: r.party_name, type: r.party_type, phone: r.phone === 'غير موجود' ? '' : r.phone, address: r.address, opening: num(r.opening_balance), limit: num(r.credit_limit), priceList: r.price_list || '' }); });
  // items
  const it = get('items.csv');
  if (it) it.forEach(r => { if (r.item_code) S.items.push({ code: r.item_code, name: r.item_name, unit: r.unit, weight: num(r.unit_weight), openQty: num(r.opening_qty), openCost: num(r.opening_cost), vat: r.vat_rate === '' ? '' : num(r.vat_rate), eta: r.eta_code || '', etaType: r.eta_type || '', reorder: num(r.reorder_level) }); });
  // transactions
  const SRC_ORD = { [T.sales]: 1, [T.purch]: 2, [T.treas]: 3, [T.manual]: 4 };
  const tx = get('transactions.csv'); let maxId = 0;
  if (tx) tx.forEach(r => {
    const id = parseInt(r.id, 10) || 0; if (id > maxId) maxId = id;
    const row = parseInt(r.source_row, 10) || 0;
    const pm = (r.pay_method || '').trim();
    S.transactions.push({
      id, date: I.normDate(r.tx_date), source: r.source, row, doc: r.doc_no || '', type: r.tx_type, partyType: r.party_type, partyCode: r.party_code || '', partyName: r.party_name || '',
      itemCode: r.item_code || '', itemName: r.item_name || '', qty: num(r.qty), pieces: num(r.pieces), price: num(r.price), amount: num(r.amount), debit: num(r.debit), credit: num(r.credit),
      mis: (r.flag || '').indexOf('الإجمالي لا يساوي') >= 0, acc: pm ? (nameToCode.get(pm) || '') : '', desc: r.description || '', jno: parseInt(r.journal_no, 10) || 0,
      seq: (SRC_ORD[r.source] || 5) * 1e6 + row
    });
  });
  S.meta.nextTxId = maxId + 1;
  // manual entries: rebuilt from journal lines with source = manual
  const jl = get('journal_lines.csv');
  if (jl) {
    const byE = new Map();
    jl.forEach(r => {
      if (r.source !== T.manual) {
        if (r.source === T.opening && r.description === 'رصيد الخزينة أول المدة') S.settings.openCash = (S.settings.openCash || 0) + num(r.debit) - num(r.credit);
        return;
      }
      let e = byE.get(r.entry_no);
      if (!e) { e = { jno: parseInt(r.entry_no, 10) || 0, date: I.normDate(r.entry_date), type: r.entry_type || T.manual, doc: r.doc_no || '', desc: r.description || '', lines: [], seq: 4e6 + (parseInt(r.entry_no, 10) || 0) }; byE.set(r.entry_no, e); S.manual.push(e); }
      e.lines.push({ acc: r.account_code, dr: num(r.debit), cr: num(r.credit), pc: r.party_code || '', pn: r.party_name || '', desc: r.description || '' });
    });
  }
  S.meta.nextManual = S.manual.length + 1;
  // documents prefixes are not needed (derived), counters derived from existing doc numbers
  S.meta.docCounters = I.docCounters(S.transactions);
  S.meta.imported = { at: new Date().toISOString(), files: Object.keys(files).length };
  return S;
};

I.docCounters = function (txs) {
  const c = {};
  txs.forEach(t => { const m = /^([A-Za-z]+-)(\d+)$/.exec(t.doc || ''); if (m) { const n = parseInt(m[2], 10); if (!c[m[1]] || c[m[1]] < n) c[m[1]] = n; } });
  return c;
};

root.SiyadaImporter = I;
if (typeof module !== 'undefined' && module.exports) module.exports = I;
})(typeof window !== 'undefined' ? window : globalThis);
