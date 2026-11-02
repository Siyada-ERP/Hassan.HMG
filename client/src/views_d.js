/* =====================================================================
   SIYADA - reports: general ledger, trial balance, income statement, balance sheet, party statement, sales/purchases
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP, E = root.SiyadaEngine, T = E.T, r2 = E.r2, num = E.num;
const { $, $$, esc, fmt, nc } = APP;
const R_ = APP.routes;
const DEBIT_NATURE = new Set(['أصول', 'مصروفات']);
const rptBar = (extra) => '<div class="toolbar noprint">' + (extra || '') + '<button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="تقرير">تصدير CSV</button></div>';
const period = (from, to) => (from ? 'من ' + from + ' ' : '') + 'إلى ' + (to || APP.today());

/* ---------- general ledger ---------- */
R_.ledger = {
  title: 'دفتر الأستاذ',
  html(arg) {
    const picker = '<label class="f grow">الحساب<input class="in" id="lgSel" list="dlLg" data-on="lgsel" value="' + esc(arg ? arg + ' - ' + APP.accName(arg) : '') + '" placeholder="اكتب كود أو اسم الحساب" autocomplete="off"><datalist id="dlLg">' + APP.S.coa.map(a => '<option value="' + esc(a.code + ' - ' + a.name) + '">').join('') + '</datalist></label>';
    const from = APP.fv('from', APP.S.settings.startDate), to = APP.fv('to', APP.today());
    if (!arg || !APP.coaBy.get(arg)) return '<div class="sheet">' + APP.sheetHead('دفتر الأستاذ', '') + '<div class="toolbar noprint">' + picker + '</div><p class="muted">اختار الحساب اللي عايز تشوف حركته.</p></div>';
    const a = APP.coaBy.get(arg), nat = DEBIT_NATURE.has(a.type) ? 1 : -1;
    const lines = APP.R.journal.filter(l => l.acc === arg).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.en - y.en || x.ln - y.ln));
    let run = 0, od = 0; const rows = [];
    lines.forEach(l => { if (from && l.date < from) { od += l.dr - l.cr; } });
    run = od * nat; rows.push({ _cls: 'grp', d: '', en: '', doc: '', tx: 'رصيد أول الفترة', pn: '', dr: 0, cr: 0, bal: run });
    let sd = 0, sc = 0;
    lines.forEach(l => { if ((from && l.date < from) || (to && l.date > to)) return; run += (l.dr - l.cr) * nat; sd += l.dr; sc += l.cr; rows.push({ d: l.date, en: l.en, doc: l.doc, tx: APP.txDesc(l) || l.typ, pn: l.pn, dr: l.dr, cr: l.cr, bal: run }); });
    const pg = APP.paged(rows, 400);
    return '<div class="sheet">' + APP.sheetHead('دفتر الأستاذ — ' + a.code + ' ' + a.name, period(from, to)) + '<div class="toolbar noprint">' + picker + APP.dateFilter(from, to) + '<button class="btn" data-act="full">عرض</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="دفتر_' + esc(arg) + '">تصدير CSV</button></div>' +
      '<div class="muted sm" style="margin-bottom:8px">طبيعة الحساب: ' + (nat === 1 ? 'مدين (الرصيد الموجب = مدين)' : 'دائن (الرصيد الموجب = دائن)') + '</div><div class="scroll" id="results">' +
      APP.table([{ h: 'التاريخ', f: r => '<span class="n">' + r.d + '</span>' }, { h: 'قيد', n: 1, f: r => '<span class="n">' + r.en + '</span>' }, { h: 'المستند', f: r => r.doc ? '<a href="#/doc/' + encodeURIComponent(r.doc) + '">' + esc(r.doc) + '</a>' : '' }, { h: 'البيان', cls: 'wrap', f: r => esc(r.tx) }, { h: 'الطرف', f: r => esc(r.pn) }, { h: 'مدين', n: 1, f: r => nc(r.dr, true) }, { h: 'دائن', n: 1, f: r => nc(r.cr, true) }, { h: 'الرصيد', n: 1, f: r => nc(r.bal) }], pg.rows, { id: 'rpt' }) +
      (rows.length <= 400 ? '<table class="grid"><tfoot><tr class="tot"><td>إجمالي الحركة</td><td class="n">' + nc(sd) + '</td><td class="n">' + nc(sc) + '</td><td>الرصيد الختامي</td><td class="n">' + nc(run) + '</td></tr></tfoot></table>' : '') + pg.html + '</div></div>';
  }
};
APP.ons.lgsel = t => { const code = t.value.split(' - ')[0].trim(); if (APP.coaBy.get(code) && t.value.indexOf(' - ') > 0) APP.go('ledger', code); };

/* ---------- trial balance ---------- */
R_.tb = {
  title: 'ميزان المراجعة',
  html() {
    const from = APP.fv('from', APP.S.settings.startDate), to = APP.fv('to', APP.today()), mv = APP.fv('mv', '1') === '1';
    const rows = E.trialBalance(APP.S, APP.R, from, to, mv);
    const tot = k => r2(rows.reduce((s, r) => s + r[k], 0));
    const ok = Math.abs(tot('openDr') - tot('openCr')) < 0.01 && Math.abs(tot('movDr') - tot('movCr')) < 0.01 && Math.abs(tot('closeDr') - tot('closeCr')) < 0.01;
    return '<div class="sheet">' + APP.sheetHead('ميزان المراجعة', period(from, to)) + '<div class="toolbar noprint">' + APP.dateFilter(from, to) + '<label class="f">عرض<select class="in" data-f="mv" data-full="1"><option value="1"' + (mv ? ' selected' : '') + '>الحسابات اللي عليها حركة</option><option value="0"' + (!mv ? ' selected' : '') + '>كل الحسابات</option></select></label><button class="btn" data-act="full">عرض</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="ميزان_المراجعة">تصدير CSV</button></div><div class="bal ' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'الميزان متوازن ✔' : 'الميزان مش متوازن — راجع فحوصات التناسق') + '</div><div class="scroll">' +
      '<table class="grid" id="rpt"><thead><tr><th rowspan="2">الكود</th><th rowspan="2">الحساب</th><th colspan="2" class="n">رصيد أول الفترة</th><th colspan="2" class="n">حركة الفترة</th><th colspan="2" class="n">الرصيد</th></tr><tr><th class="n">مدين</th><th class="n">دائن</th><th class="n">مدين</th><th class="n">دائن</th><th class="n">مدين</th><th class="n">دائن</th></tr></thead><tbody>' +
      (rows.length ? rows.map(r => '<tr><td><span class="n">' + esc(r.code) + '</span></td><td><a href="#/ledger/' + encodeURIComponent(r.code) + '">' + esc(r.name) + '</a></td><td class="n">' + nc(r.openDr, true) + '</td><td class="n">' + nc(r.openCr, true) + '</td><td class="n">' + nc(r.movDr, true) + '</td><td class="n">' + nc(r.movCr, true) + '</td><td class="n">' + nc(r.closeDr, true) + '</td><td class="n">' + nc(r.closeCr, true) + '</td></tr>').join('') : '<tr><td colspan="8" class="empty">مفيش حركة.</td></tr>') +
      '</tbody><tfoot><tr class="tot"><td colspan="2">الإجمالي</td>' + ['openDr', 'openCr', 'movDr', 'movCr', 'closeDr', 'closeCr'].map(k => '<td class="n">' + nc(tot(k)) + '</td>').join('') + '</tr></tfoot></table></div></div>';
  }
};

/* ---------- income statement ---------- */
function isData(from, to) {
  const rows = E.incomeStatement(APP.S, APP.R, from, to), grp = c => (APP.coaBy.get(c) || {}).group || '';
  const salesG = new Set(['إيرادات النشاط', 'خصومات المبيعات']);
  const sales = rows.filter(r => r.type === 'إيرادات' && salesG.has(grp(r.code))), other = rows.filter(r => r.type === 'إيرادات' && !salesG.has(grp(r.code)));
  const cogs = rows.filter(r => r.type === 'مصروفات' && grp(r.code) === 'تكلفة المبيعات'), opex = rows.filter(r => r.type === 'مصروفات' && grp(r.code) !== 'تكلفة المبيعات');
  const sum = a => r2(a.reduce((s, r) => s + r.amount, 0));
  const netSales = sum(sales), costS = -sum(cogs), gross = r2(netSales + sum(cogs)), exp = -sum(opex), oth = sum(other);
  return { sales, other, cogs, opex, netSales, costS, gross, exp, oth, net: r2(gross - exp + oth) };
}
R_.is = {
  title: 'قائمة الدخل',
  html() {
    const from = APP.fv('from', APP.S.settings.startDate), to = APP.fv('to', APP.today()), d = isData(from, to), base = d.netSales || 0;
    const pct = v => base ? '<span class="n">' + (v / base * 100).toFixed(1) + '%</span>' : '';
    const L = [];
    const sec = (t) => L.push({ _cls: 'grp', n: t, a: null });
    const row = (n, a, cls) => L.push({ n, a, _cls: cls || '' });
    sec('الإيرادات'); d.sales.forEach(r => row(r.code + ' - ' + r.name, r.amount)); row('صافي المبيعات', d.netSales, 'sub');
    sec('تكلفة المبيعات'); d.cogs.forEach(r => row(r.code + ' - ' + r.name, -r.amount)); row('إجمالي تكلفة المبيعات', d.costS, 'sub');
    row('مجمل الربح', d.gross, 'sub big');
    sec('المصروفات'); d.opex.forEach(r => row(r.code + ' - ' + r.name, -r.amount)); row('إجمالي المصروفات', d.exp, 'sub');
    sec('إيرادات أخرى'); d.other.forEach(r => row(r.code + ' - ' + r.name, r.amount)); row('إجمالي الإيرادات الأخرى', d.oth, 'sub');
    row('صافي الربح (الخسارة)', d.net, 'dbl');
    return '<div class="sheet doc">' + APP.sheetHead('قائمة الدخل', period(from, to)) + '<div class="toolbar noprint">' + APP.dateFilter(from, to) + '<button class="btn" data-act="full">عرض</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="قائمة_الدخل">تصدير CSV</button></div><div class="scroll">' +
      APP.table([{ h: 'البند', f: r => esc(r.n) }, { h: 'المبلغ', n: 1, f: r => r.a === null ? '' : nc(r.a) }, { h: '% من صافي المبيعات', n: 1, f: r => r.a === null ? '' : pct(r.a) }], L, { id: 'rpt' }) + '</div>' +
      '<p class="muted sm">قيود الإقفال مش داخلة في القائمة. تكلفة المبيعات محسوبة بمتوسط التكلفة، فلو في أصناف اتباعت من غير تكلفة مسجلة (شوف «فحوصات التناسق») الربح هيطلع أعلى من الحقيقي.</p></div>';
  }
};

/* ---------- balance sheet ---------- */
R_.bs = {
  title: 'المركز المالي',
  html() {
    const to = APP.fv('to', APP.today()), S = APP.S; const by = new Map();
    APP.R.journal.forEach(l => { if (!to || l.date <= to) by.set(l.acc, (by.get(l.acc) || 0) + l.dr - l.cr); });
    const sec = (tp, sign) => { const m = new Map(); S.coa.filter(a => a.type === tp).forEach(a => { const v = r2((by.get(a.code) || 0) * sign); if (Math.abs(v) >= 0.005) { const g = a.group || 'أخرى'; if (!m.has(g)) m.set(g, []); m.get(g).push({ code: a.code, name: a.name, v }); } }); return m; };
    const A = sec('أصول', 1), Li = sec('خصوم', -1), Eq = sec('حقوق ملكية', -1);
    let pr = 0; S.coa.forEach(a => { if (a.type === 'إيرادات' || a.type === 'مصروفات') pr -= (by.get(a.code) || 0); }); pr = r2(pr);
    const L = []; const tot = { a: 0, l: 0, e: 0 };
    const dump = (title, m, key) => { L.push({ _cls: 'grp', n: title, v: null }); m.forEach((arr, g) => { arr.forEach(r => { L.push({ n: r.code + ' - ' + r.name, v: r.v, code: r.code }); tot[key] += r.v; }); }); };
    dump('الأصول', A, 'a'); L.push({ n: 'إجمالي الأصول', v: tot.a, _cls: 'dbl' });
    dump('الخصوم', Li, 'l'); L.push({ n: 'إجمالي الخصوم', v: tot.l, _cls: 'sub' });
    dump('حقوق الملكية', Eq, 'e'); L.push({ n: 'أرباح (خسائر) الفترة غير المرحّلة', v: pr }); tot.e += pr; L.push({ n: 'إجمالي حقوق الملكية', v: r2(tot.e), _cls: 'sub' });
    L.push({ n: 'إجمالي الخصوم وحقوق الملكية', v: r2(tot.l + tot.e), _cls: 'dbl' });
    const diff = r2(tot.a - tot.l - tot.e);
    return '<div class="sheet doc">' + APP.sheetHead('المركز المالي (الميزانية)', 'في ' + (to || APP.today())) + '<div class="toolbar noprint"><label class="f">في تاريخ<input class="in" type="date" data-f="to" value="' + esc(to) + '"></label><button class="btn" data-act="full">عرض</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="المركز_المالي">تصدير CSV</button></div>' +
      '<div class="bal ' + (Math.abs(diff) < 0.01 ? 'ok' : 'bad') + '">' + (Math.abs(diff) < 0.01 ? 'الميزانية متوازنة ✔ (الأصول = الخصوم + حقوق الملكية)' : 'فرق في الميزانية: ' + fmt(diff)) + '</div><div class="scroll">' +
      APP.table([{ h: 'البند', f: r => r.code ? '<a href="#/ledger/' + encodeURIComponent(r.code) + '">' + esc(r.n) + '</a>' : esc(r.n) }, { h: 'المبلغ', n: 1, f: r => r.v === null ? '' : nc(r.v) }], L, { id: 'rpt' }) + '</div>' +
      '<p class="muted sm">المخزون بمتوسط التكلفة؛ لو في أصناف رصيدها سالب أو بدون تكلفة هتلاقي قيمة المخزون والأرباح مش دقيقة لحد ما تتصحح بيانات الأصناف.</p></div>';
  }
};

/* ---------- party statement ---------- */
R_.statement = {
  title: 'كشف حساب',
  html(arg) {
    const picker = '<label class="f grow">العميل / المورد<input class="in" id="stSel" list="dlSt" data-on="stsel" value="' + esc(arg && APP.pBy.get(arg) ? arg + ' - ' + APP.pBy.get(arg).name : '') + '" placeholder="اكتب كود أو اسم" autocomplete="off"><datalist id="dlSt">' + APP.S.parties.map(p => '<option value="' + esc(APP.pLabel(p)) + '">').join('') + '</datalist></label>';
    const p = arg ? APP.pBy.get(arg) : null;
    if (!p) return '<div class="sheet">' + APP.sheetHead('كشف حساب', '') + '<div class="toolbar noprint">' + picker + '</div><p class="muted">اختار العميل أو المورد.</p></div>';
    const from = APP.fv('from', ''), to = APP.fv('to', ''), isC = p.type === T.cust, sg = isC ? 1 : -1;
    const ord = l => { const t = l.tid ? APP.txBy.get(l.tid) : null; return t ? t.seq : 1e9 + l.en; };
    const lines = APP.R.journal.filter(l => l.pc === p.code).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : ord(x) - ord(y) || x.ln - y.ln));
    let run = 0; lines.forEach(l => { if (l.typ === T.opening || (from && l.date < from)) run += (l.dr - l.cr) * sg; });
    const rows = [{ _cls: 'grp', d: '', doc: '', tx: 'رصيد أول الفترة', dr: 0, cr: 0, bal: run }]; let sd = 0, sc = 0;
    lines.forEach(l => { if (l.typ === T.opening) return; if ((from && l.date < from) || (to && l.date > to)) return; run += (l.dr - l.cr) * sg; sd += l.dr; sc += l.cr; rows.push({ d: l.date, doc: l.doc, tx: APP.txDesc(l), dr: l.dr, cr: l.cr, bal: run }); });
    const pg = APP.paged(rows, 400);
    return '<div class="sheet">' + APP.sheetHead('كشف حساب ' + (isC ? 'عميل' : 'مورد'), period(from || '', to || '')) + '<div class="frow" style="margin-bottom:10px"><div><span class="muted sm">الاسم</span><div><b>' + esc(p.name) + '</b></div></div><div><span class="muted sm">الكود</span><div class="n">' + esc(p.code) + '</div></div><div><span class="muted sm">التليفون</span><div class="n">' + esc(p.phone) + '</div></div><div><span class="muted sm">الرصيد الحالي</span><div><b class="n ' + (p.balance < 0 ? 'neg' : '') + '">' + fmt(p.balance) + '</b></div></div></div>' +
      '<div class="toolbar noprint">' + picker + APP.dateFilter(from, to) + '<button class="btn" data-act="full">عرض</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="كشف_' + esc(p.code) + '">تصدير CSV</button><a class="btn primary" href="#/' + (isC ? 'receipt' : 'payment') + '" data-act="prefParty" data-c="' + esc(p.code) + '">' + (isC ? '+ سند قبض' : '+ سند دفع') + '</a></div><div class="scroll">' +
      APP.table([{ h: 'التاريخ', f: r => '<span class="n">' + r.d + '</span>' }, { h: 'المستند', f: r => r.doc ? '<a href="#/doc/' + encodeURIComponent(r.doc) + '">' + esc(r.doc) + '</a>' : '' }, { h: 'البيان', cls: 'wrap', f: r => esc(r.tx) }, { h: 'مدين', n: 1, f: r => nc(r.dr, true) }, { h: 'دائن', n: 1, f: r => nc(r.cr, true) }, { h: 'الرصيد', n: 1, f: r => nc(r.bal) }], pg.rows, { id: 'rpt' }) +
      (rows.length <= 400 ? '<table class="grid"><tfoot><tr class="tot"><td>الإجمالي</td><td class="n">' + nc(sd) + '</td><td class="n">' + nc(sc) + '</td><td>الرصيد</td><td class="n">' + nc(run) + '</td></tr></tfoot></table>' : '') + pg.html + '</div>' +
      '<p class="muted sm">' + (isC ? 'الرصيد الموجب = العميل مدين لنا.' : 'الرصيد الموجب = إحنا مدينين للمورد.') + '</p></div>';
  }
};
APP.ons.stsel = t => { const code = t.value.split(' - ')[0].trim(); if (APP.pBy.get(code) && t.value.indexOf(' - ') > 0) APP.go('statement', code); };
APP.acts.prefParty = b => { const p = APP.pBy.get(b.dataset.c); APP.UI.prefParty = p ? p.code + ' - ' + p.name : ''; location.hash = b.getAttribute('href'); };

/* ---------- sales / purchases report ---------- */
R_.salesrep = {
  title: 'تقرير المبيعات والمشتريات',
  html() {
    const from = APP.fv('from', APP.S.settings.startDate), to = APP.fv('to', APP.today()), v = APP.fv('v', 'cust');
    const R = APP.R, S = APP.S, rows = [];
    const inP = t => (!from || t.date >= from) && (!to || t.date <= to);
    let cols;
    if (v === 'cust' || v === 'supp') {
      const m = new Map(); const sales = v === 'cust';
      S.transactions.forEach(t => {
        if (!inP(t)) return; if (sales ? t.source !== T.sales : t.source !== T.purch) return;
        const k = t.partyCode || t.partyName; let r = m.get(k); if (!r) { r = { name: t.partyName, code: t.partyCode, g: 0, rt: 0, ds: 0, pd: 0, n: 0 }; m.set(k, r); }
        const amt = t.debit + t.credit;
        if (t.type === (sales ? T.sale : T.buy)) { r.g += amt; r.n++; } else if (t.type === (sales ? T.ret : T.retBuy)) r.rt += amt; else if (t.type === T.disc) r.ds += amt; else if (t.type === (sales ? T.coll : T.pay)) r.pd += amt;
      });
      m.forEach(r => { r.net = r2(r.g - r.rt - r.ds); rows.push(r); }); rows.sort((a, b) => b.net - a.net);
      cols = [{ h: 'الاسم', f: r => '<a href="#/statement/' + encodeURIComponent(r.code) + '">' + esc(r.name) + '</a>' }, { h: sales ? 'المبيعات' : 'المشتريات', n: 1, f: r => nc(r.g), total: r => r.g }, { h: 'المرتجعات', n: 1, f: r => nc(r.rt, true), total: r => r.rt }, { h: 'الخصم', n: 1, f: r => nc(r.ds, true), total: r => r.ds }, { h: 'الصافي', n: 1, f: r => nc(r.net), total: r => r.net }, { h: sales ? 'المحصّل' : 'المسدد', n: 1, f: r => nc(r.pd, true), total: r => r.pd }];
    } else {
      const m = new Map(); const sales = v === 'itemS';
      S.transactions.forEach(t => {
        if (!inP(t) || !t.itemCode) return; if (sales ? t.source !== T.sales : t.source !== T.purch) return;
        const i = R.txInfo.get(t.id) || {}; let r = m.get(t.itemCode); if (!r) { r = { code: t.itemCode, name: t.itemName, q: 0, val: 0, cost: 0 }; m.set(t.itemCode, r); }
        if (t.type === (sales ? T.sale : T.buy)) { r.q += t.qty; r.val += i.net || 0; r.cost += sales ? (i.cost || 0) : 0; } else if (t.type === (sales ? T.ret : T.retBuy)) { r.q -= t.qty; r.val -= i.net || 0; r.cost += sales ? (i.cost || 0) : 0; }
      });
      m.forEach(r => { r.profit = r2(r.val - r.cost); rows.push(r); }); rows.sort((a, b) => b.val - a.val);
      cols = [{ h: 'الصنف', f: r => '<a href="#/itemcard/' + encodeURIComponent(r.code) + '">' + esc(r.name) + '</a>' }, { h: 'الكمية', n: 1, f: r => '<span class="n">' + APP.fmtq(r.q) + '</span>' }, { h: sales ? 'قيمة المبيعات' : 'قيمة المشتريات', n: 1, f: r => nc(r.val), total: r => r.val }].concat(sales ? [{ h: 'التكلفة', n: 1, f: r => nc(r.cost), total: r => r.cost }, { h: 'الربح', n: 1, f: r => nc(r.profit), total: r => r.profit }] : []);
    }
    const sel = '<label class="f">التقرير<select class="in" data-f="v" data-full="1"><option value="cust"' + (v === 'cust' ? ' selected' : '') + '>المبيعات حسب العميل</option><option value="itemS"' + (v === 'itemS' ? ' selected' : '') + '>المبيعات حسب الصنف</option><option value="supp"' + (v === 'supp' ? ' selected' : '') + '>المشتريات حسب المورد</option><option value="itemP"' + (v === 'itemP' ? ' selected' : '') + '>المشتريات حسب الصنف</option></select></label>';
    return '<div class="sheet">' + APP.sheetHead('تقرير المبيعات والمشتريات', period(from, to)) + '<div class="toolbar noprint">' + sel + APP.dateFilter(from, to) + '<button class="btn" data-act="full">عرض</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="تقرير">تصدير CSV</button></div><div class="scroll">' + APP.table(cols, rows, { id: 'rpt', totals: true }) + '</div>' + (v === 'itemS' ? '<p class="muted sm">الربح = قيمة المبيعات بدون الضريبة − التكلفة بمتوسط التكلفة.</p>' : '') + '</div>';
  }
};
})(window);
