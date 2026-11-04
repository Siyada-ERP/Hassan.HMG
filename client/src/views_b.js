/* =====================================================================
   SIYADA - master data & lists: parties, items, chart of accounts, treasury, journal, documents, transactions
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP, E = root.SiyadaEngine, T = E.T, r2 = E.r2, num = E.num;
const { $, $$, esc, fmt, nc } = APP;
const R_ = APP.routes;

/* ---------- helpers ---------- */
APP.guard = function (date) {
  const c = APP.S.settings.closedUntil;
  if (c && date && date <= c) { APP.alert('التاريخ ' + date + ' داخل فترة مقفولة (حتى ' + c + '). غيّر «قفل الفترات» من الإعدادات لو عايز تعدّل فيها.'); return false; }
  return true;
};
function pager(total, size, page) {
  const pages = Math.max(1, Math.ceil(total / size)); if (pages <= 1) return '';
  return '<div class="pager"><button class="btn s" data-act="pg" data-p="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>السابق</button><span class="sm">صفحة <span class="n">' + page + '</span> من <span class="n">' + pages + '</span> — <span class="n">' + total + '</span> سطر</span><button class="btn s" data-act="pg" data-p="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>التالي</button></div>';
}
APP.acts.pg = b => { APP.UI.f.page = Math.max(1, parseInt(b.dataset.p, 10) || 1); const r = APP.routes[APP.cur().route]; if (r && r.results) APP.debouncedResults(); else APP.rerender(); root.scrollTo(0, 0); };
APP.paged = (arr, size) => { const pg = Math.min(Math.max(1, parseInt(APP.fv('page', 1), 10) || 1), Math.max(1, Math.ceil(arr.length / size))); return { rows: arr.slice((pg - 1) * size, pg * size), html: pager(arr.length, size, pg) }; };
const has = (hay, q) => !q || String(hay).toLowerCase().indexOf(q.toLowerCase()) >= 0;
APP.dateFilter = (fromDef, toDef) => '<label class="f">من<input class="in" type="date" data-f="from" value="' + esc(APP.fv('from', fromDef || '')) + '"></label><label class="f">إلى<input class="in" type="date" data-f="to" value="' + esc(APP.fv('to', toDef || '')) + '"></label>';
APP.searchBox = ph => '<label class="f grow">بحث<input class="in" data-f="q" value="' + esc(APP.fv('q', '')) + '" placeholder="' + esc(ph || 'اكتب للبحث…') + '" autocomplete="off"></label>';
APP.actBtns = (...b) => b.join(' ');

/* ---------- parties ---------- */
function nextPartyCode(type) {
  const pre = type === T.cust ? 'C-' : 'R-'; let mx = 0; const set = new Set(APP.S.parties.map(p => p.code));
  APP.S.parties.forEach(p => { if (p.code.indexOf(pre) === 0) { const m = /^(\d+)$/.exec(p.code.slice(pre.length)); if (m) mx = Math.max(mx, parseInt(m[1], 10)); } });
  let c; do { mx++; c = pre + String(mx).padStart(3, '0'); } while (set.has(c)); return c;
}
function partiesView(type) {
  const isC = type === T.cust, name = isC ? 'العملاء' : 'الموردون';
  return {
    title: name,
    html() {
      return '<div class="sheet">' + APP.sheetHead(name, isC ? 'أرصدة العملاء' : 'أرصدة الموردين') +
        '<div class="toolbar">' + APP.searchBox('اسم أو كود أو تليفون') + '<label class="f">الرصيد<select class="in" data-f="bal"><option value="">الكل</option><option value="pos">عليه رصيد</option><option value="zero">رصيد صفر</option><option value="neg">رصيد معكوس</option></select></label>' +
        '<button class="btn primary" data-act="partyNew" data-t="' + type + '">+ ' + (isC ? 'عميل جديد' : 'مورد جديد') + '</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="' + name + '">تصدير CSV</button></div>' +
        '<div class="scroll" id="results">' + this.results() + '</div></div>';
    },
    results() {
      const q = APP.fv('q', '').trim(), bf = APP.fv('bal', '');
      let rows = APP.R.parties.filter(p => p.type === type && (has(p.name + ' ' + p.code + ' ' + p.phone, q)));
      if (bf === 'pos') rows = rows.filter(p => p.balance > 0.004); else if (bf === 'zero') rows = rows.filter(p => Math.abs(p.balance) < 0.005); else if (bf === 'neg') rows = rows.filter(p => p.balance < -0.004);
      rows.sort((a, b) => b.balance - a.balance);
      const pg = APP.paged(rows, 150);
      return APP.table([
        { h: 'الكود', f: p => '<span class="n">' + esc(p.code) + '</span>' },
        { h: 'الاسم', f: p => '<a href="#/statement/' + encodeURIComponent(p.code) + '">' + esc(p.name) + '</a>' + (p.adhoc ? ' <span class="chip warn">غير مسجل</span>' : '') },
        { h: 'التليفون', f: p => '<span class="n">' + esc(p.phone) + '</span>' },
        { h: 'أول المدة', n: 1, f: p => nc(p.opening), total: p => p.opening },
        { h: isC ? 'مدين' : 'سداد/مدين', n: 1, f: p => nc(p.debit), total: p => p.debit },
        { h: isC ? 'دائن' : 'مشتريات/دائن', n: 1, f: p => nc(p.credit), total: p => p.credit },
        { h: 'الرصيد', n: 1, f: p => nc(p.balance), total: p => p.balance },
        { h: 'الحد الائتماني', n: 1, f: p => p.limit ? nc(p.limit) : '' },
        { h: 'آخر حركة', f: p => '<span class="n">' + (p.last || '') + '</span>' },
        { h: '', cls: 'act', f: p => '<a class="btn s" href="#/statement/' + encodeURIComponent(p.code) + '">كشف حساب</a> <button class="btn s" data-act="partyEdit" data-c="' + esc(p.code) + '">تعديل</button>' }
      ], pg.rows, { id: 'rpt', totals: rows.length <= 150, empty: 'مفيش ' + name + ' مطابقين.' }) + pg.html;
    }
  };
}
R_.customers = partiesView(T.cust);
R_.suppliers = partiesView(T.supp);
function agingView(type) {
  const isC = type === T.cust, label = isC ? 'العملاء' : 'الموردين', title = 'أعمار ديون ' + label;
  return {
    title,
    html() {
      const to = APP.fv('to', APP.today());
      return '<div class="sheet">' + APP.sheetHead(title, 'تحليل الحركة حسب تاريخها') +
        '<div class="toolbar">' + APP.dateFilter('', to) + '<button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="' + title + '">تصدير CSV</button></div>' +
        '<p class="muted sm">التقرير يوضح صافي حركة كل ' + (isC ? 'عميل' : 'مورد') + ' حسب عمرها، ويضع الرصيد الافتتاحي ضمن أكثر من 90 يومًا.</p><div class="scroll" id="results">' + this.results() + '</div></div>';
    },
    results() {
      const to = APP.fv('to', APP.today()), end = new Date(to + 'T23:59:59');
      const rows = APP.R.parties.filter(p => p.type === type).map(p => {
        const net = [0, 0, 0, 0];
        APP.S.transactions.filter(t => t.partyCode === p.code && t.partyType === type && t.date <= to).forEach(t => {
          const d = new Date(t.date + 'T12:00:00'), age = Math.max(0, Math.floor((end - d) / 86400000));
          const i = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3;
          net[i] += isC ? (t.debit || 0) - (t.credit || 0) : (t.credit || 0) - (t.debit || 0);
        });
        net[3] += p.opening;
        return { p, net, total: net.reduce((s, x) => s + x, 0) };
      }).filter(r => Math.abs(r.total) > 0.004).sort((a, b) => b.total - a.total);
      return APP.table([
        { h: isC ? 'العميل' : 'المورد', f: r => '<a href="#/statement/' + encodeURIComponent(r.p.code) + '">' + esc(r.p.name) + '</a>' },
        { h: '0–30 يوم', n: 1, f: r => nc(r.net[0]), total: r => r.net[0] },
        { h: '31–60 يوم', n: 1, f: r => nc(r.net[1]), total: r => r.net[1] },
        { h: '61–90 يوم', n: 1, f: r => nc(r.net[2]), total: r => r.net[2] },
        { h: 'أكثر من 90', n: 1, f: r => nc(r.net[3]), total: r => r.net[3] },
        { h: 'الرصيد', n: 1, f: r => nc(r.total), total: r => r.total },
        { h: '', cls: 'act', f: r => '<a class="btn s" href="#/statement/' + encodeURIComponent(r.p.code) + '">كشف حساب</a>' }
      ], rows, { id: 'rpt', totals: true, empty: 'لا توجد أرصدة أو حركات حتى التاريخ المحدد.' });
    }
  };
}
R_.aging = agingView(T.cust);
R_.supplieraging = agingView(T.supp);
function partyForm(ref, type) {
  const isC = type === T.cust, isNew = !ref;
  const p = ref ? { code: ref.code, name: ref.name, phone: ref.phone, address: ref.address, open: ref.opening, limit: ref.limit, days: ref.creditDays || 0, taxId: ref.taxId || '', rtype: ref.rtype || 'P', pl: ref.priceList || '' } : { code: nextPartyCode(type), name: '', phone: '', address: '', open: 0, limit: 0, days: 0, taxId: '', rtype: 'P', pl: '' };
  const used = !isNew && (APP.pBy.get(p.code) || {}).count > 0;
  APP.modal('<h3>' + (isNew ? (isC ? 'عميل جديد' : 'مورد جديد') : 'تعديل: ' + esc(p.name)) + '</h3><div class="mbody"><div class="frow c2"><label class="f">الكود <span class="req">*</span><input class="in n" id="pfCode" value="' + esc(p.code) + '"' + (used ? ' readonly' : '') + '>' + (used ? '<span class="hint">الكود مقفول لأن عليه حركات.</span>' : '') + '</label><label class="f">الاسم <span class="req">*</span><input class="in" id="pfName" value="' + esc(p.name) + '"></label></div>' +
    '<div class="frow c2"><label class="f">التليفون<input class="in n" id="pfPh" value="' + esc(p.phone) + '"></label><label class="f">العنوان<input class="in" id="pfAd" value="' + esc(p.address) + '"></label></div>' +
    '<div class="frow c2"><label class="f">الرصيد الافتتاحي<input class="in n" id="pfOp" value="' + esc(p.open) + '"><span class="hint">' + (isC ? 'موجب = العميل مدين لنا.' : 'موجب = إحنا مدينين للمورد.') + '</span></label><label class="f">الحد الائتماني<input class="in n" id="pfLim" value="' + esc(p.limit) + '"></label></div><div class="frow"><label class="f">مدة الائتمان بالأيام<input class="in n" id="pfDays" inputmode="numeric" value="' + esc(p.days) + '"><span class="hint">صفر = بدون تاريخ استحقاق محدد.</span></label></div>' + (isC ? '<div class="frow"><label class="f">الرقم الضريبي / القومي<input class="in n" id="pfTax" value="' + esc(p.taxId) + '"></label><label class="f">نوع العميل (للفاتورة الإلكترونية)<select class="in" id="pfRt"><option value="P"' + (p.rtype !== 'B' ? ' selected' : '') + '>فرد</option><option value="B"' + (p.rtype === 'B' ? ' selected' : '') + '>شركة</option></select></label><label class="f">قائمة الأسعار<select class="in" id="pfPl"><option value="">— بدون —</option>' + APP.priceLists().map(l => '<option' + (l.name === p.pl ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select></label></div>' : '') + '<div id="pfErr" class="err"></div></div>' +
    '<div class="mfoot"><button class="btn primary" id="pfOk">حفظ</button><button class="btn" data-act="mclose">إلغاء</button>' + (!isNew && !used ? '<button class="btn danger" id="pfDel" style="margin-right:auto">حذف</button>' : '') + '</div>');
  $('#pfOk').onclick = () => {
    const code = $('#pfCode').value.trim(), nm = $('#pfName').value.trim(); const op = parseFloat($('#pfOp').value || '0'), lim = parseFloat($('#pfLim').value || '0'), days = parseInt($('#pfDays').value || '0', 10);
    const er = $('#pfErr'); if (!code || !nm) { er.textContent = 'الكود والاسم مطلوبين.'; return; } if (isNaN(op) || isNaN(lim) || isNaN(days) || days < 0) { er.textContent = 'الرصيد والحد ومدة الائتمان لازم تكون أرقام صحيحة.'; return; }
    if (APP.S.parties.some(x => x.code === code && x !== ref)) { er.textContent = 'الكود ده مستخدم قبل كده.'; return; }
    const rec = { code, name: nm, type, phone: $('#pfPh').value.trim(), address: $('#pfAd').value.trim(), opening: op, limit: lim, creditDays: days };
    if (isC) { rec.taxId = $('#pfTax').value.trim(); rec.rtype = $('#pfRt').value; rec.priceList = $('#pfPl').value; }
    if (isNew) APP.S.parties.push(Object.assign({ priceList: '' }, rec)); else Object.assign(ref, rec);
    APP.mclose(); APP.commit('تم الحفظ.');
  };
  if ($('#pfDel')) $('#pfDel').onclick = async () => { if (await APP.confirm('حذف ' + p.name + '؟', 'حذف', true)) { APP.S.parties.splice(APP.S.parties.indexOf(ref), 1); APP.mclose(); APP.commit('تم الحذف.'); } };
}
APP.acts.partyNew = b => partyForm(null, b.dataset.t);
APP.acts.partyEdit = b => { const p = APP.S.parties.find(x => x.code === b.dataset.c); if (p) partyForm(p, p.type); };

/* ---------- items ---------- */
R_.items = {
  title: 'الأصناف والمخزون',
  html() {
    const inv = APP.R.items, tv = inv.reduce((s, x) => s + x.value, 0);
    const low = inv.filter(x => x.reorder > 0 && x.onHand <= x.reorder).length;
    const neg = inv.filter(x => x.onHand < -0.0005).length;
    const zero = inv.filter(x => Math.abs(x.onHand) < 0.0005).length;
    return '<div class="sheet">' + APP.sheetHead('الأصناف والمخزون', 'القيمة بمتوسط التكلفة') +
      '<div class="toolbar">' + APP.searchBox('اسم أو كود الصنف') + '<label class="f">الحالة<select class="in" data-f="st"><option value="">الكل</option><option value="low">وصل لحد الطلب</option><option value="neg">رصيد سالب</option><option value="nocost">بدون تكلفة</option><option value="zero">رصيد صفر</option></select></label>' +
      '<button class="btn primary" data-act="itemNew">+ صنف جديد</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="الأصناف">تصدير CSV</button></div>' +
      '<div class="kpis"><div class="kpi"><small>عدد الأصناف</small><b class="n">' + inv.length + '</b></div><div class="kpi"><small>قيمة المخزون</small><b>' + fmt(tv) + '</b></div><div class="kpi"><small>وصل لحد الطلب</small><b class="' + (low ? 'neg' : '') + '">' + low + '</b></div><div class="kpi"><small>رصيد سالب</small><b class="' + (neg ? 'neg' : '') + '">' + neg + '</b></div><div class="kpi"><small>رصيد صفر</small><b>' + zero + '</b></div></div><div class="scroll" id="results">' + this.results() + '</div></div>';
  },
  results() {
    const q = APP.fv('q', '').trim(), st = APP.fv('st', '');
    let rows = APP.R.items.filter(x => has(x.name + ' ' + x.code, q));
    if (st === 'low') rows = rows.filter(x => x.reorder > 0 && x.onHand <= x.reorder); else if (st === 'neg') rows = rows.filter(x => x.onHand < -0.0005); else if (st === 'nocost') rows = rows.filter(x => x.noCost > 0 || x.avgCost <= 0); else if (st === 'zero') rows = rows.filter(x => Math.abs(x.onHand) < 0.0005);
    const pg = APP.paged(rows, 150); const WT = new Map(APP.S.items.map(i => [i.code, num(i.weight)]));
    return APP.table([
      { h: 'الكود', f: x => '<span class="n">' + esc(x.code) + '</span>' },
      { h: 'الصنف', f: x => '<a href="#/itemcard/' + encodeURIComponent(x.code) + '">' + esc(x.name) + '</a>' },
      { h: 'الوحدة', f: x => esc(x.unit) },
      { h: 'وزن الصنف (كجم/لتر للوحدة)', n: 1, f: x => WT.get(x.code) ? '<span class="n">' + APP.fmtq(WT.get(x.code)) + '</span>' : '' },
      { h: 'الرصيد', n: 1, f: x => '<span class="n' + (x.onHand < -0.0005 ? ' neg' : '') + '">' + APP.fmtq(x.onHand) + '</span>' },
      { h: 'متوسط التكلفة', n: 1, f: x => nc(x.avgCost) },
      { h: 'القيمة', n: 1, f: x => nc(x.value), total: x => x.value },
      { h: 'آخر شراء', n: 1, f: x => x.lastBuy ? nc(x.lastBuy) : '' },
      { h: 'آخر بيع', n: 1, f: x => x.lastSell ? nc(x.lastSell) : '' },
      { h: 'حد الطلب', n: 1, f: x => x.reorder ? '<span class="n">' + APP.fmtq(x.reorder) + '</span>' : '' },
      { h: '', cls: 'act', f: x => '<a class="btn s" href="#/itemcard/' + encodeURIComponent(x.code) + '">كارت الصنف</a> <button class="btn s" data-act="itemEdit" data-c="' + esc(x.code) + '">تعديل</button>' }
    ], pg.rows, { id: 'rpt', totals: rows.length <= 150, empty: 'مفيش أصناف مطابقة.' }) + pg.html;
  }
};
function nextItemCode() { let mx = 0; const set = new Set(APP.S.items.map(x => x.code)); APP.S.items.forEach(x => { const m = /^I-(\d+)$/.exec(x.code); if (m) mx = Math.max(mx, parseInt(m[1], 10)); }); let c; do { mx++; c = 'I-' + String(mx).padStart(3, '0'); } while (set.has(c)); return c; }
function itemForm(it) {
  const isNew = !it; const x = it || { code: nextItemCode(), name: '', unit: 'قطعة', openQty: 0, openCost: 0, vat: '', reorder: 0, weight: 0, eta: '', etaType: '' };
  const used = !isNew && APP.S.transactions.some(t => t.itemCode === x.code);
  APP.modal('<h3>' + (isNew ? 'صنف جديد' : 'تعديل: ' + esc(x.name)) + '</h3><div class="mbody"><div class="frow c2"><label class="f">الكود <span class="req">*</span><input class="in n" id="ifCode" value="' + esc(x.code) + '"' + (used ? ' readonly' : '') + '>' + (used ? '<span class="hint">الكود مقفول لأن عليه حركات.</span>' : '') + '</label><label class="f">اسم الصنف <span class="req">*</span><input class="in" id="ifName" value="' + esc(x.name) + '"></label></div>' +
    '<div class="frow"><label class="f">الوحدة<input class="in" id="ifUnit" value="' + esc(x.unit) + '"></label><label class="f">رصيد أول المدة<input class="in n" id="ifQ" value="' + esc(x.openQty) + '"></label><label class="f">تكلفة الوحدة أول المدة<input class="in n" id="ifC" value="' + esc(x.openCost) + '"></label></div>' +
    '<div class="frow c2"><label class="f">وزن الصنف (كجم/لتر للوحدة)<input class="in n" id="ifW" inputmode="decimal" value="' + esc(x.weight || '') + '" placeholder="مثال: 25"><span class="hint">لو كتبته، الفاتورة بتحسب «العدد» لوحدها = الكمية ÷ الوزن (مثلًا ٥٠٠ كجم ÷ ٢٥ = ٢٠ شكارة).</span></label></div>' +
    '<div class="frow"><label class="f">حد الطلب<input class="in n" id="ifRo" value="' + esc(x.reorder) + '"></label><label class="f">ضريبة الصنف %<input class="in n" id="ifVat" value="' + esc(x.vat) + '" placeholder="الافتراضية"></label><label class="f">كود ETA<input class="in n" id="ifEta" value="' + esc(x.eta) + '"></label></div><div class="frow"><label class="f">نوع الكود (ETA)<select class="in" id="ifEt"><option' + (x.etaType !== 'GS1' ? ' selected' : '') + '>EGS</option><option' + (x.etaType === 'GS1' ? ' selected' : '') + '>GS1</option></select></label><label class="f">وحدة ETA<select class="in" id="ifEu"><option value="">تلقائي</option>' + ['KGM', 'LTR', 'EA', 'MTR', 'GRM', 'TON'].map(u => '<option' + (x.etaUnit === u ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></label></div><div id="ifErr" class="err"></div></div>' +
    '<div class="mfoot"><button class="btn primary" id="ifOk">حفظ</button><button class="btn" data-act="mclose">إلغاء</button>' + (!isNew && !used ? '<button class="btn danger" id="ifDel" style="margin-right:auto">حذف</button>' : '') + '</div>');
  $('#ifOk').onclick = () => {
    const er = $('#ifErr'), code = $('#ifCode').value.trim(), nm = $('#ifName').value.trim(); const q = parseFloat($('#ifQ').value || '0'), c = parseFloat($('#ifC').value || '0'), ro = parseFloat($('#ifRo').value || '0'); const vt = $('#ifVat').value.trim(); const wt = parseFloat($('#ifW').value || '0');
    if (!code || !nm) { er.textContent = 'الكود والاسم مطلوبين.'; return; } if ([q, c, ro, wt].some(isNaN) || wt < 0 || (vt !== '' && isNaN(parseFloat(vt)))) { er.textContent = 'الأرقام مش مظبوطة.'; return; }
    if (APP.S.items.some(y => y.code === code && y !== it)) { er.textContent = 'الكود ده مستخدم قبل كده.'; return; }
    const rec = { code, name: nm, unit: $('#ifUnit').value.trim(), openQty: q, openCost: c, reorder: ro, vat: vt === '' ? '' : parseFloat(vt), eta: $('#ifEta').value.trim(), etaType: $('#ifEt').value, etaUnit: $('#ifEu').value, weight: wt };
    if (isNew) APP.S.items.push(rec); else Object.assign(it, rec);
    APP.mclose(); APP.commit('تم الحفظ.');
  };
  if ($('#ifDel')) $('#ifDel').onclick = async () => { if (await APP.confirm('حذف الصنف ' + x.name + '؟', 'حذف', true)) { APP.S.items.splice(APP.S.items.indexOf(it), 1); APP.mclose(); APP.commit('تم الحذف.'); } };
}
APP.acts.itemNew = () => itemForm(null);
APP.acts.itemEdit = b => { const it = APP.S.items.find(x => x.code === b.dataset.c); if (it) itemForm(it); };

R_.itemcard = {
  title: 'كارت الصنف',
  html(code) {
    const x = APP.iBy.get(code); if (!x) return '<div class="sheet"><p>الصنف مش موجود.</p></div>';
    const IN = new Set([T.ret, T.buy]), OUT = new Set([T.sale, T.retBuy]);
    const txs = APP.S.transactions.filter(t => t.itemCode === code && (IN.has(t.type) || OUT.has(t.type))).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
    let run = x.openQty; const rows = [{ _cls: 'grp', d: '', doc: '', tp: 'رصيد أول المدة', pn: '', qin: x.openQty, qout: 0, pr: x.openCost, bal: run }];
    txs.forEach(t => { const i = IN.has(t.type); run += i ? t.qty : -t.qty; rows.push({ d: t.date, doc: t.doc, tp: t.type, pn: t.partyName, qin: i ? t.qty : 0, qout: i ? 0 : t.qty, pr: t.price, bal: run }); });
    return '<div class="sheet">' + APP.sheetHead('كارت الصنف', x.code + ' - ' + x.name) +
      '<div class="toolbar noprint"><a class="btn" href="#/items">رجوع للأصناف</a><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="كارت_' + esc(code) + '">تصدير CSV</button></div>' +
      '<div class="kpis" style="margin-bottom:14px"><div class="kpi"><small>الرصيد</small><b>' + APP.fmtq(x.onHand) + ' ' + esc(x.unit) + '</b></div><div class="kpi"><small>متوسط التكلفة</small><b>' + fmt(x.avgCost) + '</b></div><div class="kpi"><small>قيمة المخزون</small><b>' + fmt(x.value) + '</b></div><div class="kpi"><small>إجمالي المبيعات</small><b>' + fmt(x.sales) + '</b></div><div class="kpi"><small>تكلفة المبيعات</small><b>' + fmt(x.cogs) + '</b></div></div>' +
      '<div class="scroll">' + APP.table([{ h: 'التاريخ', f: r => '<span class="n">' + r.d + '</span>' }, { h: 'المستند', f: r => r.doc ? '<a href="#/doc/' + encodeURIComponent(r.doc) + '">' + esc(r.doc) + '</a>' : '' }, { h: 'البيان', f: r => esc(r.tp) }, { h: 'الطرف', f: r => esc(r.pn) }, { h: 'وارد', n: 1, f: r => r.qin ? '<span class="n">' + APP.fmtq(r.qin) + '</span>' : '' }, { h: 'صادر', n: 1, f: r => r.qout ? '<span class="n">' + APP.fmtq(r.qout) + '</span>' : '' }, { h: 'السعر', n: 1, f: r => r.pr ? nc(r.pr) : '' }, { h: 'الرصيد', n: 1, f: r => '<span class="n' + (r.bal < -0.0005 ? ' neg' : '') + '">' + APP.fmtq(r.bal) + '</span>' }], rows, { id: 'rpt' }) + '</div></div>';
  }
};

R_.stockmoves = {
  title: 'حركة المخزون',
  html() {
    const from = APP.fv('from', APP.S.settings.startDate), to = APP.fv('to', APP.today());
    return '<div class="sheet">' + APP.sheetHead('حركة المخزون', 'الوارد والصادر والرصيد الجاري') +
      '<div class="toolbar">' + APP.dateFilter(from, to) +
      '<label class="f grow">الصنف<select class="in" data-f="item"><option value="">كل الأصناف</option>' +
      APP.S.items.map(x => '<option value="' + esc(x.code) + '"' + (APP.fv('item', '') === x.code ? ' selected' : '') + '>' + esc(x.code + ' - ' + x.name) + '</option>').join('') +
      '</select></label><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="حركة المخزون">تصدير CSV</button></div>' +
      '<div class="scroll" id="results">' + this.results() + '</div></div>';
  },
  results() {
    const from = APP.fv('from', APP.S.settings.startDate), to = APP.fv('to', APP.today()), code = APP.fv('item', '');
    const inTypes = new Set([T.ret, T.buy]), outTypes = new Set([T.sale, T.retBuy]);
    const rows = [];
    APP.S.items.filter(x => !code || x.code === code).forEach(item => {
      let run = item.openQty;
      APP.S.transactions.filter(t => t.itemCode === item.code && (inTypes.has(t.type) || outTypes.has(t.type)) && t.date < from).forEach(t => { run += inTypes.has(t.type) ? num(t.qty) : -num(t.qty); });
      APP.S.transactions.filter(t => t.itemCode === item.code && (inTypes.has(t.type) || outTypes.has(t.type)) && t.date >= from && t.date <= to)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq))
        .forEach(t => {
          const incoming = inTypes.has(t.type), qty = num(t.qty);
          run += incoming ? qty : -qty;
          rows.push({ date: t.date, doc: t.doc, item, type: t.type, party: t.partyName, in: incoming ? qty : 0, out: incoming ? 0 : qty, bal: run });
        });
    });
    return APP.table([
      { h: 'التاريخ', f: r => '<span class="n">' + r.date + '</span>' },
      { h: 'المستند', f: r => '<a href="#/doc/' + encodeURIComponent(r.doc) + '">' + esc(r.doc) + '</a>' },
      { h: 'الصنف', f: r => '<a href="#/itemcard/' + encodeURIComponent(r.item.code) + '">' + esc(r.item.name) + '</a>' },
      { h: 'النوع', f: r => esc(r.type) },
      { h: 'الطرف', f: r => esc(r.party || '') },
      { h: 'وارد', n: 1, f: r => r.in ? '<span class="n">' + APP.fmtq(r.in) + '</span>' : '', total: r => r.in },
      { h: 'صادر', n: 1, f: r => r.out ? '<span class="n">' + APP.fmtq(r.out) + '</span>' : '', total: r => r.out },
      { h: 'الرصيد الجاري', n: 1, f: r => '<span class="n' + (r.bal < -0.0005 ? ' neg' : '') + '">' + APP.fmtq(r.bal) + '</span>' }
    ], rows, { id: 'rpt', totals: true, empty: 'لا توجد حركة مخزون في الفترة المحددة.' });
  }
};

/* ---------- chart of accounts ---------- */
const ACC_TYPES = ['أصول', 'خصوم', 'حقوق ملكية', 'إيرادات', 'مصروفات'];
R_.coa = {
  title: 'دليل الحسابات',
  html() {
    return '<div class="sheet">' + APP.sheetHead('دليل الحسابات', 'الأرصدة حتى اليوم') +
      '<div class="toolbar">' + APP.searchBox('كود أو اسم الحساب') + '<button class="btn primary" data-act="accNew">+ حساب جديد</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="دليل_الحسابات">تصدير CSV</button></div><div class="scroll" id="results">' + this.results() + '</div></div>';
  },
  results() {
    const q = APP.fv('q', '').trim(); const rows = [];
    ACC_TYPES.forEach(tp => {
      const as = APP.S.coa.filter(a => a.type === tp && has(a.code + ' ' + a.name, q)).sort((a, b) => (a.code < b.code ? -1 : 1)); if (!as.length) return;
      rows.push({ grp: tp }); as.forEach(a => rows.push({ a }));
    });
    return APP.table([
      { h: 'الكود', f: r => r.grp ? '<b>' + esc(r.grp) + '</b>' : '<span class="n">' + esc(r.a.code) + '</span>' },
      { h: 'اسم الحساب', f: r => r.grp ? '' : '<a href="#/ledger/' + encodeURIComponent(r.a.code) + '">' + esc(r.a.name) + '</a>' },
      { h: 'المجموعة', f: r => r.grp ? '' : esc(r.a.group) },
      { h: 'نقدية/بنك', f: r => r.grp ? '' : (r.a.fin ? 'نعم' : '') },
      { h: 'الرصيد', n: 1, f: r => r.grp ? '' : nc(APP.bal(r.a.code)) },
      { h: '', cls: 'act', f: r => r.grp ? '' : '<a class="btn s" href="#/ledger/' + encodeURIComponent(r.a.code) + '">دفتر الأستاذ</a> <button class="btn s" data-act="accEdit" data-c="' + esc(r.a.code) + '">تعديل</button>' }
    ].map(c => c), rows.map(r => Object.assign(r, r.grp ? { _cls: 'grp' } : {})), { id: 'rpt' });
  }
};
function accForm(a) {
  const isNew = !a; const x = a || { code: '', name: '', type: 'أصول', group: '', fin: false, accountNo: '', notes: '' };
  const used = !isNew && APP.R.journal.some(l => l.acc === x.code);
  const groups = Array.from(new Set(APP.S.coa.map(y => y.group).filter(Boolean)));
  APP.modal('<h3>' + (isNew ? 'حساب جديد' : 'تعديل: ' + esc(x.name)) + '</h3><div class="mbody"><div class="frow c2"><label class="f">الكود <span class="req">*</span><input class="in n" id="afCode" value="' + esc(x.code) + '"' + (!isNew ? ' readonly' : '') + '></label><label class="f">اسم الحساب <span class="req">*</span><input class="in" id="afName" value="' + esc(x.name) + '"></label></div>' +
    '<div class="frow c2"><label class="f">النوع<select class="in" id="afType">' + ACC_TYPES.map(t => '<option' + (t === x.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label><label class="f">المجموعة<input class="in" id="afGrp" list="dlGrp" value="' + esc(x.group) + '"><datalist id="dlGrp">' + groups.map(g => '<option value="' + esc(g) + '">').join('') + '</datalist></label></div>' +
    '<div class="frow"><label class="f">رقم الحساب / الهاتف<input class="in n" id="afNo" value="' + esc(x.accountNo || '') + '" placeholder="رقم البنك أو فودافون كاش أو إنستا باي"><span class="hint">يظهر عند اختيار الحساب في الفاتورة والسند.</span></label></div><label class="f" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="afFin"' + (x.fin ? ' checked' : '') + '> حساب نقدية / بنك (يظهر في أرصدة الخزينة وفي سندات الدفع)</label><div id="afErr" class="err"></div></div>' +
    '<div class="mfoot"><button class="btn primary" id="afOk">حفظ</button><button class="btn" data-act="mclose">إلغاء</button>' + (!isNew && !used ? '<button class="btn danger" id="afDel" style="margin-right:auto">حذف</button>' : '') + '</div>');
  $('#afOk').onclick = () => {
    const er = $('#afErr'), code = $('#afCode').value.trim(), nm = $('#afName').value.trim(); if (!code || !nm) { er.textContent = 'الكود والاسم مطلوبين.'; return; }
    if (isNew && APP.S.coa.some(y => y.code === code)) { er.textContent = 'الكود ده مستخدم قبل كده.'; return; }
    const rec = { code, name: nm, type: $('#afType').value, group: $('#afGrp').value.trim(), fin: $('#afFin').checked, accountNo: $('#afNo').value.trim(), notes: x.notes || '' };
    if (isNew) APP.S.coa.push(rec); else Object.assign(a, rec);
    APP.mclose(); APP.commit('تم الحفظ.');
  };
  if ($('#afDel')) $('#afDel').onclick = async () => {
    const s = APP.S.settings; if (ACC_USED(x.code)) { $('#afErr').textContent = 'الحساب ده مربوط في الإعدادات أو ربط الحسابات — غيّر الربط الأول.'; return; }
    if (await APP.confirm('حذف الحساب ' + x.name + '؟', 'حذف', true)) { APP.S.coa.splice(APP.S.coa.indexOf(a), 1); APP.mclose(); APP.commit('تم الحذف.'); }
  };
}
function ACC_USED(code) { const s = APP.S.settings, M = APP.S.mapping; return Object.keys(s).some(k => k.indexOf('acc') === 0 && s[k] === code) || ['types', 'methods', 'expenses', 'incomes'].some(k => M[k].some(m => m.acc === code)); }
APP.acts.accNew = () => accForm(null);
APP.acts.accEdit = b => { const a = APP.S.coa.find(x => x.code === b.dataset.c); if (a) accForm(a); };

/* ---------- treasury balances ---------- */
R_.treasury = {
  title: 'أرصدة الخزينة والبنوك',
  html() {
    const fin = APP.S.coa.filter(a => a.fin); const from = APP.fv('from', APP.S.settings.startDate), to = APP.fv('to', APP.today());
    const tb = E.trialBalance(APP.S, APP.R, from, to, false).filter(r => fin.some(a => a.code === r.code));
    const rows = tb.map(r => ({ code: r.code, name: r.name, open: r.openDr - r.openCr, din: r.movDr, dout: r.movCr, close: r.closeDr - r.closeCr }));
    return '<div class="sheet">' + APP.sheetHead('أرصدة الخزينة والبنوك', 'من ' + from + ' إلى ' + to) + '<div class="toolbar noprint">' + APP.dateFilter(from, to) + '<button class="btn" data-f-apply="1" data-act="full">عرض</button><button class="btn" data-act="print">طباعة</button></div><div class="scroll">' +
      APP.table([{ h: 'الحساب', f: r => '<a href="#/ledger/' + encodeURIComponent(r.code) + '">' + esc(r.code + ' - ' + r.name) + '</a>' }, { h: 'رصيد أول الفترة', n: 1, f: r => nc(r.open), total: r => r.open }, { h: 'وارد', n: 1, f: r => nc(r.din), total: r => r.din }, { h: 'صادر', n: 1, f: r => nc(r.dout), total: r => r.dout }, { h: 'الرصيد', n: 1, f: r => nc(r.close), total: r => r.close }], rows, { totals: true, empty: 'مفيش حسابات نقدية. علّم حساب بـ «نقدية/بنك» من دليل الحسابات.' }) + '</div></div>';
  }
};
APP.acts.full = () => APP.rerender();

/* ---------- journal ---------- */
R_.journal = {
  title: 'دفتر القيود',
  html() {
    return '<div class="sheet">' + APP.sheetHead('دفتر القيود اليومية', 'الأحدث أولًا') + '<div class="toolbar">' + APP.dateFilter('', '') + APP.searchBox('رقم قيد أو مستند أو طرف أو حساب أو بيان') + '<label class="f">النوع<select class="in" data-f="ty"><option value="">الكل</option><option value="آلي">آلي (من الحركات)</option><option value="افتتاحي">افتتاحي</option><option value="يدوي">يدوي</option><option value="تحويل">تحويل</option><option value="تسوية">تسوية</option><option value="إقفال">إقفال</option></select></label><button class="btn" data-act="print">طباعة</button><a class="btn primary" href="#/manual">+ قيد يدوي</a></div><div class="scroll" id="results">' + this.results() + '</div></div>';
  },
  results() {
    const f = APP.UI.f, q = (f.q || '').trim().toLowerCase(), from = f.from || '', to = f.to || '', ty = f.ty || '';
    const byE = new Map();
    APP.R.journal.forEach(l => { let e = byE.get(l.en); if (!e) { e = { en: l.en, date: l.date, typ: l.typ, doc: l.doc, lines: [], txt: '' }; byE.set(l.en, e); } e.lines.push(l); });
    let ents = Array.from(byE.values()).filter(e => (!from || e.date >= from) && (!to || e.date <= to) && (!ty || e.typ === ty));
    if (q) ents = ents.filter(e => { if (!e._t) e._t = (e.en + ' ' + e.doc + ' ' + e.lines.map(l => l.acc + ' ' + l.accName + ' ' + l.pn + ' ' + l.pc + ' ' + APP.txDesc(l)).join(' ')).toLowerCase(); return e._t.indexOf(q) >= 0; });
    ents.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.en - a.en));
    const pg = APP.paged(ents, 40); let sd = 0, sc = 0; ents.forEach(e => e.lines.forEach(l => { sd += l.dr; sc += l.cr; }));
    let h = '<table class="grid"><thead><tr><th>الحساب</th><th>البيان</th><th>الطرف</th><th class="n">مدين</th><th class="n">دائن</th></tr></thead><tbody>';
    if (!pg.rows.length) h += '<tr><td colspan="5" class="empty">مفيش قيود مطابقة.</td></tr>';
    pg.rows.forEach(e => {
      h += '<tr class="entry"><td colspan="5">قيد <span class="n">' + e.en + '</span> — <span class="n">' + e.date + '</span> — ' + esc(e.typ) + (e.doc ? ' — مستند <a href="#/doc/' + encodeURIComponent(e.doc) + '">' + esc(e.doc) + '</a>' : '') + (e.typ !== T.auto && e.typ !== T.opening ? ' <button class="btn s noprint" data-act="manDel" data-e="' + e.en + '">حذف</button> <a class="btn s noprint" href="#/manual/' + e.en + '">تعديل</a>' : '') + '</td></tr>';
      e.lines.forEach(l => { h += '<tr><td><a href="#/ledger/' + encodeURIComponent(l.acc) + '">' + esc(l.acc + ' - ' + (APP.accName(l.acc))) + '</a></td><td class="wrap">' + esc(APP.txDesc(l)) + '</td><td>' + esc(l.pn) + '</td><td class="n">' + nc(l.dr, true) + '</td><td class="n">' + nc(l.cr, true) + '</td></tr>'; });
    });
    h += '</tbody>' + (ents.length ? '<tfoot><tr class="tot"><td colspan="3">إجمالي الفلتر (' + ents.length + ' قيد)</td><td class="n">' + nc(sd) + '</td><td class="n">' + nc(sc) + '</td></tr></tfoot>' : '') + '</table>';
    return h + pg.html;
  }
};
APP.acts.manDel = async b => {
  const en = parseInt(b.dataset.e, 10), m = APP.S.manual.find(x => x.jno === en); if (!m) { APP.toast('القيد ده مش يدوي.', 'bad'); return; }
  if (!APP.guard(m.date)) return; if (!await APP.confirm('حذف القيد اليدوي رقم ' + en + '؟', 'حذف', true)) return;
  APP.S.manual.splice(APP.S.manual.indexOf(m), 1); APP.commit('تم حذف القيد.');
};

/* ---------- documents ---------- */
R_.docs = {
  title: 'المستندات',
  html() {
    const types = Array.from(new Set(APP.R.docs.map(d => d.type)));
    return '<div class="sheet">' + APP.sheetHead('المستندات', 'فواتير وسندات') + '<div class="toolbar">' + APP.dateFilter('', '') + APP.searchBox('رقم المستند أو الطرف') + '<label class="f">النوع<select class="in" data-f="ty"><option value="">الكل</option>' + types.map(t => '<option>' + esc(t) + '</option>').join('') + '</select></label><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="المستندات">تصدير CSV</button></div><div class="scroll" id="results">' + this.results() + '</div></div>';
  },
  results() {
    const f = APP.UI.f, q = (f.q || '').trim(), from = f.from || '', to = f.to || '', ty = f.ty || '';
    let rows = APP.R.docs.filter(d => (!from || d.date >= from) && (!to || d.date <= to) && (!ty || d.type === ty) && has(d.doc + ' ' + d.pn, q));
    rows = rows.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); const pg = APP.paged(rows, 120);
    return APP.table([
      { h: 'التاريخ', f: d => '<span class="n">' + d.date + '</span>' }, { h: 'المستند', f: d => '<a href="#/doc/' + encodeURIComponent(d.doc) + '">' + esc(d.doc) + '</a>' }, { h: 'النوع', f: d => esc(d.type) }, { h: 'الطرف', f: d => esc(d.pn) },
      { h: 'الأسطر', n: 1, f: d => '<span class="n">' + d.lines + '</span>' }, { h: 'الإجمالي', n: 1, f: d => nc(d.gross), total: d => d.gross }, { h: 'الخصم', n: 1, f: d => nc(d.discount, true) }, { h: 'الصافي', n: 1, f: d => nc(d.net), total: d => d.net }, { h: 'المدفوع', n: 1, f: d => nc(d.paid, true) },
      { h: '', cls: 'act', f: d => '<a class="btn s" href="#/doc/' + encodeURIComponent(d.doc) + '">عرض</a> <button class="btn s" data-act="docEdit" data-d="' + esc(d.doc) + '">تعديل</button> <button class="btn s danger" data-act="docDel" data-d="' + esc(d.doc) + '">حذف</button>' }
    ], pg.rows, { id: 'rpt', totals: false, empty: 'مفيش مستندات مطابقة.' }) + pg.html;
  }
};

/* ---------- transactions log ---------- */
R_.txs = {
  title: 'سجل الحركات',
  html() {
    return '<div class="sheet">' + APP.sheetHead('سجل الحركات', 'كل حركة وقيدها') + '<div class="toolbar">' + APP.dateFilter('', '') + APP.searchBox('طرف أو صنف أو مستند أو بيان') + '<label class="f">المصدر<select class="in" data-f="src"><option value="">الكل</option><option>' + T.sales + '</option><option>' + T.purch + '</option><option>' + T.treas + '</option></select></label><label class="f">النوع<select class="in" data-f="ty"><option value="">الكل</option>' + Array.from(new Set(APP.S.transactions.map(t => t.type))).map(t => '<option>' + esc(t) + '</option>').join('') + '</select></label><label class="f">ملاحظات<select class="in" data-f="fl"><option value="">الكل</option><option value="1">عليها ملاحظة</option></select></label><button class="btn" data-act="print">طباعة</button></div><div class="scroll" id="results">' + this.results() + '</div></div>';
  },
  results() {
    const f = APP.UI.f, q = (f.q || '').trim(), from = f.from || '', to = f.to || '';
    let rows = APP.S.transactions.filter(t => (!from || t.date >= from) && (!to || t.date <= to) && (!f.src || t.source === f.src) && (!f.ty || t.type === f.ty) && (!f.fl || (APP.R.txInfo.get(t.id) || {}).flag) && has(t.partyName + ' ' + t.itemName + ' ' + t.doc + ' ' + t.desc + ' ' + t.partyCode + ' ' + t.itemCode, q));
    rows = rows.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)); const pg = APP.paged(rows, 100);
    return APP.table([
      { h: 'التاريخ', f: t => '<span class="n">' + t.date + '</span>' }, { h: 'المستند', f: t => t.doc ? '<a href="#/doc/' + encodeURIComponent(t.doc) + '">' + esc(t.doc) + '</a>' : '' }, { h: 'المصدر', f: t => esc(t.source) }, { h: 'النوع', f: t => esc(t.type) },
      { h: 'الطرف', f: t => esc(t.partyName) }, { h: 'الصنف', f: t => esc(t.itemName) }, { h: 'العدد', n: 1, f: t => t.pieces ? '<span class="n">' + APP.fmtq(t.pieces) + '</span>' : '' }, { h: 'الكمية', n: 1, f: t => t.qty ? '<span class="n">' + APP.fmtq(t.qty) + '</span>' : '' }, { h: 'السعر', n: 1, f: t => t.price ? nc(t.price) : '' },
      { h: 'مدين', n: 1, f: t => nc(t.debit, true), total: t => t.debit }, { h: 'دائن', n: 1, f: t => nc(t.credit, true), total: t => t.credit }, { h: 'قيد', n: 1, f: t => '<span class="n">' + ((APP.R.txInfo.get(t.id) || {}).jno || '') + '</span>' },
      { h: 'ملاحظة', cls: 'wrap', f: t => { const i = APP.R.txInfo.get(t.id); return i && i.flag ? '<span class="chip warn">' + esc(i.flag) + '</span>' : ''; } },
      { h: '', cls: 'act', f: t => '<button class="btn s" data-act="txEdit" data-id="' + t.id + '">تعديل</button> <button class="btn s danger" data-act="txDel" data-id="' + t.id + '">حذف</button>' }
    ], pg.rows, { id: 'rpt', totals: rows.length <= 100, empty: 'مفيش حركات مطابقة.' }) + pg.html;
  }
};
APP.acts.txDel = async b => {
  const t = APP.txBy.get(parseInt(b.dataset.id, 10)); if (!t) return; if (!APP.guard(t.date)) return;
  if (!await APP.confirm('حذف الحركة: ' + t.type + ' ' + (t.partyName || '') + ' بمبلغ ' + fmt(t.debit + t.credit) + '؟', 'حذف', true)) return;
  APP.S.transactions.splice(APP.S.transactions.indexOf(t), 1); APP.commit('تم حذف الحركة.');
};
APP.acts.docDel = async b => {
  const d = b.dataset.d, ts = APP.S.transactions.filter(t => t.doc === d); if (!ts.length) return; if (ts.some(t => !APP.guard(t.date))) return;
  if (!await APP.confirm('حذف المستند ' + d + ' بكل حركاته (' + ts.length + ')؟', 'حذف', true)) return;
  APP.S.transactions = APP.S.transactions.filter(t => t.doc !== d); APP.commit('تم حذف المستند.');
};
APP.acts.txEdit = b => {
  const t = APP.txBy.get(parseInt(b.dataset.id, 10)); if (!t) return;
  const types = t.source === T.treas ? [T.exp, T.inc] : (t.source === T.sales ? [T.sale, T.ret, T.coll, T.disc, T.pay, 'عجز', 'سلفة', T.buy] : [T.buy, T.retBuy, T.pay, T.disc]);
  if (types.indexOf(t.type) < 0) types.push(t.type);
  const fin = APP.S.coa.filter(a => a.fin);
  APP.modal('<h3>تعديل حركة</h3><div class="mbody"><div class="frow"><label class="f">التاريخ<input class="in" type="date" id="teD" value="' + esc(t.date) + '"></label><label class="f">رقم المستند<input class="in" id="teDoc" value="' + esc(t.doc) + '"></label><label class="f">النوع<select class="in" id="teTp">' + types.map(x => '<option' + (x === t.type ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></label></div>' +
    '<div class="frow c2"><label class="f">' + (t.source === T.treas ? 'التصنيف' : 'الطرف (كود - اسم)') + '<input class="in" id="teP" list="dlTeP" value="' + esc(t.partyCode ? t.partyCode + ' - ' + t.partyName : t.partyName) + '"><datalist id="dlTeP">' + (t.source === T.treas ? (t.type === T.inc ? APP.S.mapping.incomes : APP.S.mapping.expenses).map(m => '<option value="' + esc(m.key) + '">').join('') : APP.S.parties.filter(p => p.type === (t.source === T.sales ? T.cust : T.supp)).map(p => '<option value="' + esc(APP.pLabel(p)) + '">').join('')) + '</datalist></label>' +
    '<label class="f">الصنف (كود - اسم)<input class="in" id="teI" list="dlTeI" value="' + esc(t.itemCode ? t.itemCode + ' - ' + t.itemName : '') + '"><datalist id="dlTeI">' + APP.S.items.map(x => '<option value="' + esc(APP.iLabel(x)) + '">').join('') + '</datalist></label></div>' +
    '<div class="frow"><label class="f">العدد<input class="in n" id="teC" value="' + esc(t.pieces || 0) + '"></label><label class="f">الكمية<input class="in n" id="teQ" value="' + esc(t.qty) + '"></label><label class="f">السعر<input class="in n" id="teR" value="' + esc(t.price) + '"></label><label class="f">مدين<input class="in n" id="teDr" value="' + esc(t.debit) + '"></label><label class="f">دائن<input class="in n" id="teCr" value="' + esc(t.credit) + '"></label></div>' +
    '<div class="frow c2"><label class="f">طريقة الدفع / الحساب<select class="in" id="teAcc"><option value="">تلقائي</option>' + fin.map(a => '<option value="' + esc(a.code) + '"' + (a.code === t.acc ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select></label><label class="f">البيان<input class="in" id="teDesc" value="' + esc(t.desc) + '"></label></div><div id="teErr" class="err"></div></div>' +
    '<div class="mfoot"><button class="btn primary" id="teOk">حفظ</button><button class="btn" data-act="mclose">إلغاء</button></div>', { wide: 1 });
  $('#teOk').onclick = () => {
    const er = $('#teErr'), d = $('#teD').value; if (!d) { er.textContent = 'اكتب التاريخ.'; return; } if (!APP.guard(d) || !APP.guard(t.date)) return;
    const dr = parseFloat($('#teDr').value || '0'), cr = parseFloat($('#teCr').value || '0'), q = parseFloat($('#teQ').value || '0'), pr = parseFloat($('#teR').value || '0'), pc = parseFloat($('#teC').value || '0'); if ([dr, cr, q, pr, pc].some(isNaN)) { er.textContent = 'الأرقام مش مظبوطة.'; return; }
    const pv = $('#teP').value.trim(), iv = $('#teI').value.trim();
    if (t.source !== T.treas) { const m = pv.split(' - '); const p = APP.S.parties.find(x => x.code === m[0].trim() && x.type === (t.source === T.sales ? T.cust : T.supp)) || APP.S.parties.find(x => x.name === pv && x.type === (t.source === T.sales ? T.cust : T.supp)); if (!p) { er.textContent = 'الطرف مش موجود في ' + (t.source === T.sales ? 'العملاء' : 'الموردين') + '.'; return; } t.partyCode = p.code; t.partyName = p.name; } else t.partyName = pv;
    if (iv) { const m = iv.split(' - '); const x = APP.S.items.find(y => y.code === m[0].trim()) || APP.S.items.find(y => y.name === iv); if (!x) { er.textContent = 'الصنف مش موجود.'; return; } t.itemCode = x.code; t.itemName = x.name; } else { t.itemCode = ''; t.itemName = ''; }
    Object.assign(t, { date: d, doc: $('#teDoc').value.trim(), type: $('#teTp').value, qty: q, pieces: pc, price: pr, debit: dr, credit: cr, amount: dr + cr, mis: false, acc: $('#teAcc').value, desc: $('#teDesc').value.trim() });
    APP.mclose(); APP.commit('تم تعديل الحركة.');
  };
};
})(window);
