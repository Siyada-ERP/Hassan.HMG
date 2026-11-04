/* =====================================================================
   SIYADA - shared helpers (DOM, formatting, dialogs, tables, Arabic number words)
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP = root.APP || { S: null, R: null, UI: { f: {} }, routes: {}, acts: {}, ons: {} };
const E = root.SiyadaEngine, T = E.T, r2 = E.r2, num = E.num;

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
APP.$ = $; APP.$$ = $$; APP.esc = esc;

/* ---------- numbers ---------- */
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf3 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
APP.fmt = (n, blankZero) => { n = num(n); if (blankZero && Math.abs(n) < 0.005) return ''; return nf2.format(Math.abs(n) < 0.005 ? 0 : n); };
APP.fmt0 = n => nf0.format(num(n));
APP.fmtq = n => nf3.format(num(n));
// numeric cell html: negative numbers in red
APP.nc = (n, blankZero) => { n = num(n); const t = APP.fmt(n, blankZero); return '<span class="n' + (n < -0.004 ? ' neg' : '') + '">' + t + '</span>'; };
APP.short = n => { n = num(n); const a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + ' مليون'; if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + ' ألف'; return nf0.format(n); };

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, '0');
APP.today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
APP.monthStart = d => d.slice(0, 8) + '01';
APP.addDays = (d, k) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
APP.monthKey = d => d.slice(0, 7);
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
APP.monthName = k => MONTHS[parseInt(k.slice(5, 7), 10) - 1] + ' ' + k.slice(2, 4);
APP.dateLong = d => { if (!d) return ''; const p = d.split('-'); return parseInt(p[2], 10) + ' ' + MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0]; };

/* ---------- toast / modal / confirm ---------- */
let toastT = 0;
APP.toast = (msg, kind) => {
  const el = $('#toast'); if (!el) return;
  el.className = 'show ' + (kind || 'ok'); el.textContent = msg;
  clearTimeout(toastT); toastT = setTimeout(() => { el.className = ''; }, kind === 'bad' ? 6000 : 2600);
};
APP.modal = (html, opts) => {
  opts = opts || {};
  const m = $('#modal'); m.innerHTML = '<div class="mback" data-act="mclose"></div><div class="mbox' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
  m.className = 'open'; const f = $('input,select,textarea', m); if (f && !opts.nofocus) setTimeout(() => { if (!m.contains(document.activeElement) || document.activeElement === m) f.focus(); }, 30);
};
APP.mclose = () => { const m = $('#modal'); m.className = ''; m.innerHTML = ''; };
APP.acts.mclose = () => APP.mclose();
APP.confirm = (msg, okText, danger) => new Promise(res => {
  APP.modal('<div class="mbody"><p class="mmsg">' + esc(msg).replace(/\n/g, '<br>') + '</p></div><div class="mfoot"><button class="btn ' + (danger ? 'danger' : 'primary') + '" id="cfOk">' + esc(okText || 'تأكيد') + '</button><button class="btn" id="cfNo">إلغاء</button></div>', { nofocus: true });
  $('#cfOk').onclick = () => { APP.mclose(); res(true); };
  $('#cfNo').onclick = () => { APP.mclose(); res(false); };
  $('#cfOk').focus();
});
APP.alert = msg => new Promise(res => {
  APP.modal('<div class="mbody"><p class="mmsg">' + esc(msg).replace(/\n/g, '<br>') + '</p></div><div class="mfoot"><button class="btn primary" id="alOk">تمام</button></div>', { nofocus: true });
  $('#alOk').onclick = () => { APP.mclose(); res(); }; $('#alOk').focus();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').className === 'open') APP.mclose(); });

/* ---------- tables ---------- */
// cols: [{h:'عنوان', f:row=>html, n:true(numeric), cls:'', total:row=>number|null}]
APP.table = (cols, rows, o) => {
  o = o || {};
  let h = '<table class="grid' + (o.cls ? ' ' + o.cls : '') + '"' + (o.id ? ' id="' + o.id + '"' : '') + '><thead><tr>';
  cols.forEach(c => { h += '<th class="' + (c.n ? 'n ' : '') + (c.cls || '') + '">' + c.h + '</th>'; });
  h += '</tr></thead><tbody>';
  if (!rows.length) h += '<tr><td class="empty" colspan="' + cols.length + '">' + (o.empty || 'مفيش بيانات في الفترة دي.') + '</td></tr>';
  rows.forEach(r => {
    h += '<tr' + (r._cls ? ' class="' + r._cls + '"' : '') + (r._attr || '') + '>';
    cols.forEach(c => { const v = c.f(r); h += '<td class="' + (c.n ? 'n ' : '') + (c.cls || '') + '">' + (v === undefined || v === null ? '' : v) + '</td>'; });
    h += '</tr>';
  });
  h += '</tbody>';
  if (o.totals && rows.length) {
    h += '<tfoot><tr class="tot">';
    cols.forEach((c, i) => {
      if (c.total) { const sum = rows.reduce((s, r) => s + num(c.total(r)), 0); h += '<td class="n ' + (c.cls || '') + '">' + (c.tf ? c.tf(sum) : APP.nc(sum)) + '</td>'; }
      else h += '<td>' + (i === 0 ? (o.totalLabel || 'الإجمالي') : '') + '</td>';
    });
    h += '</tr></tfoot>';
  }
  return h + '</table>';
};

APP.tableToCSV = (tb, name) => {
  const rows = [];
  $$('tr', tb).forEach(tr => {
    if (tr.closest('tr.dl')) return;
    const cells = Array.from(tr.children).filter(td => !td.classList.contains('nocsv')).map(td => {
      let t = td.innerText.replace(/\s+/g, ' ').trim();
      if (td.classList.contains('n')) t = t.replace(/,/g, '');
      return '"' + t.replace(/"/g, '""') + '"';
    });
    rows.push(cells.join(','));
  });
  APP.download('﻿' + rows.join('\r\n'), name + '.csv', 'text/csv;charset=utf-8');
};
APP.tableToExcel = (tb, name) => {
  const rows = [];
  $$('tr', tb).forEach(tr => {
    if (tr.closest('tr.dl')) return;
    const cells = Array.from(tr.children).filter(td => !td.classList.contains('nocsv')).map(td => {
      const text = td.innerText.replace(/\s+/g, ' ').trim();
      return '<td>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') + '</td>';
    });
    if (cells.length) rows.push('<tr>' + cells.join('') + '</tr>');
  });
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body dir="rtl"><table>' + rows.join('') + '</table></body></html>';
  APP.download('\uFEFF' + html, name + '.xls', 'application/vnd.ms-excel;charset=utf-8');
};
APP.download = (text, name, mime) => {
  const b = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
};

/* ---------- Arabic amount in words (EGP) ---------- */
const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUND = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
function below1000(n) {
  const p = []; const h = Math.floor(n / 100), r = n % 100;
  if (h) p.push(HUND[h]);
  if (r) { if (r < 20) p.push(ONES[r]); else { const o = r % 10, t = Math.floor(r / 10); p.push(o ? ONES[o] + ' و' + TENS[t] : TENS[t]); } }
  return p.join(' و');
}
function groupWord(n, one, two, few, many) {
  if (n === 1) return one; if (n === 2) return two;
  if (n >= 3 && n <= 10) return below1000(n) + ' ' + few;
  return below1000(n) + ' ' + many;
}
function intWords(n) {
  if (n === 0) return 'صفر';
  const parts = [];
  const bil = Math.floor(n / 1e9), mil = Math.floor(n / 1e6) % 1000, th = Math.floor(n / 1e3) % 1000, rest = n % 1000;
  if (bil) parts.push(groupWord(bil, 'مليار', 'ملياران', 'مليارات', 'مليارًا'));
  if (mil) parts.push(groupWord(mil, 'مليون', 'مليونان', 'ملايين', 'مليونًا'));
  if (th) parts.push(groupWord(th, 'ألف', 'ألفان', 'آلاف', 'ألفًا'));
  if (rest) parts.push(below1000(rest));
  return parts.join(' و');
}
APP.tafqeet = amount => {
  amount = Math.abs(r2(num(amount)));
  const g = Math.floor(amount + 1e-9), p = Math.round((amount - g) * 100);
  let s = intWords(g) + ' جنيهًا مصريًا';
  if (p) s += ' و' + intWords(p) + ' قرشًا';
  return 'فقط ' + s + ' لا غير';
};

/* ---------- misc ---------- */
APP.debounce = (fn, ms) => { let t = 0; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; };
APP.uid = () => Math.random().toString(36).slice(2, 8);
APP.pLabel = p => p.code + ' - ' + p.name;
APP.iLabel = x => x.code + ' - ' + x.name;
})(typeof window !== 'undefined' ? window : globalThis);
