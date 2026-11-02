/* =====================================================================
   SIYADA - server mode screens: login, register, forgot/reset, invite, company picker,
   team, activity log, account, admin
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP, net = APP.net, { $, $$, esc } = APP;
const api = (...a) => net.api(...a);
const ui = net.ui = {};
const ROLE_AR = net.ROLE_AR;
const fdt = s => { if (!s) return '—'; const d = new Date(typeof s === 'number' ? s : s); if (isNaN(d)) return '—'; const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };

/* ---------- auth screen frame ---------- */
const FEAT = ['كل شركة ليها دفاتر منفصلة تمامًا عن باقي الشركات', 'ضيف المحاسبين والموظفين بصلاحيات (مالك / محاسب / عرض فقط)', 'التعديلات بتظهر عند كل المستخدمين لحظيًا', 'نسخة احتياطية يومية تلقائية على السيرفر', 'شغّال من أي جهاز: كمبيوتر أو موبايل'];
function screen(title, sub, body, main) {
  document.title = 'SIYADA — ' + title;
  $('#root').innerHTML = '<div id="setup" class="auth"><div class="pane"><div><div class="word">SIYADA</div><p>برنامج حسابات كامل: فواتير، سندات، قيود، دفتر أستاذ وتقارير جاهزة للطباعة — على السيرفر ومتاح لفريقك كله.</p></div><ul class="feat">' + FEAT.map(f => '<li>' + f + '</li>').join('') + '</ul></div>' +
    '<div class="form"><h1>' + esc(title) + '</h1><div class="sub">' + sub + '</div>' + body + '<div id="auErr" class="err" role="alert"></div></div></div>';
  const f = $('#setup input:not([readonly])'); if (f) f.focus();
}
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('#setup.auth input') && $('#auMain')) { e.preventDefault(); $('#auMain').click(); } });
const err = m => { const el = $('#auErr'); if (el) { el.className = 'err'; el.textContent = m || ''; } };
const okMsg = m => { const el = $('#auErr'); if (el) { el.className = 'okm'; el.textContent = m || ''; } };
async function busy(fn) {
  const b = $('#auMain'); if (b) b.disabled = true; err('');
  try { await fn(); } catch (e) { err(e.message); } finally { const b2 = $('#auMain'); if (b2) b2.disabled = false; }
}
const field = (label, id, type, val, extra) => '<label class="f">' + label + '<input class="in" id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '" ' + (extra || '') + '></label>';
const links = arr => '<div class="alinks">' + arr.map(l => '<a href="#" data-act="auGo" data-to="' + l[0] + '">' + l[1] + '</a>').join('') + '</div>';
APP.acts.auGo = (b) => { const t = b.dataset.to; if (t === 'login') ui.showLogin(); else if (t === 'register') ui.showRegister(); else if (t === 'forgot') ui.showForgot(); };

ui.showError = msg => screen('مفيش اتصال', esc(msg), '<div class="toolbar"><button class="btn primary" id="auMain" data-act="auReload">إعادة المحاولة</button></div>');
APP.acts.auReload = () => location.reload();

ui.showLogin = function (msg) {
  net.ready = false;
  screen('تسجيل الدخول', 'ادخل بالإيميل وكلمة المرور بتاعتك.', field('البريد الإلكتروني', 'auEmail', 'email', '', 'autocomplete="username" dir="ltr"') + field('كلمة المرور', 'auPw', 'password', '', 'autocomplete="current-password" dir="ltr"') +
    '<div class="toolbar"><button class="btn primary" id="auMain" data-act="auLogin">دخول</button></div>' + links([['forgot', 'نسيت كلمة المرور؟']].concat(net.ping && net.ping.registration === false ? [] : [['register', 'إنشاء حساب وشركة جديدة']])));
  if (msg) err(msg);
};
APP.acts.auLogin = () => busy(async () => {
  const email = $('#auEmail').value.trim(), password = $('#auPw').value; if (!email || !password) throw new Error('اكتب الإيميل وكلمة المرور.');
  const me = await api('POST', '/api/login', { email, password }, { noAuth: true });
  if (ui.pendingInvite) { const t = ui.pendingInvite; ui.pendingInvite = null; net.me = me; const r = await api('POST', '/api/invite/accept', { token: t }); me.companies = r.companies; return net.afterLogin(me, r.companyId); }
  return net.afterLogin(me);
});

ui.showRegister = function () {
  net.ready = false;
  screen('إنشاء حساب جديد', 'اكتب اسم شركتك وبياناتك — هتتجهز لك دفاتر مستقلة بالكامل.', field('اسم الشركة', 'auCo', 'text', '', 'autocomplete="organization" placeholder="مثال: شركة النور للتجارة"') + field('البريد الإلكتروني', 'auEmail', 'email', '', 'autocomplete="username" dir="ltr"') +
    '<div class="frow c2">' + field('كلمة المرور (٨ حروف على الأقل)', 'auPw', 'password', '', 'autocomplete="new-password" dir="ltr"') + field('تأكيد كلمة المرور', 'auPw2', 'password', '', 'autocomplete="new-password" dir="ltr"') + '</div>' +
    '<div class="toolbar"><button class="btn primary" id="auMain" data-act="auRegister">إنشاء الحساب</button></div>' + links([['login', 'عندي حساب — تسجيل الدخول']]));
};
APP.acts.auRegister = () => busy(async () => {
  const company = $('#auCo').value.trim(), email = $('#auEmail').value.trim(), password = $('#auPw').value;
  if (company.length < 2) throw new Error('اكتب اسم الشركة.'); if (!email) throw new Error('اكتب الإيميل.');
  if (password !== $('#auPw2').value) throw new Error('كلمتين المرور مش متطابقتين.');
  const r = await api('POST', '/api/register', { company, email, password }, { noAuth: true });
  if (r.needVerify) return screen('فعّل الإيميل', 'بعتنا رسالة تفعيل على <b dir="ltr">' + esc(email) + '</b>. افتح الرابط اللي فيها وبعدها سجّل دخول.', '<div class="toolbar"><button class="btn primary" id="auMain" data-act="auGo" data-to="login">تسجيل الدخول</button></div>');
  APP.UI.prefillCompany = company; return net.afterLogin(r, r.companyId);
});

ui.showForgot = function () {
  screen('استرجاع كلمة المرور', 'اكتب إيميلك وهنبعتلك رابط لتغيير كلمة المرور.', field('البريد الإلكتروني', 'auEmail', 'email', '', 'autocomplete="username" dir="ltr"') + '<div class="toolbar"><button class="btn primary" id="auMain" data-act="auForgot">إرسال الرابط</button></div>' + links([['login', 'رجوع لتسجيل الدخول']]));
};
APP.acts.auForgot = () => busy(async () => { const email = $('#auEmail').value.trim(); if (!email) throw new Error('اكتب الإيميل.'); await api('POST', '/api/forgot', { email }, { noAuth: true }); okMsg('لو الإيميل ده مسجل عندنا هيوصله رابط لتغيير كلمة المرور خلال دقايق.'); });

ui.showReset = function (token) {
  ui.resetToken = token;
  screen('كلمة مرور جديدة', 'اكتب كلمة المرور الجديدة.', '<div class="frow c2">' + field('كلمة المرور الجديدة', 'auPw', 'password', '', 'autocomplete="new-password" dir="ltr"') + field('تأكيد كلمة المرور', 'auPw2', 'password', '', 'autocomplete="new-password" dir="ltr"') + '</div><div class="toolbar"><button class="btn primary" id="auMain" data-act="auReset">حفظ كلمة المرور</button></div>');
};
APP.acts.auReset = () => busy(async () => {
  if ($('#auPw').value !== $('#auPw2').value) throw new Error('كلمتين المرور مش متطابقتين.');
  await api('POST', '/api/reset', { token: ui.resetToken, password: $('#auPw').value }, { noAuth: true });
  screen('تم', 'اتغيرت كلمة المرور. ادخل بيها دلوقتي.', '<div class="toolbar"><button class="btn primary" id="auMain" data-act="auGo" data-to="login">تسجيل الدخول</button></div>');
});
ui.doVerify = async function (token) {
  try { await api('POST', '/api/verify', { token }, { noAuth: true }); screen('تم تفعيل الإيميل', 'حسابك اتفعّل. تقدر تسجّل دخول.', '<div class="toolbar"><button class="btn primary" id="auMain" data-act="auGo" data-to="login">تسجيل الدخول</button></div>'); }
  catch (e) { screen('رابط غير صالح', esc(e.message), '<div class="toolbar"><button class="btn primary" id="auMain" data-act="auGo" data-to="login">تسجيل الدخول</button></div>'); }
};

/* ---------- invitations ---------- */
ui.showInvite = async function (token) {
  let info; try { info = await api('GET', '/api/invite/' + encodeURIComponent(token), null, { noAuth: true }); } catch (e) { return screen('الدعوة غير صالحة', esc(e.message), '<div class="toolbar"><button class="btn primary" id="auMain" data-act="auGo" data-to="login">تسجيل الدخول</button></div>'); }
  ui.inv = { token, info }; const me = net.me;
  const head = 'اتدعيت للانضمام لشركة <b>' + esc(info.company) + '</b> بصلاحية <b>' + esc(info.roleAr) + '</b>.';
  if (me && me.user.email === info.email) return screen('دعوة للانضمام', head, '<div class="toolbar"><button class="btn primary" id="auMain" data-act="auAccept">قبول الدعوة</button></div>');
  if (me) return screen('دعوة للانضمام', head + '<br>الدعوة دي مبعوتة للإيميل <b dir="ltr">' + esc(info.email) + '</b> وأنت داخل بإيميل تاني.', '<div class="toolbar"><button class="btn primary" id="auMain" data-act="logout" data-then="invite">تسجيل الخروج والدخول بالإيميل الصحيح</button></div>');
  if (info.userExists) { ui.pendingInvite = token; screen('دعوة للانضمام', head + '<br>سجّل دخول بحسابك وهنضيفك للشركة.', field('البريد الإلكتروني', 'auEmail', 'email', info.email, 'readonly dir="ltr"') + field('كلمة المرور', 'auPw', 'password', '', 'autocomplete="current-password" dir="ltr"') + '<div class="toolbar"><button class="btn primary" id="auMain" data-act="auLogin">دخول وقبول الدعوة</button></div>' + links([['forgot', 'نسيت كلمة المرور؟']])); return; }
  screen('دعوة للانضمام', head + '<br>أنشئ حسابك بكلمة مرور.', field('البريد الإلكتروني', 'auEmail', 'email', info.email, 'readonly dir="ltr"') + '<div class="frow c2">' + field('كلمة المرور (٨ حروف على الأقل)', 'auPw', 'password', '', 'autocomplete="new-password" dir="ltr"') + field('تأكيد كلمة المرور', 'auPw2', 'password', '', 'autocomplete="new-password" dir="ltr"') + '</div><div class="toolbar"><button class="btn primary" id="auMain" data-act="auInvReg">إنشاء الحساب والانضمام</button></div>');
};
APP.acts.auAccept = () => busy(async () => { const r = await api('POST', '/api/invite/accept', { token: ui.inv.token }); net.me.companies = r.companies; return net.afterLogin(net.me, r.companyId); });
APP.acts.auInvReg = () => busy(async () => {
  if ($('#auPw').value !== $('#auPw2').value) throw new Error('كلمتين المرور مش متطابقتين.');
  const r = await api('POST', '/api/register', { email: ui.inv.info.email, password: $('#auPw').value, invite: ui.inv.token }, { noAuth: true }); return net.afterLogin(r, r.companyId);
});

/* ---------- company picker / waiting ---------- */
ui.showPicker = function (msg) {
  net.ready = false; net.stopPoll(); const me = net.me; if (!me) return ui.showLogin();
  const cos = me.companies;
  screen('اختار الشركة', 'أهلاً <b dir="ltr">' + esc(me.user.email) + '</b>', (cos.length ? '<div class="cocards">' + cos.map(c => '<button class="cocard" data-act="openCo" data-id="' + c.id + '"' + (c.disabled ? ' disabled' : '') + '><b>' + esc(c.name) + '</b><span>' + esc(ROLE_AR[c.role] || '') + (c.disabled ? ' — موقوفة' : '') + '</span></button>').join('') + '</div>' : '<p class="muted">مفيش شركات على حسابك لسه.</p>') +
    '<h2 class="h2s">إنشاء شركة جديدة</h2><div class="frow c2">' + field('اسم الشركة', 'auCo', 'text', '', 'placeholder="مثال: شركة الأمل"') + '<div class="f"><br><button class="btn primary" id="auMain" data-act="auNewCo">إنشاء</button></div></div>' + '<div class="alinks"><a href="#" data-act="logout">تسجيل الخروج</a></div>');
  if (msg) err(msg);
};
APP.acts.openCo = b => net.open(parseInt(b.dataset.id, 10));
APP.acts.auNewCo = () => busy(async () => { const n = $('#auCo').value.trim(); if (n.length < 2) throw new Error('اكتب اسم الشركة.'); const r = await api('POST', '/api/companies', { name: n }); APP.UI.prefillCompany = n; net.me.companies = r.companies; return net.open(r.companyId); });
ui.showWaiting = function () {
  net.ready = true; document.title = 'SIYADA';
  screen('الشركة لسه ما اتجهزتش', 'مالك الشركة هو اللي بيجهّز الدفاتر أول مرة. الصفحة هتتحدّث تلقائيًا أول ما يخلّص.', '<div class="alinks"><a href="#" data-act="switchCo">تبديل الشركة</a><a href="#" data-act="logout">تسجيل الخروج</a></div>');
};
APP.acts.switchCo = async b => { await net.flush(); net.ready = false; net.stopPoll(); try { net.me = await api('GET', '/api/me'); } catch (e) { return; } ui.showPicker(); };
APP.acts.logout = async b => {
  await net.flush(); net.ready = false; net.stopPoll();
  try { await api('POST', '/api/logout', {}, { noAuth: true }); } catch (e) { }
  net.me = null; net.S = null; APP.S = null; APP.R = null; $('#root').innerHTML = '';
  if (b && b.dataset && b.dataset.then === 'invite' && ui.inv) { const t = ui.inv.token; return ui.showInvite(t); }
  ui.showLogin();
};

/* ---------- in-app routes ---------- */
const R_ = APP.routes;
const sheet = (title, body) => '<div class="sheet doc">' + APP.sheetHead(title) + body + '</div>';
const cid = () => net.cid;

R_.team = {
  title: 'الفريق والصلاحيات',
  html() { return sheet('الفريق والصلاحيات', '<div id="teamBody"><p class="muted">جارٍ التحميل…</p></div>'); },
  after() { loadTeam(); }
};
async function loadTeam() {
  const el = $('#teamBody'); if (!el) return;
  try {
    const t = await api('GET', '/api/c/' + cid() + '/team'); const owner = t.role === 'owner';
    let h = '<div class="bal">صلاحيتك: <b>' + esc(ROLE_AR[t.role]) + '</b> — <span class="muted sm">المالك: كل حاجة. المحاسب: تسجيل وتعديل الحركات والتقارير. عرض فقط: التقارير والبيانات بدون تعديل.</span></div>';
    h += '<h2 class="h2s">الأعضاء</h2><table class="grid"><thead><tr><th>الإيميل</th><th>الصلاحية</th>' + (owner ? '<th>آخر دخول</th><th></th>' : '') + '</tr></thead><tbody>' +
      t.members.map(m => '<tr><td dir="ltr" style="text-align:right">' + esc(m.email) + (m.userId === t.you ? ' <span class="pill">أنت</span>' : '') + '</td><td>' + (owner && m.role !== 'owner' ? '<select class="in sm" data-on="tmRole" data-uid="' + m.userId + '" data-cur="' + m.role + '"><option value="accountant"' + (m.role === 'accountant' ? ' selected' : '') + '>محاسب</option><option value="viewer"' + (m.role === 'viewer' ? ' selected' : '') + '>عرض فقط</option></select>' : esc(ROLE_AR[m.role])) + '</td>' +
        (owner ? '<td class="n">' + esc(fdt(m.last_login)) + '</td><td class="act">' + (m.role !== 'owner' ? '<button class="btn s danger" data-act="tmRemove" data-uid="' + m.userId + '" data-em="' + esc(m.email) + '">إزالة</button>' : '') + '</td>' : '') + '</tr>').join('') + '</tbody></table>';
    if (owner) {
      h += '<h2 class="h2s">دعوة عضو جديد</h2><div class="frow c3"><label class="f">إيميل العضو<input class="in" id="tmEmail" type="email" dir="ltr" placeholder="name@example.com"></label><label class="f">الصلاحية<select class="in" id="tmRoleNew"><option value="accountant">محاسب</option><option value="viewer">عرض فقط</option></select></label><div class="f"><br><button class="btn primary" data-act="tmInvite">إرسال الدعوة</button></div></div><div id="tmMsg"></div>';
      if (t.invites.length) h += '<h3 class="h3s">دعوات معلّقة</h3><table class="grid"><thead><tr><th>الإيميل</th><th>الصلاحية</th><th>تنتهي</th><th></th></tr></thead><tbody>' + t.invites.map(i => '<tr><td dir="ltr" style="text-align:right">' + esc(i.email) + '</td><td>' + esc(ROLE_AR[i.role]) + '</td><td class="n">' + esc(fdt(i.expires_at)) + '</td><td class="act"><button class="btn s" data-act="tmCancel" data-id="' + i.id + '">إلغاء</button></td></tr>').join('') + '</tbody></table>';
      const others = t.members.filter(m => m.role !== 'owner');
      h += '<h2 class="h2s danger-h">منطقة حساسة</h2><div class="toolbar">' + (others.length ? '<button class="btn" data-act="tmTransfer">نقل ملكية الشركة</button>' : '') + '<button class="btn danger" data-act="tmDelete">حذف الشركة نهائيًا</button></div>';
      ui.team = t;
    } else h += '<h2 class="h2s">مغادرة الشركة</h2><div class="toolbar"><button class="btn" data-act="tmLeave">مغادرة الشركة دي</button></div>';
    el.innerHTML = h;
  } catch (e) { el.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
}
APP.ons.tmRole = async t => {
  if (t.value === t.dataset.cur) return; const old = t.dataset.cur; t.dataset.cur = t.value;
  try { await api('POST', '/api/c/' + cid() + '/member', { userId: +t.dataset.uid, role: t.value }); APP.toast('اتغيرت الصلاحية.'); } catch (e) { t.value = old; t.dataset.cur = old; APP.alert(e.message); }
};
APP.acts.tmInvite = async b => {
  const email = $('#tmEmail').value.trim(); if (!email) { $('#tmEmail').focus(); return; } b.disabled = true;
  try {
    const r = await api('POST', '/api/c/' + cid() + '/invite', { email, role: $('#tmRoleNew').value });
    $('#tmMsg').innerHTML = '<div class="bal ok">' + (r.mailed ? 'اتبعتت الدعوة على الإيميل. ' : 'الإيميل مش متظبط على السيرفر — ابعت الرابط ده للعضو بنفسك: ') + '<div class="linkbox"><input class="in" id="tmLink" readonly dir="ltr" value="' + esc(r.link) + '"><button class="btn s" data-act="tmCopy">نسخ</button></div></div>';
    $('#tmEmail').value = ''; setTimeout(loadTeamKeepMsg, 0);
  } catch (e) { APP.alert(e.message); } finally { b.disabled = false; }
};
async function loadTeamKeepMsg() { const m = $('#tmMsg') ? $('#tmMsg').innerHTML : ''; await loadTeam(); if ($('#tmMsg')) $('#tmMsg').innerHTML = m; }
APP.acts.tmCopy = () => { const i = $('#tmLink'); if (!i) return; i.select(); try { navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand && document.execCommand('copy'); } APP.toast('اتنسخ الرابط.'); };
APP.acts.tmCancel = async b => { try { await api('POST', '/api/c/' + cid() + '/invite/cancel', { id: +b.dataset.id }); loadTeam(); } catch (e) { APP.alert(e.message); } };
APP.acts.tmRemove = async b => { if (!await APP.confirm('إزالة ' + b.dataset.em + ' من الشركة؟ مش هيقدر يفتح الدفاتر تاني.', 'إزالة', true)) return; try { await api('POST', '/api/c/' + cid() + '/member/remove', { userId: +b.dataset.uid }); loadTeam(); } catch (e) { APP.alert(e.message); } };
APP.acts.tmLeave = async () => { if (!await APP.confirm('هتغادر الشركة دي ومش هتقدر تفتحها إلا بدعوة جديدة. تكمل؟', 'مغادرة', true)) return; try { const r = await api('POST', '/api/c/' + cid() + '/leave', {}); net.me.companies = r.companies; net.stopPoll(); net.ready = false; ui.showPicker(); } catch (e) { APP.alert(e.message); } };
APP.acts.tmTransfer = () => {
  const others = ui.team.members.filter(m => m.role !== 'owner');
  APP.modal('<div class="mbody"><p class="mmsg">هتبقى <b>محاسب</b> بعد النقل، والعضو اللي تختاره هيبقى المالك.</p><label class="f">المالك الجديد<select class="in" id="trU">' + others.map(m => '<option value="' + m.userId + '">' + esc(m.email) + '</option>').join('') + '</select></label><label class="f">كلمة المرور بتاعتك للتأكيد<input class="in" type="password" id="trPw" dir="ltr"></label><div id="trErr" class="err"></div></div><div class="mfoot"><button class="btn primary" id="trOk">نقل الملكية</button><button class="btn" data-act="mclose">إلغاء</button></div>');
  $('#trOk').onclick = async () => { try { await api('POST', '/api/c/' + cid() + '/transfer', { userId: +$('#trU').value, password: $('#trPw').value }); APP.acts.mclose(); await net.reload(); APP.go('team'); } catch (e) { $('#trErr').textContent = e.message; } };
};
APP.acts.tmDelete = () => {
  APP.modal('<div class="mbody"><p class="mmsg">هتتحذف الشركة <b>وكل بياناتها</b> لكل المستخدمين نهائيًا. خد نسخة JSON قبل ما تكمل.</p><label class="f">اكتب اسم الشركة بالظبط<input class="in" id="dlName" autocomplete="off"></label><label class="f">كلمة المرور بتاعتك<input class="in" type="password" id="dlPw" dir="ltr"></label><div id="dlErr" class="err"></div></div><div class="mfoot"><button class="btn danger" id="dlOk">حذف نهائي</button><button class="btn" data-act="mclose">إلغاء</button></div>');
  $('#dlOk').onclick = async () => { try { const r = await api('POST', '/api/c/' + cid() + '/delete', { name: $('#dlName').value, password: $('#dlPw').value }); APP.acts.mclose(); net.stopPoll(); net.ready = false; net.me.companies = r.companies; APP.S = null; ui.showPicker('اتحذفت الشركة.'); } catch (e) { $('#dlErr').textContent = e.message; } };
};

R_.activity = {
  title: 'سجل النشاط',
  html() { return sheet('سجل النشاط', '<div class="toolbar"><button class="btn" data-act="acRefresh">تحديث</button></div><div id="acBody"><p class="muted">جارٍ التحميل…</p></div>'); },
  after() { loadActivity(); }
};
const ACT_AR = { mutate: 'تعديل بيانات', create: 'إنشاء الشركة', join: 'انضمام', invite: 'دعوة', role: 'تغيير صلاحية', remove: 'إزالة عضو', leave: 'مغادرة', transfer: 'نقل ملكية', restore: 'استيراد/استعادة', wipe: 'مسح البيانات' };
async function loadActivity() {
  const el = $('#acBody'); if (!el) return;
  try { const r = await api('GET', '/api/c/' + cid() + '/activity'); el.innerHTML = '<table class="grid"><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead><tbody>' + (r.rows.length ? r.rows.map(x => '<tr><td class="n">' + esc(fdt(x.ts)) + '</td><td dir="ltr" style="text-align:right">' + esc(x.email) + '</td><td>' + esc(ACT_AR[x.action] || x.action) + '</td><td class="wrap">' + esc(x.detail) + '</td></tr>').join('') : '<tr><td class="empty" colspan="4">لسه مفيش نشاط.</td></tr>') + '</tbody></table>'; }
  catch (e) { el.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
}
APP.acts.acRefresh = loadActivity;

R_.account = {
  title: 'حسابي',
  html() {
    const u = net.me.user;
    return sheet('حسابي', '<div class="bal">الإيميل: <b dir="ltr">' + esc(u.email) + '</b>' + (u.verified ? '' : ' — <span class="neg">لسه ما اتفعّلش</span> <button class="btn s" data-act="acResend">إعادة إرسال رسالة التفعيل</button>') + '</div>' +
      '<h2 class="h2s">تغيير كلمة المرور</h2><div class="frow c3"><label class="f">الحالية<input class="in" type="password" id="acOld" dir="ltr" autocomplete="current-password"></label><label class="f">الجديدة<input class="in" type="password" id="acNew" dir="ltr" autocomplete="new-password"></label><label class="f">تأكيد الجديدة<input class="in" type="password" id="acNew2" dir="ltr" autocomplete="new-password"></label></div><div id="acMsg" class="err"></div><div class="toolbar"><button class="btn primary" data-act="acPw">تغيير كلمة المرور</button><button class="btn" data-act="acOthers">تسجيل الخروج من باقي الأجهزة</button></div>' +
      '<h2 class="h2s">شركاتي</h2><table class="grid"><thead><tr><th>الشركة</th><th>صلاحيتك</th></tr></thead><tbody>' + net.me.companies.map(c => '<tr><td>' + esc(c.name) + (c.id === net.cid ? ' <span class="pill">الحالية</span>' : '') + '</td><td>' + esc(ROLE_AR[c.role]) + '</td></tr>').join('') + '</tbody></table><div class="toolbar"><button class="btn" data-act="switchCo">تبديل الشركة / إنشاء شركة جديدة</button></div>');
  }
};
APP.acts.acPw = async () => {
  const m = $('#acMsg'); m.className = 'err'; m.textContent = '';
  if ($('#acNew').value !== $('#acNew2').value) { m.textContent = 'كلمتين المرور مش متطابقتين.'; return; }
  try { await api('POST', '/api/password', { old: $('#acOld').value, password: $('#acNew').value }); ['acOld', 'acNew', 'acNew2'].forEach(i => { $('#' + i).value = ''; }); m.className = 'okm'; m.textContent = 'اتغيرت كلمة المرور.'; } catch (e) { m.textContent = e.message; }
};
APP.acts.acOthers = async () => { try { await api('POST', '/api/logout-others', {}); APP.toast('اتسجل خروج من باقي الأجهزة.'); } catch (e) { APP.alert(e.message); } };
APP.acts.acResend = async () => { try { const r = await api('POST', '/api/resend', {}); APP.toast(r.sent ? 'اتبعتت رسالة التفعيل.' : 'الإيميل مش متظبط على السيرفر — اطلب من المدير.'); } catch (e) { APP.alert(e.message); } };

R_.admin = {
  title: 'إدارة الخدمة',
  html() { return sheet('إدارة الخدمة', '<div class="toolbar"><button class="btn" data-act="adRefresh">تحديث</button><button class="btn" data-act="adBackup">نسخة احتياطية الآن</button></div><div id="adBody"><p class="muted">جارٍ التحميل…</p></div>'); },
  after() { loadAdmin(); }
};
async function loadAdmin() {
  const el = $('#adBody'); if (!el) return;
  try {
    const r = await api('GET', '/api/admin/overview');
    el.innerHTML = '<div class="bal">الإيميل (SMTP): ' + (r.smtp ? '<b class="pos">متظبط</b>' : '<b class="neg">غير متظبط</b> — الدعوات والتفعيل بتتكتب في مجلد outbox على السيرفر') + '</div>' +
      '<h2 class="h2s">الشركات (' + r.companies.length + ')</h2><table class="grid"><thead><tr><th>الشركة</th><th>المالك</th><th>الأعضاء</th><th>الحركات</th><th>آخر تعديل</th><th></th></tr></thead><tbody>' + r.companies.map(c => '<tr><td>' + esc(c.name) + (c.disabled ? ' <span class="pill bad">موقوفة</span>' : '') + '</td><td dir="ltr" style="text-align:right">' + esc(c.owner || '') + '</td><td class="n">' + c.members + '</td><td class="n">' + c.tx + '</td><td class="n">' + esc(fdt(c.updated_at)) + '</td><td class="act"><button class="btn s" data-act="adCo" data-id="' + c.id + '" data-a="' + (c.disabled ? 'enable' : 'disable') + '">' + (c.disabled ? 'تشغيل' : 'إيقاف') + '</button> <button class="btn s danger" data-act="adCo" data-id="' + c.id + '" data-a="delete" data-n="' + esc(c.name) + '">حذف</button></td></tr>').join('') + '</tbody></table>' +
      '<h2 class="h2s">المستخدمون (' + r.users.length + ')</h2><table class="grid"><thead><tr><th>الإيميل</th><th>الشركات</th><th>مفعّل</th><th>آخر دخول</th><th></th></tr></thead><tbody>' + r.users.map(u => '<tr><td dir="ltr" style="text-align:right">' + esc(u.email) + (u.is_admin ? ' <span class="pill">مدير</span>' : '') + (u.disabled ? ' <span class="pill bad">موقوف</span>' : '') + '</td><td class="n">' + u.companies + '</td><td>' + (u.verified ? 'نعم' : '<button class="btn s" data-act="adUser" data-id="' + u.id + '" data-a="verify">تفعيل يدوي</button>') + '</td><td class="n">' + esc(fdt(u.last_login)) + '</td><td class="act"><button class="btn s" data-act="adUser" data-id="' + u.id + '" data-a="reset" data-em="' + esc(u.email) + '">كلمة مرور مؤقتة</button> ' + (u.id === net.me.user.id ? '' : '<button class="btn s" data-act="adUser" data-id="' + u.id + '" data-a="' + (u.disabled ? 'enable' : 'disable') + '">' + (u.disabled ? 'تشغيل' : 'إيقاف') + '</button> <button class="btn s danger" data-act="adUser" data-id="' + u.id + '" data-a="delete" data-em="' + esc(u.email) + '">حذف</button>') + '</td></tr>').join('') + '</tbody></table>';
  } catch (e) { el.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
}
APP.acts.adRefresh = loadAdmin;
APP.acts.adBackup = async () => { try { const r = await api('POST', '/api/admin/backup', {}); APP.toast('تمت النسخة: ' + r.file); } catch (e) { APP.alert(e.message); } };
APP.acts.adUser = async b => {
  const a = b.dataset.a; if (a === 'delete' && !await APP.confirm('حذف المستخدم ' + b.dataset.em + ' نهائيًا؟', 'حذف', true)) return;
  if (a === 'reset' && !await APP.confirm('هتتعمل كلمة مرور مؤقتة جديدة لـ ' + b.dataset.em + ' وهيتسجل خروجه من كل الأجهزة. تكمل؟', 'تكمل')) return;
  try { const r = await api('POST', '/api/admin/user', { id: +b.dataset.id, action: a }); if (r.temp) await APP.alert('كلمة المرور المؤقتة (ابعتها للمستخدم وخليه يغيّرها):\n' + r.temp); loadAdmin(); } catch (e) { APP.alert(e.message); }
};
APP.acts.adCo = async b => {
  const a = b.dataset.a; if (a === 'delete' && !await APP.confirm('حذف الشركة «' + b.dataset.n + '» وكل بياناتها نهائيًا؟', 'حذف', true)) return;
  try { await api('POST', '/api/admin/company', { id: +b.dataset.id, action: a }); loadAdmin(); } catch (e) { APP.alert(e.message); }
};
})(window);
