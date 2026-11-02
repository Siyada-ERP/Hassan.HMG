/* =====================================================================
   SIYADA - sales/purchases references (one row per invoice), net quantity after returns, employee sheets
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP, E = root.SiyadaEngine, T = E.T, r2 = E.r2, num = E.num;
const { $, $$, esc, fmt, nc } = APP;
const R_ = APP.routes;
const has = (hay, q) => !q || String(hay).toLowerCase().indexOf(q.toLowerCase()) >= 0;
const qf = n => '<span class="n">' + APP.fmtq(n) + '</span>';
const qz = n => (num(n) ? qf(n) : '<span class="muted">—</span>');
const per = (from, to) => (from ? 'من ' + from + ' ' : '') + 'إلى ' + (to || APP.today());
const linkParty = (code, name, sales) => code ? '<a href="#/statement/' + encodeURIComponent(code) + '">' + esc(name) + '</a>' : esc(name);

/* ---------------------------------------------------------------
   مرجع المبيعات / مرجع المشتريات
   --------------------------------------------------------------- */
const REF = {
  refsale: { title: 'مرجع المبيعات', src: T.sales, lt: T.sale, rt: T.ret, types: ['فاتورة بيع', 'مرتجع مبيعات'], pl: 'العميل', pay: 'المحصّل' },
  refpur: { title: 'مرجع المشتريات', src: T.purch, lt: T.buy, rt: T.retBuy, types: ['فاتورة شراء', 'مرتجع مشتريات'], pl: 'المورد', pay: 'المدفوع' }
};
function linesByDoc(K) {
  const m = new Map();
  APP.S.transactions.forEach(t => { if (t.source === K.src && (t.type === K.lt || t.type === K.rt)) { let a = m.get(t.doc); if (!a) m.set(t.doc, a = []); a.push(t); } });
  m.forEach(a => a.sort((x, y) => x.id - y.id));
  return m;
}
const opts = (k, list) => list.map(o => '<option value="' + o[0] + '"' + ((APP.UI.f[k] || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('');
function refActs(d) {
  return '<a class="btn s" href="#/doc/' + encodeURIComponent(d.doc) + '">عرض</a> <button class="btn s" data-act="docEdit" data-d="' + esc(d.doc) + '">تعديل</button> <button class="btn s danger" data-act="docDel" data-d="' + esc(d.doc) + '">حذف</button>';
}
function refResults(K, route) {
  const f = APP.UI.f, q = (f.q || '').trim(), from = APP.fv('from', ''), to = APP.fv('to', ''), ty = f.ty || '', st = f.st || '', v = APP.fv('v', 'sum');
  const LM = linesByDoc(K);
  let docs = APP.R.docs.filter(d => K.types.indexOf(d.type) >= 0 && (!from || d.date >= from) && (!to || d.date <= to));
  if (ty === 'inv') docs = docs.filter(d => d.type === K.types[0]); else if (ty === 'ret') docs = docs.filter(d => d.type === K.types[1]);
  if (st === 'open') docs = docs.filter(d => d.type === K.types[0] && r2(d.net - d.paid) > 0.004); else if (st === 'paid') docs = docs.filter(d => d.type === K.types[0] && r2(d.net - d.paid) <= 0.004);
  if (q) docs = docs.filter(d => has(d.doc + ' ' + d.pn + ' ' + d.pc + ' ' + (LM.get(d.doc) || []).map(t => t.itemName + ' ' + t.itemCode).join(' '), q));
  docs = docs.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.doc < b.doc ? 1 : -1)));
  let gi = 0, gr = 0, paid = 0, rest = 0, nl = 0, pcs = 0;
  docs.forEach(d => { const ls = LM.get(d.doc) || []; nl += ls.length; ls.forEach(t => { pcs += num(t.pieces); }); if (d.type === K.types[0]) { gi += d.net; paid += d.paid; rest += r2(d.net - d.paid); } else gr += d.net; });
  const kp = (l, v, c) => '<div class="kpi"><small>' + l + '</small><b' + (c ? ' class="' + c + '"' : '') + '>' + v + '</b></div>';
  const sum = '<div class="kpis" style="margin:0 0 14px">' + kp('عدد المستندات', docs.length) + kp('عدد البنود', nl) + (pcs ? kp('إجمالي العدد', APP.fmtq(pcs)) : '') + kp('الفواتير (صافي)', fmt(gi)) + kp('المرتجعات', fmt(gr)) + kp('الصافي بعد المرتجع', fmt(gi - gr)) + kp(K.pay + ' مع الفواتير', fmt(paid)) + kp('المتبقي على الفواتير', fmt(rest), rest > 0.004 ? 'neg' : '') + '</div>';
  const pg = APP.paged(docs, v === 'det' ? 60 : 100);
  let h;
  if (v === 'det') {
    h = '<table class="grid" id="rpt"><thead><tr><th>التاريخ</th><th>المستند</th><th>النوع</th><th>' + K.pl + '</th><th class="n">م</th><th>الصنف</th><th class="n">العدد</th><th class="n">الكمية</th><th class="n">السعر</th><th class="n">الإجمالي</th><th class="act nocsv"></th></tr></thead><tbody>';
    if (!pg.rows.length) h += '<tr><td class="empty" colspan="11">مفيش مستندات مطابقة.</td></tr>';
    pg.rows.forEach(d => {
      const ls = LM.get(d.doc) || []; const ret = d.type === K.types[1];
      if (!ls.length) { h += '<tr><td class="n">' + d.date + '</td><td><a href="#/doc/' + encodeURIComponent(d.doc) + '">' + esc(d.doc) + '</a></td><td>' + esc(d.type) + '</td><td>' + linkParty(d.pc, d.pn) + '</td><td colspan="6" class="muted">بدون بنود</td><td class="act nocsv">' + refActs(d) + '</td></tr>'; return; }
      ls.forEach((t, i) => {
        h += '<tr' + (i === 0 ? ' class="rf1"' : '') + '><td class="n">' + d.date + '</td><td><a href="#/doc/' + encodeURIComponent(d.doc) + '">' + esc(d.doc) + '</a></td><td>' + (ret ? '<span class="neg">' + esc(d.type) + '</span>' : esc(d.type)) + '</td><td>' + linkParty(d.pc, d.pn) + '</td><td class="n">' + (i + 1) + '</td><td><a href="#/itemcard/' + encodeURIComponent(t.itemCode) + '">' + esc(t.itemName || '—') + '</a></td><td class="n">' + (t.pieces ? APP.fmtq(t.pieces) : '') + '</td><td class="n">' + APP.fmtq(t.qty) + '</td><td class="n">' + nc(t.price) + '</td><td class="n">' + nc(t.debit + t.credit) + '</td><td class="act nocsv">' + (i === 0 ? refActs(d) : '') + '</td></tr>';
      });
    });
    h += '</tbody></table>';
  } else {
    h = '<table class="grid" id="rpt"><thead><tr><th class="act nocsv"></th><th>التاريخ</th><th>المستند</th><th>النوع</th><th>' + K.pl + '</th><th>الأصناف</th><th class="n">عدد البنود</th><th class="n">العدد</th><th class="n">الكمية</th><th class="n">الإجمالي</th><th class="n">الخصم</th><th class="n">الصافي</th><th class="n">' + K.pay + '</th><th class="n">المتبقي</th><th class="act nocsv"></th></tr></thead><tbody>';
    if (!pg.rows.length) h += '<tr><td class="empty" colspan="15">مفيش مستندات مطابقة.</td></tr>';
    pg.rows.forEach(d => {
      const ls = LM.get(d.doc) || []; const ret = d.type === K.types[1]; const pc = ls.reduce((s, t) => s + num(t.pieces), 0), qq = ls.reduce((s, t) => s + num(t.qty), 0);
      const first = ls[0] ? esc(ls[0].itemName || '—') : '<span class="muted">—</span>', more = ls.length > 1 ? ' <span class="muted sm">+' + (ls.length - 1) + ' أخرى</span>' : '';
      h += '<tr class="rf"><td class="act nocsv"><button class="btn s ghost" data-act="refx" aria-expanded="false" title="إظهار بنود المستند">▸</button></td><td class="n">' + d.date + '</td><td><a href="#/doc/' + encodeURIComponent(d.doc) + '">' + esc(d.doc) + '</a></td><td>' + (ret ? '<span class="neg">' + esc(d.type) + '</span>' : esc(d.type)) + '</td><td>' + linkParty(d.pc, d.pn) + '</td><td>' + first + more + '</td><td class="n">' + ls.length + '</td><td class="n">' + (pc ? APP.fmtq(pc) : '') + '</td><td class="n">' + APP.fmtq(qq) + '</td><td class="n">' + nc(d.gross) + '</td><td class="n">' + nc(d.discount, true) + '</td><td class="n">' + nc(d.net) + '</td><td class="n">' + (ret ? '' : nc(d.paid, true)) + '</td><td class="n">' + (ret ? '' : nc(r2(d.net - d.paid), true)) + '</td><td class="act nocsv">' + refActs(d) + '</td></tr>';
      h += '<tr class="dl" hidden><td></td><td colspan="14"><table class="sub"><thead><tr><th class="n">م</th><th>الصنف</th><th>الوحدة</th><th class="n">العدد</th><th class="n">الكمية</th><th class="n">السعر</th><th class="n">الإجمالي</th></tr></thead><tbody>' +
        ls.map((t, i) => '<tr><td class="n">' + (i + 1) + '</td><td><a href="#/itemcard/' + encodeURIComponent(t.itemCode) + '">' + esc(t.itemName || '—') + '</a></td><td>' + esc(((APP.iBy.get(t.itemCode) || {}).unit) || '') + '</td><td class="n">' + (t.pieces ? APP.fmtq(t.pieces) : '') + '</td><td class="n">' + APP.fmtq(t.qty) + '</td><td class="n">' + nc(t.price) + '</td><td class="n">' + nc(t.debit + t.credit) + '</td></tr>').join('') + '</tbody></table></td></tr>';
    });
    h += '</tbody></table>';
  }
  return sum + '<div class="scroll">' + h + '</div>' + pg.html;
}
Object.keys(REF).forEach(route => {
  const K = REF[route];
  R_[route] = {
    title: K.title,
    html() {
      const kind = route === 'refsale' ? 'sale' : 'purchase';
      return '<div class="sheet">' + APP.sheetHead(K.title, 'كل مستند على سطر واحد مع عدد البنود') +
        '<div class="toolbar">' + APP.dateFilter('', '') + APP.searchBox('رقم مستند أو ' + K.pl + ' أو صنف') +
        '<label class="f">العرض<select class="in" data-f="v"><option value="sum"' + (APP.fv('v', 'sum') === 'sum' ? ' selected' : '') + '>سطر لكل مستند</option><option value="det"' + (APP.fv('v', 'sum') === 'det' ? ' selected' : '') + '>كل البنود</option></select></label>' +
        '<label class="f">النوع<select class="in" data-f="ty">' + opts('ty', [['', 'فواتير ومرتجعات'], ['inv', 'فواتير فقط'], ['ret', 'مرتجعات فقط']]) + '</select></label>' +
        '<label class="f">السداد<select class="in" data-f="st">' + opts('st', [['', 'الكل'], ['open', 'عليها متبقي'], ['paid', 'مسددة']]) + '</select></label>' +
        '<a class="btn primary" href="#/' + kind + '">+ ' + (kind === 'sale' ? 'فاتورة بيع' : 'فاتورة شراء') + '</a><button class="btn" data-act="refxAll">فتح/غلق كل البنود</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="' + K.title.replace(/ /g, '_') + '">تصدير CSV</button></div>' +
        '<div id="results">' + this.results() + '</div></div>';
    },
    results() { return refResults(K, route); }
  };
});
APP.acts.refx = b => {
  const tr = b.closest('tr'), dl = tr.nextElementSibling; if (!dl || !dl.classList.contains('dl')) return;
  const open = dl.hidden; dl.hidden = !open; b.textContent = open ? '▾' : '▸'; b.setAttribute('aria-expanded', open ? 'true' : 'false');
};
APP.acts.refxAll = () => {
  const dls = $$('#results tr.dl'); if (!dls.length) return; const open = dls.some(x => x.hidden);
  dls.forEach(dl => { dl.hidden = !open; const b = dl.previousElementSibling && dl.previousElementSibling.querySelector('[data-act="refx"]'); if (b) { b.textContent = open ? '▾' : '▸'; b.setAttribute('aria-expanded', open ? 'true' : 'false'); } });
};

/* ---------------------------------------------------------------
   الكمية بعد المرتجع (لكل عميل / مورد / صنف خلال فترة)
   --------------------------------------------------------------- */
function aggNet(K, from, to, q) {
  const byP = new Map(), byI = new Map();
  const mk = (code, name, extra) => Object.assign({ code, name, sq: 0, sp: 0, sv: 0, rq: 0, rp: 0, rv: 0, docs: new Set(), sub: new Map() }, extra);
  const bump = (o, t, ret) => { const amt = t.debit + t.credit; if (ret) { o.rq += num(t.qty); o.rp += num(t.pieces); o.rv += amt; } else { o.sq += num(t.qty); o.sp += num(t.pieces); o.sv += amt; } o.docs.add(t.doc); };
  APP.S.transactions.forEach(t => {
    if (t.source !== K.src || (t.type !== K.lt && t.type !== K.rt)) return;
    if ((from && t.date < from) || (to && t.date > to)) return;
    if (q && !has(t.partyName + ' ' + t.partyCode + ' ' + t.itemName + ' ' + t.itemCode, q)) return;
    const ret = t.type === K.rt, pk = t.partyCode || t.partyName || '—', ik = t.itemCode || t.itemName || '—';
    let p = byP.get(pk); if (!p) byP.set(pk, p = mk(t.partyCode, t.partyName || '—'));
    let i = byI.get(ik); if (!i) byI.set(ik, i = mk(t.itemCode, t.itemName || '—', { unit: ((APP.iBy.get(t.itemCode) || {}).unit) || '' }));
    let ps = p.sub.get(ik); if (!ps) p.sub.set(ik, ps = mk(t.itemCode, t.itemName || '—', { unit: i.unit }));
    let is = i.sub.get(pk); if (!is) i.sub.set(pk, is = mk(t.partyCode, t.partyName || '—'));
    bump(p, t, ret); bump(i, t, ret); bump(ps, t, ret); bump(is, t, ret);
  });
  return { byP, byI };
}
const nq = o => r2((o.sq - o.rq) * 1000) / 1000, np = o => o.sp - o.rp, nv = o => r2(o.sv - o.rv);
function netCols(first, firstF, sales) {
  return [{ h: first, f: firstF },
    { h: 'عدد المستندات', n: 1, f: o => '<span class="n">' + o.docs.size + '</span>' },
    { h: sales ? 'الكمية المباعة' : 'الكمية المشتراة', n: 1, f: o => qz(o.sq), total: o => o.sq, tf: v => qf(v) },
    { h: 'الكمية المرتجعة', n: 1, f: o => qz(o.rq), total: o => o.rq, tf: v => qf(v) },
    { h: 'الكمية بعد المرتجع', n: 1, cls: 'netq', f: o => '<b class="n' + (nq(o) < 0 ? ' neg' : '') + '">' + APP.fmtq(nq(o)) + '</b>', total: o => nq(o), tf: v => '<b class="n">' + APP.fmtq(v) + '</b>' },
    { h: 'صافي العدد', n: 1, f: o => (o.sp || o.rp) ? qf(np(o)) : '<span class="muted">—</span>', total: o => np(o), tf: v => qf(v) },
    { h: 'قيمة المرتجع', n: 1, f: o => nc(o.rv, true), total: o => o.rv },
    { h: 'صافي القيمة', n: 1, f: o => '<b>' + nc(nv(o)) + '</b>', total: o => nv(o) }];
}
function netResults(arg) {
  const sales = arg !== 'p', K = sales ? REF.refsale : REF.refpur;
  const f = APP.UI.f, q = (f.q || '').trim(), from = APP.fv('from', APP.S.settings.startDate || ''), to = APP.fv('to', APP.today()), v = APP.fv('v', 'party');
  const A = aggNet(K, from, to, q); const sortBy = m => Array.from(m.values()).sort((a, b) => nv(b) - nv(a));
  const unitOf = o => o.unit ? ' <span class="muted sm">' + esc(o.unit) + '</span>' : '';
  let h = '';
  if (v === 'det') {
    const rows = []; A.byP.forEach(p => p.sub.forEach(s => rows.push(Object.assign({ pn: p.name, pc: p.code }, s)))); rows.sort((a, b) => (a.pn < b.pn ? -1 : a.pn > b.pn ? 1 : nv(b) - nv(a)));
    const pg = APP.paged(rows, 150), cols = netCols(K.pl, o => linkParty(o.pc, o.pn), sales); cols.splice(1, 0, { h: 'الصنف', f: o => esc(o.name) + unitOf(o) });
    h = APP.table(cols, pg.rows, { id: 'rpt', totals: true, empty: 'مفيش حركة في الفترة دي.' }) + pg.html;
    if (rows.length > 150) h += '<p class="muted sm">الإجمالي في الأسفل بيخص الصفحة الحالية بس.</p>';
  } else {
    const prim = v === 'item' ? A.byI : A.byP; const rows = sortBy(prim); const pg = APP.paged(rows, 100);
    const cols = netCols(v === 'item' ? 'الصنف' : K.pl, v === 'item' ? o => '<a href="#/itemcard/' + encodeURIComponent(o.code) + '">' + esc(o.name) + '</a>' + unitOf(o) : o => linkParty(o.code, o.name), sales);
    cols.unshift({ h: '', cls: 'act nocsv', f: () => '<button class="btn s ghost" data-act="refx" aria-expanded="false" title="تفاصيل">▸</button>' });
    const sc = netCols(v === 'item' ? K.pl : 'الصنف', v === 'item' ? o => linkParty(o.code, o.name) : o => esc(o.name) + unitOf(o), sales);
    h = '<table class="grid" id="rpt"><thead><tr>' + cols.map(c => '<th class="' + (c.n ? 'n ' : '') + (c.cls || '') + '">' + c.h + '</th>').join('') + '</tr></thead><tbody>';
    if (!pg.rows.length) h += '<tr><td class="empty" colspan="' + cols.length + '">مفيش حركة في الفترة دي.</td></tr>';
    pg.rows.forEach(o => {
      h += '<tr class="rf">' + cols.map(c => '<td class="' + (c.n ? 'n ' : '') + (c.cls || '') + '">' + c.f(o) + '</td>').join('') + '</tr>';
      const subs = sortBy(o.sub);
      h += '<tr class="dl" hidden><td></td><td colspan="' + (cols.length - 1) + '"><table class="sub"><thead><tr>' + sc.map(c => '<th class="' + (c.n ? 'n ' : '') + '">' + c.h + '</th>').join('') + '</tr></thead><tbody>' + subs.map(s => '<tr>' + sc.map(c => '<td class="' + (c.n ? 'n ' : '') + '">' + c.f(s) + '</td>').join('') + '</tr>').join('') + '</tbody></table></td></tr>';
    });
    h += '</tbody>';
    const all = rows; const tot = cols.map((c, i) => { if (i === 0) return '<td></td>'; if (i === 1) return '<td>الإجمالي</td>'; return c.total ? '<td class="n">' + (c.tf ? c.tf(all.reduce((s, o) => s + num(c.total(o)), 0)) : APP.nc(all.reduce((s, o) => s + num(c.total(o)), 0))) + '</td>' : '<td></td>'; }).join('');
    if (rows.length) h += '<tfoot><tr class="tot">' + tot + '</tr></tfoot>'; h += '</table>' + pg.html;
  }
  return '<div class="scroll">' + h + '</div>';
}
R_.netqty = {
  title: arg => 'الكمية بعد المرتجع — ' + (arg === 'p' ? 'مشتريات' : 'مبيعات'),
  html(arg) {
    const sales = arg !== 'p', K = sales ? REF.refsale : REF.refpur, from = APP.fv('from', APP.S.settings.startDate || ''), to = APP.fv('to', APP.today()), v = APP.fv('v', 'party');
    return '<div class="sheet">' + APP.sheetHead('الكمية بعد المرتجع — ' + (sales ? 'مبيعات' : 'مشتريات'), per(from, to)) +
      '<div class="toolbar">' + '<a class="btn' + (sales ? ' primary' : '') + '" href="#/netqty/s">مبيعات</a><a class="btn' + (sales ? '' : ' primary') + '" href="#/netqty/p">مشتريات</a>' + APP.dateFilter(from, to) + APP.searchBox('اسم ' + K.pl + ' أو صنف') +
      '<label class="f">التجميع<select class="in" data-f="v"><option value="party"' + (v === 'party' ? ' selected' : '') + '>حسب ' + K.pl + '</option><option value="item"' + (v === 'item' ? ' selected' : '') + '>حسب الصنف</option><option value="det"' + (v === 'det' ? ' selected' : '') + '>' + K.pl + ' × صنف</option></select></label>' +
      '<button class="btn" data-act="refxAll">فتح/غلق التفاصيل</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="الكمية_بعد_المرتجع">تصدير CSV</button></div>' +
      '<p class="muted sm noprint">الكمية بعد المرتجع = كمية ' + (sales ? 'المبيعات' : 'المشتريات') + ' − كمية المرتجعات في الفترة. الأصناف اللي وحداتها مختلفة بتتجمع في إجمالي واحد، فشوف التفاصيل تحت كل ' + K.pl + ' للأرقام الدقيقة.</p>' +
      '<div id="results">' + this.results(arg) + '</div></div>';
  },
  results(arg) { return netResults(arg); }
};

/* ---------------------------------------------------------------
   شيتات الموظفين
   --------------------------------------------------------------- */
const EM = () => APP.S.employees || (APP.S.employees = []);
const accOf = key => { const m = (APP.S.mapping.expenses || []).find(x => x.key === key); return m && m.acc ? m.acc : ''; };
const ADV_ACC = () => accOf('سلف الموظفين') || '1202';
const SAL_ACC = () => accOf('مرتبات وأجور') || '5201';
const empBy = code => EM().find(e => e.code === code);
const monthOf = d => (d || '').slice(0, 7);
const lastDay = p => { const [y, m] = p.split('-').map(Number); return p + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); };
const curMonth = () => APP.today().slice(0, 7);
const empLabel = e => e.code + ' - ' + e.name;
function empBalances(upTo) {
  const m = new Map(); let all = 0, acc = ADV_ACC();
  APP.R.journal.forEach(l => { if (l.acc !== acc || (upTo && l.date > upTo)) return; const d = l.dr - l.cr; all += d; if (l.pc) m.set(l.pc, (m.get(l.pc) || 0) + d); });
  let att = 0; m.forEach(v => { att += v; });
  return { by: m, all: r2(all), unatt: r2(all - att), bal: c => r2(m.get(c) || 0) };
}
const empEntries = kind => APP.S.manual.filter(m => m.emp && (!kind || (Array.isArray(kind) ? kind.indexOf(m.kind) >= 0 : m.kind === kind)));
const advAmt = m => (m.lines.find(l => l.acc === ADV_ACC() && l.pc) || { dr: 0, cr: 0 });
const nextEmpCode = () => { let mx = 0; EM().forEach(e => { const k = /^E-(\d+)$/.exec(e.code); if (k) mx = Math.max(mx, parseInt(k[1], 10)); }); let c; do { mx++; c = 'E-' + String(mx).padStart(2, '0'); } while (empBy(c)); return c; };

/* ----- employees master ----- */
R_.emps = {
  title: 'بيانات الموظفين',
  html() {
    const B = empBalances(), act = EM().filter(e => e.active !== false);
    const kp = (l, v, c) => '<div class="kpi"><small>' + l + '</small><b' + (c ? ' class="' + c + '"' : '') + '>' + v + '</b></div>';
    return '<div class="sheet">' + APP.sheetHead('بيانات الموظفين', 'المرتبات والسلف') +
      '<div class="kpis" style="margin-bottom:14px">' + kp('الموظفين النشطين', act.length) + kp('إجمالي المرتبات الشهرية', fmt(act.reduce((s, e) => s + num(e.salary), 0))) + kp('السلف القائمة', fmt(B.all)) + (Math.abs(B.unatt) > 0.004 ? kp('سلف غير منسوبة لموظف', fmt(B.unatt), 'neg') : '') + '</div>' +
      '<div class="toolbar noprint"><button class="btn primary" data-act="empNew">+ موظف جديد</button><a class="btn" href="#/empadv">سلفة موظف</a><a class="btn" href="#/payroll">مرتبات الشهر</a><a class="btn" href="#/empstmt">شيت السلف الشهري</a>' + APP.searchBox('اسم أو كود الموظف') + '<button class="btn" data-act="print">طباعة</button></div><div class="scroll" id="results">' + this.results() + '</div>' +
      (Math.abs(B.unatt) > 0.004 ? '<p class="muted sm">«السلف غير المنسوبة» هي أرصدة على حساب سلف الموظفين اتسجلت قبل كده من غير تحديد موظف (مثلًا من استيراد قديم أو سند مصروف). سجّل بعدها السلف من شاشة «سلفة موظف» علشان تتنسب للموظف.</p>' : '') + '</div>';
  },
  results() {
    const q = (APP.UI.f.q || '').trim(), B = empBalances(); const rows = EM().filter(e => has(e.code + ' ' + e.name + ' ' + (e.job || '') + ' ' + (e.phone || ''), q)).sort((a, b) => (a.code < b.code ? -1 : 1));
    return APP.table([{ h: 'الكود', f: e => '<span class="n">' + esc(e.code) + '</span>' }, { h: 'الاسم', f: e => '<a href="#/empstmt/' + encodeURIComponent(e.code) + '">' + esc(e.name) + '</a>' }, { h: 'الوظيفة', f: e => esc(e.job || '') }, { h: 'الهاتف', f: e => '<span class="n">' + esc(e.phone || '') + '</span>' }, { h: 'تاريخ التعيين', f: e => '<span class="n">' + esc(e.hire || '') + '</span>' },
      { h: 'المرتب الأساسي', n: 1, f: e => nc(e.salary, true), total: e => (e.active === false ? 0 : e.salary) }, { h: 'رصيد السلف', n: 1, f: e => nc(B.bal(e.code), true), total: e => B.bal(e.code) }, { h: 'الحالة', f: e => e.active === false ? '<span class="muted">غير نشط</span>' : 'نشط' },
      { h: '', cls: 'act', f: e => '<a class="btn s" href="#/empstmt/' + encodeURIComponent(e.code) + '">كشف حساب</a> <a class="btn s" href="#/empadv" data-act="empAdvGo" data-c="' + esc(e.code) + '">سلفة</a> <button class="btn s" data-act="empEdit" data-c="' + esc(e.code) + '">تعديل</button> <button class="btn s danger" data-act="empDel" data-c="' + esc(e.code) + '">حذف</button>' }
    ], rows, { id: 'rpt', totals: true, empty: 'لسه ما ضفتش موظفين — اضغط «+ موظف جديد».' });
  }
};
APP.acts.empAdvGo = (b, e) => { e.preventDefault(); APP.UI.prefEmp = b.dataset.c; APP.go('empadv'); };
function empModal(e) {
  const nw = !e; e = e || { code: nextEmpCode(), name: '', job: '', phone: '', hire: '', salary: '', active: true, note: '' };
  APP.modal('<h3>' + (nw ? 'موظف جديد' : 'تعديل بيانات موظف') + '</h3><div class="mbody"><div class="frow"><label class="f">الكود<input class="in" id="emC" value="' + esc(e.code) + '"' + (nw ? '' : ' disabled') + '></label><label class="f" style="grid-column:span 2">الاسم <span class="req">*</span><input class="in" id="emN" value="' + esc(e.name) + '"></label></div>' +
    '<div class="frow"><label class="f">الوظيفة<input class="in" id="emJ" value="' + esc(e.job || '') + '"></label><label class="f">الهاتف<input class="in n" id="emP" value="' + esc(e.phone || '') + '"></label><label class="f">تاريخ التعيين<input class="in" type="date" id="emH" value="' + esc(e.hire || '') + '"></label></div>' +
    '<div class="frow"><label class="f">المرتب الأساسي (شهريًا)<input class="in n" id="emS" inputmode="decimal" value="' + esc(e.salary || '') + '"></label><label class="f">الحالة<select class="in" id="emA"><option value="1"' + (e.active !== false ? ' selected' : '') + '>نشط</option><option value="0"' + (e.active === false ? ' selected' : '') + '>غير نشط (ما يظهرش في المرتبات)</option></select></label></div>' +
    '<div class="frow c2"><label class="f">ملاحظات<input class="in" id="emNt" value="' + esc(e.note || '') + '"></label></div><div id="emErr" class="err"></div></div><div class="mfoot"><button class="btn primary" id="emOk">حفظ</button><button class="btn" data-act="mclose">إلغاء</button></div>', { wide: 1 });
  $('#emOk').onclick = () => {
    const er = $('#emErr'), code = $('#emC').value.trim(), name = $('#emN').value.trim(), sal = parseFloat($('#emS').value || '0');
    if (!code || !name) { er.textContent = 'اكتب الكود والاسم.'; return; } if (isNaN(sal) || sal < 0) { er.textContent = 'المرتب لازم يكون رقم موجب.'; return; }
    if (nw && empBy(code)) { er.textContent = 'الكود ده مستخدم قبل كده.'; return; }
    const d = { code, name, job: $('#emJ').value.trim(), phone: $('#emP').value.trim(), hire: $('#emH').value, salary: sal, active: $('#emA').value === '1', note: $('#emNt').value.trim() };
    if (nw) EM().push(d); else Object.assign(e, d);
    APP.mclose(); APP.commit(nw ? 'تم إضافة الموظف.' : 'تم حفظ بيانات الموظف.');
  };
}
APP.acts.empNew = () => empModal(null);
APP.acts.empEdit = b => { const e = empBy(b.dataset.c); if (e) empModal(e); };
APP.acts.empDel = async b => {
  const e = empBy(b.dataset.c); if (!e) return;
  if (empEntries().some(m => m.emp === e.code)) { APP.alert('الموظف ' + e.name + ' عليه سلف أو مرتبات مسجلة. اقفله من «تعديل ← الحالة: غير نشط» بدل الحذف.'); return; }
  if (!await APP.confirm('حذف الموظف ' + e.name + '؟', 'حذف', true)) return;
  EM().splice(EM().indexOf(e), 1); APP.commit('تم حذف الموظف.');
};

/* ----- advances (سلفة / سداد سلفة) ----- */
function advList() {
  const rows = empEntries(['adv', 'rep']).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.jno - a.jno)).slice(0, 40);
  return APP.table([{ h: 'التاريخ', f: m => '<span class="n">' + m.date + '</span>' }, { h: 'المستند', f: m => '<a href="#/doc/' + encodeURIComponent(m.doc) + '">' + esc(m.doc) + '</a>' }, { h: 'الموظف', f: m => { const e = empBy(m.emp); return esc(e ? e.name : m.emp); } }, { h: 'النوع', f: m => m.kind === 'adv' ? 'سلفة' : 'سداد سلفة' },
    { h: 'المبلغ', n: 1, f: m => nc(m.kind === 'adv' ? advAmt(m).dr : advAmt(m).cr) }, { h: 'البيان', f: m => esc(m.desc) },
    { h: '', cls: 'act', f: m => '<a class="btn s" href="#/empadv/' + encodeURIComponent(m.doc) + '">تعديل</a> <button class="btn s danger" data-act="advDel" data-d="' + esc(m.doc) + '">حذف</button>' }], rows, { empty: 'لسه ما سجلتش سلف.' });
}
R_.empadv = {
  title: arg => (arg ? 'تعديل سلفة موظف' : 'سلفة موظف'),
  html(arg) {
    let m = null; if (arg) { m = APP.S.manual.find(x => x.doc === arg && (x.kind === 'adv' || x.kind === 'rep')); if (!m) return '<div class="sheet"><p>السلفة دي مش موجودة.</p><a class="btn" href="#/empadv">سلفة جديدة</a></div>'; }
    const emps = EM().filter(e => e.active !== false || (m && m.emp === e.code));
    if (!emps.length) return '<div class="sheet"><p>لازم تضيف موظفين الأول.</p><a class="btn primary" href="#/emps">بيانات الموظفين</a></div>';
    const ln = m ? advAmt(m) : null, cashLn = m ? m.lines.find(l => l !== ln && l.acc !== ADV_ACC()) : null;
    const p = m ? { date: m.date, doc: m.doc, emp: m.emp, kind: m.kind, amt: m.kind === 'adv' ? ln.dr : ln.cr, acc: cashLn ? cashLn.acc : '', note: (m.note || '') } : { date: APP.UI.keepDate || APP.today(), doc: APP.nextDoc('SL-'), emp: APP.UI.prefEmp || '', kind: 'adv', amt: '', acc: '', note: '' }; APP.UI.prefEmp = '';
    return '<div class="sheet doc" id="frm" data-edit="' + esc(m ? m.doc : '') + '">' + APP.sheetHead('سلفة موظف' + (m ? ' (تعديل)' : ''), p.doc) +
      '<div class="frow"><label class="f">التاريخ <span class="req">*</span><input class="in" type="date" id="fD" value="' + esc(p.date) + '"></label><label class="f">رقم المستند<input class="in" id="fNo" value="' + esc(p.doc) + '"></label><label class="f">نوع الحركة<select class="in" id="aK"><option value="adv"' + (p.kind === 'adv' ? ' selected' : '') + '>سلفة جديدة (صرف للموظف)</option><option value="rep"' + (p.kind === 'rep' ? ' selected' : '') + '>سداد سلفة (الموظف رجّع فلوس)</option></select></label></div>' +
      '<div class="frow c2"><label class="f">الموظف <span class="req">*</span><select class="in" id="aE" data-on="advEmp"><option value="">— اختار —</option>' + emps.map(e => '<option value="' + esc(e.code) + '"' + (e.code === p.emp ? ' selected' : '') + '>' + esc(empLabel(e)) + '</option>').join('') + '</select><span class="hint" id="aEh"></span></label><label class="f">المبلغ <span class="req">*</span><input class="in n" id="fAmt" inputmode="decimal" value="' + esc(p.amt || '') + '"></label></div>' +
      '<div class="frow c2"><label class="f">من / إلى حساب<select class="in" id="fAcc">' + APP.methodOpts(p.acc) + '</select></label><label class="f">البيان<input class="in" id="fDesc" value="' + esc(p.note) + '" placeholder="اختياري"></label></div><div id="fErr" class="err"></div>' +
      '<div class="toolbar"><button class="btn primary" data-act="saveAdv">حفظ</button>' + (m ? '' : '<button class="btn" data-act="saveAdvNew">حفظ وإضافة جديد</button>') + '<a class="btn" href="#/' + (m ? 'empadv' : 'emps') + '">إلغاء</a></div>' +
      '<h2 class="h2s">آخر السلف والسدادات</h2><div class="scroll">' + advList() + '</div></div>';
  },
  after() { if ($('#aE')) APP.ons.advEmp($('#aE')); }
};
APP.ons.advEmp = t => { const el = $('#aEh'); if (!el) return; const e = empBy(t.value); if (!e) { el.textContent = ''; return; } const b = empBalances().bal(e.code); el.innerHTML = 'رصيد السلف الحالي: <span class="n' + (b < 0 ? ' neg' : '') + '">' + fmt(b) + '</span>' + (e.salary ? ' — المرتب الأساسي <span class="n">' + fmt(e.salary) + '</span>' : ''); };
function saveAdv(again) {
  const er = $('#fErr'); er.textContent = ''; const edit = $('#frm').dataset.edit, date = $('#fD').value, doc = $('#fNo').value.trim(), kind = $('#aK').value, e = empBy($('#aE').value), amt = parseFloat($('#fAmt').value), acc = $('#fAcc').value, note = $('#fDesc').value.trim();
  if (!date) { er.textContent = 'اكتب التاريخ.'; return; } if (!e) { er.textContent = 'اختار الموظف.'; return; } if (!(amt > 0)) { er.textContent = 'اكتب مبلغ أكبر من صفر.'; return; } if (!doc) { er.textContent = 'اكتب رقم المستند.'; return; } if (!acc) { er.textContent = 'اختار الحساب.'; return; }
  if (doc !== edit && (APP.S.transactions.some(t => t.doc === doc) || APP.S.manual.some(m => m.doc === doc))) { er.textContent = 'رقم المستند ده مستخدم قبل كده.'; return; }
  const old = edit ? APP.S.manual.find(x => x.doc === edit) : null; if (!APP.guard(date) || (old && !APP.guard(old.date))) return;
  let bal = empBalances().bal(e.code); if (old && old.emp === e.code) { const l = advAmt(old); bal -= (l.dr - l.cr); }
  if (kind === 'rep' && amt > bal + 0.004) { er.textContent = 'مبلغ السداد (' + fmt(amt) + ') أكبر من رصيد سلف الموظف (' + fmt(bal) + ').'; return; }
  const d = (kind === 'adv' ? 'سلفة ' : 'سداد سلفة ') + e.name + (note ? ' - ' + note : '');
  const lines = kind === 'adv' ? [{ acc: ADV_ACC(), dr: amt, cr: 0, pc: e.code, pn: e.name, desc: d }, { acc, dr: 0, cr: amt, pc: '', pn: '', desc: d }] : [{ acc, dr: amt, cr: 0, pc: '', pn: '', desc: d }, { acc: ADV_ACC(), dr: 0, cr: amt, pc: e.code, pn: e.name, desc: d }];
  const rec = { date, type: kind === 'adv' ? 'سلفة' : 'سداد سلفة', doc, desc: d, emp: e.code, kind, note, lines };
  if (old) Object.assign(old, rec); else APP.S.manual.push(Object.assign({ jno: 0, seq: 4e6 + APP.nextId('man') }, rec));
  APP.bumpDoc(doc); APP.UI.keepDate = date;
  if (APP.commit('تم حفظ ' + (kind === 'adv' ? 'السلفة' : 'سداد السلفة') + '.', { norender: true })) { if (again && !old) { APP.UI.prefEmp = e.code; APP.go('empadv'); APP.rerender(); } else APP.go('empadv'); }
}
APP.acts.saveAdv = () => saveAdv(false); APP.acts.saveAdvNew = () => saveAdv(true);
APP.acts.advDel = async b => {
  const m = APP.S.manual.find(x => x.doc === b.dataset.d); if (!m) return; if (!APP.guard(m.date)) return;
  if (!await APP.confirm('حذف ' + (m.kind === 'adv' ? 'السلفة' : 'سداد السلفة') + ' ' + m.doc + '؟', 'حذف', true)) return;
  APP.S.manual.splice(APP.S.manual.indexOf(m), 1); APP.commit('تم الحذف.');
};

/* ----- monthly payroll ----- */
const payEntry = (code, p) => APP.S.manual.find(m => m.kind === 'pay' && m.emp === code && m.pay && m.pay.per === p);
const advInMonth = (code, p) => empEntries(['adv', 'rep']).filter(m => m.emp === code && monthOf(m.date) === p).reduce((s, m) => { const l = advAmt(m); return s + (l.dr - l.cr); }, 0);
const num0 = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
R_.payroll = {
  title: 'مرتبات الشهر',
  html(arg) {
    const p = /^\d{4}-\d{2}$/.test(arg || '') ? arg : curMonth(), B = empBalances(), emps = EM().filter(e => e.active !== false || payEntry(e.code, p));
    if (!emps.length) return '<div class="sheet"><p>لازم تضيف موظفين الأول.</p><a class="btn primary" href="#/emps">بيانات الموظفين</a></div>';
    let tb = '';
    emps.sort((a, b) => (a.code < b.code ? -1 : 1)).forEach(e => {
      const m = payEntry(e.code, p), bal = B.bal(e.code);
      if (m) {
        const x = m.pay; tb += '<tr class="done" data-c="' + esc(e.code) + '"><td></td><td>' + esc(e.name) + '<div class="muted sm">' + esc(e.job || '') + '</div></td><td class="n">' + nc(x.base, true) + '</td><td class="n">' + nc(x.add, true) + '</td><td class="n">' + nc(x.ded, true) + '</td><td class="n">' + nc(x.base + x.add - x.ded) + '</td><td class="n">' + nc(advInMonth(e.code, p), true) + '</td><td class="n">' + nc(x.adv, true) + '</td><td class="n"><b>' + nc(x.net) + '</b></td><td class="n">' + nc(bal, true) + '</td><td class="nowrap"><span class="pill">مُرحَّل</span> <a href="#/doc/' + encodeURIComponent(m.doc) + '">' + esc(m.doc) + '</a></td><td class="act"><a class="btn s" href="#/payslip/' + encodeURIComponent(m.doc) + '">قسيمة</a> <button class="btn s danger" data-act="payUndo" data-d="' + esc(m.doc) + '">إلغاء الترحيل</button></td></tr>';
      } else {
        const sal = num(e.salary), ai = Math.max(0, advInMonth(e.code, p)), dflt = r2(Math.min(Math.max(bal, 0), ai, sal));
        tb += '<tr class="pr" data-c="' + esc(e.code) + '" data-bal="' + bal + '"><td class="act"><input type="checkbox" class="pk" checked aria-label="تحديد"></td><td>' + esc(e.name) + '<div class="muted sm">' + esc(e.job || '') + '</div></td><td class="n"><input class="n pb" data-on="pay" inputmode="decimal" value="' + esc(sal || '') + '"></td><td class="n"><input class="n pa" data-on="pay" inputmode="decimal" value=""></td><td class="n"><input class="n pd" data-on="pay" inputmode="decimal" value=""></td><td class="n pe"></td><td class="n">' + nc(ai, true) + '</td><td class="n"><input class="n pj" data-on="pay" inputmode="decimal" value="' + (dflt || '') + '"></td><td class="n pn"></td><td class="n pr2"></td><td class="pw"></td><td class="act"></td></tr>';
      }
    });
    return '<div class="sheet">' + APP.sheetHead('مرتبات شهر ' + p, 'مع خصم السلف') +
      '<div class="toolbar noprint"><label class="f">الشهر<input class="in" type="month" id="pMon" data-on="payMon" value="' + p + '"></label><label class="f">تاريخ القيد<input class="in" type="date" id="pDate" value="' + lastDay(p) + '"></label><label class="f">يتصرف من<select class="in" id="pAcc">' + APP.methodOpts() + '</select></label><button class="btn primary" data-act="payPostAll">ترحيل المحدد</button><a class="btn" href="#/empadv">سلفة موظف</a><a class="btn" href="#/emps">بيانات الموظفين</a><button class="btn" data-act="print">طباعة</button></div>' +
      '<div class="scroll"><table class="grid" id="rpt"><thead><tr><th class="act nocsv"></th><th>الموظف</th><th class="n">المرتب</th><th class="n">إضافي / مكافأة</th><th class="n">خصومات / جزاءات</th><th class="n">المستحق</th><th class="n">سلف الشهر</th><th class="n">خصم السلف</th><th class="n">الصافي للصرف</th><th class="n">رصيد السلف بعد</th><th>الحالة</th><th class="act nocsv"></th></tr></thead><tbody id="pBody">' + tb + '</tbody><tfoot><tr class="tot" id="pTot"></tr></tfoot></table></div>' +
      '<div id="fErr" class="err"></div><p class="muted sm">الصرف بيتسجل كقيد: مدين «مرتبات وأجور» بالمستحق، ودائن «سلف الموظفين» بقيمة السلف المخصومة، ودائن الخزينة/البنك بالصافي. «سلف الشهر» للعلم (اللي اتصرف للموظف في نفس الشهر) وهو الافتراضي لخصم السلف — تقدر تغيّره.</p></div>';
  },
  after() { APP.ons.pay(); }
};
APP.ons.payMon = t => { if (/^\d{4}-\d{2}$/.test(t.value)) APP.go('payroll', t.value); };
function payRow(tr) {
  const bal = num0(tr.dataset.bal), base = num0($('.pb', tr).value), add = num0($('.pa', tr).value), ded = num0($('.pd', tr).value), adv = num0($('.pj', tr).value);
  const earned = r2(base + add - ded), net = r2(earned - adv);
  return { c: tr.dataset.c, bal, base, add, ded, adv, earned, net, after: r2(bal - adv) };
}
APP.ons.pay = () => {
  let tE = 0, tA = 0, tN = 0;
  $$('#pBody tr.pr').forEach(tr => {
    const x = payRow(tr), bad = x.net < -0.004 || x.adv < 0 || x.adv > Math.max(x.bal, 0) + 0.004;
    $('.pe', tr).textContent = fmt(x.earned); $('.pn', tr).innerHTML = '<b class="' + (x.net < 0 ? 'neg' : '') + '">' + fmt(x.net) + '</b>'; $('.pr2', tr).textContent = fmt(x.after);
    $('.pw', tr).innerHTML = x.net < -0.004 ? '<span class="neg sm">السلف أكبر من المستحق</span>' : (x.adv > Math.max(x.bal, 0) + 0.004 ? '<span class="neg sm">أكبر من رصيد السلف</span>' : '');
    tr.classList.toggle('bad', bad); if ($('.pk', tr).checked) { tE += x.earned; tA += x.adv; tN += x.net; }
  });
  $$('#pBody tr.done').forEach(tr => { const m = payEntry(tr.dataset.c, $('#pMon').value); if (m) { tE += m.pay.base + m.pay.add - m.pay.ded; tA += m.pay.adv; tN += m.pay.net; } });
  const t = $('#pTot'); if (t) t.innerHTML = '<td></td><td>الإجمالي (المحدد + المُرحَّل)</td><td></td><td></td><td></td><td class="n">' + fmt(tE) + '</td><td></td><td class="n">' + fmt(tA) + '</td><td class="n">' + fmt(tN) + '</td><td></td><td></td><td></td>';
};
document.addEventListener('change', e => { if (e.target && e.target.classList && e.target.classList.contains('pk')) APP.ons.pay(); });
function postPay(rows, p, date, acc) {
  rows.forEach(x => {
    const e = empBy(x.c), doc = 'SAL-' + p.replace('-', '') + '-' + e.code, d = 'مرتب شهر ' + p + ' - ' + e.name;
    const lines = [{ acc: SAL_ACC(), dr: x.earned, cr: 0, pc: e.code, pn: e.name, desc: d }];
    if (x.adv > 0) lines.push({ acc: ADV_ACC(), dr: 0, cr: x.adv, pc: e.code, pn: e.name, desc: 'خصم سلفة من مرتب ' + p });
    if (x.net > 0) lines.push({ acc, dr: 0, cr: x.net, pc: e.code, pn: e.name, desc: d });
    APP.S.manual.push({ jno: 0, date, type: 'مرتبات', doc, desc: d, seq: 4e6 + APP.nextId('man'), emp: e.code, kind: 'pay', pay: { per: p, base: x.base, add: x.add, ded: x.ded, adv: x.adv, net: x.net }, lines });
  });
}
APP.acts.payPostAll = () => {
  const er = $('#fErr'); er.textContent = ''; const p = $('#pMon').value, date = $('#pDate').value, acc = $('#pAcc').value; if (!date) { er.textContent = 'اكتب تاريخ القيد.'; return; }
  const rows = []; let bad = '';
  $$('#pBody tr.pr').forEach(tr => {
    if (!$('.pk', tr).checked) return; const x = payRow(tr), e = empBy(x.c);
    if (x.earned <= 0 && x.adv <= 0) return; if (x.base < 0 || x.add < 0 || x.ded < 0 || x.adv < 0) { bad = e.name + ': الأرقام لازم تكون موجبة.'; return; }
    if (x.net < -0.004) { bad = e.name + ': خصم السلف أكبر من المستحق.'; return; } if (x.adv > Math.max(x.bal, 0) + 0.004) { bad = e.name + ': خصم السلف أكبر من رصيد سلفه (' + fmt(x.bal) + ').'; return; }
    rows.push(x);
  });
  if (bad) { er.textContent = bad; return; } if (!rows.length) { er.textContent = 'مفيش حاجة تترحّل — حدد موظفين وفيهم مبالغ.'; return; }
  const dup = rows.map(x => 'SAL-' + p.replace('-', '') + '-' + x.c).find(d => APP.S.manual.some(m => m.doc === d) || APP.S.transactions.some(t => t.doc === d)); if (dup) { er.textContent = 'رقم المستند ' + dup + ' مستخدم قبل كده.'; return; }
  if (!APP.guard(date)) return;
  postPay(rows, p, date, acc); APP.commit('تم ترحيل مرتبات ' + rows.length + ' موظف.');
};
APP.acts.payUndo = async b => {
  const m = APP.S.manual.find(x => x.doc === b.dataset.d); if (!m) return; if (!APP.guard(m.date)) return;
  if (!await APP.confirm('إلغاء ترحيل المرتب ' + m.doc + '؟ هيتحذف القيد ويرجع السلف المخصومة.', 'إلغاء الترحيل', true)) return;
  APP.S.manual.splice(APP.S.manual.indexOf(m), 1); APP.commit('تم إلغاء الترحيل.');
};

/* ----- payslip ----- */
R_.payslip = {
  title: 'قسيمة مرتب',
  html(arg) {
    const m = APP.S.manual.find(x => x.doc === arg && x.kind === 'pay'); if (!m) return '<div class="sheet"><p>القسيمة دي مش موجودة.</p><a class="btn" href="#/payroll">مرتبات الشهر</a></div>';
    const e = empBy(m.emp) || { name: m.lines[0].pn, code: m.emp }, x = m.pay, earned = r2(x.base + x.add - x.ded), after = empBalances(m.date).bal(m.emp);
    const row = (l, v, b) => '<tr><td>' + l + '</td><td class="n">' + (b ? '<b>' + fmt(v) + '</b>' : fmt(v)) + '</td></tr>';
    return '<div class="sheet doc">' + APP.sheetHead('قسيمة مرتب', 'شهر ' + x.per) + '<div class="toolbar noprint"><button class="btn primary" data-act="print">طباعة</button><a class="btn" href="#/payroll/' + x.per + '">مرتبات الشهر</a></div>' +
      '<div class="frow"><div><span class="muted sm">الموظف</span><div><b>' + esc(e.name) + '</b> <span class="muted sm n">' + esc(e.code) + '</span></div></div><div><span class="muted sm">الوظيفة</span><div>' + esc(e.job || '—') + '</div></div><div><span class="muted sm">تاريخ الصرف</span><div class="n">' + m.date + '</div></div></div>' +
      '<table class="grid"><thead><tr><th>البند</th><th class="n">المبلغ</th></tr></thead><tbody>' + row('المرتب الأساسي', x.base) + (x.add ? row('إضافي / مكافأة', x.add) : '') + (x.ded ? row('خصومات / جزاءات (−)', x.ded) : '') + row('إجمالي المستحق', earned, 1) + (x.adv ? row('سلف مخصومة (−)', x.adv) : '') + '</tbody><tfoot><tr class="tot"><td>صافي المرتب</td><td class="n">' + fmt(x.net) + '</td></tr></tfoot></table>' +
      '<div class="words">' + esc(APP.tafqeet(x.net)) + '</div><p class="muted sm">رصيد السلف المتبقي على الموظف بعد الخصم: <span class="n">' + fmt(after) + '</span> — رقم المستند ' + esc(m.doc) + '</p><div class="sig"><div>المحاسب</div><div>المستلم</div><div>اعتماد</div></div></div>';
  }
};

/* ----- statements / monthly advances sheet ----- */
R_.empstmt = {
  title: arg => (arg ? 'كشف حساب موظف' : 'شيت السلف الشهري'),
  html(arg) {
    const e = arg ? empBy(arg) : null; if (arg && !e) return '<div class="sheet"><p>الموظف مش موجود.</p><a class="btn" href="#/empstmt">كل الموظفين</a></div>';
    const sel = '<label class="f">الموظف<select class="in" data-on="empSel"><option value="">كل الموظفين (شيت السلف الشهري)</option>' + EM().map(x => '<option value="' + esc(x.code) + '"' + (arg === x.code ? ' selected' : '') + '>' + esc(empLabel(x)) + '</option>').join('') + '</select></label>';
    if (!e) {
      const yr = APP.fv('yr', APP.today().slice(0, 4));
      return '<div class="sheet">' + APP.sheetHead('شيت السلف الشهري', 'سنة ' + yr) + '<div class="toolbar">' + sel + '<label class="f">السنة<input class="in n" data-f="yr" value="' + esc(yr) + '" inputmode="numeric" style="width:90px"></label><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="سلف_الموظفين">تصدير CSV</button></div><div class="scroll" id="results">' + this.results('') + '</div></div>';
    }
    const from = APP.fv('from', ''), to = APP.fv('to', '');
    return '<div class="sheet">' + APP.sheetHead('كشف حساب موظف', e.name + ' (' + e.code + ')') + '<div class="toolbar">' + sel + APP.dateFilter('', '') + '<a class="btn" href="#/empadv" data-act="empAdvGo" data-c="' + esc(e.code) + '">+ سلفة</a><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="كشف_' + esc(e.code) + '">تصدير CSV</button></div><div id="results">' + this.results(arg) + '</div></div>';
  },
  results(arg) {
    const e = arg ? empBy(arg) : null, acc = ADV_ACC();
    if (!e) {
      const yr = String(APP.fv('yr', APP.today().slice(0, 4))).trim(), B = empBalances(), mon = Array.from({ length: 12 }, (_, i) => yr + '-' + String(i + 1).padStart(2, '0'));
      const by = new Map(); empEntries(['adv', 'rep']).forEach(m => { const k = m.emp + '|' + monthOf(m.date); const l = advAmt(m); by.set(k, (by.get(k) || 0) + l.dr - l.cr); });
      const pays = new Map(); empEntries('pay').forEach(m => { if ((m.pay.per || '').slice(0, 4) === yr) pays.set(m.emp, (pays.get(m.emp) || 0) + m.pay.adv); });
      const rows = EM().slice().sort((a, b) => (a.code < b.code ? -1 : 1)).map(x => ({ e: x, m: mon.map(k => by.get(x.code + '|' + k) || 0), ded: pays.get(x.code) || 0, bal: B.bal(x.code) }));
      const cols = [{ h: 'الموظف', f: r => '<a href="#/empstmt/' + encodeURIComponent(r.e.code) + '">' + esc(r.e.name) + '</a>' }, { h: 'المرتب', n: 1, f: r => nc(r.e.salary, true) }].concat(mon.map((k, i) => ({ h: String(i + 1), n: 1, f: r => nc(r.m[i], true), total: r => r.m[i] })))
        .concat([{ h: 'إجمالي السلف', n: 1, f: r => '<b>' + nc(r.m.reduce((s, v) => s + v, 0), true) + '</b>', total: r => r.m.reduce((s, v) => s + v, 0) }, { h: 'المخصوم من المرتب', n: 1, f: r => nc(r.ded, true), total: r => r.ded }, { h: 'الرصيد الحالي', n: 1, f: r => '<b>' + nc(r.bal, true) + '</b>', total: r => r.bal }]);
      let h = APP.table(cols, rows, { id: 'rpt', totals: true, empty: 'لسه ما ضفتش موظفين.' });
      if (Math.abs(B.unatt) > 0.004) h += '<p class="muted sm">فيه رصيد سلف غير منسوب لموظف: <span class="n">' + fmt(B.unatt) + '</span> (سجّله على موظف من «سلفة موظف»).</p>';
      return h + '<p class="muted sm">الأعمدة 1–12 هي شهور السنة، والأرقام = السلف المصروفة (بعد خصم السدادات النقدية).</p>';
    }
    const from = APP.fv('from', ''), to = APP.fv('to', ''); let run = 0, openB = 0; const rows = [];
    APP.R.journal.forEach(l => { if (l.acc !== acc || l.pc !== e.code) return; if (from && l.date < from) { openB += l.dr - l.cr; return; } if (to && l.date > to) return; rows.push(l); });
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.en - b.en)); run = r2(openB);
    const data = [{ _cls: 'grp', d: '', doc: '', ds: 'رصيد أول الفترة', dr: 0, cr: 0, b: run }].concat(rows.map(l => { run = r2(run + l.dr - l.cr); return { d: l.date, doc: l.doc, ds: l.desc, dr: l.dr, cr: l.cr, b: run }; }));
    let h = APP.table([{ h: 'التاريخ', f: r => '<span class="n">' + r.d + '</span>' }, { h: 'المستند', f: r => r.doc ? '<a href="#/doc/' + encodeURIComponent(r.doc) + '">' + esc(r.doc) + '</a>' : '' }, { h: 'البيان', f: r => esc(r.ds) }, { h: 'سلف (مدين)', n: 1, f: r => nc(r.dr, true), total: r => r.dr }, { h: 'سداد / خصم (دائن)', n: 1, f: r => nc(r.cr, true), total: r => r.cr }, { h: 'الرصيد', n: 1, f: r => nc(r.b, true) }], data, { id: 'rpt', totals: true, empty: 'مفيش حركة.' });
    h += '<p>الرصيد الحالي للسلف: <b class="n">' + fmt(run) + '</b>' + (e.salary ? ' — المرتب الأساسي <span class="n">' + fmt(e.salary) + '</span>' : '') + '</p>';
    const pays = empEntries('pay').filter(m => m.emp === e.code).sort((a, b) => (a.pay.per < b.pay.per ? 1 : -1));
    if (pays.length) h += '<h2 class="h2s">المرتبات المصروفة</h2>' + APP.table([{ h: 'الشهر', f: m => '<span class="n">' + esc(m.pay.per) + '</span>' }, { h: 'الأساسي', n: 1, f: m => nc(m.pay.base, true) }, { h: 'إضافي', n: 1, f: m => nc(m.pay.add, true) }, { h: 'خصومات', n: 1, f: m => nc(m.pay.ded, true) }, { h: 'سلف مخصومة', n: 1, f: m => nc(m.pay.adv, true) }, { h: 'الصافي', n: 1, f: m => '<b>' + nc(m.pay.net) + '</b>' }, { h: '', cls: 'act', f: m => '<a class="btn s" href="#/payslip/' + encodeURIComponent(m.doc) + '">قسيمة</a>' }], pays, { totals: false });
    return h;
  }
};
APP.ons.empSel = t => APP.go('empstmt', t.value);
})(window);
