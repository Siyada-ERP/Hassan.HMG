/* =====================================================================
   SIYADA - core: state, routing, shell, company name propagation, setup wizard
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP, E = root.SiyadaEngine, I = root.SiyadaImporter, T = E.T, r2 = E.r2, num = E.num;
const { $, $$, esc } = APP;
APP.net = APP.net || { on: false, ready: false, detect: async () => false };

/* Top menu bar (Dexef style): headings only, each opens a drop-down of the screens it is responsible for.
   entry: [route,label(,arg)] | ['!act',label] | ['-',title] (section header, '' = separator) | ['>',label,[entries]] (fly-out) */
const MENU = [
  ['ملف', [['settings', 'إعدادات الشركة'], ['mapping', 'ربط الحسابات'], ['>', 'البيانات', [['import', 'استيراد بيانات'], ['backup', 'نسخة احتياطية'], ['checks', 'فحوصات التناسق']]], ['-', ''], ['closing', 'إقفال السنة']]],
  ['المبيعات', [['sale', 'فاتورة بيع'], ['salret', 'مرتجع مبيعات'], ['receipt', 'تحصيل من عميل (سند قبض)'], ['-', 'المراجع والتقارير'], ['refsale', 'مرجع المبيعات'], ['netqty', 'الكمية بعد المرتجع', 's'], ['salesrep', 'تقرير المبيعات والمشتريات']]],
  ['المشتريات', [['purchase', 'فاتورة شراء'], ['purret', 'مرتجع مشتريات'], ['payment', 'سداد لمورد (سند دفع)'], ['-', 'المراجع والتقارير'], ['refpur', 'مرجع المشتريات'], ['netqty', 'الكمية بعد المرتجع', 'p']]],
  ['المخازن', [['items', 'الأصناف والمخزون'], ['stockmoves', 'حركة المخزون'], ['prices', 'قوائم الأسعار']]],
  ['العملاء والموردين', [['customers', 'العملاء'], ['suppliers', 'الموردون'], ['aging', 'أعمار ديون العملاء'], ['supplieraging', 'أعمار ديون الموردين'], ['-', ''], ['statement', 'كشف حساب']]],
  ['الحسابات', [['>', 'الخزينة والبنوك', [['expense', 'سند مصروف'], ['income', 'سند إيراد'], ['transfer', 'تحويل بين الحسابات'], ['treasury', 'أرصدة الخزينة والبنوك']]], ['>', 'القيود والدفاتر', [['manual', 'قيد يدوي'], ['journal', 'دفتر القيود'], ['ledger', 'دفتر الأستاذ']]], ['coa', 'دليل الحسابات'], ['-', ''], ['docs', 'المستندات'], ['txs', 'سجل الحركات']]],
  ['الموظفون', [['emps', 'بيانات الموظفين'], ['empadv', 'سلفة موظف'], ['payroll', 'مرتبات الشهر'], ['-', ''], ['empstmt', 'كشف حساب موظف']]],
  ['التقارير', [['>', 'القوائم المالية', [['tb', 'ميزان المراجعة'], ['is', 'قائمة الدخل'], ['bs', 'المركز المالي']]], ['>', 'المبيعات والمشتريات', [['refsale', 'مرجع المبيعات'], ['refpur', 'مرجع المشتريات'], ['netqty', 'الكمية بعد المرتجع — مبيعات', 's'], ['netqty', 'الكمية بعد المرتجع — مشتريات', 'p'], ['salesrep', 'تقرير المبيعات والمشتريات']]], ['>', 'المخزون', [['stockmoves', 'حركة المخزون'], ['items', 'الأصناف والمخزون']]], ['analytics', 'تحليل البيانات'], ['>', 'الائتمان', [['aging', 'أعمار ديون العملاء'], ['supplieraging', 'أعمار ديون الموردين']]], ['>', 'الضرائب', [['vat', 'تقرير الضريبة'], ['eta', 'الفاتورة الإلكترونية']]], ['>', 'كشوف الحسابات', [['statement', 'كشف حساب'], ['ledger', 'دفتر الأستاذ'], ['empstmt', 'كشف حساب موظف']]]]]
];
APP.MENU = MENU;
const TITLES = {};
(function walk(es) { es.forEach(e => { if (e[0] === '>') walk(e[2]); else if (e[0] !== '-' && e[0][0] !== '!' && !e[2] && !TITLES[e[0]]) TITLES[e[0]] = e[1]; }); })(MENU.reduce((a, h) => a.concat(h[1]), []).concat([['dashboard', 'لوحة التحكم']]));
/* remove entries (by route) from a menu: used for read-only users; drops empty fly-outs/headings and dangling section titles */
APP.menuPrune = function (menu, keep) {
  const clean = es => { const o = []; es.forEach(e => { if (e[0] === '>') { const c = clean(e[2]); if (c.length) o.push(['>', e[1], c]); } else if (e[0] === '-' || e[0][0] === '!' || keep(e[0])) o.push(e); });
    const r = []; o.forEach(e => { const last = r[r.length - 1]; if (e[0] === '-' && (!last || last[0] === '-')) { if (last && !e[1]) return; if (last) r.pop(); } r.push(e); });
    while (r.length && r[r.length - 1][0] === '-') r.pop(); return r; };
  return menu.map(h => [h[0], clean(h[1]), h[2]]).filter(h => h[1].length);
};
APP.titleOf = r => (APP.routes[r] && APP.routes[r].title) || TITLES[r] || '';

/* ---------- indexes (rebuilt after every posting) ---------- */
APP.index = function () {
  const S = APP.S, R = APP.R;
  APP.coaBy = new Map(S.coa.map(a => [a.code, a]));
  APP.txBy = new Map(S.transactions.map(t => [t.id, t]));
  APP.pBy = new Map(R.parties.map(p => [p.code, p]));
  APP.iBy = new Map(R.items.map(p => [p.code, p]));
  APP.docBy = new Map(R.docs.map(d => [d.doc, d]));
  APP.accName = c => { const a = APP.coaBy.get(c); return a ? a.name : (c || ''); };
  APP.bal = c => (R.bal.get(c) || 0);
};
APP.txDesc = function (l) {
  const t = APP.txBy.get(l.tid); if (!t) return l.desc || '';
  let s = t.type || '';
  if (t.itemName) s += ' - ' + t.itemName + (t.qty ? ' (' + APP.fmtq(t.qty) + (t.price ? ' × ' + APP.fmtq(t.price) : '') + ')' : '');
  if (t.desc && t.source === T.treas) s = t.desc; else if (t.desc) s += ' - ' + t.desc;
  return s;
};

/* ids for new records (the server version hands out blocks so users never clash) */
APP.nextId = kind => { const m = APP.S.meta; return kind === 'tx' ? m.nextTxId++ : m.nextManual++; };

/* ---------- commit: rebuild journal, save, redraw ---------- */
APP.commit = function (msg, opts) {
  opts = opts || {};
  try { APP.R = E.build(APP.S); } catch (e) { console.error(e); APP.toast('حصل خطأ أثناء الترحيل: ' + e.message, 'bad'); return false; }
  APP.index();
  APP.S.meta.changes = (APP.S.meta.changes || 0) + 1;
  APP.saveSoon();
  if (msg) APP.toast(msg);
  if (!opts.norender) APP.rerender();
  return true;
};
APP.setSaveState = s => {
  const el = $('#savest'); if (!el) return;
  el.className = s === 'bad' ? 'bad' : '';
  el.textContent = s === '...' ? 'جارٍ الحفظ…' : s === 'ok' ? '✔ اتحفظ تلقائيًا' : 'التخزين التلقائي غير متاح — خد نسخة احتياطية';
};

/* ---------- company identity (applied to every screen, report and print) ---------- */
APP.company = () => (APP.S && APP.S.settings.company) || '';
APP.logoHtml = cls => (APP.S.settings.logo ? '<img class="' + (cls || 'logo') + '" alt="" src="' + esc(APP.S.settings.logo) + '">' : '');
APP.sheetHead = function (title, sub) {
  const s = APP.S.settings;
  const meta = []; if (s.taxNo) meta.push('الرقم الضريبي: ' + esc(s.taxNo)); if (s.phone) meta.push('هاتف: ' + esc(s.phone));
  const addr = [s.gov, s.city, s.street, s.bldg].filter(Boolean).join('، '); if (addr) meta.push(esc(addr));
  return '<div class="sh">' + APP.logoHtml('logo') + '<div class="t"><div class="co">' + esc(s.company) + '</div>' + (s.activity ? '<div class="muted sm">' + esc(s.activity) + '</div>' : '') + '<div class="ti">' + esc(title) + (sub ? ' <span class="muted sm">— ' + esc(sub) + '</span>' : '') + '</div></div><div class="meta">' + meta.map(m => '<div>' + m + '</div>').join('') + '<div>تاريخ الطباعة: <span class="n">' + APP.today() + '</span></div></div></div>';
};
function applyCompany() {
  const s = APP.S.settings;
  document.title = s.company + ' — SIYADA';
  const b = $('#brand'); if (b) b.innerHTML = APP.logoHtml('logo') + '<div class="co">' + esc(s.company) + '</div><div class="app">SIYADA</div>';
}
APP.applyCompany = applyCompany;

/* ---------- routing ---------- */
function parseHash() {
  const h = decodeURIComponent((location.hash || '').replace(/^#\/?/, ''));
  const i = h.indexOf('/'); return i < 0 ? { route: h || 'dashboard', arg: '' } : { route: h.slice(0, i), arg: h.slice(i + 1) };
}
APP.go = function (route, arg) { const h = '#/' + route + (arg ? '/' + encodeURIComponent(arg) : ''); if (location.hash === h) APP.rerender(); else location.hash = h; };
APP.cur = () => parseHash();
root.addEventListener('hashchange', () => { APP.UI.f = {}; APP.render(true); });

function menuHtml(menu) {
  const link = e => e[0][0] === '!' ? '<li><a href="#" data-act="' + e[0].slice(1) + '">' + e[1] + '</a></li>'
    : '<li><a class="ni" data-r="' + e[0] + '"' + (e[2] ? ' data-a="' + esc(e[2]) + '"' : '') + ' href="#/' + e[0] + (e[2] ? '/' + encodeURIComponent(e[2]) : '') + '">' + e[1] + '</a></li>';
  const list = es => es.map(e => e[0] === '-' ? (e[1] ? '<li class="nvsec">' + e[1] + '</li>' : '<li class="nvsep"></li>')
    : e[0] === '>' ? '<li class="nvf"><button type="button" class="nvfa" data-act="mfl">' + e[1] + '<i></i></button><ul class="nvd2">' + list(e[2]) + '</ul></li>' : link(e)).join('');
  return '<div class="nvh"><a class="nvt ni" data-r="dashboard" href="#/dashboard">الرئيسية</a></div>' +
    menu.map(h => '<div class="nvh' + (h[2] && h[2].end ? ' end' : '') + '"><button type="button" class="nvt" data-act="mtog" aria-haspopup="true" aria-expanded="false">' + h[0] + '<i></i></button><ul class="nvd">' + list(h[1]) + '</ul></div>').join('');
}
APP.buildNav = function () { const n = $('#mnav'); if (n) { n.innerHTML = menuHtml(APP.navFilter ? APP.navFilter(MENU) : MENU); markNav(parseHash()); } };
const ALIAS = { itemcard: 'items', doc: 'docs', payslip: 'payroll' }, DEFARG = { netqty: 's' };
function closeMenus() { $$('#mnav .nvh.open,#mnav .nvf.open').forEach(h => h.classList.remove('open')); $$('#mnav .nvt[aria-expanded]').forEach(b => b.setAttribute('aria-expanded', 'false')); }
function markNav(p) {
  const r = ALIAS[p.route] || p.route, arg = p.arg || DEFARG[r] || '';
  $$('#mnav a.ni').forEach(a => a.classList.toggle('on', a.dataset.r === r && (!a.dataset.a || a.dataset.a === arg)));
  $$('#mnav .nvh').forEach(h => h.classList.toggle('on', !!h.querySelector('a.ni.on')));
  closeMenus();
}
function buildShell() {
  $('#root').innerHTML = '<div id="app"><header id="menubar"><button class="nvbtn" id="burger" data-act="burger" aria-label="القائمة"><i></i></button><a class="brand" id="brand" href="#/dashboard"></a><nav id="mnav" aria-label="القائمة الرئيسية"></nav></header>' +
    '<div id="top"><h1 id="ptitle"></h1><span id="savest"></span></div><div id="banner"></div><main id="main"></main></div>';
  applyCompany(); APP.buildNav();
}
let shellOn = false;
let rendering = false;
APP.render = function (reset) {
  if (APP.net && APP.net.on && !APP.net.ready) return;
  if (rendering) { setTimeout(() => APP.render(reset), 0); return; }
  rendering = true;
  try { renderNow(reset); } finally { rendering = false; }
};
function renderNow(reset) {
  if (!APP.S || !APP.S.settings.company) { shellOn = false; showSetup(); return; }
  if (!shellOn || !$('#app')) { buildShell(); shellOn = true; }
  const p = parseHash(); if (APP.guardRoute && !APP.guardRoute(p.route)) { p.route = 'dashboard'; if (location.hash !== '#/dashboard') history.replaceState(null, '', '#/dashboard'); }
  let r = APP.routes[p.route];
  if (!r) { p.route = 'dashboard'; r = APP.routes.dashboard; }
  markNav(p);
  $('#ptitle').textContent = (typeof r.title === 'function' ? r.title(p.arg) : r.title) || TITLES[p.route] || '';
  document.body.classList.remove('nav');
  const y = root.scrollY;
  const ae = document.activeElement; if (ae && ae !== document.body && $('#main') && $('#main').contains(ae)) { try { ae.blur(); } catch (e) { } }
  try { $('#main').innerHTML = r.html(p.arg); if (r.after) r.after(p.arg); } catch (e) { console.error(e); $('#main').innerHTML = '<div class="sheet"><p class="err">حصل خطأ في عرض الشاشة: ' + esc(e.message) + '</p></div>'; }
  root.scrollTo(0, reset ? 0 : y);
  renderBanner();
}
APP.rerender = () => APP.render(false);

function renderBanner() {
  const el = $('#banner'); if (!el) return; const S = APP.S; let h = '';
  if (APP.net && APP.net.on) { el.innerHTML = APP.net.banner(); return; }
  if (APP.store.mode() === 'mem') h += '<div class="bn bad"><span><b>التخزين التلقائي في المتصفح مش شغال.</b> أي حاجة تسجلها هتضيع لو قفلت الصفحة — خد نسخة احتياطية بعد كل شغل.</span><button class="btn s" data-act="backup">حفظ نسخة احتياطية</button></div>';
  if (!APP.UI.bnHide && S.transactions.length + S.manual.length > 0) {
    const ch = S.meta.changes || 0, lb = S.meta.lastBackup;
    const days = lb ? (Date.now() - new Date(lb).getTime()) / 864e5 : 999;
    if ((!lb && ch >= 10) || (lb && (days >= 7 && ch > 0 || ch >= 60)))
      h += '<div class="bn"><span>' + (lb ? 'آخر نسخة احتياطية من ' + Math.floor(days) + ' يوم، وعملت ' + ch + ' تعديل بعدها.' : 'لسه ما أخدتش نسخة احتياطية من بياناتك.') + ' خد نسخة دلوقتي وخزّنها في مكان تاني.</span><button class="btn primary s" data-act="backup">حفظ نسخة احتياطية</button><button class="btn s" data-act="bnhide">بعدين</button></div>';
  }
  el.innerHTML = h;
}
APP.acts.backup = () => { APP.backupJSON(); APP.toast('تم تنزيل النسخة الاحتياطية — احفظها في مكان آمن.'); APP.rerender(); };
APP.acts.bnhide = () => { APP.UI.bnHide = true; renderBanner(); };
APP.acts.burger = () => document.body.classList.toggle('nav');
const MOB = () => root.matchMedia && root.matchMedia('(max-width:900px)').matches;
/* keep a drop-down inside the screen (RTL: it opens towards the left; flip when it would be cut off) */
function fit(ul, fly) {
  if (!ul || MOB()) return; ul.classList.remove('flip'); const r = ul.getBoundingClientRect(); const W = root.innerWidth || document.documentElement.clientWidth;
  if (r.left < 4 || r.right > W - 2) ul.classList.add('flip');
}
APP.acts.mtog = b => {
  const h = b.parentNode, was = h.classList.contains('open'); closeMenus();
  if (!was) { h.classList.add('open'); b.setAttribute('aria-expanded', 'true'); fit(h.querySelector('.nvd')); }
};
APP.acts.mfl = b => { const f = b.parentNode, was = f.classList.contains('open'); $$('#mnav .nvf.open').forEach(x => x.classList.remove('open')); if (!was) f.classList.add('open'); fit(f.querySelector('.nvd2'), true); };
document.addEventListener('mouseover', e => {
  if (MOB()) return; const fl = e.target.closest && e.target.closest('#mnav .nvf');
  if (fl) { fit(fl.querySelector('.nvd2'), true); return; }
  const h = e.target.closest && e.target.closest('#mnav .nvh'); if (!h || h.classList.contains('open')) return;
  const o = document.querySelector('#mnav .nvh.open'); if (o && h.querySelector('.nvd')) { const b = h.querySelector('.nvt'); APP.acts.mtog(b); }
});
document.addEventListener('click', e => {
  const t = e.target; if (!t.closest) return;
  if (t.closest('#mnav a')) { closeMenus(); document.body.classList.remove('nav'); return; }
  if (!t.closest('#mnav') && !t.closest('#burger')) closeMenus();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenus(); document.body.classList.remove('nav'); } });
APP.acts.print = () => root.print();
APP.acts.csv = (b) => { const t = $('#' + (b.dataset.t || 'rpt')) || $('table.grid'); if (t) APP.tableToCSV(t, (b.dataset.n || 'SIYADA') + '_' + APP.today()); };

/* ---------- global event delegation ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const f = APP.acts[b.dataset.act]; if (f) { if (b.tagName === 'A') e.preventDefault(); f(b, e); }
});
document.addEventListener('input', e => {
  const t = e.target; if (t.dataset && t.dataset.f) {
    APP.UI.f[t.dataset.f] = t.value; if (t.dataset.f !== 'page') APP.UI.f.page = 1;
    const r = APP.routes[parseHash().route]; if (r && r.results) APP.debouncedResults(); }
  if (t.dataset && t.dataset.on && APP.ons[t.dataset.on]) APP.ons[t.dataset.on](t, e);
});
document.addEventListener('change', e => {
  const t = e.target; if (t.dataset && t.dataset.f) {
    APP.UI.f[t.dataset.f] = t.value; if (t.dataset.f !== 'page') APP.UI.f.page = 1;
    const r = APP.routes[parseHash().route];
    if (r && r.results) APP.debouncedResults(true); else if (t.dataset.full) APP.rerender(); }
  if (t.dataset && t.dataset.on && APP.ons[t.dataset.on]) APP.ons[t.dataset.on](t, e);
});
APP.debouncedResults = APP.debounce(function () {
  const p = parseHash(), r = APP.routes[p.route]; const el = $('#results'); if (!r || !r.results || !el) return;
  el.innerHTML = r.results(p.arg); if (r.afterResults) r.afterResults(p.arg);
}, 140);
// quick filters helper: value of a UI filter with default
APP.fv = (k, d) => (APP.UI.f[k] !== undefined ? APP.UI.f[k] : d);

/* ---------- logo picker (shrinks the image so the file stays small) ---------- */
APP.readLogo = function (file) {
  return new Promise((res, rej) => {
    if (!file) return res('');
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('تعذر قراءة الصورة'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('الملف ده مش صورة'));
      img.onload = () => {
        const k = Math.min(1, 360 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/png'));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
};

/* ---------- file reading for imports ---------- */
APP.readFiles = async function (fileList) {
  const files = {}, others = [];
  for (const f of Array.from(fileList)) {
    const n = f.name.toLowerCase();
    if (n.endsWith('.csv')) files[n] = await f.text();
    else if (n.endsWith('.json')) others.push({ name: f.name, text: await f.text() });
  }
  return { csv: files, json: others };
};
APP.importFrom = async function (fileList, company) {
  const got = await APP.readFiles(fileList);
  if (got.json.length) {
    const S = APP.normalizeState(APP.parseBackup(got.json[0].text));
    if (company) S.settings.company = company;
    return { S, kind: 'json' };
  }
  if (!got.csv['transactions.csv'] && !got.csv['journal_lines.csv']) throw new Error('اختار ملفات التصدير (transactions.csv وباقي الملفات) أو ملف نسخة احتياطية JSON.');
  const S = APP.normalizeState(I.fromCSV(got.csv, company ? { company } : (APP.S ? APP.S.settings : null)));
  if (company) S.settings.company = company;
  return { S, kind: 'csv', n: Object.keys(got.csv).length };
};

/* ---------- first-run setup (company name typed by the user, applied everywhere) ---------- */
function showSetup() {
  const s = APP.S && APP.S.settings ? APP.S.settings : E.defaultSettings();
  $('#root').innerHTML = '<div id="setup"><div class="pane"><div><div class="word">SIYADA</div><p>برنامج حسابات كامل على جهازك: فواتير، سندات، قيود، دفتر أستاذ، وتقارير جاهزة للطباعة.</p></div>' +
    '<div class="prev"><div class="sh"><div class="t"><div class="co" id="pvCo">اسم شركتك هنا</div><div class="ti">ميزان المراجعة</div></div></div><div class="hintp">كده هيظهر اسم شركتك في أعلى كل شاشة وتقرير وفاتورة مطبوعة.</div></div></div>' +
    '<div class="form"><h1>إعداد الشركة</h1><div class="sub">اكتب بيانات شركتك مرة واحدة، وتقدر تعدلها بعدين من «إعدادات الشركة».</div>' +
    '<div class="frow c2"><label class="f">اسم الشركة <span class="req">*</span><input class="in" id="suCo" data-on="suco" autocomplete="off" placeholder="مثال: شركة النور للتجارة" value="' + esc(s.company || APP.UI.prefillCompany || '') + '"></label>' +
    '<label class="f">النشاط<input class="in" id="suAct" value="' + esc(s.activity) + '" placeholder="مثال: توزيع مواد غذائية"></label></div>' +
    '<div class="frow"><label class="f">الرقم الضريبي<input class="in n" id="suTax" value="' + esc(s.taxNo) + '"></label><label class="f">الهاتف<input class="in n" id="suPh" value="' + esc(s.phone) + '"></label>' +
    '<label class="f">تاريخ بداية الدفاتر<input class="in" type="date" id="suDt" value="' + esc(s.startDate) + '"></label></div>' +
    '<div class="frow c2"><label class="f">العنوان<input class="in" id="suAd" placeholder="المحافظة، المدينة، الشارع"></label>' +
    '<div class="f">الشعار (اختياري)<div class="logoPick"><input type="file" accept="image/*" id="suLogo"><span id="suLogoPv"></span></div></div></div>' +
    '<div id="suErr" class="err"></div>' +
    '<div class="toolbar"><button class="btn primary" data-act="suNew">ابدأ بدفاتر جديدة</button></div>' +
    '<div class="ors">أو</div><div class="f">استيراد بيانات موجودة <span class="hint">(ملفات CSV المصدّرة من ملف SIYADA الإكسل، أو نسخة احتياطية JSON)</span><input type="file" multiple accept=".csv,.json" id="suFiles" class="in"></div>' +
    '<div class="toolbar" style="margin-top:12px"><button class="btn" data-act="suImport">استيراد وابدأ</button></div></div></div>';
  APP.UI.setupLogo = (APP.S && APP.S.settings.logo) || '';
  document.title = 'SIYADA — إعداد الشركة';
  const co = $('#suCo'); co.focus(); APP.ons.suco(co);
}
APP.ons.suco = t => { const pv = $('#pvCo'); if (pv) { pv.textContent = t.value.trim() || 'اسم شركتك هنا'; } };
document.addEventListener('change', async e => {
  if (e.target.id === 'suLogo') {
    try { APP.UI.setupLogo = await APP.readLogo(e.target.files[0]); $('#suLogoPv').innerHTML = '<img alt="" src="' + APP.UI.setupLogo + '" style="height:46px">'; const pv = $('#pvCo'); const sh = pv.closest('.sh'); const old = $('img', sh); if (old) old.remove(); sh.insertAdjacentHTML('afterbegin', '<img class="logo" alt="" src="' + APP.UI.setupLogo + '">'); }
    catch (x) { $('#suErr').textContent = x.message; }
  }
});
function setupInfo() {
  const co = $('#suCo').value.trim();
  if (!co) { $('#suErr').textContent = 'اكتب اسم الشركة الأول.'; $('#suCo').focus(); return null; }
  $('#suErr').textContent = '';
  return { company: co, activity: $('#suAct').value.trim(), taxNo: $('#suTax').value.trim(), phone: $('#suPh').value.trim(), street: $('#suAd').value.trim(), startDate: $('#suDt').value || E.defaultSettings().startDate, logo: APP.UI.setupLogo || '' };
}
APP.acts.suNew = async () => {
  const info = setupInfo(); if (!info) return;
  APP.S = APP.normalizeState(APP.newState(info)); APP.R = E.build(APP.S); APP.index(); APP.S.meta.changes = 0;
  await APP.saveNow(); location.hash = '#/dashboard'; APP.render(true);
  APP.toast('اتجهزت دفاتر ' + info.company + '. ابدأ بإضافة العملاء والأصناف.');
};
APP.acts.suImport = async () => {
  const info = setupInfo(); if (!info) return;
  const fl = $('#suFiles').files; if (!fl.length) { $('#suErr').textContent = 'اختار ملفات الاستيراد الأول.'; return; }
  try {
    const r = await APP.importFrom(fl, info.company);
    Object.assign(r.S.settings, { company: info.company, activity: info.activity || r.S.settings.activity, taxNo: info.taxNo || r.S.settings.taxNo, phone: info.phone || r.S.settings.phone, street: info.street || r.S.settings.street, logo: info.logo || r.S.settings.logo });
    APP.S = r.S; APP.R = E.build(APP.S); APP.index(); APP.S.meta.changes = 0; APP.S.meta.lastBackup = '';
    await APP.saveNow(); location.hash = '#/dashboard'; APP.render(true);
    APP.toast('تم الاستيراد: ' + APP.R.counts.tx + ' حركة و' + APP.R.counts.entries + ' قيد.');
  } catch (x) { $('#suErr').textContent = x.message; }
};

/* ---------- boot ---------- */
APP.boot = async function () {
  if (await APP.net.detect()) { APP.net.on = true; return APP.net.boot(); }
  let S = null;
  try { S = await APP.store.load(); } catch (e) { S = null; }
  if (S && S.settings) { APP.S = APP.normalizeState(S); try { APP.R = E.build(APP.S); APP.index(); } catch (e) { console.error(e); } }
  else APP.S = null;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  APP.render(true);
  if (APP.S) APP.setSaveState('ok');
};
document.addEventListener('DOMContentLoaded', () => APP.boot());
})(window);
