/* =====================================================================
   SIYADA - year-end closing, VAT report, e-invoice (ETA) draft, price lists, alerts
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP, E = root.SiyadaEngine, T = E.T, r2 = E.r2, num = E.num;
const { $, $$, esc, fmt, nc } = APP;
const R_ = APP.routes;
const period = (from, to) => (from ? 'من ' + from + ' ' : '') + 'إلى ' + (to || APP.today());

/* ======================= year-end closing ======================= */
function closePreview(cd) {
  const S = APP.S, bal = new Map();
  APP.R.journal.forEach(l => { if (l.date <= cd) bal.set(l.acc, (bal.get(l.acc) || 0) + l.dr - l.cr); });
  let rev = 0, cogs = 0, ex = 0; const lines = [];
  S.coa.forEach(a => {
    if (a.type !== 'إيرادات' && a.type !== 'مصروفات') return;
    const b = r2(bal.get(a.code) || 0);
    if (a.type === 'إيرادات') rev -= b; else if (a.group === 'تكلفة المبيعات') cogs += b; else ex += b;
    if (b !== 0) lines.push({ acc: a.code, name: a.name, dr: b < 0 ? -b : 0, cr: b > 0 ? b : 0, desc: 'ترحيل نتيجة السنة' });
  });
  rev = r2(rev); cogs = r2(cogs); ex = r2(ex); const net = r2(rev - cogs - ex);
  const n = lines.length;
  if (net !== 0) lines.push({ acc: S.settings.accRE, name: APP.accName(S.settings.accRE), dr: net < 0 ? -net : 0, cr: net > 0 ? net : 0, desc: 'صافي نتيجة السنة' });
  return { rev, cogs, ex, net, lines, n };
}
function clYear() { const cl = APP.S.meta.closings || []; return parseInt(APP.fv('yr', String(cl.length ? cl[cl.length - 1].year + 1 : new Date().getFullYear() - (new Date().getMonth() < 3 ? 1 : 0))), 10) || 0; }
R_.closing = {
  title: 'إقفال السنة المالية',
  html() {
    const S = APP.S, cl = S.meta.closings || [], yr = clYear();
    const cd = APP.fv('cd', yr + '-12-31'); const pv = closePreview(cd);
    const hist = APP.table([{ h: 'السنة', f: c => '<span class="n">' + c.year + '</span>' }, { h: 'تاريخ الإقفال', f: c => '<span class="n">' + c.date + '</span>' }, { h: 'القيد', f: c => '<a href="#/doc/' + encodeURIComponent(c.doc) + '">' + esc(c.doc) + '</a>' }, { h: 'صافي النتيجة', n: 1, f: c => nc(c.net) }], cl.slice().reverse(), { empty: 'مفيش إقفال متسجّل.' });
    return '<div class="sheet doc">' + APP.sheetHead('إقفال السنة المالية', 'ترحيل الإيرادات والمصروفات إلى ' + APP.accName(S.settings.accRE)) +
      '<p class="muted" style="margin-top:0">الإقفال بيصفّر حسابات الإيرادات والمصروفات لحد التاريخ ده ويرحّل الصافي إلى حساب الأرباح المرحّلة، وبعدها بيقفل الفترة فمفيش تعديل في تواريخها. تقدر تتراجع عن آخر إقفال.</p>' +
      '<div class="toolbar"><label class="f">السنة<input class="in n" data-f="yr" data-full="1" value="' + yr + '"></label><label class="f">تاريخ الإقفال<input class="in" type="date" data-f="cd" data-full="1" value="' + esc(cd) + '"></label></div>' +
      '<div class="kpis" style="margin-bottom:14px"><div class="kpi"><small>الإيرادات</small><b>' + fmt(pv.rev) + '</b></div><div class="kpi"><small>تكلفة المبيعات</small><b>' + fmt(pv.cogs) + '</b></div><div class="kpi"><small>المصروفات</small><b>' + fmt(pv.ex) + '</b></div><div class="kpi"><small>صافي النتيجة</small><b class="' + (pv.net < 0 ? 'neg' : '') + '">' + fmt(pv.net) + '</b></div></div>' +
      '<div class="scroll">' + APP.table([{ h: 'الحساب', f: l => esc(l.acc + ' - ' + l.name) }, { h: 'البيان', f: l => esc(l.desc) }, { h: 'مدين', n: 1, f: l => nc(l.dr, true), total: l => l.dr }, { h: 'دائن', n: 1, f: l => nc(l.cr, true), total: l => l.cr }], pv.lines, { totals: true, empty: 'مفيش أرصدة إيرادات أو مصروفات مفتوحة لحد التاريخ ده.' }) + '</div>' +
      '<p class="muted sm">دي معاينة قيد الإقفال «CL-' + yr + '». لسه ما اتسجّلش أي حاجة.</p><div id="clErr" class="err"></div>' +
      '<div class="toolbar"><button class="btn primary" data-act="clRun">إقفال السنة ' + yr + '</button><button class="btn danger" data-act="clUndo"' + (cl.length ? '' : ' disabled') + '>تراجع عن آخر إقفال</button></div>' +
      '<h2 style="margin:18px 0 8px">سجل الإقفال</h2>' + hist + '</div>';
  }
};
APP.acts.clRun = async () => {
  const S = APP.S, yr = clYear(), er = $('#clErr');
  const cl = S.meta.closings || (S.meta.closings = []); const cd = APP.fv('cd', yr + '-12-31');
  if (!(yr >= 1990 && yr <= 2100)) { er.textContent = 'سنة الإقفال غير صحيحة.'; return; }
  if (cd > APP.today()) { er.textContent = 'مينفعش تقفل لتاريخ لسه ماجاش.'; return; }
  if (S.settings.closedUntil && cd <= S.settings.closedUntil) { er.textContent = 'التاريخ ده داخل فترة مقفولة بالفعل (حتى ' + S.settings.closedUntil + ').'; return; }
  if (S.manual.some(m => m.doc === 'CL-' + yr)) { er.textContent = 'السنة دي متقفلة قبل كده.'; return; }
  const pv = closePreview(cd); if (!pv.n) { er.textContent = 'مفيش أرصدة إيرادات أو مصروفات مفتوحة لحد التاريخ ده.'; return; }
  if (!await APP.confirm('هيتم إقفال السنة ' + yr + ' لحد ' + cd + '.\nصافي النتيجة: ' + fmt(pv.net) + '\nبعد الإقفال مفيش إضافة أو تعديل أو حذف لحركات بتاريخ داخل الفترة دي. تكمل؟', 'إقفال')) return;
  S.manual.push({ jno: 0, date: cd, type: T.closing, doc: 'CL-' + yr, desc: 'قيد إقفال السنة المالية ' + yr, seq: 4e6 + APP.nextId('man'), lines: pv.lines.map(l => ({ acc: l.acc, dr: l.dr, cr: l.cr, pc: '', pn: '', desc: l.desc })) });
  cl.push({ year: yr, date: cd, doc: 'CL-' + yr, net: pv.net, at: new Date().toISOString(), prevLock: S.settings.closedUntil || '' });
  S.settings.closedUntil = cd; APP.UI.f = {};
  APP.commit('تم إقفال السنة ' + yr + ' (قيد CL-' + yr + ').');
};
APP.acts.clUndo = async () => {
  const S = APP.S, cl = S.meta.closings || []; if (!cl.length) return; const c = cl[cl.length - 1];
  if (!await APP.confirm('هتلغي إقفال السنة ' + c.year + ' (قيد ' + c.doc + ') وتفتح الفترة تاني. تكمل؟', 'تراجع', true)) return;
  S.manual = S.manual.filter(m => m.doc !== c.doc); cl.pop(); S.settings.closedUntil = c.prevLock || (cl.length ? cl[cl.length - 1].date : ''); APP.UI.f = {};
  APP.commit('تم إلغاء إقفال السنة ' + c.year + '.');
};

/* ======================= VAT report ======================= */
R_.vat = {
  title: 'تقرير ضريبة القيمة المضافة',
  html() {
    const S = APP.S, st = S.settings, from = APP.fv('from', ''), to = APP.fv('to', '');
    let vOut = 0, vRet = 0, vIn = 0; const mon = new Map();
    APP.R.journal.forEach(l => {
      if ((from && l.date < from) || (to && l.date > to)) return; const k = l.date.slice(0, 7);
      if (l.acc === st.accVatOut || l.acc === st.accVatIn) { let m = mon.get(k); if (!m) { m = { k, o: 0, r: 0, i: 0 }; mon.set(k, m); } if (l.acc === st.accVatOut) { m.o += l.cr; m.r += l.dr; vOut += l.cr; vRet += l.dr; } else { m.i += l.dr - l.cr; vIn += l.dr - l.cr; } }
    });
    const months = Array.from(mon.values()).sort((a, b) => (a.k < b.k ? -1 : 1)).map(m => Object.assign(m, { net: r2(m.o - m.r - m.i) }));
    const types = new Set(['فاتورة بيع', 'مرتجع مبيعات', 'فاتورة شراء', 'مرتجع مشتريات']);
    const docs = APP.R.docs.filter(d => d.vat !== 0 && types.has(d.type) && (!from || d.date >= from) && (!to || d.date <= to)).sort((a, b) => (a.date < b.date ? -1 : 1));
    const net = r2(vOut - vRet - vIn);
    return '<div class="sheet">' + APP.sheetHead('تقرير ضريبة القيمة المضافة', period(from, to)) +
      (st.vatOn ? '<p class="muted sm" style="margin-top:0">الأسعار شاملة الضريبة (النسبة الافتراضية ' + esc(st.vatRate) + '%) والضريبة بتتفصل من جوه السعر حسب نسبة كل صنف.</p>' : '<div class="bn" style="margin:0 0 12px"><span>الضريبة غير مفعّلة في «إعدادات الشركة»، فكل القيم صفر. فعّلها لو الأسعار عندك شاملة الضريبة.</span><a class="btn s" href="#/settings">الإعدادات</a></div>') +
      '<div class="toolbar noprint">' + APP.dateFilter(from, to) + '<button class="btn" data-act="full">عرض</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rptd" data-n="مستندات_الضريبة">تصدير المستندات CSV</button></div>' +
      '<div class="kpis"><div class="kpi"><small>ضريبة المبيعات (مخرجات)</small><b>' + fmt(vOut) + '</b></div><div class="kpi"><small>مرتجعات وخصومات المبيعات</small><b>' + fmt(vRet) + '</b></div><div class="kpi"><small>ضريبة المشتريات (مدخلات)</small><b>' + fmt(vIn) + '</b></div><div class="kpi"><small>' + (net >= 0 ? 'المستحق للمصلحة' : 'رصيد دائن للشركة') + '</small><b class="' + (net < 0 ? 'neg' : '') + '">' + fmt(net) + '</b></div></div>' +
      '<h2 style="margin:6px 0 8px">حسب الشهر</h2><div class="scroll">' + APP.table([{ h: 'الشهر', f: m => esc(APP.monthName(m.k)) }, { h: 'المخرجات', n: 1, f: m => nc(m.o), total: m => m.o }, { h: 'المرتجعات', n: 1, f: m => nc(m.r), total: m => m.r }, { h: 'المدخلات', n: 1, f: m => nc(m.i), total: m => m.i }, { h: 'الصافي', n: 1, f: m => nc(m.net), total: m => m.net }], months, { totals: true, empty: 'مفيش حركة ضريبة في الفترة.' }) + '</div>' +
      '<h2 style="margin:18px 0 8px">المستندات اللي عليها ضريبة <span class="muted sm">(' + docs.length + ')</span></h2><div class="scroll">' + APP.table([{ h: 'المستند', f: d => '<a href="#/doc/' + encodeURIComponent(d.doc) + '">' + esc(d.doc) + '</a>' }, { h: 'التاريخ', f: d => '<span class="n">' + d.date + '</span>' }, { h: 'الطرف', f: d => esc(d.pn) }, { h: 'النوع', f: d => esc(d.type) }, { h: 'قبل الضريبة', n: 1, f: d => nc(d.net - d.vat), total: d => d.net - d.vat }, { h: 'الضريبة', n: 1, f: d => nc(d.vat), total: d => d.vat }, { h: 'الإجمالي', n: 1, f: d => nc(d.net), total: d => d.net }], docs.slice(0, 500), { id: 'rptd', totals: true, empty: 'مفيش مستندات عليها ضريبة.' }) + '</div>' + (docs.length > 500 ? '<p class="muted sm">معروض أول 500 مستند.</p>' : '') + '</div>';
  }
};

/* ======================= e-invoice (ETA) draft ======================= */
function etaUnit(it) { if (it && it.etaUnit) return it.etaUnit; const u = (it && it.unit) || ''; return u.indexOf('لتر') >= 0 ? 'LTR' : 'KGM'; }
function etaRows(from, to) {
  const S = APP.S, R = APP.R, st = S.settings; const rows = []; let noTax = 0, noEta = 0, noDoc = 0; const docs = new Set();
  S.transactions.forEach(t => {
    if (t.source !== T.sales || (t.type !== T.sale && t.type !== T.ret) || !t.itemCode) return;
    if ((from && t.date < from) || (to && t.date > to)) return;
    const info = R.txInfo.get(t.id) || {}, it = S.items.find(x => x.code === t.itemCode), p = S.parties.find(x => x.code === t.partyCode);
    let doc = t.doc; if (!doc) { doc = 'ROW-' + t.row; noDoc++; }
    const txid = p && p.taxId ? p.taxId : ''; if (!txid) noTax++;
    let etaCode = it && it.eta ? it.eta : ''; if (!etaCode) { noEta++; etaCode = t.itemCode; }
    let rate = 0; if (st.vatOn) rate = it && it.vat !== '' && it.vat !== undefined && !isNaN(parseFloat(it.vat)) ? num(it.vat) : st.vatRate;
    const net = r2(info.net || 0), vat = r2(info.vat || 0), qty = t.qty;
    rows.push({ doc, date: t.date, tp: t.type === T.sale ? 'I' : 'C', rt: p && p.rtype === 'B' ? 'B' : 'P', txid, name: t.partyName, code: etaCode, itype: (it && it.etaType) || 'EGS', desc: t.itemName, unit: etaUnit(it), qty, price: qty > 0 ? Math.round(net / qty * 1e5) / 1e5 : 0, sales: net, net, rate, vat, total: r2(net + vat) });
    docs.add(doc);
  });
  rows.sort((a, b) => (a.doc < b.doc ? -1 : a.doc > b.doc ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { rows, nDoc: docs.size, noTax, noEta, noDoc };
}
R_.eta = {
  title: 'الفاتورة الإلكترونية (مسودة)',
  html() {
    const from = APP.fv('from', ''), to = APP.fv('to', ''); const d = etaRows(from, to), s = APP.S.settings;
    return '<div class="sheet">' + APP.sheetHead('تجهيز الفاتورة الإلكترونية (ETA)', period(from, to)) +
      '<div class="bn" style="margin:0 0 12px"><span><b>مسودة غير موقّعة:</b> الملف ده بيجهّز بيانات فواتير البيع والمرتجعات بصيغة JSON قريبة من نموذج مصلحة الضرائب، لكنه مش مرسل ولا موقّع. راجعه مع المحاسب القانوني قبل أي استخدام.</span></div>' +
      '<div class="toolbar noprint">' + APP.dateFilter(from, to) + '<button class="btn" data-act="full">عرض</button><button class="btn primary" data-act="etaJson"' + (d.rows.length ? '' : ' disabled') + '>تنزيل ملف JSON</button><button class="btn" data-act="csv" data-t="rpt" data-n="ETA_مسودة">تصدير CSV</button></div>' +
      '<div class="kpis"><div class="kpi"><small>الفواتير</small><b>' + d.nDoc + '</b></div><div class="kpi"><small>الأسطر</small><b>' + d.rows.length + '</b></div><div class="kpi"><small>أسطر بدون رقم ضريبي للعميل</small><b class="' + (d.noTax ? 'neg' : '') + '">' + d.noTax + '</b></div><div class="kpi"><small>أصناف بدون كود ETA</small><b class="' + (d.noEta ? 'neg' : '') + '">' + d.noEta + '</b></div><div class="kpi"><small>أسطر بدون رقم فاتورة</small><b class="' + (d.noDoc ? 'neg' : '') + '">' + d.noDoc + '</b></div></div>' +
      (!s.taxNo ? '<p class="err">الرقم الضريبي للشركة فاضي — اكتبه في «إعدادات الشركة».</p>' : '') +
      '<div class="scroll">' + APP.table([{ h: 'الفاتورة', f: r => esc(r.doc) }, { h: 'التاريخ', f: r => '<span class="n">' + r.date + '</span>' }, { h: 'النوع', f: r => r.tp === 'I' ? 'فاتورة' : 'إشعار دائن' }, { h: 'العميل', f: r => esc(r.name) }, { h: 'الرقم الضريبي', f: r => '<span class="n">' + esc(r.txid) + '</span>' }, { h: 'كود الصنف', f: r => '<span class="n">' + esc(r.code) + '</span>' }, { h: 'الصنف', f: r => esc(r.desc) }, { h: 'الوحدة', f: r => esc(r.unit) }, { h: 'الكمية', n: 1, f: r => '<span class="n">' + APP.fmtq(r.qty) + '</span>' }, { h: 'سعر الوحدة', n: 1, f: r => '<span class="n">' + APP.fmtq(r.price) + '</span>' }, { h: 'الصافي', n: 1, f: r => nc(r.net), total: r => r.net }, { h: 'الضريبة', n: 1, f: r => nc(r.vat), total: r => r.vat }, { h: 'الإجمالي', n: 1, f: r => nc(r.total), total: r => r.total }], d.rows.slice(0, 600), { id: 'rpt', totals: true, empty: 'مفيش فواتير بيع بأصناف في الفترة دي.' }) + '</div>' + (d.rows.length > 600 ? '<p class="muted sm">معروض أول 600 سطر في الجدول، وملف JSON هيحتوي على كل ' + d.rows.length + ' سطر.</p>' : '') + '</div>';
  }
};
APP.acts.etaJson = () => {
  const s = APP.S.settings, from = APP.fv('from', ''), to = APP.fv('to', ''), d = etaRows(from, to); if (!d.rows.length) return;
  const issuer = { address: { branchID: s.branch || '0', country: 'EG', governate: s.gov || '', regionCity: s.city || '', street: s.street || '', buildingNumber: s.bldg || '' }, type: 'B', id: s.taxNo || '', name: s.company };
  const out = []; let i = 0;
  while (i < d.rows.length) {
    let j = i; while (j + 1 < d.rows.length && d.rows[j + 1].doc === d.rows[i].doc) j++;
    const g = d.rows.slice(i, j + 1), h = g[0]; let ts = 0, tn = 0, tv = 0, ta = 0;
    const lines = g.map(r => { ts += r.sales; tn += r.net; tv += r.vat; ta += r.total; return { description: r.desc, itemType: r.itype, itemCode: r.code, unitType: r.unit, quantity: r.qty, unitValue: { currencySold: 'EGP', amountEGP: r.price }, salesTotal: r.sales, total: r.total, valueDifference: 0, totalTaxableFees: 0, netTotal: r.net, itemsDiscount: 0, discount: { rate: 0, amount: 0 }, taxableItems: (r.rate > 0 || r.vat !== 0) ? [{ taxType: 'T1', amount: r.vat, subType: 'V009', rate: r.rate }] : [] }; });
    out.push({ issuer, receiver: { address: { country: 'EG', governate: '', regionCity: '', street: '', buildingNumber: '' }, type: h.rt, id: h.txid, name: h.name }, documentType: h.tp, documentTypeVersion: '1.0', dateTimeIssued: h.date + 'T00:00:00Z', taxpayerActivityCode: s.etaActivity || '', internalID: h.doc, invoiceLines: lines, totalDiscountAmount: 0, totalSalesAmount: r2(ts), netAmount: r2(tn), taxTotals: tv !== 0 ? [{ taxType: 'T1', amount: r2(tv) }] : [], totalAmount: r2(ta), extraDiscountAmount: 0, totalItemsDiscountAmount: 0 });
    i = j + 1;
  }
  const stamp = APP.today().replace(/-/g, '') + '_' + new Date().toTimeString().slice(0, 5).replace(':', '');
  APP.download(JSON.stringify({ documents: out }, null, 1), 'ETA_draft_' + stamp + '.json', 'application/json');
  APP.toast('تم تنزيل مسودة JSON (' + out.length + ' فاتورة) — غير موقّعة.');
};

/* ======================= price lists ======================= */
APP.priceLists = () => (APP.S.priceLists || (APP.S.priceLists = []));
APP.priceFor = (partyListName, itemCode) => { if (!partyListName) return 0; const l = APP.priceLists().find(x => x.name === partyListName); return l && l.prices[itemCode] ? num(l.prices[itemCode]) : 0; };
R_.prices = {
  title: 'قوائم الأسعار',
  html() {
    const lists = APP.priceLists(); const cur = APP.fv('pl', lists.length ? lists[0].name : ''); const L = lists.find(x => x.name === cur);
    const nUse = L ? APP.S.parties.filter(p => p.priceList === L.name).length : 0;
    let h = '<div class="sheet doc">' + APP.sheetHead('قوائم الأسعار', 'سعر البيع لكل مجموعة عملاء') +
      '<p class="muted" style="margin-top:0">اعمل قائمة (مثلًا: جملة، تجزئة) واكتب سعر كل صنف، وبعدها اختار القائمة لكل عميل من «تعديل العميل». فاتورة البيع بتجيب سعر القائمة تلقائيًا، ولو الصنف مالوش سعر فيها بتجيب آخر سعر بيع.</p>' +
      '<div class="toolbar noprint"><label class="f">القائمة<select class="in" data-f="pl" data-full="1">' + (lists.length ? lists.map(l => '<option' + (l.name === cur ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') : '<option value="">— مفيش قوائم —</option>') + '</select></label><button class="btn primary" data-act="plNew">+ قائمة جديدة</button>' + (L ? '<button class="btn" data-act="plRen">تغيير الاسم</button><button class="btn" data-act="plFill">ملء من آخر سعر بيع</button><button class="btn danger" data-act="plDel">حذف القائمة</button>' : '') + '</div>';
    if (L) {
      h += '<div class="muted sm" style="margin-bottom:8px">القائمة مستخدمة عند <b class="n">' + nUse + '</b> عميل.</div><div class="scroll"><table class="grid" id="plTbl"><thead><tr><th>الكود</th><th>الصنف</th><th>الوحدة</th><th class="n">آخر سعر بيع</th><th class="n">سعر القائمة</th></tr></thead><tbody>' +
        APP.R.items.map(x => '<tr><td><span class="n">' + esc(x.code) + '</span></td><td>' + esc(x.name) + '</td><td>' + esc(x.unit) + '</td><td class="n">' + (x.lastSell ? nc(x.lastSell) : '') + '</td><td class="n"><input class="in n plp" style="margin:0;max-width:130px" data-c="' + esc(x.code) + '" inputmode="decimal" value="' + esc(L.prices[x.code] || '') + '"></td></tr>').join('') + '</tbody></table></div><div class="toolbar" style="margin-top:12px"><button class="btn primary" data-act="plSave">حفظ الأسعار</button></div>';
    } else h += '<p class="muted">اعمل أول قائمة بزرار «قائمة جديدة».</p>';
    return h + '</div>';
  }
};
function askName(title, def) {
  return new Promise(res => {
    APP.modal('<h3>' + esc(title) + '</h3><div class="mbody"><label class="f">الاسم<input class="in" id="nmIn" value="' + esc(def || '') + '"></label><div class="err" id="nmErr"></div></div><div class="mfoot"><button class="btn primary" id="nmOk">حفظ</button><button class="btn" id="nmNo">إلغاء</button></div>');
    $('#nmOk').onclick = () => { const v = $('#nmIn').value.trim(); if (!v) { $('#nmErr').textContent = 'اكتب اسم.'; return; } APP.mclose(); res(v); };
    $('#nmNo').onclick = () => { APP.mclose(); res(null); };
    $('#nmIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#nmOk').click(); });
  });
}
APP.acts.plNew = async () => { const n = await askName('قائمة أسعار جديدة', ''); if (!n) return; if (APP.priceLists().some(l => l.name === n)) { APP.toast('الاسم ده موجود.', 'bad'); return; } APP.priceLists().push({ name: n, prices: {} }); APP.UI.f.pl = n; APP.commit('تمت إضافة القائمة.'); };
APP.acts.plRen = async () => { const L = APP.priceLists().find(x => x.name === APP.fv('pl', '') || (!APP.UI.f.pl && x === APP.priceLists()[0])); if (!L) return; const n = await askName('اسم القائمة', L.name); if (!n || n === L.name) return; if (APP.priceLists().some(l => l.name === n)) { APP.toast('الاسم ده موجود.', 'bad'); return; } APP.S.parties.forEach(p => { if (p.priceList === L.name) p.priceList = n; }); L.name = n; APP.UI.f.pl = n; APP.commit('تم تغيير الاسم.'); };
function curList() { const lists = APP.priceLists(); const n = APP.fv('pl', lists.length ? lists[0].name : ''); return lists.find(x => x.name === n); }
APP.acts.plDel = async () => { const L = curList(); if (!L) return; if (!await APP.confirm('حذف القائمة «' + L.name + '»؟ العملاء المربوطين بيها هيرجعوا من غير قائمة.', 'حذف', true)) return; APP.S.parties.forEach(p => { if (p.priceList === L.name) p.priceList = ''; }); APP.S.priceLists = APP.priceLists().filter(x => x !== L); APP.UI.f.pl = ''; APP.commit('تم حذف القائمة.'); };
APP.acts.plFill = async () => { const L = curList(); if (!L) return; if (!await APP.confirm('هيتملى سعر القائمة من آخر سعر بيع لكل صنف (للأصناف اللي ليها سعر بيع). الأسعار الحالية هتتبدّل. تكمل؟', 'ملء')) return; APP.R.items.forEach(x => { if (x.lastSell) L.prices[x.code] = x.lastSell; }); APP.commit('تم ملء الأسعار.'); };
APP.acts.plSave = () => { const L = curList(); if (!L) return; const pr = {}; let bad = 0; $$('.plp').forEach(i => { const v = i.value.trim(); if (v === '') return; const n = parseFloat(v); if (isNaN(n) || n < 0) { bad++; i.style.borderColor = 'var(--red)'; return; } if (n > 0) pr[i.dataset.c] = n; }); if (bad) { APP.toast('في ' + bad + ' سعر مش رقم صحيح.', 'bad'); return; } L.prices = pr; APP.commit('تم حفظ الأسعار (' + Object.keys(pr).length + ' صنف).'); };

/* ======================= alerts (dashboard) ======================= */
APP.alerts = function () {
  const S = APP.S, R = APP.R, days = num(S.settings.alertDays) || 60; const today = APP.today(), cut = APP.addDays(today, -days);
  const lastColl = new Map(); S.transactions.forEach(t => { if (t.type === T.coll && t.partyCode && (!lastColl.has(t.partyCode) || t.date > lastColl.get(t.partyCode))) lastColl.set(t.partyCode, t.date); });
  const over = R.parties.filter(p => p.type === T.cust && p.limit > 0 && p.balance > p.limit + 0.005).sort((a, b) => (b.balance - b.limit) - (a.balance - a.limit));
  const stale = R.parties.filter(p => p.type === T.cust && p.balance > 0.5 && p.count > 0 && (lastColl.get(p.code) || '') < cut).sort((a, b) => b.balance - a.balance);
  const low = R.items.filter(x => x.reorder > 0 && x.onHand <= x.reorder && x.onHand >= 0).sort((a, b) => a.onHand - b.onHand);
  const neg = R.items.filter(x => x.onHand < -0.0005).sort((a, b) => a.onHand - b.onHand);
  return { days, over, stale, low, neg };
};
})(window);
