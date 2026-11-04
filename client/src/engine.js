/* =====================================================================
   SIYADA engine - posting rules (same rules as the SIYADA Excel ERP macro engine, no formulas anywhere)
   state -> journal (balanced entries) + derived tables + consistency checks
   ===================================================================== */
(function (root) {
'use strict';
const E = {};

const r2 = x => (x >= 0 ? Math.floor(x * 100 + 0.5000001) / 100 : -Math.floor(-x * 100 + 0.5000001) / 100);
E.r2 = r2;
const num = v => { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : 0; };
E.num = num;

// Arabic literals used by the rules (kept in one place)
const T = {
  sales: 'مبيعات', purch: 'مشتريات', treas: 'خزينة', manual: 'يدوي', opening: 'افتتاحي', auto: 'آلي',
  stockTransfer: 'تحويل مخزني',
  cust: 'عميل', supp: 'مورد', party0: 'جهة',
  sale: 'بيع', ret: 'مرتجع', coll: 'تحصيل', disc: 'خصم', buy: 'شراء', retBuy: 'مرتجع شراء', pay: 'سداد', exp: 'مصروف', inc: 'إيراد',
  closing: 'إقفال', yes: 'نعم'
};
E.T = T;

E.defaultSettings = function () {
  return {
    company: '', taxNo: '', activity: '', branch: '0', gov: '', city: '', street: '', bldg: '', phone: '', logo: '',
    startDate: new Date().getFullYear() + '-01-01', costMode: 'avg',
    vatOn: false, vatRate: 14, vatIncl: true,
    accCash: '1101', accAR: '1201', accAP: '2101', accInv: '1301', accCogs: '5101', accSales: '4101', accSusp: '9999',
    accOpen: '3101', accRE: '3201', accVatOut: '2102', accVatIn: '1203', accExp: '5207', accInc: '4201',
    openCash: 0, closedUntil: '', etaActivity: '', alertDays: 60, uiTheme: 'green_gold', uiDensity: 'comfortable',
    defaultWarehouseId: 'main', warehouseSelection: true,
    printSize: 'a4', paymentMethods: ['cash', 'bank', 'instapay', 'wallet', 'cheque'],
    localPasswordEnabled: false, localPasswordSalt: '', localPasswordHash: ''
  };
};

const tcodeOf = tp => ({ [T.sale]: 1, [T.ret]: 2, [T.coll]: 3, [T.disc]: 4, [T.buy]: 5, [T.retBuy]: 6, [T.pay]: 7, [T.exp]: 8, [T.inc]: 9 }[tp] || 10);
const rankOf = (src, tc) => {
  let r = tc === 5 ? 1 : (tc === 1 || tc === 6 ? 3 : 2);
  if (src === T.manual) r = 4;
  if (src === T.opening) r = 0;
  return r;
};
E.tcodeOf = tcodeOf;

/* -------------------------------------------------------------------
   build(S): S = {settings, coa, mapping, parties, items, transactions, manual, meta}
   ------------------------------------------------------------------- */
E.build = function (S) {
  const st = Object.assign(E.defaultSettings(), S.settings || {});
  const meta = S.meta || (S.meta = {});
  const M = S.mapping || { types: [], methods: [], expenses: [], incomes: [] };
  const coaMap = new Map();
  (S.coa || []).forEach(a => coaMap.set(a.code, a));
  const accName = c => (coaMap.get(c) || {}).name || '';
  const accType = c => (coaMap.get(c) || {}).type || '';

  const mapType = (src, tp) => { for (const m of M.types) if (m.src === src && m.tp === tp) return m.acc; return ''; };
  const methodAcc = txt => { if (!txt) return ''; for (const m of M.methods) if (txt.indexOf(m.key) >= 0) return m.acc; return ''; };
  const expAcc = cat => { for (const m of M.expenses) if (m.key === cat) return m.acc; return ''; };
  const incAcc = cat => { for (const m of M.incomes) if (m.key === cat) return m.acc; return ''; };

  const R = { journal: [], txInfo: new Map(), docs: [], items: [], stockMoves: [], checks: [], counts: {}, warnings: [] };
  const warehouses = Array.isArray(S.warehouses) && S.warehouses.length ? S.warehouses : [{ id: 'main', name: 'المخزن الرئيسي', active: true }];
  const whBy = new Map(warehouses.map(w => [w.id, w]));
  const defaultWh = (st.defaultWarehouseId && whBy.has(st.defaultWarehouseId)) ? st.defaultWarehouseId : warehouses[0].id;
  let nMis = 0, nPreStart = 0, nNoCost = 0, nUnmapped = 0, nNoParty = 0, nNoItem = 0, nImb = 0, mUntracked = 0;

  // ---- items (runtime copy)
  const items = (S.items || []).map(x => ({
    code: x.code, name: x.name, unit: x.unit || '', weight: num(x.weight), openQty: num(x.openQty), openCost: num(x.openCost),
    vat: (x.vat === '' || x.vat === null || x.vat === undefined || isNaN(parseFloat(x.vat))) ? -1 : num(x.vat),
    eta: x.eta || '', etaType: x.etaType || '', reorder: num(x.reorder),
    q: 0, v: 0, lastC: 0, buyQ: 0, sellQ: 0, cogs: 0, salesV: 0, lastBuy: 0, lastSell: 0, noCost: 0, warehouses: {}
  }));
  const itemMap = new Map();
  items.forEach((x, i) => {
    x.q = x.openQty; x.v = r2(x.openQty * x.openCost); x.lastC = x.openCost;
    x.warehouses[defaultWh] = { q: x.openQty, v: x.v, lastC: x.openCost };
    if (!itemMap.has(x.code)) itemMap.set(x.code, i);
  });
  const whState = (x, id) => x.warehouses[id] || (x.warehouses[id] = { q: 0, v: 0, lastC: x.lastC || 0 });
  const itemIdx = c => (c && itemMap.has(c) ? itemMap.get(c) : -1);
  const itemRate = i => (i >= 0 && items[i].vat >= 0 ? items[i].vat : st.vatRate);
  const avgCost = i => { const x = items[i]; let a = 0; if (x.q > 0.0000001) a = x.v / x.q; if (a <= 0) a = x.lastC; if (a < 0) a = 0; return a; };
  const avgCostWh = (i, id) => { const x = items[i], w = whState(x, id); let a = 0; if (w.q > 0.0000001) a = w.v / w.q; if (a <= 0) a = w.lastC || x.lastC; return a < 0 ? 0 : a; };

  // ---- parties (runtime copy)
  const parties = (S.parties || []).map(x => ({
    code: x.code, name: x.name, type: x.type, phone: x.phone || '', address: x.address || '', open: num(x.opening), limit: num(x.limit),
    priceList: x.priceList || '', dr: 0, cr: 0, last: '', cnt: 0, adhoc: false
  }));
  const pByCode = new Map(), pByName = new Map();
  parties.forEach((p, i) => { if (!pByCode.has(p.code)) pByCode.set(p.code, i); const k = p.type + '|' + p.name; if (!pByName.has(k)) pByName.set(k, i); });
  function getParty(code, nm, pty, rec) {
    let k = (code && pByCode.has(code)) ? pByCode.get(code) : -1;
    if (k < 0 && nm && pByName.has(pty + '|' + nm)) k = pByName.get(pty + '|' + nm);
    if (k < 0) {
      parties.push({ code: code || ('?' + String(parties.length + 1).padStart(4, '0')), name: nm, type: pty, phone: '', address: '', open: 0, limit: 0, priceList: '', dr: 0, cr: 0, last: '', cnt: 0, adhoc: true });
      k = parties.length - 1;
      pByCode.set(parties[k].code, k);
      if (nm) pByName.set(pty + '|' + nm, k);
      nNoParty++;
      addFlag(rec, 'طرف غير موجود في بيانات ' + (pty === T.cust ? 'العملاء' : 'الموردين'));
    }
    function procStock(r) {
      const it = itemIdx(r.ic); if (it < 0 || r.q <= 0) return;
      const x = items[it], from = whState(x, r.from), to = whState(x, r.to);
      const unit = avgCostWh(it, r.from), value = r2(r.q * unit);
      from.q -= r.q; from.v -= value; to.q += r.q; to.v += value; to.lastC = unit;
      R.stockMoves.push({ date: r.date, doc: r.doc, itemCode: r.ic, qty: r.q, fromWarehouseId: r.from, toWarehouseId: r.to, type: T.stockTransfer });
    }
    return k;
  }
  function addFlag(rec, txt) { rec.flags.push(txt); }

  // ---- records
  const recs = [];
  const startDate = st.startDate || '';
  (S.transactions || []).forEach(t => {
    const dr = num(t.debit), cr = num(t.credit);
    if (dr === 0 && cr === 0) return;
    let tp = t.type, src = t.source;
    if (src === T.treas) { tp = (tp && tp.indexOf(T.inc) >= 0) ? T.inc : T.exp; }
    const rec = {
      kind: 'tx', t, src, tp, tc: tcodeOf(tp), date: t.date || '', doc: t.doc || '', ic: t.itemCode || '', in: t.itemName || '',
      q: num(t.qty), cnt: num(t.pieces), pr: num(t.price), dr, cr, desc: t.desc || '', ref: t.row || 0, seq: t.seq || 0, jno: t.jno || 0, flags: [],
      pt: '',       pc: '', pn: '', p: -1, acc: t.acc || '', warehouseId: whBy.has(t.warehouseId) ? t.warehouseId : defaultWh
    };
    if ((t.mis || (t.amount !== undefined && t.amount !== null && t.amount !== '' && Math.abs(num(t.amount) - (dr + cr)) > 0.005)) && (src === T.sales || src === T.purch)) { nMis++; addFlag(rec, 'الإجمالي لا يساوي المدين/الدائن'); }
    if (src === T.sales || src === T.purch) {
      const pty = src === T.sales ? T.cust : T.supp;
      if ((t.partyName || '').length > 0 || (tp || '').length > 0) {
        rec.pt = pty;
        const k = getParty(t.partyCode || '', t.partyName || '', pty, rec);
        rec.p = k; rec.pc = parties[k].code; rec.pn = parties[k].name;
      } else return;
    } else if (src === T.treas) {
      rec.pt = T.party0; rec.pc = ''; rec.pn = t.partyName || '';
      rec.cat = rec.pn;
    } else return;
    recs.push(rec);
  });
  (S.stockTransfers || []).forEach(t => {
    if (!t || !t.itemCode || !num(t.qty) || !whBy.has(t.fromWarehouseId) || !whBy.has(t.toWarehouseId)) return;
    recs.push({ kind: 'stock', t, src: T.stockTransfer, tp: T.stockTransfer, tc: 10, date: t.date || startDate,
      doc: t.doc || '', ic: t.itemCode, q: num(t.qty), from: t.fromWarehouseId, to: t.toWarehouseId,
      seq: t.seq || 0, jno: 0, flags: [] });
  });
  (S.manual || []).forEach(m => {
    const lines = (m.lines || []).filter(l => l.acc && (num(l.dr) !== 0 || num(l.cr) !== 0));
    if (!lines.length) return;
    recs.push({ kind: 'man', m, lines, src: T.manual, tp: m.type || T.manual, tc: 10, date: m.date || '', doc: m.doc || '', desc: m.desc || '', seq: m.seq || 0, jno: m.jno || 0, ref: m.ref || 0, flags: [] });
  });
  recs.forEach(r => {
    if (!r.date) { r.date = startDate; addFlag(r, 'بدون تاريخ'); }
    else if (startDate && r.date < startDate && r.src !== T.manual) { nPreStart++; addFlag(r, 'تاريخ قبل بداية الدفاتر'); }
    r.rank = rankOf(r.src, r.tc);
  });
  recs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.rank - b.rank) || (a.seq - b.seq)));

  // ---- journal emission
  let nextJno = Math.max(num(meta.nextJno), 2);
  recs.forEach(r => { if (r.jno >= nextJno) nextJno = r.jno + 1; });
  let cur = null;
  const J = R.journal;
  function beginEntry(date, src, ref, typ, doc, desc, jno, tid) {
    cur = { tid: tid || 0, en: jno, ln: 0, date, src, ref, typ, doc, desc, sumDr: 0, sumCr: 0, startJ: J.length };
  }
  function addLine(acc, dAmt, cAmt, pc, pn, desc) {
    const x1 = r2(dAmt), x2 = r2(cAmt);
    if (x1 === 0 && x2 === 0) return;
    cur.ln++;
    J.push({ en: cur.en, ln: cur.ln, date: cur.date, acc, accName: accName(acc), dr: x1, cr: x2, desc: desc || cur.desc, doc: cur.doc, src: cur.src, ref: cur.ref, pc: pc || '', pn: pn || '', typ: cur.typ, tid: cur.tid });
    cur.sumDr += x1; cur.sumCr += x2;
  }
  function endEntry() {
    if (J.length <= cur.startJ) return false;
    const diff = r2(cur.sumDr - cur.sumCr);
    if (diff !== 0) {
      nImb++;
      if (diff > 0) addLine(st.accSusp, 0, diff, '', '', 'تسوية فرق قيد تلقائي'); else addLine(st.accSusp, -diff, 0, '', '', 'تسوية فرق قيد تلقائي');
    }
    return true;
  }
  const getJno = r => { if (!r.jno) { r.jno = nextJno++; if (r.kind === 'tx') r.t.jno = r.jno; else r.m.jno = r.jno; } return r.jno; };

  // ---- documents
  const docMap = new Map(); const docs = [];
  function docAdd(doc, tc, amt, vat, cost, date, pc, pn, meth, src, hasLine, en) {
    if (!doc) return;
    let d = docMap.get(doc);
    if (!d) { d = { doc, date, pc, pn, meth, src, en, lines: 0, s: new Array(11).fill(0), vat: 0, cost: 0 }; docMap.set(doc, d); docs.push(d); }
    d.s[tc] += amt; d.vat += vat; d.cost += cost; if (hasLine) d.lines++;
    if (!d.meth) d.meth = meth;
    if (!d.pc) { d.pc = pc; d.pn = pn; }
  }
  const setTx = (r, net, vat, cost, meth, en) => R.txInfo.set(r.t.id, { net, vat, cost, meth, jno: en, flag: r.flags.join(' | ') });

  // ---- opening entry (always entry 1)
  (function opening() {
    const d = startDate || new Date().toISOString().slice(0, 10);
    beginEntry(d, T.opening, 0, T.opening, 'OPEN-1', 'قيد افتتاحي - أرصدة بداية الدفاتر', 1);
    parties.forEach(p => {
      if (p.open !== 0) {
        if (p.type === T.cust) { if (p.open > 0) addLine(st.accAR, p.open, 0, p.code, p.name); else addLine(st.accAR, 0, -p.open, p.code, p.name); }
        else { if (p.open > 0) addLine(st.accAP, 0, p.open, p.code, p.name); else addLine(st.accAP, -p.open, 0, p.code, p.name); }
      }
    });
    let s = 0; items.forEach(x => { s += x.v; });
    if (s !== 0) { if (s > 0) addLine(st.accInv, s, 0, '', '', 'مخزون أول المدة'); else addLine(st.accInv, 0, -s, '', '', 'مخزون أول المدة'); }
    const oc = num(st.openCash);
    if (oc !== 0) { if (oc > 0) addLine(st.accCash, oc, 0, '', '', 'رصيد الخزينة أول المدة'); else addLine(st.accCash, 0, -oc, '', '', 'رصيد الخزينة أول المدة'); }
    const tot = r2(cur.sumDr - cur.sumCr);
    if (tot > 0) addLine(st.accOpen, 0, tot, '', '', 'رأس المال والأرصدة الافتتاحية');
    else if (tot < 0) addLine(st.accOpen, -tot, 0, '', '', 'رأس المال والأرصدة الافتتاحية');
    endEntry();
  })();

  function procParty(r) {
    const src = r.src, tc = r.tc, dr = r.dr, cr = r.cr, amt = dr + cr, pc = r.pc, pn = r.pn;
    const pa = src === T.purch ? st.accAP : st.accAR;
    const it = itemIdx(r.ic), qty = r.q;
    let meth = '';
    const en = getJno(r);
    beginEntry(r.date, src, r.ref, T.auto, r.doc, r.desc, en, r.t.id);
    let cnt = mapType(src, r.tp);
    if (cnt === 'AUTO') { cnt = r.acc || methodAcc(r.desc); if (!cnt) cnt = st.accCash; meth = accName(cnt); }
    if (!cnt) { cnt = st.accSusp; nUnmapped++; addFlag(r, 'نوع الحركة غير معرّف في ربط الحسابات'); }
    let net = amt, vat = 0;
    if (st.vatOn && (tc === 1 || tc === 2 || tc === 4 || tc === 5 || tc === 6)) {
      const vr = itemRate(it);
      if (vr > 0) { net = r2(amt / (1 + vr / 100)); vat = r2(amt - net); }
    }
    if (dr > 0) addLine(pa, dr, 0, pc, pn); else addLine(pa, 0, cr, pc, pn);
    const vatAcc = src === T.purch ? st.accVatIn : st.accVatOut;
    if (dr > 0) { addLine(cnt, 0, net); if (vat !== 0) addLine(vatAcc, 0, vat); }
    else { addLine(cnt, net, 0); if (vat !== 0) addLine(vatAcc, vat, 0); }
    let cost = 0;
    if (src === T.sales) {
      if (tc === 1 && it >= 0 && qty > 0) {
        const uCost = avgCostWh(it, r.warehouseId); cost = r2(qty * uCost);
        if (uCost <= 0) { nNoCost++; items[it].noCost++; addFlag(r, 'صنف بدون تكلفة'); }
        addLine(st.accCogs, cost, 0); addLine(st.accInv, 0, cost);
        const x = items[it], w = whState(x, r.warehouseId); w.q -= qty; w.v -= cost; x.q -= qty; x.v -= cost; x.sellQ += qty; x.salesV += net; x.cogs += cost; x.lastSell = r.pr;
      } else if (tc === 2 && it >= 0 && qty > 0) {
        const uCost = avgCostWh(it, r.warehouseId); cost = r2(qty * uCost);
        addLine(st.accInv, cost, 0); addLine(st.accCogs, 0, cost);
        const x = items[it], w = whState(x, r.warehouseId); w.q += qty; w.v += cost; x.q += qty; x.v += cost; x.sellQ -= qty; x.salesV -= net; x.cogs -= cost;
        cost = -cost;
      } else if (tc === 5) {
        if (it >= 0 && qty > 0) { const x = items[it], w = whState(x, r.warehouseId); x.q += qty; x.v += net; w.q += qty; w.v += net; x.buyQ += qty; x.lastC = net / qty; w.lastC = x.lastC; x.lastBuy = r.pr; cost = net; }
        else mUntracked += net;
      } else if ((tc === 1 || tc === 2) && it < 0) { nNoItem++; addFlag(r, 'بدون كود صنف'); }
    } else {
      if (tc === 5) {
        if (it >= 0 && qty > 0) { const x = items[it], w = whState(x, r.warehouseId); x.q += qty; x.v += net; w.q += qty; w.v += net; x.buyQ += qty; x.lastC = net / qty; w.lastC = x.lastC; x.lastBuy = r.pr; cost = net; }
        else { mUntracked += net; if (it < 0) addFlag(r, 'شراء بدون كود صنف: مش متتبّع في المخزون'); }
      } else if (tc === 6) {
        if (it >= 0 && qty > 0) { const x = items[it], w = whState(x, r.warehouseId); x.q -= qty; x.v -= net; w.q -= qty; w.v -= net; x.buyQ -= qty; cost = -net; }
        else mUntracked -= net;
      }
    }
    endEntry();
    const p = parties[r.p];
    if (p) { p.dr += dr; p.cr += cr; p.cnt++; if (r.date > p.last) p.last = r.date; }
    docAdd(r.doc, tc, amt, vat, cost, r.date, pc, pn, meth, src, (tc === 1 || tc === 2 || tc === 5 || tc === 6), en);
    setTx(r, net, vat, cost, meth, en);
  }

  function procTreasury(r) {
    const tc = r.tc, cat = r.cat;
    const en = getJno(r);
    beginEntry(r.date, T.treas, r.ref, T.auto, r.doc, r.desc, en, r.t.id);
    let cash = r.acc || methodAcc(r.desc);
    if (!cash) cash = st.accCash;
    const meth = accName(cash);
    let amt, acc;
    if (tc === 8) {
      amt = r.cr; acc = expAcc(cat);
      if (!acc) { acc = st.accExp; addFlag(r, 'تصنيف المصروف غير موجود في ربط الحسابات'); }
      addLine(acc, amt, 0, '', cat); addLine(cash, 0, amt);
    } else {
      amt = r.dr; acc = incAcc(cat);
      if (!acc) { acc = st.accInc; addFlag(r, 'تصنيف الإيراد غير موجود في ربط الحسابات'); }
      addLine(cash, amt, 0); addLine(acc, 0, amt, '', cat);
    }
    endEntry();
    docAdd(r.doc, tc, amt, 0, 0, r.date, '', cat, meth, T.treas, true, en);
    setTx(r, amt, 0, 0, meth, en);
  }

  function procStock(r) {
    const it = itemIdx(r.ic); if (it < 0 || r.q <= 0) return;
    const x = items[it], from = whState(x, r.from), to = whState(x, r.to);
    const unit = avgCostWh(it, r.from), value = r2(r.q * unit);
    from.q -= r.q; from.v -= value; to.q += r.q; to.v += value; to.lastC = unit;
    R.stockMoves.push({ date: r.date, doc: r.doc, itemCode: r.ic, qty: r.q, fromWarehouseId: r.from, toWarehouseId: r.to, type: T.stockTransfer });
  }

  function procManual(r) {
    const en = getJno(r);
    beginEntry(r.date, T.manual, r.ref, r.tp || T.manual, r.doc, r.desc, en);
    r.lines.forEach(l => {
      if (!coaMap.has(l.acc)) nUnmapped++;
      addLine(l.acc, num(l.dr), num(l.cr), l.pc || '', l.pn || '', l.desc || r.desc);
    });
    endEntry();
  }

  recs.forEach(r => {
    if (r.kind === 'man') procManual(r);
    else if (r.kind === 'stock') procStock(r);
    else if (r.src === T.treas) procTreasury(r);
    else procParty(r);
  });
  meta.nextJno = nextJno;

  // ---- ledger balance helpers
  const bal = new Map();
  J.forEach(l => bal.set(l.acc, (bal.get(l.acc) || 0) + l.dr - l.cr));
  const ledgerBal = a => r2(bal.get(a) || 0);
  R.bal = bal; R.ledgerBal = ledgerBal;

  // ---- outputs
  R.parties = parties.map(p => ({
    code: p.code, name: p.name, type: p.type, phone: p.phone, address: p.address, opening: p.open, debit: r2(p.dr), credit: r2(p.cr),
    balance: r2(p.type === T.cust ? p.open + p.dr - p.cr : p.open + p.cr - p.dr), limit: p.limit, creditDays: num(((S.parties || []).find(x => x.code === p.code && x.type === p.type) || {}).creditDays), last: p.last, priceList: p.priceList, count: p.cnt, adhoc: p.adhoc
  }));
  R.warehouses = warehouses.map(w => ({ id: w.id, name: w.name, active: w.active !== false }));
  R.items = items.map(x => ({
    code: x.code, name: x.name, unit: x.unit, weight: x.weight, openQty: x.openQty, openCost: x.openCost, vat: x.vat >= 0 ? x.vat : '', eta: x.eta, etaType: x.etaType,
    bought: x.buyQ, sold: x.sellQ, onHand: r2(x.q * 1000) / 1000, avgCost: r2(avgCost(items.indexOf(x))), value: r2(x.v), reorder: x.reorder,
    lastBuy: x.lastBuy, lastSell: x.lastSell, cogs: r2(x.cogs), sales: r2(x.salesV), noCost: x.noCost,
    warehouses: Object.keys(x.warehouses).map(id => Object.assign({ id, name: (whBy.get(id) || {}).name || id }, x.warehouses[id]))
  }));
  R.docs = docs.map(d => {
    const s = d.s; const disc = s[4]; let typ, gross = 0, paid = 0;
    if (s[1] > 0) { typ = 'فاتورة بيع'; gross = s[1]; paid = s[3]; }
    else if (s[2] > 0) { typ = 'مرتجع مبيعات'; gross = s[2]; }
    else if (s[3] > 0) { typ = 'سند قبض'; gross = s[3]; paid = s[3]; }
    else if (s[5] > 0) { typ = 'فاتورة شراء'; gross = s[5]; }
    else if (s[6] > 0) { typ = 'مرتجع مشتريات'; gross = s[6]; }
    else if (s[7] > 0) { typ = 'سند دفع'; gross = s[7]; paid = s[7]; }
    else if (s[8] > 0) { typ = 'سند مصروف'; gross = s[8]; paid = s[8]; }
    else if (s[9] > 0) { typ = 'سند إيراد'; gross = s[9]; paid = s[9]; }
    else { typ = 'مستند'; gross = s[10] + disc; }
    return { doc: d.doc, date: d.date, type: typ, pc: d.pc, pn: d.pn, lines: d.lines, gross: r2(gross), discount: r2(disc), net: r2(gross - disc), paid: r2(paid), vat: r2(d.vat), cost: r2(d.cost), meth: d.meth, jno: d.en, src: d.src };
  });

  // ---- consistency checks
  const chk = (name, stat, diff, note) => R.checks.push({ name, stat, diff, note });
  const tol = (d, t) => (Math.abs(d) <= t ? 'ok' : 'bad');
  let sd = 0, sc = 0; J.forEach(l => { sd += l.dr; sc += l.cr; });
  chk('توازن دفتر القيود (مدين = دائن)', tol(sd - sc, 0.005), r2(sd - sc), 'مدين ' + fmt(sd) + ' / دائن ' + fmt(sc));
  let custSum = 0, suppSum = 0; R.parties.forEach(p => { if (p.type === T.cust) custSum += p.balance; else suppSum += p.balance; });
  const ar = ledgerBal(st.accAR);
  chk('العملاء: دفتر القيود مقابل أرصدة العملاء', tol(ar - custSum, 1), r2(ar - custSum), 'الدفتر ' + fmt(ar) + ' / العملاء ' + fmt(custSum));
  const ap = -ledgerBal(st.accAP);
  chk('الموردون: دفتر القيود مقابل أرصدة الموردين', tol(ap - suppSum, 1), r2(ap - suppSum), 'الدفتر ' + fmt(ap) + ' / الموردين ' + fmt(suppSum));
  const inv = ledgerBal(st.accInv); let ckInv = mUntracked; items.forEach(x => { ckInv += x.v; });
  chk('المخزون: الدفتر مقابل الأصناف', tol(inv - ckInv, 1), r2(inv - ckInv), 'الدفتر ' + fmt(inv) + ' / الأصناف ' + fmt(ckInv - mUntracked) + ' + بدون صنف ' + fmt(mUntracked));
  let nNC = 0, nNeg = 0; items.forEach(x => { if (x.noCost > 0) nNC++; if (x.q < -0.0005) nNeg++; });
  chk('أصناف اتباعت بدون تكلفة', nNC === 0 ? 'ok' : 'warn', nNC, 'اكتب تكلفة الوحدة الافتتاحية في بيانات الأصناف وكمّل المشتريات');
  chk('أصناف برصيد مخزون سالب', nNeg === 0 ? 'ok' : 'warn', nNeg, 'المبيعات أكبر من (الافتتاحي + المشتريات)');
  const sus = ledgerBal(st.accSusp);
  chk('الحساب المعلّق (يحتاج مراجعة)', Math.abs(sus) <= 0.005 ? 'ok' : 'warn', sus, 'رصيد الحساب ' + st.accSusp);
  chk('حركات نوعها أو طرفها غير معرّف', nUnmapped + nNoParty === 0 ? 'ok' : 'warn', nUnmapped + nNoParty, 'راجع ربط الحسابات وبيانات العملاء والموردين');
  chk('حركات بتاريخ قبل بداية الدفاتر', nPreStart === 0 ? 'ok' : 'warn', nPreStart, 'تاريخ البداية في الإعدادات');
  chk('قيود اتصحّح فرقها تلقائيًا', nImb === 0 ? 'ok' : 'bad', nImb, 'لو ظهر الرقم ده بلّغ عنه');
  chk('حركات الإجمالي فيها لا يساوي المدين/الدائن', nMis === 0 ? 'ok' : 'warn', nMis, 'راجع المبلغ المكتوب في الحركة مقابل المدين/الدائن');

  R.counts = { tx: recs.filter(r => r.kind === 'tx').length, manual: recs.filter(r => r.kind === 'man').length, lines: J.length, entries: new Set(J.map(l => l.en)).size, docs: docs.length, parties: parties.length, items: items.length, noCost: nNC, neg: nNeg };
  return R;
};

function fmt(x) { return (Math.round(x * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
E.fmt = fmt;

/* ---------- account balances for reports ---------- */
// movement of one account in [d1,d2] (ISO strings, '' = open)
E.sumAcc = function (J, acc, d1, d2) {
  let dr = 0, cr = 0;
  for (const l of J) if (l.acc === acc && (!d1 || l.date >= d1) && (!d2 || l.date <= d2)) { dr += l.dr; cr += l.cr; }
  return { dr, cr };
};

// trial balance rows: opening / movement / closing per account
E.trialBalance = function (S, R, d1, d2, onlyMoving) {
  const rows = new Map();
  (S.coa || []).forEach(a => rows.set(a.code, { code: a.code, name: a.name, type: a.type, group: a.group, od: 0, oc: 0, md: 0, mc: 0 }));
  for (const l of R.journal) {
    let r = rows.get(l.acc);
    if (!r) { r = { code: l.acc, name: l.accName || '(حساب غير معرّف)', type: '', group: '', od: 0, oc: 0, md: 0, mc: 0 }; rows.set(l.acc, r); }
    if (d1 && l.date < d1) { r.od += l.dr; r.oc += l.cr; }
    else if (!d2 || l.date <= d2) { r.md += l.dr; r.mc += l.cr; }
  }
  const out = [];
  rows.forEach(r => {
    const o = r2(r.od - r.oc), m1 = r2(r.md), m2 = r2(r.mc), c = r2(o + r.md - r.mc);
    r.openDr = o > 0 ? o : 0; r.openCr = o < 0 ? -o : 0;
    r.movDr = m1; r.movCr = m2;
    r.closeDr = c > 0 ? c : 0; r.closeCr = c < 0 ? -c : 0;
    if (!onlyMoving || r.openDr || r.openCr || r.movDr || r.movCr) out.push(r);
  });
  out.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return out;
};

/* ---------- income statement ---------- */
E.incomeStatement = function (S, R, d1, d2) {
  const st = S.settings;
  const typeOf = c => ((S.coa || []).find(a => a.code === c) || {}).type || '';
  const by = new Map();
  for (const l of R.journal) {
    if (l.typ === T.closing) continue;
    if (d1 && l.date < d1) continue;
    if (d2 && l.date > d2) continue;
    const t = typeOf(l.acc);
    if (t !== 'إيرادات' && t !== 'مصروفات') continue;
    by.set(l.acc, (by.get(l.acc) || 0) + l.cr - l.dr);
  }
  const rows = [];
  by.forEach((v, k) => rows.push({ code: k, name: ((S.coa || []).find(a => a.code === k) || {}).name || k, amount: r2(v), type: typeOf(k) }));
  rows.sort((a, b) => (a.code < b.code ? -1 : 1));
  return rows;
};

root.SiyadaEngine = E;
if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
