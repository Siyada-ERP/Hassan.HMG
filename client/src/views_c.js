/* =====================================================================
   SIYADA - data entry: invoices, vouchers, treasury vouchers, transfers, manual entries, document view/print
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP, E = root.SiyadaEngine, T = E.T, r2 = E.r2, num = E.num;
const { $, $$, esc, fmt, nc } = APP;
const R_ = APP.routes;
function dueDate(date, days) { if (!date || !(days > 0)) return ''; const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + days); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

const KINDS = {
  sale: { title: 'فاتورة بيع', k: 'inv', src: T.sales, lt: T.sale, side: 'dr', pty: T.cust, pre: 'FB-', pk: 'lastSell', pay: { tp: T.coll, side: 'cr', label: 'المحصّل الآن' }, disc: { tp: T.disc, side: 'cr' }, partyLbl: 'العميل' },
  salret: { title: 'مرتجع مبيعات', k: 'inv', src: T.sales, lt: T.ret, side: 'cr', pty: T.cust, pre: 'MR-', pk: 'lastSell', pay: { tp: T.pay, side: 'dr', label: 'المرتد نقدًا للعميل' }, disc: null, partyLbl: 'العميل' },
  purchase: { title: 'فاتورة شراء', k: 'inv', src: T.purch, lt: T.buy, side: 'cr', pty: T.supp, pre: 'PB-', pk: 'lastBuy', pay: { tp: T.pay, side: 'dr', label: 'المدفوع الآن' }, disc: { tp: T.disc, side: 'dr' }, partyLbl: 'المورد' },
  purret: { title: 'مرتجع مشتريات', k: 'inv', src: T.purch, lt: T.retBuy, side: 'dr', pty: T.supp, pre: 'PR-', pk: 'lastBuy', pay: null, disc: null, partyLbl: 'المورد' },
  receipt: { title: 'سند قبض', k: 'vch', src: T.sales, tp: T.coll, side: 'cr', pty: T.cust, pre: 'TS-', partyLbl: 'العميل', amtLbl: 'المبلغ المقبوض', methLbl: 'استلمنا في' },
  payment: { title: 'سند دفع', k: 'vch', src: T.purch, tp: T.pay, side: 'dr', pty: T.supp, pre: 'SD-', partyLbl: 'المورد', amtLbl: 'المبلغ المدفوع', methLbl: 'دفعنا من' },
  expense: { title: 'سند مصروف', k: 'trs', src: T.treas, tp: T.exp, pre: 'EXP-', catLbl: 'تصنيف المصروف', amtLbl: 'قيمة المصروف', methLbl: 'اتدفع من' },
  income: { title: 'سند إيراد', k: 'trs', src: T.treas, tp: T.inc, pre: 'INC-', catLbl: 'تصنيف الإيراد', amtLbl: 'قيمة الإيراد', methLbl: 'اتحصّل في' }
};
APP.KINDS = KINDS;
const PAD4 = { 'M-': 1, 'T-': 1, 'A-': 1, 'CL-': 1, 'SL-': 1 };
function nextDoc(pre) {
  const S = APP.S; let n = (S.meta.docCounters[pre] || 0);
  const used = new Set(S.transactions.map(t => t.doc)); S.manual.forEach(m => used.add(m.doc));
  let d; do { n++; d = pre + (PAD4[pre] ? String(n).padStart(4, '0') : n); } while (used.has(d)); return d;
}
function bumpDoc(doc) { const m = /^([A-Za-z]+-)(\d+)$/.exec(doc || ''); if (m) { const n = parseInt(m[2], 10), c = APP.S.meta.docCounters; if (!c[m[1]] || c[m[1]] < n) c[m[1]] = n; } }
const finAccs = () => APP.S.coa.filter(a => a.fin);
function methodOpts(sel) { const f = finAccs(); const def = sel || APP.S.settings.accCash; return f.map(a => '<option value="' + esc(a.code) + '"' + (a.code === def ? ' selected' : '') + '>' + esc(a.name + (a.accountNo ? ' — ' + a.accountNo : '')) + '</option>').join(''); }
function findParty(txt, type) {
  txt = (txt || '').trim(); if (!txt) return null; const code = txt.split(' - ')[0].trim();
  return APP.S.parties.find(p => p.type === type && p.code === code) || APP.S.parties.find(p => p.type === type && p.name === txt) || null;
}
function findItem(txt) { txt = (txt || '').trim(); if (!txt) return null; const code = txt.split(' - ')[0].trim(); return APP.S.items.find(x => x.code === code) || APP.S.items.find(x => x.name === txt) || null; }
function newTx(f) {
  const S = APP.S, m = S.meta; const id = APP.nextId('tx'); const row = (m.nextRow[f.source] = (m.nextRow[f.source] || 1)); m.nextRow[f.source] = row + 1;
  const dr = f.side === 'dr' ? r2(f.amount) : 0, cr = f.side === 'cr' ? r2(f.amount) : 0;
  return { id, date: f.date, source: f.source, row, doc: f.doc, type: f.type, partyType: f.partyType || '', partyCode: f.partyCode || '', partyName: f.partyName || '', itemCode: f.itemCode || '', itemName: f.itemName || '', qty: f.qty || 0, pieces: f.pieces || 0, price: f.price || 0, amount: dr + cr, debit: dr, credit: cr, acc: f.acc || '', desc: f.desc || '', jno: 0, seq: 1e7 + id };
}
APP.nextDoc = nextDoc; APP.bumpDoc = bumpDoc; APP.methodOpts = methodOpts;
const KIND_BY_ROUTE = Object.keys(KINDS);

/* ---------- reconstruct a saved document for editing ---------- */
function kindOfDoc(txs) {
  const has = (s, t) => txs.some(x => x.source === s && x.type === t);
  if (has(T.sales, T.sale)) return 'sale'; if (has(T.sales, T.ret)) return 'salret'; if (has(T.purch, T.buy)) return 'purchase'; if (has(T.purch, T.retBuy)) return 'purret';
  if (has(T.sales, T.coll) && txs.length === 1) return 'receipt'; if (has(T.purch, T.pay) && txs.length === 1) return 'payment';
  if (has(T.treas, T.exp) && txs.length === 1) return 'expense'; if (has(T.treas, T.inc) && txs.length === 1) return 'income';
  if (has(T.sales, T.coll)) return 'receipt'; if (has(T.purch, T.pay)) return 'payment';
  return null;
}
function loadDoc(kind, doc) {
  const K = KINDS[kind], txs = APP.S.transactions.filter(t => t.doc === doc); if (!txs.length) return null;
  const p = { edit: doc, date: txs[0].date, doc, lines: [], disc: 0, paid: 0, payAcc: '', desc: '' };
  txs.forEach(t => {
    if (K.k === 'inv') {
      if (t.type === K.lt) { p.lines.push({ item: t.itemCode ? t.itemCode + ' - ' + t.itemName : '', pcs: t.pieces, qty: t.qty, price: t.price }); p.party = t.partyCode + ' - ' + t.partyName; p.warehouseId = t.warehouseId; }
      else if (K.disc && t.type === K.disc.tp) p.disc += t.debit + t.credit;
      else if (K.pay && t.type === K.pay.tp) { p.paid += t.debit + t.credit; p.payAcc = t.acc; if (!p.party) p.party = t.partyCode + ' - ' + t.partyName; }
      if (t.desc) p.desc = t.desc;
    } else if (K.k === 'vch') { p.party = t.partyCode + ' - ' + t.partyName; p.amount = t.debit + t.credit; p.payAcc = t.acc; p.desc = t.desc; }
    else { p.cat = t.partyName; p.amount = t.debit + t.credit; p.payAcc = t.acc; p.desc = (t.desc || '').indexOf(t.partyName + ' - ') === 0 ? t.desc.slice(t.partyName.length + 3) : (t.desc === t.partyName ? '' : t.desc); }
  });
  return p;
}

/* ---------- invoice form ---------- */
function partyDL(type) { return '<datalist id="dlParty">' + APP.S.parties.filter(p => p.type === type).map(p => '<option value="' + esc(APP.pLabel(p)) + '">').join('') + '</datalist>'; }
function itemDL() { return '<datalist id="dlItem">' + APP.S.items.map(x => '<option value="' + esc(APP.iLabel(x)) + '">').join('') + '</datalist>'; }
function lineRow(K, l, i) {
  return '<tr class="ln"><td class="ix">' + (i + 1) + '</td><td><input class="li" list="dlItem" data-on="line" value="' + esc(l.item || '') + '" placeholder="كود أو اسم الصنف" autocomplete="off"><div class="hint lh"></div></td><td style="width:110px"><input class="n lq" data-on="line" inputmode="decimal" value="' + esc(l.qty || '') + '" placeholder="الكمية"></td><td style="width:90px"><input class="n lc" data-on="line" inputmode="numeric" value="' + esc(l.pcs || '') + '" placeholder="العدد" title="العدد = الكمية ÷ وزن الوحدة"></td><td style="width:120px"><input class="n lp" data-on="line" inputmode="decimal" value="' + esc(l.price || '') + '" placeholder="السعر لكل وحدة كمية"></td><td style="width:130px" class="tot lt"></td><td style="width:36px"><button class="btn s ghost" data-act="lnDel" title="حذف السطر" tabindex="-1">✕</button></td></tr>';
}
function invoiceHtml(kind, arg) {
  const K = KINDS[kind]; const pre = arg ? loadDoc(kind, arg) : null; if (arg && !pre) return '<div class="sheet"><p>المستند ' + esc(arg) + ' مش موجود.</p></div>';
  const p = pre || { date: APP.UI.keepDate || APP.today(), doc: nextDoc(K.pre), lines: [{}, {}, {}], disc: '', paid: '', payAcc: '', desc: '', warehouseId: APP.S.settings.defaultWarehouseId };
  if (p.lines.length < 1) p.lines.push({});
  let h = '<div class="sheet doc" id="frm" data-kind="' + kind + '" data-edit="' + esc(p.edit || '') + '">' + APP.sheetHead(K.title + (p.edit ? ' (تعديل)' : ''), p.doc) + partyDL(K.pty) + itemDL() +
    '<div class="frow"><label class="f">التاريخ <span class="req">*</span><input class="in" type="date" id="fD" value="' + esc(p.date) + '"></label><label class="f">رقم المستند<input class="in" id="fNo" value="' + esc(p.doc) + '"></label>' +
    (APP.S.settings.warehouseSelection !== false ? '<label class="f">المخزن<select class="in" id="fWarehouse">' + APP.S.warehouses.filter(w => w.active !== false).map(w => '<option value="' + esc(w.id) + '"' + (w.id === (p.warehouseId || APP.S.settings.defaultWarehouseId) ? ' selected' : '') + '>' + esc(w.name) + '</option>').join('') + '</select></label>' : '') +
    '<label class="f" style="grid-column:span 2">' + K.partyLbl + ' <span class="req">*</span><input class="in" id="fP" list="dlParty" data-on="party" value="' + esc(p.party || '') + '" placeholder="اكتب كود أو اسم ' + K.partyLbl + '" autocomplete="off"><span class="hint" id="fPh"></span></label></div>' +
    '<table class="lines"><thead><tr><th></th><th>الصنف</th><th>الكمية</th><th>العدد</th><th>السعر/الكمية</th><th>الإجمالي</th><th></th></tr></thead><tbody id="lnBody">' + p.lines.map((l, i) => lineRow(K, l, i)).join('') + '</tbody></table>' +
    '<button class="btn s" data-act="lnAdd">+ سطر</button><div class="sumbox">' +
    '<div class="r"><span>إجمالي العدد</span><b class="n" id="sPcs">0</b></div><div class="r"><span>إجمالي الأصناف</span><b class="n" id="sGross">0.00</b></div>' +
    (K.disc ? '<div class="r"><span>خصم</span><input class="n" id="fDisc" data-on="line" inputmode="decimal" value="' + esc(p.disc || '') + '"></div>' : '') +
    '<div class="r big"><span>الصافي</span><b class="n" id="sNet">0.00</b></div>' +
    (K.pay ? '<div class="r"><span>الرصيد السابق</span><b class="n" id="sPrev">0.00</b></div><div class="r"><span>' + K.pay.label + '</span><input class="n" id="fPaid" data-on="line" inputmode="decimal" value="' + esc(p.paid || '') + '"></div><div class="r" id="rMeth"><span>طريقة الدفع</span><select class="in" id="fAcc" style="width:160px">' + methodOpts(p.payAcc) + '</select></div><div class="r"><span>الرصيد بعد الفاتورة</span><b class="n" id="sRest">0.00</b></div>' : '') +
    '</div><div class="frow c2" style="margin-top:12px"><label class="f">ملاحظات<input class="in" id="fDesc" value="' + esc(p.desc || '') + '"></label></div><div id="fErr" class="err"></div>' +
    '<div class="toolbar"><button class="btn primary" data-act="saveDoc">حفظ</button><button class="btn" data-act="saveDocNew">حفظ وإضافة جديد</button><a class="btn" href="#/' + (p.edit ? 'doc/' + encodeURIComponent(p.edit) : 'dashboard') + '">إلغاء</a></div></div>';
  return h;
}
function recalcInv() {
  const frm = $('#frm'); if (!frm) return; const K = KINDS[frm.dataset.kind]; let gross = 0, pcs = 0;
  $$('#lnBody tr').forEach(tr => {
    const q = parseFloat($('.lq', tr).value) || 0, p = parseFloat($('.lp', tr).value) || 0, t = r2(q * p); gross += t; $('.lt', tr).textContent = t ? fmt(t) : '';
    const x = findItem($('.li', tr).value), lh = $('.lh', tr), pc = $('.lc', tr);
    if (x) { const r = APP.iBy.get(x.code), w = num(x.weight); const bal = r ? r.onHand : 0; const out = K.lt === T.sale || K.lt === T.retBuy; if (w > 0) { pc.readOnly = true; pc.title = 'العدد = الكمية ÷ وزن الوحدة'; pc.value = q > 0 ? r3(q / w) : ''; } else { pc.readOnly = false; } lh.innerHTML = 'الرصيد: <span class="n' + (out && q > bal ? ' neg' : '') + '">' + APP.fmtq(bal) + '</span> ' + esc(x.unit || '') + (out && q > bal ? ' — الكمية أكبر من الرصيد' : '') + (w > 0 ? ' — وزن الوحدة <span class="n">' + APP.fmtq(w) + '</span>' : ''); } else { pc.readOnly = false; lh.textContent = ''; }
    pcs += parseFloat(pc.value) || 0;
  });
  const disc = K.disc ? (parseFloat($('#fDisc').value) || 0) : 0, net = r2(gross - disc);
  $('#sPcs').textContent = APP.fmtq(pcs); $('#sGross').textContent = fmt(gross); $('#sNet').textContent = fmt(net);
  if (K.pay) { const p = findParty($('#fP').value, K.pty), r = p && APP.pBy.get(p.code); let prev = r ? r.balance : 0; const edit = frm.dataset.edit; if (edit && p) prev -= APP.S.transactions.filter(t => t.doc === edit && t.partyCode === p.code).reduce((s, t) => s + (K.lt === T.sale ? t.debit - t.credit : t.credit - t.debit), 0); const paid = parseFloat($('#fPaid').value) || 0; $('#sPrev').textContent = fmt(prev); $('#sRest').textContent = fmt(K.lt === T.sale ? prev + net - paid : prev - net + paid); $('#rMeth').style.opacity = paid > 0 ? 1 : .45; }
}
/* العدد = الكمية ÷ وزن الصنف (لو الصنف له وزن). */
const r3 = v => Math.round(v * 1000) / 1000;
function syncPcs(tr, t) {
  const x = findItem($('.li', tr).value), w = x ? num(x.weight) : 0; if (!(w > 0)) return;
  const q = $('.lq', tr), c = $('.lc', tr);
  if (t === q) { delete q.dataset.auto; const v = parseFloat(q.value); if (v > 0) { c.value = r3(v / w); c.dataset.auto = '1'; } else if (!q.value.trim()) { c.value = ''; delete c.dataset.auto; } }
  else if (t.classList.contains('li')) { const v = parseFloat(q.value); if (v > 0) { c.value = r3(v / w); c.dataset.auto = '1'; } }
}
APP.ons.line = (t) => {
  const tr0 = t.closest('tr'); if (tr0 && (t.classList.contains('lq') || t.classList.contains('lc') || t.classList.contains('li'))) syncPcs(tr0, t);
  if (t.classList.contains('li')) { const x = findItem(t.value); const tr = t.closest('tr'); const pr = $('.lp', tr); if (x && !pr.value) { const K = KINDS[$('#frm').dataset.kind]; const r = APP.iBy.get(x.code); let v = 0; if (K.pk === 'lastSell') { const par = findParty($('#fP').value, K.pty); if (par && par.priceList) v = APP.priceFor(par.priceList, x.code); } if (!v) v = r ? (r[K.pk] || r.lastSell || r.lastBuy) : 0; if (v) pr.value = v; if (!$('.lq', tr).value) $('.lq', tr).value = ''; } }
  recalcInv();
};
APP.ons.party = (t) => {
  const frm = $('#frm'); const K = KINDS[frm.dataset.kind]; const p = findParty(t.value, K.pty); const el = $('#fPh');
  if (!p) { el.textContent = ''; return; } const r = APP.pBy.get(p.code);
  el.innerHTML = 'الرصيد الحالي: <span class="n' + (r.balance < 0 ? ' neg' : '') + '">' + fmt(r.balance) + '</span>' + (K.pty === T.cust ? ' (مدين لنا)' : ' (مستحق له)') + (p.limit ? ' — الحد الائتماني <span class="n">' + fmt(p.limit) + '</span>' : '');
};
APP.acts.lnAdd = () => { const tb = $('#lnBody'); const K = KINDS[$('#frm').dataset.kind]; tb.insertAdjacentHTML('beforeend', lineRow(K, {}, tb.children.length)); $('.li', tb.lastElementChild).focus(); };
APP.acts.lnDel = b => { const tb = $('#lnBody'); if (tb.children.length <= 1) { $$('input', b.closest('tr')).forEach(i => { i.value = ''; }); } else b.closest('tr').remove(); $$('#lnBody .ix').forEach((e, i) => { e.textContent = i + 1; }); recalcInv(); };

function saveInvoice(again) {
  const frm = $('#frm'), kind = frm.dataset.kind, K = KINDS[kind], edit = frm.dataset.edit, er = $('#fErr'); er.textContent = '';
  const date = $('#fD').value; if (!date) { er.textContent = 'اكتب التاريخ.'; return; }
  const p = findParty($('#fP').value, K.pty); if (!p) { er.textContent = 'اختار ' + K.partyLbl + ' من القايمة (أو سجّله الأول من شاشة ' + (K.pty === T.cust ? 'العملاء' : 'الموردين') + ').'; $('#fP').focus(); return; }
  const lines = []; let bad = '';
  $$('#lnBody tr').forEach((tr, i) => {
    const iv = $('.li', tr).value.trim(), q = parseFloat($('.lq', tr).value), pr = parseFloat($('.lp', tr).value), pc = parseFloat($('.lc', tr).value);
    if (!iv && isNaN(q) && isNaN(pr) && isNaN(pc)) return;
    const x = findItem(iv); if (!x) { bad = 'السطر ' + (i + 1) + ': الصنف مش موجود في بيانات الأصناف.'; return; }
    if (!(q > 0)) { bad = 'السطر ' + (i + 1) + ': اكتب كمية أكبر من صفر.'; return; } if (!(pr > 0)) { bad = 'السطر ' + (i + 1) + ': اكتب سعر أكبر من صفر.'; return; }
    if (!isNaN(pc) && pc < 0) { bad = 'السطر ' + (i + 1) + ': العدد لازم يكون رقم موجب.'; return; }
    lines.push({ x, q, pr, pc: isNaN(pc) ? 0 : pc, amt: r2(q * pr) });
  });
  if (bad) { er.textContent = bad; return; } if (!lines.length) { er.textContent = 'ضيف صنف واحد على الأقل.'; return; }
  const gross = r2(lines.reduce((s, l) => s + l.amt, 0)); const disc = K.disc ? (parseFloat($('#fDisc').value) || 0) : 0; const paid = K.pay ? (parseFloat($('#fPaid').value) || 0) : 0;
  if (disc < 0 || paid < 0) { er.textContent = 'الخصم والمدفوع لازم يكونوا أرقام موجبة.'; return; } if (disc > gross) { er.textContent = 'الخصم أكبر من إجمالي الأصناف.'; return; }
  const net = r2(gross - disc); if (paid > net + 0.004) { er.textContent = 'المدفوع أكبر من صافي المستند.'; return; }
  const doc = $('#fNo').value.trim(); if (!doc) { er.textContent = 'اكتب رقم المستند.'; return; }
  if (doc !== edit && (APP.S.transactions.some(t => t.doc === doc) || APP.S.manual.some(m => m.doc === doc))) { er.textContent = 'رقم المستند ده مستخدم قبل كده.'; return; }
  if (!APP.guard(date)) return; if (edit) { const old = APP.S.transactions.filter(t => t.doc === edit); if (old.some(t => !APP.guard(t.date))) return; }
  const finish = () => {
    if (edit) APP.S.transactions = APP.S.transactions.filter(t => t.doc !== edit);
    const warehouseId = $('#fWarehouse') ? $('#fWarehouse').value : APP.S.settings.defaultWarehouseId;
    const base = { date, source: K.src, doc, partyType: K.pty, partyCode: p.code, partyName: p.name, warehouseId }; const note = $('#fDesc').value.trim(); const out = [];
    lines.forEach(l => out.push(newTx(Object.assign({}, base, { type: K.lt, side: K.side, amount: l.amt, itemCode: l.x.code, itemName: l.x.name, qty: l.q, pieces: l.pc, price: l.pr, desc: note }))));
    if (disc > 0) out.push(newTx(Object.assign({}, base, { type: K.disc.tp, side: K.disc.side, amount: disc, desc: note })));
    if (paid > 0) out.push(newTx(Object.assign({}, base, { type: K.pay.tp, side: K.pay.side, amount: paid, acc: $('#fAcc').value, desc: note })));
    out.forEach(t => APP.S.transactions.push(t)); bumpDoc(doc);
    APP.UI.keepDate = date;
    if (APP.commit((edit ? 'تم تعديل ' : 'تم حفظ ') + K.title + ' ' + doc + '.', { norender: true })) { if (again && !edit) { APP.go(kind); APP.rerender(); } else APP.go('doc', doc); }
  };
  if (kind === 'sale' && p.limit > 0) { const r = APP.pBy.get(p.code); let prev = r ? r.balance : 0; if (edit) prev -= APP.S.transactions.filter(t => t.doc === edit && t.partyCode === p.code).reduce((s, t) => s + t.debit - t.credit, 0); const after = prev + net - paid; if (after > p.limit + 0.004) { APP.confirm('الحد الائتماني للعميل ' + p.name + ' هو ' + fmt(p.limit) + '، ورصيده بعد الفاتورة هيبقى ' + fmt(after) + '. تكمل الحفظ؟', 'حفظ').then(ok => { if (ok) finish(); }); return; } }
  finish();
}

/* ---------- voucher form (receipt / payment) ---------- */
function voucherHtml(kind, arg) {
  const K = KINDS[kind]; const pre = arg ? loadDoc(kind, arg) : null; if (arg && !pre) return '<div class="sheet"><p>المستند ' + esc(arg) + ' مش موجود.</p></div>';
  const p = pre || { date: APP.UI.keepDate || APP.today(), doc: nextDoc(K.pre), party: APP.UI.prefParty || '', amount: '', payAcc: '', desc: '' }; APP.UI.prefParty = '';
  return '<div class="sheet doc" id="frm" data-kind="' + kind + '" data-edit="' + esc(p.edit || '') + '">' + APP.sheetHead(K.title + (p.edit ? ' (تعديل)' : ''), p.doc) + partyDL(K.pty) +
    '<div class="frow"><label class="f">التاريخ <span class="req">*</span><input class="in" type="date" id="fD" value="' + esc(p.date) + '"></label><label class="f">رقم السند<input class="in" id="fNo" value="' + esc(p.doc) + '"></label></div>' +
    '<div class="frow c2"><label class="f">' + K.partyLbl + ' <span class="req">*</span><input class="in" id="fP" list="dlParty" data-on="party" value="' + esc(p.party || '') + '" placeholder="اكتب كود أو اسم ' + K.partyLbl + '" autocomplete="off"><span class="hint" id="fPh"></span></label><label class="f">' + K.amtLbl + ' <span class="req">*</span><input class="in n" id="fAmt" inputmode="decimal" value="' + esc(p.amount || '') + '"></label></div>' +
    '<div class="frow c2"><label class="f">' + K.methLbl + '<select class="in" id="fAcc">' + methodOpts(p.payAcc) + '</select></label><label class="f">البيان<input class="in" id="fDesc" value="' + esc(p.desc || '') + '"></label></div><div id="fErr" class="err"></div>' +
    '<div class="toolbar"><button class="btn primary" data-act="saveDoc">حفظ</button><button class="btn" data-act="saveDocNew">حفظ وإضافة جديد</button><a class="btn" href="#/' + (p.edit ? 'doc/' + encodeURIComponent(p.edit) : 'dashboard') + '">إلغاء</a></div></div>';
}
function saveVoucher(again) {
  const frm = $('#frm'), kind = frm.dataset.kind, K = KINDS[kind], edit = frm.dataset.edit, er = $('#fErr'); er.textContent = '';
  const date = $('#fD').value; if (!date) { er.textContent = 'اكتب التاريخ.'; return; }
  const p = findParty($('#fP').value, K.pty); if (!p) { er.textContent = 'اختار ' + K.partyLbl + ' من القايمة.'; return; }
  const amt = parseFloat($('#fAmt').value); if (!(amt > 0)) { er.textContent = 'اكتب مبلغ أكبر من صفر.'; return; }
  const doc = $('#fNo').value.trim(); if (!doc) { er.textContent = 'اكتب رقم السند.'; return; }
  if (doc !== edit && (APP.S.transactions.some(t => t.doc === doc) || APP.S.manual.some(m => m.doc === doc))) { er.textContent = 'رقم السند ده مستخدم قبل كده.'; return; }
  if (!APP.guard(date)) return; if (edit && APP.S.transactions.filter(t => t.doc === edit).some(t => !APP.guard(t.date))) return;
  if (edit) APP.S.transactions = APP.S.transactions.filter(t => t.doc !== edit);
  APP.S.transactions.push(newTx({ date, source: K.src, doc, type: K.tp, side: K.side, amount: amt, partyType: K.pty, partyCode: p.code, partyName: p.name, acc: $('#fAcc').value, desc: $('#fDesc').value.trim() })); bumpDoc(doc); APP.UI.keepDate = date;
  if (APP.commit((edit ? 'تم تعديل ' : 'تم حفظ ') + K.title + ' ' + doc + '.', { norender: true })) { if (again && !edit) { APP.go(kind); APP.rerender(); } else APP.go('doc', doc); }
}

/* ---------- treasury voucher (expense / income) ---------- */
function treasuryHtml(kind, arg) {
  const K = KINDS[kind]; const pre = arg ? loadDoc(kind, arg) : null; if (arg && !pre) return '<div class="sheet"><p>المستند ' + esc(arg) + ' مش موجود.</p></div>';
  const p = pre || { date: APP.UI.keepDate || APP.today(), doc: nextDoc(K.pre), cat: '', amount: '', payAcc: '', desc: '' };
  const cats = kind === 'expense' ? APP.S.mapping.expenses : APP.S.mapping.incomes;
  return '<div class="sheet doc" id="frm" data-kind="' + kind + '" data-edit="' + esc(p.edit || '') + '">' + APP.sheetHead(K.title + (p.edit ? ' (تعديل)' : ''), p.doc) +
    '<div class="frow"><label class="f">التاريخ <span class="req">*</span><input class="in" type="date" id="fD" value="' + esc(p.date) + '"></label><label class="f">رقم السند<input class="in" id="fNo" value="' + esc(p.doc) + '"></label></div>' +
    '<div class="frow c2"><label class="f">' + K.catLbl + ' <span class="req">*</span><select class="in" id="fCat"><option value="">— اختار —</option>' + cats.map(c => '<option' + (c.key === p.cat ? ' selected' : '') + '>' + esc(c.key) + '</option>').join('') + '</select><span class="hint">محتاج تصنيف جديد؟ ضيفه من <a href="#/mapping">ربط الحسابات</a>.</span></label><label class="f">' + K.amtLbl + ' <span class="req">*</span><input class="in n" id="fAmt" inputmode="decimal" value="' + esc(p.amount || '') + '"></label></div>' +
    '<div class="frow c2"><label class="f">' + K.methLbl + '<select class="in" id="fAcc">' + methodOpts(p.payAcc) + '</select></label><label class="f">البيان<input class="in" id="fDesc" value="' + esc(p.desc || '') + '"></label></div><div id="fErr" class="err"></div>' +
    '<div class="toolbar"><button class="btn primary" data-act="saveDoc">حفظ</button><button class="btn" data-act="saveDocNew">حفظ وإضافة جديد</button><a class="btn" href="#/' + (p.edit ? 'doc/' + encodeURIComponent(p.edit) : 'dashboard') + '">إلغاء</a></div></div>';
}
function saveTreasury(again) {
  const frm = $('#frm'), kind = frm.dataset.kind, K = KINDS[kind], edit = frm.dataset.edit, er = $('#fErr'); er.textContent = '';
  const date = $('#fD').value; if (!date) { er.textContent = 'اكتب التاريخ.'; return; } const cat = $('#fCat').value; if (!cat) { er.textContent = 'اختار التصنيف.'; return; }
  const amt = parseFloat($('#fAmt').value); if (!(amt > 0)) { er.textContent = 'اكتب مبلغ أكبر من صفر.'; return; }
  const doc = $('#fNo').value.trim(); if (!doc) { er.textContent = 'اكتب رقم السند.'; return; }
  if (doc !== edit && (APP.S.transactions.some(t => t.doc === doc) || APP.S.manual.some(m => m.doc === doc))) { er.textContent = 'رقم السند ده مستخدم قبل كده.'; return; }
  if (!APP.guard(date)) return; if (edit && APP.S.transactions.filter(t => t.doc === edit).some(t => !APP.guard(t.date))) return;
  if (edit) APP.S.transactions = APP.S.transactions.filter(t => t.doc !== edit);
  const note = $('#fDesc').value.trim();
  APP.S.transactions.push(newTx({ date, source: T.treas, doc, type: K.tp, side: kind === 'expense' ? 'cr' : 'dr', amount: amt, partyType: T.party0, partyName: cat, acc: $('#fAcc').value, desc: note ? cat + ' - ' + note : cat })); bumpDoc(doc); APP.UI.keepDate = date;
  if (APP.commit((edit ? 'تم تعديل ' : 'تم حفظ ') + K.title + ' ' + doc + '.', { norender: true })) { if (again && !edit) { APP.go(kind); APP.rerender(); } else APP.go('doc', doc); }
}
APP.acts.saveDoc = () => { const k = KINDS[$('#frm').dataset.kind].k; (k === 'inv' ? saveInvoice : k === 'vch' ? saveVoucher : saveTreasury)(false); };
APP.acts.saveDocNew = () => { const k = KINDS[$('#frm').dataset.kind].k; (k === 'inv' ? saveInvoice : k === 'vch' ? saveVoucher : saveTreasury)(true); };

KIND_BY_ROUTE.forEach(kind => {
  const K = KINDS[kind];
  R_[kind] = { title: arg => K.title + (arg ? ' (تعديل)' : ''), html: arg => (K.k === 'inv' ? invoiceHtml : K.k === 'vch' ? voucherHtml : treasuryHtml)(kind, arg), after: () => { if (K.k === 'inv') recalcInv(); const f = $('#fP') || $('#fCat'); if (f && !f.value) f.focus(); if ($('#fP') && $('#fP').value) APP.ons.party($('#fP')); } };
});

/* ---------- transfer between financial accounts ---------- */
R_.transfer = {
  title: 'تحويل بين الحسابات',
  html() {
    const p = { date: APP.UI.keepDate || APP.today(), doc: nextDoc('T-') };
    return '<div class="sheet doc" id="frm">' + APP.sheetHead('تحويل بين الحسابات', p.doc) + '<div class="frow"><label class="f">التاريخ <span class="req">*</span><input class="in" type="date" id="fD" value="' + p.date + '"></label><label class="f">رقم المستند<input class="in" id="fNo" value="' + p.doc + '"></label></div>' +
      '<div class="frow"><label class="f">من حساب<select class="in" id="tFrom">' + methodOpts() + '</select></label><label class="f">إلى حساب<select class="in" id="tTo">' + methodOpts(finAccs()[1] ? finAccs()[1].code : '') + '</select></label><label class="f">المبلغ <span class="req">*</span><input class="in n" id="tAmt" inputmode="decimal"></label></div>' +
      '<div class="frow c2"><label class="f">البيان<input class="in" id="tDesc" placeholder="مثال: إيداع في البنك"></label></div><div id="fErr" class="err"></div><div class="toolbar"><button class="btn primary" data-act="saveTransfer">حفظ التحويل</button></div></div>';
  }
};
APP.acts.saveTransfer = () => {
  const er = $('#fErr'); er.textContent = ''; const date = $('#fD').value, from = $('#tFrom').value, to = $('#tTo').value, amt = parseFloat($('#tAmt').value), doc = $('#fNo').value.trim();
  if (!date) { er.textContent = 'اكتب التاريخ.'; return; } if (!from || !to || from === to) { er.textContent = 'اختار حسابين مختلفين.'; return; } if (!(amt > 0)) { er.textContent = 'اكتب مبلغ أكبر من صفر.'; return; }
  if (!doc) { er.textContent = 'اكتب رقم المستند.'; return; } if (APP.S.transactions.some(t => t.doc === doc) || APP.S.manual.some(m => m.doc === doc)) { er.textContent = 'رقم المستند مستخدم قبل كده.'; return; }
  if (!APP.guard(date)) return; const d = $('#tDesc').value.trim() || 'تحويل بين الحسابات';
  APP.S.manual.push({ jno: 0, date, type: 'تحويل', doc, desc: d, seq: 4e6 + APP.nextId('man'), lines: [{ acc: to, dr: amt, cr: 0, desc: d }, { acc: from, dr: 0, cr: amt, desc: d }] }); bumpDoc(doc); APP.UI.keepDate = date;
  APP.commit('تم حفظ التحويل ' + doc + '.', { norender: true }); APP.go('journal');
};

R_.stocktransfer = {
  title: 'تحويل بين المخازن',
  html() {
    const p = { date: APP.UI.keepDate || APP.today(), doc: nextDoc('ST-') };
    const wh = APP.S.warehouses.filter(w => w.active !== false);
    return '<div class="sheet doc" id="frm">' + APP.sheetHead('تحويل بين المخازن', p.doc) + itemDL() +
      '<div class="frow"><label class="f">التاريخ <span class="req">*</span><input class="in" type="date" id="stDate" value="' + p.date + '"></label><label class="f">رقم المستند<input class="in" id="stDoc" value="' + p.doc + '"></label></div>' +
      '<div class="frow"><label class="f">من مخزن<select class="in" id="stFrom">' + wh.map(w => '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>').join('') + '</select></label><label class="f">إلى مخزن<select class="in" id="stTo">' + wh.map((w, i) => '<option value="' + esc(w.id) + '"' + (i === 1 ? ' selected' : '') + '>' + esc(w.name) + '</option>').join('') + '</select></label></div>' +
      '<div class="frow"><label class="f">الصنف<input class="in" id="stItem" list="dlItem" placeholder="كود أو اسم الصنف"></label><label class="f">الكمية<input class="in n" id="stQty" inputmode="decimal"></label></div><label class="f">البيان<input class="in" id="stDesc"></label><div id="stErr" class="err"></div><div class="toolbar"><button class="btn primary" data-act="saveStockTransfer">حفظ التحويل</button></div></div>';
  }
};
APP.acts.saveStockTransfer = () => {
  const er = $('#stErr'), date = $('#stDate').value, doc = $('#stDoc').value.trim(), from = $('#stFrom').value, to = $('#stTo').value, item = findItem($('#stItem').value), qty = parseFloat($('#stQty').value);
  er.textContent = ''; if (!date || !doc || !item || !(qty > 0) || from === to) { er.textContent = 'اكتب البيانات واختر صنفًا ومخزنين مختلفين.'; return; }
  if (APP.S.transactions.some(t => t.doc === doc) || APP.S.manual.some(m => m.doc === doc) || APP.S.stockTransfers.some(t => t.doc === doc)) { er.textContent = 'رقم المستند مستخدم قبل كده.'; return; }
  if (!APP.guard(date)) return;
  APP.S.stockTransfers.push({ id: APP.nextId('tx'), date, doc, itemCode: item.code, itemName: item.name, qty, fromWarehouseId: from, toWarehouseId: to, desc: $('#stDesc').value.trim(), seq: Date.now() });
  APP.commit('تم حفظ التحويل ' + doc + '.', { norender: true }); APP.go('stockmoves');
};

/* ---------- manual journal entry ---------- */
function manLine(l) {
  return '<tr class="ml"><td><input class="ma" list="dlAcc" data-on="man" value="' + esc(l.acc ? l.acc + ' - ' + APP.accName(l.acc) : '') + '" placeholder="كود أو اسم الحساب" autocomplete="off"></td><td style="width:140px"><input class="n md" data-on="man" inputmode="decimal" value="' + esc(l.dr || '') + '"></td><td style="width:140px"><input class="n mc" data-on="man" inputmode="decimal" value="' + esc(l.cr || '') + '"></td><td><input class="mn" value="' + esc(l.desc || '') + '" placeholder="بيان السطر (اختياري)"></td><td style="width:36px"><button class="btn s ghost" data-act="mlDel" tabindex="-1">✕</button></td></tr>';
}
R_.manual = {
  title: arg => (arg ? 'تعديل قيد يدوي' : 'قيد يدوي'),
  html(arg) {
    let m = null; if (arg) { m = APP.S.manual.find(x => String(x.jno) === arg); if (!m) return '<div class="sheet"><p>القيد ده مش موجود أو مش يدوي.</p></div>'; if (m.emp) return '<div class="sheet"><p>القيد ده تابع لشيتات الموظفين — عدّله من هناك علشان يفضل مربوط بالموظف.</p><a class="btn primary" href="#/' + (m.kind === 'pay' ? 'payroll/' + encodeURIComponent(m.pay.per) : 'empadv/' + encodeURIComponent(m.doc)) + '">فتح الشاشة</a></div>'; }
    const p = m ? { date: m.date, type: m.type, doc: m.doc, desc: m.desc, lines: m.lines.map(l => Object.assign({}, l)) } : { date: APP.UI.keepDate || APP.today(), type: T.manual, doc: nextDoc('M-'), desc: '', lines: [{}, {}] };
    return '<div class="sheet doc" id="frm" data-edit="' + (m ? m.jno : '') + '">' + APP.sheetHead('قيد يومية يدوي' + (m ? ' (تعديل)' : ''), p.doc) + '<datalist id="dlAcc">' + APP.S.coa.map(a => '<option value="' + esc(a.code + ' - ' + a.name) + '">').join('') + '</datalist>' +
      '<div class="frow"><label class="f">التاريخ <span class="req">*</span><input class="in" type="date" id="fD" value="' + esc(p.date) + '"></label><label class="f">رقم المستند<input class="in" id="fNo" value="' + esc(p.doc) + '"></label><label class="f">نوع القيد<select class="in" id="mType">' + ['يدوي', 'تسوية', 'إقفال', 'تحويل'].map(x => '<option' + (x === p.type ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label></div>' +
      '<div class="frow c2"><label class="f">البيان <span class="req">*</span><input class="in" id="fDesc" value="' + esc(p.desc) + '"></label></div>' +
      '<table class="lines"><thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th><th>بيان السطر</th><th></th></tr></thead><tbody id="mBody">' + p.lines.map(manLine).join('') + '</tbody></table><button class="btn s" data-act="mlAdd">+ سطر</button>' +
      '<div class="bal" id="mBal"></div><div id="fErr" class="err"></div><div class="toolbar"><button class="btn primary" data-act="saveManual">حفظ القيد</button><a class="btn" href="#/journal">إلغاء</a></div></div>';
  },
  after() { APP.ons.man(); }
};
APP.ons.man = () => {
  let d = 0, c = 0; $$('#mBody tr').forEach(tr => { d += parseFloat($('.md', tr).value) || 0; c += parseFloat($('.mc', tr).value) || 0; });
  const diff = r2(d - c), el = $('#mBal'); if (!el) return;
  el.className = 'bal ' + (Math.abs(diff) < 0.005 && d > 0 ? 'ok' : 'bad');
  el.innerHTML = 'مدين <span class="n">' + fmt(d) + '</span> — دائن <span class="n">' + fmt(c) + '</span> — ' + (Math.abs(diff) < 0.005 ? (d > 0 ? 'القيد متوازن ✔' : 'اكتب مبالغ القيد') : 'الفرق <span class="n">' + fmt(diff) + '</span> (القيد لازم يتوازن)');
};
APP.acts.mlAdd = () => { const tb = $('#mBody'); tb.insertAdjacentHTML('beforeend', manLine({})); $('.ma', tb.lastElementChild).focus(); };
APP.acts.mlDel = b => { const tb = $('#mBody'); if (tb.children.length <= 2) { $$('input', b.closest('tr')).forEach(i => { i.value = ''; }); } else b.closest('tr').remove(); APP.ons.man(); };
APP.acts.saveManual = () => {
  const er = $('#fErr'); er.textContent = ''; const edit = $('#frm').dataset.edit; const date = $('#fD').value, doc = $('#fNo').value.trim(), desc = $('#fDesc').value.trim(), type = $('#mType').value;
  if (!date) { er.textContent = 'اكتب التاريخ.'; return; } if (!desc) { er.textContent = 'اكتب بيان القيد.'; return; } if (!doc) { er.textContent = 'اكتب رقم المستند.'; return; }
  const lines = []; let bad = '', d = 0, c = 0;
  $$('#mBody tr').forEach((tr, i) => {
    const av = $('.ma', tr).value.trim(), dr = parseFloat($('.md', tr).value) || 0, cr = parseFloat($('.mc', tr).value) || 0; if (!av && !dr && !cr) return;
    const code = av.split(' - ')[0].trim(); const a = APP.coaBy.get(code) || APP.S.coa.find(x => x.name === av); if (!a) { bad = 'السطر ' + (i + 1) + ': الحساب مش موجود في دليل الحسابات.'; return; }
    if (dr < 0 || cr < 0) { bad = 'السطر ' + (i + 1) + ': المبالغ لازم تكون موجبة.'; return; } if (dr > 0 && cr > 0) { bad = 'السطر ' + (i + 1) + ': اكتب مدين أو دائن مش الاتنين.'; return; }
    d += dr; c += cr; lines.push({ acc: a.code, dr, cr, pc: '', pn: '', desc: $('.mn', tr).value.trim() });
  });
  if (bad) { er.textContent = bad; return; } if (lines.length < 2) { er.textContent = 'القيد لازم يكون فيه سطرين على الأقل.'; return; } if (Math.abs(r2(d - c)) >= 0.005) { er.textContent = 'القيد مش متوازن: الفرق ' + fmt(d - c) + '.'; return; }
  const dup = x => x.doc === doc && String(x.jno) !== edit; if (APP.S.manual.some(dup) || APP.S.transactions.some(t => t.doc === doc)) { er.textContent = 'رقم المستند مستخدم قبل كده.'; return; }
  if (!APP.guard(date)) return;
  if (edit) { const m = APP.S.manual.find(x => String(x.jno) === edit); if (!APP.guard(m.date)) return; Object.assign(m, { date, doc, desc, type, lines }); }
  else APP.S.manual.push({ jno: 0, date, type, doc, desc, seq: 4e6 + APP.nextId('man'), lines });
  bumpDoc(doc); APP.UI.keepDate = date; APP.commit('تم حفظ القيد.', { norender: true }); APP.go('journal');
};

/* ---------- document view / print ---------- */
R_.doc = {
  title: arg => 'مستند ' + arg,
  html(arg) {
    const txs = APP.S.transactions.filter(t => t.doc === arg).sort((a, b) => a.id - b.id);
    if (!txs.length) { const m = APP.S.manual.find(x => x.doc === arg); if (m) return manualDocHtml(m); return '<div class="sheet"><p>المستند ' + esc(arg) + ' مش موجود.</p><a class="btn" href="#/docs">كل المستندات</a></div>'; }
    const kind = kindOfDoc(txs), K = kind ? KINDS[kind] : null, t0 = txs[0], d = APP.docBy.get(arg) || {}, info = txs.map(t => APP.R.txInfo.get(t.id) || {});
    const title = K ? K.title : (d.type || 'مستند');
    const lines = K && K.k === 'inv' ? txs.filter(t => t.type === K.lt) : [];
    const sumTp = tp => txs.filter(t => t.type === tp).reduce((s, t) => s + t.debit + t.credit, 0);
    let h = '<div class="sheet doc ' + (lines.length ? 'invoice-document' : 'voucher-document') + '">' + APP.sheetHead(title, arg) +
      '<div class="toolbar noprint"><button class="btn primary" data-act="printSize" data-size="' + (APP.S.settings.printSize === 'a5' ? 'a5' : 'a4') + '">طباعة ' + (APP.S.settings.printSize === 'a5' ? 'A5' : 'A4') + '</button><button class="btn" data-act="printSize" data-size="' + (APP.S.settings.printSize === 'a5' ? 'a4' : 'a5') + '">طباعة ' + (APP.S.settings.printSize === 'a5' ? 'A4' : 'A5') + '</button>' + (kind ? '<a class="btn" href="#/' + kind + '/' + encodeURIComponent(arg) + '">تعديل</a>' : '<a class="btn" href="#/txs">تعديل من سجل الحركات</a>') + '<button class="btn danger" data-act="docDel" data-d="' + esc(arg) + '">حذف</button><a class="btn" href="#/docs">كل المستندات</a></div>' +
      '<div class="frow doc-meta"><div><span class="muted sm">التاريخ</span><div class="n"><b>' + t0.date + '</b></div></div><div><span class="muted sm">' + (t0.source === T.treas ? 'التصنيف' : t0.source === T.sales ? 'العميل' : 'المورد') + '</span><div><b>' + esc(t0.partyName) + '</b> <span class="muted sm n">' + esc(t0.partyCode) + '</span></div></div>' + (K && K.k === 'inv' && t0.partyCode && dueDate(t0.date, (APP.S.parties.find(p => p.code === t0.partyCode) || {}).creditDays) ? '<div><span class="muted sm">تاريخ الاستحقاق</span><div class="n"><b>' + dueDate(t0.date, (APP.S.parties.find(p => p.code === t0.partyCode) || {}).creditDays) + '</b></div></div>' : '') + '<div><span class="muted sm">رقم القيد</span><div class="n">' + Array.from(new Set(info.map(i => i.jno))).filter(Boolean).join('، ') + '</div></div></div>';
    if (lines.length) {
      h += APP.table([{ h: '#', f: (t) => '<span class="n">' + (lines.indexOf(t) + 1) + '</span>' }, { h: 'الصنف', f: t => esc(t.itemName || '—') }, { h: 'الوحدة', f: t => esc(((APP.iBy.get(t.itemCode) || {}).unit) || '') }, { h: 'الكمية', n: 1, f: t => '<span class="n">' + APP.fmtq(t.qty) + '</span>' }].concat(lines.some(t => t.pieces) ? [{ h: 'العدد', n: 1, f: t => t.pieces ? '<span class="n">' + APP.fmtq(t.pieces) + '</span>' : '', total: t => t.pieces, tf: v => '<span class="n">' + APP.fmtq(v) + '</span>' }] : []).concat([{ h: 'السعر', n: 1, f: t => nc(t.price) }, { h: 'الإجمالي', n: 1, f: t => nc(t.debit + t.credit), total: t => t.debit + t.credit }]), lines, { totals: true, totalLabel: 'إجمالي الأصناف' });
      const gross = lines.reduce((s, t) => s + t.debit + t.credit, 0), disc = K.disc ? sumTp(K.disc.tp) : 0, paid = K.pay ? sumTp(K.pay.tp) : 0, net = r2(gross - disc);
      const payTx = K.pay ? txs.find(t => t.type === K.pay.tp) : null, payAcc = payTx ? APP.coaBy.get(payTx.acc) : null;
      h += '<div class="sumbox">' + (disc ? '<div class="r"><span>خصم</span><b class="n">' + fmt(disc) + '</b></div>' : '') + '<div class="r big"><span>الصافي</span><b class="n">' + fmt(net) + '</b></div>' + (K.pay ? '<div class="r"><span>' + K.pay.label + '</span><b class="n">' + fmt(paid) + '</b></div><div class="r"><span>المتبقي على الحساب</span><b class="n">' + fmt(net - paid) + '</b></div>' : '') + '</div>';
      h += '<div class="words">' + esc(APP.tafqeet(net)) + '</div>';
      const pr = APP.pBy.get(t0.partyCode); if (pr) h += '<p class="muted sm">الرصيد السابق: <span class="n">' + fmt(pr.balance - (t0.source === T.sales ? net - paid : -net + paid)) + '</span> — الرصيد الحالي: <span class="n">' + fmt(pr.balance) + '</span></p>';
      if (payAcc) h += '<div class="payment-details"><b>بيانات الدفع</b><span>الحساب: ' + esc(payAcc.name) + '</span>' + (payAcc.accountNo ? '<span>رقم الحساب / الهاتف: <span class="n">' + esc(payAcc.accountNo) + '</span></span>' : '') + '</div>';
    } else {
      const amt = txs.reduce((s, t) => s + t.debit + t.credit, 0);
      h += '<div class="sumbox"><div class="r big"><span>المبلغ</span><b class="n">' + fmt(amt) + '</b></div></div><div class="words">' + esc(APP.tafqeet(amt)) + '</div>';
      const voucherAcc = APP.coaBy.get(t0.acc);
      h += '<p class="document-note">طريقة الدفع: <b>' + esc(info[0].meth || APP.accName(t0.acc) || 'الخزينة النقدية') + '</b>' + (t0.desc ? ' — ' + esc(t0.desc) : '') + '</p>';
      if (voucherAcc) h += '<div class="payment-details"><b>بيانات الدفع</b><span>الحساب: ' + esc(voucherAcc.name) + '</span>' + (voucherAcc.accountNo ? '<span>رقم الحساب / الهاتف: <span class="n">' + esc(voucherAcc.accountNo) + '</span></span>' : '') + '</div>';
      if (txs.length > 1) h += APP.table([{ h: 'النوع', f: t => esc(t.type) }, { h: 'المبلغ', n: 1, f: t => nc(t.debit + t.credit) }, { h: 'البيان', f: t => esc(t.desc) }], txs);
    }
    h += '<div class="sig print-signatures"><div><span>المحاسب</span><i></i></div><div><span>' + (t0.source === T.treas ? 'المستلم' : t0.source === T.sales ? 'العميل' : 'المورد') + '</span><i></i></div><div><span>اعتماد</span><i></i></div></div></div>';
    return h;
  }
};
function manualDocHtml(m) {
  const rows = m.lines.map(l => ({ a: l.acc, n: APP.accName(l.acc), dr: l.dr, cr: l.cr, d: l.desc }));
  return '<div class="sheet doc">' + APP.sheetHead('قيد ' + m.type, m.doc) + '<div class="toolbar noprint"><button class="btn primary" data-act="printSize" data-size="a4">طباعة A4</button><button class="btn" data-act="printSize" data-size="a5">طباعة A5</button><a class="btn" href="#/' + (m.emp ? (m.kind === 'pay' ? 'payslip/' + encodeURIComponent(m.doc) : 'empadv/' + encodeURIComponent(m.doc)) : 'manual/' + m.jno) + '">' + (m.kind === 'pay' ? 'قسيمة المرتب' : 'تعديل') + '</a><a class="btn" href="#/journal">دفتر القيود</a></div><p><span class="n">' + m.date + '</span> — ' + esc(m.desc) + '</p>' +
    APP.table([{ h: 'الحساب', f: r => esc(r.a + ' - ' + r.n) }, { h: 'بيان', f: r => esc(r.d) }, { h: 'مدين', n: 1, f: r => nc(r.dr, true), total: r => r.dr }, { h: 'دائن', n: 1, f: r => nc(r.cr, true), total: r => r.cr }], rows, { totals: true }) + '<div class="sig"><div>المحاسب</div><div>اعتماد</div></div></div>';
}
APP.acts.docEdit = b => {
  const d = b.dataset.d, txs = APP.S.transactions.filter(t => t.doc === d), kind = kindOfDoc(txs);
  if (!kind) { APP.alert('نوع المستند ده مش بيتعدل من شاشة المستندات. عدّل حركاته من «سجل الحركات».'); return; } APP.go(kind, d);
};
})(window);
