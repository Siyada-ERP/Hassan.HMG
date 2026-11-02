/* =====================================================================
   SIYADA - dashboard, checks, settings, mapping, import, backup
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP, E = root.SiyadaEngine, T = E.T, r2 = E.r2, num = E.num;
const { $, $$, esc, fmt, nc } = APP;
const R_ = APP.routes;

function typeSum(t) { let s = 0; APP.S.coa.forEach(a => { if (a.type === t) s += APP.bal(a.code); }); return s; }
APP.totals = function () {
  const S = APP.S, st = S.settings;
  const assets = typeSum('أصول'), liab = -typeSum('خصوم'), eq = -typeSum('حقوق ملكية'), profit = -(typeSum('إيرادات') + typeSum('مصروفات'));
  let fin = 0; S.coa.forEach(a => { if (a.fin) fin += APP.bal(a.code); });
  return { assets, liab, eq, profit, fin, ar: APP.bal(st.accAR), ap: -APP.bal(st.accAP), inv: APP.bal(st.accInv) };
};
// net sales per month (core revenue groups)
APP.monthlySales = function (months) {
  const core = new Set(APP.S.coa.filter(a => a.group === 'إيرادات النشاط' || a.group === 'خصومات المبيعات').map(a => a.code));
  const m = new Map(months.map(k => [k, 0]));
  APP.R.journal.forEach(l => { if (core.has(l.acc) && l.typ !== T.closing) { const k = l.date.slice(0, 7); if (m.has(k)) m.set(k, m.get(k) + l.cr - l.dr); } });
  return months.map(k => r2(m.get(k)));
};
function lastMonths(n) {
  const out = []; const d = new Date(); let y = d.getFullYear(), mo = d.getMonth() + 1;
  for (let i = 0; i < n; i++) { out.unshift(y + '-' + String(mo).padStart(2, '0')); mo--; if (mo === 0) { mo = 12; y--; } }
  return out;
}
function chartSVG(keys, vals) {
  const W = 640, H = 230, L = 8, B = 28, Tp = 14, n = keys.length; const mx = Math.max(1, ...vals.map(v => Math.max(v, 0)));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(mx))); const f = mx / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
  const ph = H - B - Tp, bw = (W - L * 2) / n; let g = '', b = '';
  for (let i = 0; i <= 4; i++) { const y = Tp + ph - ph * i / 4; g += '<line class="gl" x1="' + L + '" x2="' + (W - L) + '" y1="' + y + '" y2="' + y + '"/>'; g += '<text x="' + (W - L) + '" y="' + (y - 3) + '" text-anchor="end">' + APP.short(nice * i / 4) + '</text>'; }
  const cur = new Date().toISOString().slice(0, 7);
  vals.forEach((v, i) => {
    const h = Math.max(0, v) / nice * ph, x = W - L - (i + 1) * bw + bw * 0.16;
    b += '<rect class="bar' + (keys[i] === cur ? ' cur' : '') + '" x="' + x.toFixed(1) + '" y="' + (Tp + ph - h).toFixed(1) + '" width="' + (bw * 0.68).toFixed(1) + '" height="' + h.toFixed(1) + '"><title>' + APP.monthName(keys[i]) + ': ' + fmt(v) + '</title></rect>';
    b += '<text x="' + (x + bw * 0.34).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + keys[i].slice(5) + '</text>';
  });
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="صافي المبيعات الشهرية">' + g + '<line class="base" x1="' + L + '" x2="' + (W - L) + '" y1="' + (Tp + ph) + '" y2="' + (Tp + ph) + '"/>' + b + '</svg>';
}
function ckList(arr) {
  return arr.map(c => '<div class="ck"><i class="' + c.stat + '">' + (c.stat === 'ok' ? '✓' : c.stat === 'warn' ? '!' : '✕') + '</i><div>' + esc(c.name) + (c.stat !== 'ok' ? ' <span class="chip ' + c.stat + ' n">' + (typeof c.diff === 'number' ? fmt(c.diff) : esc(c.diff)) + '</span>' : '') + '<small>' + esc(c.note || '') + '</small></div></div>').join('');
}

function alertsPanel() {
  const a = APP.alerts();
  const blk = (title, arr, f, link) => '<div class="al"><b>' + title + ' <span class="chip ' + (arr.length ? 'warn' : 'ok') + ' n">' + arr.length + '</span></b>' + (arr.length ? '<ul>' + arr.slice(0, 5).map(f).join('') + '</ul>' + (arr.length > 5 ? '<a class="sm" href="' + link + '">كل القايمة (' + arr.length + ')</a>' : '') : '<div class="muted sm" style="margin-top:6px">✓ مفيش</div>') + '</div>';
  const pl = p => '<li><a href="#/statement/' + encodeURIComponent(p.code) + '">' + esc(p.name) + '</a>';
  const il = x => '<li><a href="#/itemcard/' + encodeURIComponent(x.code) + '">' + esc(x.name) + '</a>';
  return '<div class="panel" style="margin-bottom:22px"><h2>تنبيهات</h2><div class="alerts">' +
    blk('عملاء تعدّوا الحد الائتماني', a.over, p => pl(p) + '<span class="n neg">+' + fmt(p.balance - p.limit) + '</span></li>', '#/customers') +
    blk('عملاء بدون تحصيل من ' + a.days + ' يوم', a.stale, p => pl(p) + '<span class="n">' + fmt(p.balance) + '</span></li>', '#/customers') +
    blk('أصناف وصلت حد الطلب', a.low, x => il(x) + '<span class="n">' + APP.fmtq(x.onHand) + '</span></li>', '#/items') +
    blk('أصناف رصيدها سالب', a.neg, x => il(x) + '<span class="n neg">' + APP.fmtq(x.onHand) + '</span></li>', '#/items') + '</div></div>';
}
R_.dashboard = {
  title: 'لوحة التحكم',
  html() {
    const S = APP.S, R = APP.R, t = APP.totals();
    const empty = !S.transactions.length && !S.manual.length;
    const months = lastMonths(12), vals = APP.monthlySales(months);
    const mNow = vals[vals.length - 1], mPrev = vals[vals.length - 2];
    const debtors = R.parties.filter(p => p.type === T.cust && p.balance > 0.5).sort((a, b) => b.balance - a.balance).slice(0, 6);
    const recent = R.docs.filter(d => d.date).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 8);
    const bad = R.checks.filter(c => c.stat !== 'ok').length;
    let h = '';
    if (empty) h += '<div class="panel" style="margin-bottom:20px"><h2>ابدأ من هنا</h2><p class="muted" style="margin:0 0 12px">دفاترك فاضية. الترتيب المقترح: سجّل العملاء والموردين، بعدها الأصناف، وبعدها اعمل أول فاتورة.</p><div class="toolbar" style="margin:0"><a class="btn" href="#/customers">إضافة العملاء</a><a class="btn" href="#/suppliers">إضافة الموردين</a><a class="btn" href="#/items">إضافة الأصناف</a><a class="btn primary" href="#/sale">أول فاتورة بيع</a><a class="btn" href="#/import">استيراد بيانات موجودة</a></div></div>';
    h += '<div class="eq"><div class="t"><small>الأصول</small><b>' + fmt(t.assets) + '</b></div><span class="op">=</span><div class="t"><small>الخصوم</small><b>' + fmt(t.liab) + '</b></div><span class="op">+</span><div class="t"><small>حقوق الملكية</small><b>' + fmt(t.eq) + '</b></div><span class="op">+</span><div class="t"><small>أرباح الفترة (غير مرحّلة)</small><b class="' + (t.profit < 0 ? 'neg' : '') + '">' + fmt(t.profit) + '</b></div></div>';
    h += '<div class="kpis">' +
      '<div class="kpi"><small>النقدية والبنوك</small><b>' + fmt(t.fin) + '</b><a href="#/treasury">التفاصيل</a></div>' +
      '<div class="kpi"><small>مديونية العملاء</small><b>' + fmt(t.ar) + '</b><a href="#/customers">العملاء</a></div>' +
      '<div class="kpi"><small>مستحق للموردين</small><b>' + fmt(t.ap) + '</b><a href="#/suppliers">الموردون</a></div>' +
      '<div class="kpi"><small>المخزون بالتكلفة</small><b class="' + (t.inv < 0 ? 'neg' : '') + '">' + fmt(t.inv) + '</b><a href="#/items">الأصناف</a></div>' +
      '<div class="kpi"><small>صافي مبيعات الشهر</small><b>' + fmt(mNow) + '</b><span class="muted sm">الشهر اللي قبله: <span class="n">' + fmt(mPrev) + '</span></span></div></div>';
    h += '<div class="cols"><div class="panel"><h2>صافي المبيعات — آخر 12 شهر</h2>' + chartSVG(months, vals) + '</div>' +
      '<div class="panel"><h2>فحوصات التناسق' + (bad ? '<small>' + bad + ' ملاحظة</small>' : '<small>كله سليم</small>') + '</h2>' + ckList(R.checks) + '<div style="margin-top:8px"><a href="#/checks">كل التفاصيل</a></div></div></div>';
    h += alertsPanel();
    h += '<div class="cols e"><div class="panel"><h2>أعلى مديونيات العملاء</h2>' +
      APP.table([{ h: 'العميل', f: p => '<a href="#/statement/' + encodeURIComponent(p.code) + '">' + esc(p.name) + '</a>' }, { h: 'الرصيد', n: 1, f: p => nc(p.balance) }], debtors, { empty: 'مفيش عملاء عليهم مديونية.' }) + '</div>' +
      '<div class="panel"><h2>آخر المستندات</h2>' +
      APP.table([{ h: 'التاريخ', f: d => '<span class="n">' + d.date + '</span>' }, { h: 'المستند', f: d => '<a href="#/doc/' + encodeURIComponent(d.doc) + '">' + esc(d.doc) + '</a> <span class="muted sm">' + esc(d.type) + '</span>' }, { h: 'الطرف', f: d => esc(d.pn) }, { h: 'القيمة', n: 1, f: d => nc(d.net) }], recent, { empty: 'لسه مفيش مستندات.' }) + '</div></div>';
    return h;
  }
};

/* ---------- checks ---------- */
R_.checks = {
  title: 'فحوصات التناسق',
  html() {
    const R = APP.R;
    const flagged = APP.S.transactions.filter(t => { const i = R.txInfo.get(t.id); return i && i.flag; });
    let h = '<div class="sheet">' + APP.sheetHead('فحوصات التناسق', 'يتحدّث مع كل حفظ') + ckList(R.checks) + '</div>';
    h += '<div class="sheet"><h2 style="margin-bottom:10px">الحركات اللي عليها ملاحظات <span class="muted sm">(' + flagged.length + ')</span></h2><div class="scroll" id="fl">' +
      APP.table([{ h: 'التاريخ', f: t => '<span class="n">' + t.date + '</span>' }, { h: 'المستند', f: t => esc(t.doc) }, { h: 'النوع', f: t => esc(t.type) }, { h: 'الطرف', f: t => esc(t.partyName) }, { h: 'الصنف', f: t => esc(t.itemName) }, { h: 'المبلغ', n: 1, f: t => nc(t.debit + t.credit) }, { h: 'الملاحظة', cls: 'wrap', f: t => esc(R.txInfo.get(t.id).flag) }],
        flagged.slice(0, 300), { empty: 'مفيش حركات عليها ملاحظات.' }) + '</div>' + (flagged.length > 300 ? '<p class="muted sm">معروض أول 300 حركة من ' + flagged.length + '.</p>' : '') + '</div>';
    return h;
  }
};

/* ---------- settings ---------- */
const ACC_FIELDS = [['accCash', 'حساب الخزينة الافتراضي'], ['accAR', 'حساب العملاء'], ['accAP', 'حساب الموردين'], ['accInv', 'حساب المخزون'], ['accCogs', 'حساب تكلفة البضاعة المباعة'], ['accSales', 'حساب المبيعات'], ['accSusp', 'الحساب المعلّق (للمراجعة)'], ['accOpen', 'رأس المال / الأرصدة الافتتاحية'], ['accRE', 'الأرباح المرحّلة'], ['accVatOut', 'ضريبة القيمة المضافة - مخرجات'], ['accVatIn', 'ضريبة القيمة المضافة - مدخلات'], ['accExp', 'مصروف افتراضي (تصنيف غير معروف)'], ['accInc', 'إيراد افتراضي (تصنيف غير معروف)']];
APP.accOptions = (sel, filter) => APP.S.coa.filter(a => !filter || filter(a)).map(a => '<option value="' + esc(a.code) + '"' + (a.code === sel ? ' selected' : '') + '>' + esc(a.code + ' - ' + a.name) + '</option>').join('');
R_.settings = {
  title: 'إعدادات الشركة',
  html() {
    const s = APP.S.settings;
    let h = '<div class="sheet doc"><div class="sh"><div class="t"><div class="co">' + esc(s.company) + '</div><div class="ti">إعدادات الشركة</div></div></div>' +
      '<p class="muted" style="margin-top:0">اسم الشركة بيتطبق فورًا على الشريط الجانبي وعنوان الصفحة وكل التقارير والفواتير المطبوعة.</p>' +
      '<div class="frow c2"><label class="f">اسم الشركة <span class="req">*</span><input class="in" id="sCo" value="' + esc(s.company) + '"></label><label class="f">النشاط<input class="in" id="sAct" value="' + esc(s.activity) + '"></label></div>' +
      '<div class="frow"><label class="f">كود نشاط المكلف (ETA)<input class="in n" id="sEtaAct" value="' + esc(s.etaActivity) + '"></label><label class="f">تنبيه العملاء المتأخرين بعد (يوم)<input class="in n" id="sAlD" value="' + esc(s.alertDays) + '"></label></div>' +
      '<div class="frow"><label class="f">الرقم الضريبي<input class="in n" id="sTax" value="' + esc(s.taxNo) + '"></label><label class="f">كود الفرع (ETA)<input class="in n" id="sBr" value="' + esc(s.branch) + '"></label><label class="f">الهاتف<input class="in n" id="sPh" value="' + esc(s.phone) + '"></label></div>' +
      '<div class="frow"><label class="f">المحافظة<input class="in" id="sGov" value="' + esc(s.gov) + '"></label><label class="f">المدينة<input class="in" id="sCity" value="' + esc(s.city) + '"></label><label class="f">الشارع<input class="in" id="sSt" value="' + esc(s.street) + '"></label><label class="f">رقم المبنى<input class="in" id="sBl" value="' + esc(s.bldg) + '"></label></div>' +
      '<div class="frow"><div class="f">الشعار<div class="logoPick"><span id="sLogoPv">' + (s.logo ? '<img alt="" src="' + esc(s.logo) + '">' : '<span class="muted sm">مفيش شعار</span>') + '</span><input type="file" accept="image/*" id="sLogo">' + (s.logo ? '<button class="btn s danger" data-act="rmLogo">إزالة</button>' : '') + '</div></div></div>' +
      '<h2 style="margin:22px 0 10px;padding-top:12px;border-top:1px solid var(--rule)">الدفاتر والضريبة</h2>' +
      '<div class="frow"><label class="f">تاريخ بداية الدفاتر<input class="in" type="date" id="sStart" value="' + esc(s.startDate) + '"><span class="hint">الأرصدة الافتتاحية بتتسجل بالتاريخ ده.</span></label>' +
      '<label class="f">قفل الفترات حتى تاريخ<input class="in" type="date" id="sLock" value="' + esc(s.closedUntil) + '"><span class="hint">مفيش إضافة أو تعديل أو حذف لحركات في تاريخ أقدم من التاريخ ده. سيبه فاضي لو مش عايز.</span></label>' +
      '<label class="f">ضريبة القيمة المضافة<select class="in" id="sVat"><option value="0"' + (!s.vatOn ? ' selected' : '') + '>غير مفعّلة</option><option value="1"' + (s.vatOn ? ' selected' : '') + '>مفعّلة (الأسعار شاملة الضريبة)</option></select></label>' +
      '<label class="f">النسبة الافتراضية %<input class="in n" id="sVr" value="' + esc(s.vatRate) + '"><span class="hint">تقدر تحدد نسبة مختلفة لكل صنف.</span></label></div>' +
      '<h2 style="margin:22px 0 10px;padding-top:12px;border-top:1px solid var(--rule)">الحسابات الأساسية</h2><div class="frow">' +
      ACC_FIELDS.map(f => '<label class="f">' + f[1] + '<select class="in" data-k="' + f[0] + '">' + APP.accOptions(s[f[0]]) + '</select></label>').join('') + '</div>' +
      '<div id="sErr" class="err"></div><div class="toolbar"><button class="btn primary" data-act="saveSettings">حفظ الإعدادات</button></div></div>';
    return h;
  },
  after() {
    $('#sLogo').onchange = async e => { try { APP.UI.newLogo = await APP.readLogo(e.target.files[0]); $('#sLogoPv').innerHTML = '<img alt="" src="' + APP.UI.newLogo + '">'; } catch (x) { $('#sErr').textContent = x.message; } };
    APP.UI.newLogo = undefined;
  }
};
APP.acts.rmLogo = () => { APP.S.settings.logo = ''; APP.applyCompany(); APP.saveSoon(); APP.rerender(); };
APP.acts.saveSettings = () => {
  const s = APP.S.settings; const co = $('#sCo').value.trim();
  if (!co) { $('#sErr').textContent = 'اسم الشركة مطلوب.'; return; }
  const sd = $('#sStart').value; if (!sd) { $('#sErr').textContent = 'اكتب تاريخ بداية الدفاتر.'; return; }
  const vr = parseFloat($('#sVr').value); if (!(vr >= 0 && vr < 100)) { $('#sErr').textContent = 'نسبة الضريبة لازم تكون بين 0 و 100.'; return; }
  Object.assign(s, { company: co, activity: $('#sAct').value.trim(), taxNo: $('#sTax').value.trim(), branch: $('#sBr').value.trim() || '0', phone: $('#sPh').value.trim(), gov: $('#sGov').value.trim(), city: $('#sCity').value.trim(), street: $('#sSt').value.trim(), bldg: $('#sBl').value.trim(), startDate: sd, closedUntil: $('#sLock').value, etaActivity: $('#sEtaAct').value.trim(), alertDays: parseInt($('#sAlD').value, 10) || 60, vatOn: $('#sVat').value === '1', vatRate: vr });
  if (APP.UI.newLogo !== undefined) s.logo = APP.UI.newLogo;
  $$('select[data-k]').forEach(x => { s[x.dataset.k] = x.value; });
  APP.applyCompany(); APP.commit('تم حفظ الإعدادات.');
};

/* ---------- mapping ---------- */
const MAPSEC = [
  ['types', 'ربط أنواع الحركات بالحسابات', 'كل نوع حركة بيتقابل مع حساب. «حسب طريقة الدفع» معناها الحساب يتحدد من الخزينة/البنك المختار في السند.'],
  ['methods', 'طرق الدفع (كلمات بتتدوّر عليها في البيان)', 'لو البيان فيه الكلمة دي والحركة جاية من ملف مستورد، بيتحدد حساب الخزينة المقابل.'],
  ['expenses', 'تصنيفات المصروفات', 'القائمة اللي بتظهر في سند المصروف.'],
  ['incomes', 'تصنيفات الإيرادات', 'القائمة اللي بتظهر في سند الإيراد.']
];
function mapRow(k, m) {
  const accSel = '<select class="in mk-acc">' + (k === 'types' ? '<option value="AUTO"' + (m.acc === 'AUTO' ? ' selected' : '') + '>حسب طريقة الدفع</option>' : '') + APP.accOptions(m.acc) + '</select>';
  let c = '';
  if (k === 'types') c = '<td><select class="in mk-src"><option' + (m.src === T.sales ? ' selected' : '') + '>' + T.sales + '</option><option' + (m.src === T.purch ? ' selected' : '') + '>' + T.purch + '</option></select></td><td><input class="in mk-key" value="' + esc(m.tp) + '"></td>';
  else c = '<td><input class="in mk-key" value="' + esc(m.key) + '"></td>';
  return '<tr>' + c + '<td>' + accSel + '</td><td class="act"><button class="btn s danger" data-act="mapDel" title="حذف">✕</button></td></tr>';
}
R_.mapping = {
  title: 'ربط الحسابات',
  html() {
    const M = APP.S.mapping; let h = '<div class="sheet doc"><div class="sh"><div class="t"><div class="co">' + esc(APP.company()) + '</div><div class="ti">ربط الحسابات</div></div></div>';
    MAPSEC.forEach(sec => {
      const k = sec[0];
      h += '<h2 style="margin:14px 0 4px">' + sec[1] + '</h2><p class="muted sm" style="margin:0 0 6px">' + sec[2] + '</p><table class="grid" data-k="' + k + '"><thead><tr>' + (k === 'types' ? '<th>المصدر</th><th>نوع الحركة</th>' : '<th>' + (k === 'methods' ? 'الكلمة' : 'التصنيف') + '</th>') + '<th>الحساب</th><th class="act"></th></tr></thead><tbody>' + M[k].map(m => mapRow(k, m)).join('') + '</tbody></table><div class="toolbar" style="margin-top:6px"><button class="btn s" data-act="mapAdd" data-k="' + k + '">+ إضافة صف</button></div>';
    });
    return h + '<div id="mErr" class="err"></div><div class="toolbar"><button class="btn primary" data-act="mapSave">حفظ الربط</button></div></div>';
  }
};
APP.acts.mapAdd = b => { const k = b.dataset.k; const tb = $('table[data-k="' + k + '"] tbody'); tb.insertAdjacentHTML('beforeend', mapRow(k, k === 'types' ? { src: T.sales, tp: '', acc: APP.S.coa[0] ? APP.S.coa[0].code : '' } : { key: '', acc: APP.S.coa[0] ? APP.S.coa[0].code : '' })); const f = $('.mk-key', tb.lastElementChild); if (f) f.focus(); };
APP.acts.mapDel = b => b.closest('tr').remove();
APP.acts.mapSave = () => {
  const M = { types: [], methods: [], expenses: [], incomes: [] };
  $$('table[data-k]').forEach(tb => {
    const k = tb.dataset.k;
    $$('tbody tr', tb).forEach(tr => {
      const key = $('.mk-key', tr).value.trim(), acc = $('.mk-acc', tr).value; if (!key) return;
      if (k === 'types') M.types.push({ src: $('.mk-src', tr).value, tp: key, acc }); else M[k].push({ key, acc });
    });
  });
  APP.S.mapping = M; APP.commit('تم حفظ الربط.');
};

/* ---------- import ---------- */
R_.import = {
  title: 'استيراد بيانات',
  html() {
    return '<div class="sheet doc"><div class="sh"><div class="t"><div class="co">' + esc(APP.company()) + '</div><div class="ti">استيراد بيانات</div></div></div>' +
      '<p style="margin-top:0">اختار ملفات التصدير (CSV) اللي طلعت من ملف SIYADA الإكسل — أو نسخة احتياطية JSON من البرنامج ده.</p>' +
      '<div class="bn bad" style="margin:0 0 14px"><span><b>تنبيه:</b> الاستيراد بيستبدل كل بيانات الدفاتر الحالية (العملاء، الأصناف، الحركات، القيود). اسم الشركة والشعار بيفضلوا زي ما هم. خد نسخة احتياطية قبل ما تكمل.</span></div>' +
      '<div class="frow c2"><label class="f">الملفات (حدد كل الملفات مرة واحدة)<input class="in" type="file" id="impF" multiple accept=".csv,.json"></label></div>' +
      '<p class="muted sm">الملفات المطلوبة على الأقل: transactions.csv و parties.csv و items.csv و accounts.csv و mapping_rules.csv و settings.csv و journal_lines.csv (عشان القيود اليدوية).</p><div id="impMsg" class="err"></div>' +
      '<div class="toolbar"><button class="btn primary" data-act="doImport">استيراد واستبدال البيانات</button><button class="btn" data-act="backup">حفظ نسخة احتياطية الأول</button></div></div>';
  }
};
APP.acts.doImport = async () => {
  const fl = $('#impF').files; const msg = $('#impMsg'); if (!fl.length) { msg.textContent = 'اختار الملفات الأول.'; return; }
  if (!await APP.confirm('كل بيانات الدفاتر الحالية هتتستبدل بالبيانات المستوردة. تكمل؟', 'استبدال', true)) return;
  try {
    const r = await APP.importFrom(fl, null);
    const keep = APP.S.settings; if (r.kind === 'csv') ['company', 'taxNo', 'activity', 'gov', 'city', 'street', 'bldg', 'phone', 'logo'].forEach(k => { r.S.settings[k] = keep[k] || r.S.settings[k]; });
    else if (!r.S.settings.company) r.S.settings.company = keep.company;
    APP.S = r.S; APP.S.meta.changes = 0; APP.commit('تم الاستيراد: ' + APP.R.counts.tx + ' حركة و' + APP.R.counts.entries + ' قيد.', { norender: true }); APP.applyCompany(); APP.go('dashboard');
  } catch (x) { msg.textContent = x.message; }
};

/* ---------- backup ---------- */
function csvOf(rows, cols) { return '﻿' + cols.join(',') + '\r\n' + rows.map(r => cols.map(c => { const v = r[c]; return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; }).join(',')).join('\r\n'); }
R_.backup = {
  title: 'نسخة احتياطية',
  html() {
    const S = APP.S, lb = S.meta.lastBackup; const mode = APP.store.mode();
    return '<div class="sheet doc"><div class="sh"><div class="t"><div class="co">' + esc(APP.company()) + '</div><div class="ti">نسخة احتياطية واستعادة</div></div></div>' +
      (APP.net.on ? '<p style="margin-top:0">بيانات الشركة محفوظة على السيرفر ومتزامنة مع كل المستخدمين، والسيرفر بياخد نسخة احتياطية كل يوم. تقدر برضه تنزّل نسخة JSON تحتفظ بيها عندك، أو تستعيد نسخة (للمالك فقط).</p>' : '<p style="margin-top:0">بياناتك محفوظة تلقائيًا داخل المتصفح على الجهاز ده فقط (' + (mode === 'idb' ? 'قاعدة بيانات المتصفح' : mode === 'ls' ? 'تخزين المتصفح المحلي' : '<b class="neg">غير متاح</b>') + '). لو مسحت بيانات المتصفح أو غيّرت مكان الملف أو فتحته من متصفح تاني، البيانات مش هتظهر — عشان كده النسخة الاحتياطية مهمة.</p>') +
      '<div class="bal ' + (lb ? 'ok' : 'bad') + '">' + (lb ? 'آخر نسخة احتياطية: <span class="n">' + esc(lb.slice(0, 16).replace('T', ' ')) + '</span> — تعديلات بعدها: ' + (S.meta.changes || 0) : 'لسه ما أخدتش نسخة احتياطية.') + '</div>' +
      '<div class="toolbar"><button class="btn primary" data-act="backup">حفظ نسخة احتياطية (JSON)</button></div>' +
      '<h2 style="margin:22px 0 8px;padding-top:12px;border-top:1px solid var(--rule)">استعادة نسخة احتياطية</h2><p class="muted sm" style="margin-top:0">الاستعادة بتستبدل كل البيانات الحالية.</p>' +
      '<div class="frow c2"><label class="f">ملف النسخة (JSON)<input class="in" type="file" id="rsF" accept=".json"></label></div><div id="rsMsg" class="err"></div><div class="toolbar"><button class="btn" data-act="doRestore">استعادة</button></div>' +
      '<h2 style="margin:22px 0 8px;padding-top:12px;border-top:1px solid var(--rule)">تصدير ملفات CSV</h2><div class="toolbar"><button class="btn" data-act="expCsv" data-w="journal">دفتر القيود</button><button class="btn" data-act="expCsv" data-w="parties">العملاء والموردين</button><button class="btn" data-act="expCsv" data-w="items">الأصناف</button><button class="btn" data-act="expCsv" data-w="tx">الحركات</button><button class="btn" data-act="expCsv" data-w="coa">دليل الحسابات</button></div>' +
      '<h2 style="margin:22px 0 8px;padding-top:12px;border-top:1px solid var(--rule)">مسح كل البيانات</h2><p class="muted sm" style="margin-top:0">بيمسح الدفاتر كلها من المتصفح ويرجّعك لشاشة الإعداد. خد نسخة احتياطية قبلها.</p><div class="toolbar"><button class="btn danger" data-act="wipe">مسح كل البيانات</button></div></div>';
  }
};
APP.acts.doRestore = async () => {
  const fl = $('#rsF').files; const msg = $('#rsMsg'); if (!fl.length) { msg.textContent = 'اختار ملف النسخة الأول.'; return; }
  try {
    const S = APP.normalizeState(APP.parseBackup(await fl[0].text()));
    if (!await APP.confirm('هتتستبدل كل البيانات الحالية بنسخة "' + (S.settings.company || '') + '". تكمل؟', 'استعادة', true)) return;
    APP.S = S; APP.S.meta.changes = 0; APP.commit('تمت الاستعادة.', { norender: true }); APP.applyCompany(); APP.go('dashboard');
  } catch (x) { msg.textContent = x.message; }
};
APP.acts.wipe = async () => {
  if (!await APP.confirm('هتتمسح كل بيانات الدفاتر من المتصفح نهائيًا. أخدت نسخة احتياطية؟', 'امسح كل حاجة', true)) return;
  await APP.store.wipe(); APP.S = null; location.hash = ''; location.reload();
};
APP.acts.expCsv = b => {
  const w = b.dataset.w, R = APP.R, S = APP.S, d = APP.today().replace(/-/g, '');
  if (w === 'journal') APP.download(csvOf(R.journal.map(l => ({ entry_no: l.en, line_no: l.ln, entry_date: l.date, account_code: l.acc, account_name: l.accName, debit: l.dr, credit: l.cr, description: l.desc || APP.txDesc(l), doc_no: l.doc, source: l.src, party_code: l.pc, party_name: l.pn, entry_type: l.typ })), ['entry_no', 'line_no', 'entry_date', 'account_code', 'account_name', 'debit', 'credit', 'description', 'doc_no', 'source', 'party_code', 'party_name', 'entry_type']), 'journal_lines_' + d + '.csv', 'text/csv;charset=utf-8');
  else if (w === 'parties') APP.download(csvOf(R.parties.map(p => ({ party_code: p.code, party_name: p.name, party_type: p.type, phone: p.phone, address: p.address, opening_balance: p.opening, total_debit: p.debit, total_credit: p.credit, balance: p.balance, credit_limit: p.limit, last_move: p.last, move_count: p.count })), ['party_code', 'party_name', 'party_type', 'phone', 'address', 'opening_balance', 'total_debit', 'total_credit', 'balance', 'credit_limit', 'last_move', 'move_count']), 'parties_' + d + '.csv', 'text/csv;charset=utf-8');
  else if (w === 'items') APP.download(csvOf(R.items.map(x => ({ item_code: x.code, item_name: x.name, unit: x.unit, opening_qty: x.openQty, opening_cost: x.openCost, qty_purchased: x.bought, qty_sold: x.sold, qty_on_hand: x.onHand, avg_cost: x.avgCost, stock_value: x.value, last_purchase_price: x.lastBuy, last_sale_price: x.lastSell, cogs_total: x.cogs, sales_total: x.sales })), ['item_code', 'item_name', 'unit', 'opening_qty', 'opening_cost', 'qty_purchased', 'qty_sold', 'qty_on_hand', 'avg_cost', 'stock_value', 'last_purchase_price', 'last_sale_price', 'cogs_total', 'sales_total']), 'items_' + d + '.csv', 'text/csv;charset=utf-8');
  else if (w === 'tx') APP.download(csvOf(S.transactions.map(t => { const i = R.txInfo.get(t.id) || {}; return { id: t.id, tx_date: t.date, source: t.source, doc_no: t.doc, tx_type: t.type, party_code: t.partyCode, party_name: t.partyName, item_code: t.itemCode, item_name: t.itemName, qty: t.qty, price: t.price, debit: t.debit, credit: t.credit, pay_method: i.meth || '', description: t.desc, net_amount: i.net, vat_amount: i.vat, cost_amount: i.cost, journal_no: i.jno, flag: i.flag }; }), ['id', 'tx_date', 'source', 'doc_no', 'tx_type', 'party_code', 'party_name', 'item_code', 'item_name', 'qty', 'price', 'debit', 'credit', 'pay_method', 'description', 'net_amount', 'vat_amount', 'cost_amount', 'journal_no', 'flag']), 'transactions_' + d + '.csv', 'text/csv;charset=utf-8');
  else if (w === 'coa') APP.download(csvOf(S.coa.map(a => ({ account_code: a.code, account_name: a.name, account_type: a.type, account_group: a.group, is_financial: a.fin ? T.yes : 'لا', notes: a.notes })), ['account_code', 'account_name', 'account_type', 'account_group', 'is_financial', 'notes']), 'accounts_' + d + '.csv', 'text/csv;charset=utf-8');
};
})(window);
