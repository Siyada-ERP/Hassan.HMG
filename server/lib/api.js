'use strict';
/* واجهة السيرفر (API): الحسابات، الشركات، الفريق، البيانات */
const cfg = require('./config');
const { P, tx, now, backup } = require('./db');
const A = require('./auth');
const D = require('./data');
const M = require('./mail');
const { HttpError, bad } = D;

const ROLE_AR = { owner: 'مالك', accountant: 'محاسب', viewer: 'عرض فقط' };
const baseUrl = req => cfg.baseUrl || ((A.isHttps(req) ? 'https://' : 'http://') + (req.headers.host || ('localhost:' + cfg.port)));
const str = (v, max, name) => { if (typeof v !== 'string') throw bad('بيانات ناقصة: ' + (name || '')); v = v.trim(); if (v.length > max) throw bad('النص طويل جدًا: ' + (name || '')); return v; };
const need = (c, status, msg) => { if (!c) throw new HttpError(status || 403, msg || 'غير مسموح.'); };

/* ---------- مساعدات ---------- */
function myCompanies(userId) {
  return P('my_cos', 'SELECT c.id, c.name, c.disabled, m.role FROM members m JOIN companies c ON c.id=m.company_id WHERE m.user_id=? ORDER BY c.id').all(userId).map(r => ({ id: r.id, name: r.name, role: r.role, disabled: !!r.disabled }));
}
function meObj(s) {
  return { user: { id: s.userId, email: s.email, name: s.name || '', verified: s.verified, admin: s.admin }, companies: myCompanies(s.userId), server: { smtp: !!cfg.smtp, requireVerify: cfg.requireVerify, allowRegistration: cfg.allowRegistration } };
}
function sessionObj(userId) { const u = P('u_by_id', 'SELECT id,email,name,verified,is_admin FROM users WHERE id=?').get(userId); return { userId: u.id, email: u.email, name: u.name, verified: !!u.verified, admin: !!u.is_admin }; }
function createCompany(userId, name) {
  const t = now();
  const r = P('co_ins', 'INSERT INTO companies(name,owner_id,counters,created_at,updated_at) VALUES(?,?,?,?,?)').run(name, userId, JSON.stringify(D.newCounters()), t, t);
  const id = Number(r.lastInsertRowid);
  P('mem_ins', 'INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,?,?,?)').run(id, userId, 'owner', t);
  D.log(id, { userId, email: P('u_email', 'SELECT email FROM users WHERE id=?').get(userId).email }, 'create', 'إنشاء الشركة «' + name + '»');
  return id;
}
function roleOf(userId, cid) { const r = P('mem_role', 'SELECT m.role, c.disabled FROM members m JOIN companies c ON c.id=m.company_id WHERE m.company_id=? AND m.user_id=?').get(cid, userId); return r ? { role: r.role, disabled: !!r.disabled } : null; }
function ctxCompany(ctx, roles) {
  const cid = parseInt(ctx.params.cid, 10); need(Number.isFinite(cid), 404, 'الشركة مش موجودة.'); need(ctx.session, 401, 'لازم تسجل دخول.');
  const m = roleOf(ctx.session.userId, cid); need(m, 403, 'مالكش صلاحية على الشركة دي.');
  need(!m.disabled, 403, 'الشركة دي موقوفة. تواصل مع إدارة الخدمة.');
  if (roles) need(roles.includes(m.role), 403, 'صلاحيتك (' + ROLE_AR[m.role] + ') مش بتسمح بالعملية دي.');
  return { cid, role: m.role };
}
const needLogin = ctx => { need(ctx.session, 401, 'لازم تسجل دخول.'); return ctx.session; };
const needAdmin = ctx => { const s = needLogin(ctx); need(s.admin, 403, 'للمدير فقط.'); return s; };
function startSession(ctx, userId) {
  const tok = A.createSession(userId, ctx.ip, ctx.req.headers['user-agent']);
  ctx.setCookie = A.cookieHeader(ctx.req, tok, cfg.sessionDays * 86400);
  P('u_login', 'UPDATE users SET last_login=? WHERE id=?').run(now(), userId);
}
async function mailToken(req, user, kind) {
  const ttl = kind === 'verify' ? 48 * 3600e3 : 3600e3;
  const t = A.makeToken(user.id, kind, ttl);
  const link = baseUrl(req) + '/?' + kind + '=' + t;
  const m = M.T[kind](link);
  return M.sendMail(user.email, m.subject, m.text, m.html, link);
}

/* ---------- المسارات ---------- */
const R = [];
const route = (method, pattern, fn, opts) => R.push({ method, re: new RegExp('^' + pattern.replace(/:([a-z]+)/gi, '(?<$1>[^/]+)') + '$'), fn, opts: opts || {} });

route('GET', '/api/ping', ctx => ({ app: 'siyada-server', v: 1, registration: !!cfg.allowRegistration, smtp: !!cfg.smtp }));
route('GET', '/api/me', ctx => { const s = needLogin(ctx); return meObj(s); });

route('POST', '/api/register', async ctx => {
  const b = ctx.body, ip = ctx.ip;
  need(A.hit('reg:' + ip, 10, 3600e3), 429, 'محاولات تسجيل كتير. جرّب بعد شوية.');
  const email = A.normEmail(b.email), pw = b.password, inviteTok = typeof b.invite === 'string' ? b.invite : '';
  need(cfg.allowRegistration || inviteTok, 403, 'التسجيل الجديد مقفول حاليًا.');
  if (!A.validEmail(email)) throw bad('اكتب إيميل صحيح.');
  const pp = A.passwordProblem(pw); if (pp) throw bad(pp);
  let inv = null;
  if (inviteTok) {
    inv = P('inv_get', 'SELECT i.*, c.name AS cname FROM invites i JOIN companies c ON c.id=i.company_id WHERE i.token=?').get(A.sha(inviteTok));
    if (!inv || inv.accepted_at || inv.expires_at < Date.now()) throw bad('الدعوة منتهية أو غير صالحة.');
    if (inv.email !== email) throw bad('الدعوة دي مبعوتة لإيميل تاني (' + inv.email + ').');
  }
  const company = inv ? '' : str(b.company, 120, 'اسم الشركة');
  if (!inv && company.length < 2) throw bad('اكتب اسم الشركة.');
  if (P('u_exists', 'SELECT 1 FROM users WHERE email=?').get(email)) throw new HttpError(409, 'الإيميل ده مسجل قبل كده. ادخل بحسابك أو استرجع كلمة المرور.');
  const hash = await A.hashPassword(pw);
  const out = tx(() => {
    if (P('u_exists2', 'SELECT 1 FROM users WHERE email=?').get(email)) throw new HttpError(409, 'الإيميل ده مسجل قبل كده.');
    const first = P('u_count', 'SELECT COUNT(*) AS n FROM users').get().n === 0;
    const admin = (cfg.adminEmail && cfg.adminEmail === email) || (!cfg.adminEmail && first) ? 1 : 0;
    const verified = inv ? 1 : (cfg.requireVerify ? 0 : 1);
    const r = P('u_ins', 'INSERT INTO users(email,pass,verified,is_admin,created_at,pw_changed_at) VALUES(?,?,?,?,?,?)').run(email, hash, verified, admin, now(), now());
    const uid = Number(r.lastInsertRowid); let cid = 0;
    if (inv) { P('mem_ins2', 'INSERT OR IGNORE INTO members(company_id,user_id,role,created_at) VALUES(?,?,?,?)').run(inv.company_id, uid, inv.role, now()); P('inv_acc', 'UPDATE invites SET accepted_at=? WHERE id=?').run(now(), inv.id); cid = inv.company_id; D.log(cid, { userId: uid, email }, 'join', 'انضم للشركة بصلاحية ' + ROLE_AR[inv.role]); }
    else cid = createCompany(uid, company);
    return { uid, cid, verified };
  });
  if (!out.verified) { const u = { id: out.uid, email }; mailToken(ctx.req, u, 'verify').catch(() => { }); return { needVerify: true, email }; }
  startSession(ctx, out.uid);
  return Object.assign(meObj(sessionObj(out.uid)), { companyId: out.cid });
});

route('POST', '/api/login', async ctx => {
  const email = A.normEmail(ctx.body.email), pw = typeof ctx.body.password === 'string' ? ctx.body.password : '';
  const k1 = 'login:' + ctx.ip + '|' + email, k2 = 'loginE:' + email;
  need(A.peek(k1, 8) && A.peek(k2, 30), 429, 'محاولات دخول كتيرة. استنى شوية وجرّب تاني.');
  const u = P('u_by_email', 'SELECT * FROM users WHERE email=?').get(email);
  const ok = u ? await A.verifyPassword(pw, u.pass) : (await A.dummyVerify(pw), false);
  if (!ok) { A.hit(k1, 8, 15 * 60e3); A.hit(k2, 30, 3600e3); throw new HttpError(401, 'الإيميل أو كلمة المرور غلط.'); }
  need(!u.disabled, 403, 'الحساب ده موقوف. تواصل مع إدارة الخدمة.');
  if (cfg.requireVerify && !u.verified) throw new HttpError(403, 'لازم تفعّل الإيميل الأول — راجع رسالة التفعيل.', { needVerify: true });
  A.clearKey(k1); startSession(ctx, u.id);
  return meObj(sessionObj(u.id));
});
route('POST', '/api/logout', ctx => { if (ctx.session) P('sess_del2', 'DELETE FROM sessions WHERE id=?').run(ctx.session.id); ctx.setCookie = A.cookieHeader(ctx.req, '', 0); return { ok: true }; });

route('POST', '/api/forgot', async ctx => {
  need(A.hit('forgot:' + ctx.ip, 6, 3600e3), 429, 'طلبات كتيرة. جرّب بعد شوية.');
  const email = A.normEmail(ctx.body.email);
  const u = A.validEmail(email) && P('u_by_email2', 'SELECT id,email,disabled FROM users WHERE email=?').get(email);
  if (u && !u.disabled && A.hit('forgotE:' + email, 4, 3600e3)) await mailToken(ctx.req, u, 'reset');
  return { ok: true };
});
route('POST', '/api/reset', async ctx => {
  need(A.hit('reset:' + ctx.ip, 20, 3600e3), 429, 'محاولات كتير.');
  const pp = A.passwordProblem(ctx.body.password); if (pp) throw bad(pp);
  const uid = A.useToken(String(ctx.body.token || ''), 'reset'); if (!uid) throw bad('الرابط منتهي أو غير صالح. اطلب رابط جديد.');
  const hash = await A.hashPassword(ctx.body.password);
  P('u_pw', 'UPDATE users SET pass=?, pw_changed_at=?, verified=1 WHERE id=?').run(hash, now(), uid); A.killSessions(uid);
  return { ok: true };
});
route('POST', '/api/verify', ctx => {
  const uid = A.useToken(String(ctx.body.token || ''), 'verify'); if (!uid) throw bad('رابط التفعيل منتهي أو غير صالح.');
  P('u_ver', 'UPDATE users SET verified=1 WHERE id=?').run(uid); return { ok: true };
});
route('POST', '/api/resend', async ctx => {
  const s = needLogin(ctx); need(A.hit('resend:' + s.userId, 3, 3600e3), 429, 'استنى شوية قبل إعادة الإرسال.');
  if (s.verified) return { ok: true }; const r = await mailToken(ctx.req, { id: s.userId, email: s.email }, 'verify'); return { ok: true, sent: r.sent };
});
route('POST', '/api/password', async ctx => {
  const s = needLogin(ctx); need(A.hit('pw:' + s.userId, 10, 3600e3), 429, 'محاولات كتير.');
  const u = P('u_pwget', 'SELECT pass FROM users WHERE id=?').get(s.userId);
  if (!await A.verifyPassword(String(ctx.body.old || ''), u.pass)) throw new HttpError(403, 'كلمة المرور الحالية غلط.');
  const pp = A.passwordProblem(ctx.body.password); if (pp) throw bad(pp);
  P('u_pw2', 'UPDATE users SET pass=?, pw_changed_at=? WHERE id=?').run(await A.hashPassword(ctx.body.password), now(), s.userId); A.killSessions(s.userId, s.id);
  return { ok: true };
});
route('POST', '/api/profile', ctx => { const s = needLogin(ctx); P('u_name', 'UPDATE users SET name=? WHERE id=?').run(str(ctx.body.name || '', 80, 'الاسم'), s.userId); return { ok: true }; });
route('POST', '/api/logout-others', ctx => { const s = needLogin(ctx); A.killSessions(s.userId, s.id); return { ok: true }; });

/* ---------- الدعوات ---------- */
route('GET', '/api/invite/:token', ctx => {
  const inv = P('inv_get2', 'SELECT i.email, i.role, i.expires_at, i.accepted_at, c.name AS company FROM invites i JOIN companies c ON c.id=i.company_id WHERE i.token=?').get(A.sha(ctx.params.token));
  if (!inv || inv.accepted_at || inv.expires_at < Date.now()) throw new HttpError(404, 'الدعوة منتهية أو غير صالحة.');
  return { company: inv.company, email: inv.email, role: inv.role, roleAr: ROLE_AR[inv.role], userExists: !!P('u_exists3', 'SELECT 1 FROM users WHERE email=?').get(inv.email) };
});
route('POST', '/api/invite/accept', ctx => {
  const s = needLogin(ctx);
  const inv = P('inv_get3', 'SELECT * FROM invites WHERE token=?').get(A.sha(String(ctx.body.token || '')));
  if (!inv || inv.accepted_at || inv.expires_at < Date.now()) throw bad('الدعوة منتهية أو غير صالحة.');
  need(inv.email === s.email, 403, 'الدعوة دي مبعوتة لإيميل تاني (' + inv.email + '). ادخل بالحساب الصحيح.');
  tx(() => {
    const ex = P('mem_get', 'SELECT role FROM members WHERE company_id=? AND user_id=?').get(inv.company_id, s.userId);
    if (!ex) P('mem_ins3', 'INSERT INTO members(company_id,user_id,role,created_at) VALUES(?,?,?,?)').run(inv.company_id, s.userId, inv.role, now());
    P('inv_acc2', 'UPDATE invites SET accepted_at=? WHERE id=?').run(now(), inv.id);
    P('u_ver2', 'UPDATE users SET verified=1 WHERE id=?').run(s.userId);
    D.log(inv.company_id, s, 'join', 'انضم للشركة بصلاحية ' + ROLE_AR[inv.role]);
  });
  return { companyId: inv.company_id, companies: myCompanies(s.userId) };
});

route('POST', '/api/companies', ctx => {
  const s = needLogin(ctx); need(cfg.allowRegistration || s.admin, 403, 'إنشاء شركات جديدة مقفول حاليًا.');
  need(A.hit('newco:' + s.userId, 10, 3600e3), 429, 'محاولات كتير.');
  const name = str(ctx.body.name, 120, 'اسم الشركة'); if (name.length < 2) throw bad('اكتب اسم الشركة.');
  const id = createCompany(s.userId, name); return { companyId: id, companies: myCompanies(s.userId) };
});

/* ---------- بيانات الشركة ---------- */
route('GET', '/api/c/:cid/snapshot', ctx => { const c = ctxCompany(ctx); return { raw: D.snapshot(c.cid, c.role), gzip: true }; });
route('GET', '/api/c/:cid/changes', async ctx => {
  const c = ctxCompany(ctx); const since = Number(ctx.query.get('since')) || 0;
  if (ctx.query.get('wait') === '1') { const co = D.getCompany(c.cid); if (co && since === co.rev) await D.waitChange(c.cid, cfg.longPollMs); }
  const m = roleOf(ctx.session.userId, c.cid); need(m && !m.disabled, 403, 'مالكش صلاحية.');
  return { raw: D.changes(c.cid, since).replace(/^\{/, '{"role":' + JSON.stringify(m.role) + ','), gzip: true };
});
const recent = new Map();
route('POST', '/api/c/:cid/mutate', ctx => {
  const c = ctxCompany(ctx, ['owner', 'accountant']);
  need(A.hit('mut:' + ctx.session.userId, 600, 60e3), 429, 'عمليات كتيرة جدًا. استنى لحظة.');
  const rid = typeof ctx.body.reqId === 'string' ? c.cid + ':' + ctx.session.userId + ':' + ctx.body.reqId.slice(0, 40) : '';
  if (rid && recent.has(rid)) return recent.get(rid);
  const out = D.mutate(c.cid, ctx.session, ctx.body);
  if (rid) { recent.set(rid, out); if (recent.size > 500) recent.delete(recent.keys().next().value); }
  return out;
}, { max: cfg.maxMutate });
route('POST', '/api/c/:cid/alloc', ctx => { const c = ctxCompany(ctx, ['owner', 'accountant']); return D.alloc(c.cid, ctx.body.kind, ctx.body.n); });
route('POST', '/api/c/:cid/restore', ctx => { const c = ctxCompany(ctx, ['owner']); need(A.hit('restore:' + c.cid, 20, 3600e3), 429, 'عمليات استعادة كتير.'); return D.restore(c.cid, ctx.session, ctx.body); }, { max: cfg.maxRestore });
route('POST', '/api/c/:cid/wipe', ctx => { const c = ctxCompany(ctx, ['owner']); return D.wipe(c.cid, ctx.session); });
route('GET', '/api/c/:cid/activity', ctx => {
  const c = ctxCompany(ctx, ['owner', 'accountant']);
  const rows = P('act_list', 'SELECT id,email,ts,action,detail FROM activity WHERE company_id=? ORDER BY id DESC LIMIT 300').all(c.cid);
  return { rows };
});

/* ---------- الفريق ---------- */
route('GET', '/api/c/:cid/team', ctx => {
  const c = ctxCompany(ctx);
  const members = P('team_m', 'SELECT u.id AS userId, u.email, u.name, m.role, m.created_at AS since, u.last_login FROM members m JOIN users u ON u.id=m.user_id WHERE m.company_id=? ORDER BY m.created_at').all(c.cid);
  const invites = c.role === 'owner' ? P('team_i', 'SELECT id,email,role,created_at,expires_at FROM invites WHERE company_id=? AND accepted_at IS NULL AND expires_at>? ORDER BY id DESC').all(c.cid, Date.now()) : [];
  return { members: c.role === 'owner' ? members : members.map(m => ({ userId: m.userId, email: m.email, name: m.name, role: m.role })), invites, you: ctx.session.userId, role: c.role };
});
route('POST', '/api/c/:cid/invite', async ctx => {
  const c = ctxCompany(ctx, ['owner']); need(A.hit('invite:' + c.cid, 30, 3600e3), 429, 'دعوات كتيرة. جرّب بعد شوية.');
  const email = A.normEmail(ctx.body.email); if (!A.validEmail(email)) throw bad('اكتب إيميل صحيح.');
  const role = ctx.body.role; if (role !== 'accountant' && role !== 'viewer') throw bad('اختار الصلاحية.');
  if (P('mem_chk', 'SELECT 1 FROM members m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND u.email=?').get(c.cid, email)) throw new HttpError(409, 'الإيميل ده عضو في الشركة بالفعل.');
  if (P('inv_cnt', 'SELECT COUNT(*) AS n FROM invites WHERE company_id=? AND accepted_at IS NULL AND expires_at>?').get(c.cid, Date.now()).n >= 50) throw bad('عدد الدعوات المعلّقة كبير. الغي بعضها الأول.');
  const tok = A.rnd(32), exp = Date.now() + 7 * 864e5;
  P('inv_del', 'DELETE FROM invites WHERE company_id=? AND email=? AND accepted_at IS NULL').run(c.cid, email);
  const r = P('inv_ins', 'INSERT INTO invites(company_id,email,role,token,invited_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').run(c.cid, email, role, A.sha(tok), ctx.session.userId, now(), exp);
  const co = D.getCompany(c.cid), link = baseUrl(ctx.req) + '/?invite=' + tok;
  const m = M.T.invite(link, co.name, ROLE_AR[role], ctx.session.email);
  const sent = await M.sendMail(email, m.subject, m.text, m.html, link);
  D.log(c.cid, ctx.session, 'invite', 'دعوة ' + email + ' بصلاحية ' + ROLE_AR[role]);
  return { id: Number(r.lastInsertRowid), link, mailed: !!sent.sent };
});
route('POST', '/api/c/:cid/invite/cancel', ctx => { const c = ctxCompany(ctx, ['owner']); P('inv_cancel', 'DELETE FROM invites WHERE id=? AND company_id=?').run(Number(ctx.body.id) || 0, c.cid); return { ok: true }; });
route('POST', '/api/c/:cid/member', ctx => {
  const c = ctxCompany(ctx, ['owner']); const uid = Number(ctx.body.userId), role = ctx.body.role;
  if (role !== 'accountant' && role !== 'viewer') throw bad('صلاحية غير صالحة.');
  const m = P('mem_get2', 'SELECT role FROM members WHERE company_id=? AND user_id=?').get(c.cid, uid); need(m, 404, 'العضو مش موجود.'); need(m.role !== 'owner', 400, 'مينفعش تغيّر صلاحية المالك.');
  P('mem_up', 'UPDATE members SET role=? WHERE company_id=? AND user_id=?').run(role, c.cid, uid);
  D.log(c.cid, ctx.session, 'role', 'تغيير صلاحية ' + (P('u_email2', 'SELECT email FROM users WHERE id=?').get(uid) || {}).email + ' إلى ' + ROLE_AR[role]); return { ok: true };
});
route('POST', '/api/c/:cid/member/remove', ctx => {
  const c = ctxCompany(ctx, ['owner']); const uid = Number(ctx.body.userId);
  const m = P('mem_get3', 'SELECT role FROM members WHERE company_id=? AND user_id=?').get(c.cid, uid); need(m, 404, 'العضو مش موجود.'); need(m.role !== 'owner', 400, 'مينفعش تشيل المالك.');
  const em = (P('u_email3', 'SELECT email FROM users WHERE id=?').get(uid) || {}).email;
  P('mem_del', 'DELETE FROM members WHERE company_id=? AND user_id=?').run(c.cid, uid); D.log(c.cid, ctx.session, 'remove', 'إزالة ' + em + ' من الشركة'); return { ok: true };
});
route('POST', '/api/c/:cid/leave', ctx => {
  const cid = parseInt(ctx.params.cid, 10); const s = needLogin(ctx); const m = roleOf(s.userId, cid); need(m, 404, 'مش عضو في الشركة دي.'); need(m.role !== 'owner', 400, 'المالك مينفعش يغادر. انقل الملكية الأول.');
  P('mem_del2', 'DELETE FROM members WHERE company_id=? AND user_id=?').run(cid, s.userId); D.log(cid, s, 'leave', 'غادر الشركة'); return { companies: myCompanies(s.userId) };
});
route('POST', '/api/c/:cid/transfer', async ctx => {
  const c = ctxCompany(ctx, ['owner']); const uid = Number(ctx.body.userId);
  const u = P('u_pwget2', 'SELECT pass FROM users WHERE id=?').get(ctx.session.userId); if (!await A.verifyPassword(String(ctx.body.password || ''), u.pass)) throw new HttpError(403, 'كلمة المرور غلط.');
  const m = P('mem_get4', 'SELECT role FROM members WHERE company_id=? AND user_id=?').get(c.cid, uid); need(m && m.role !== 'owner', 400, 'اختار عضو من الفريق.');
  tx(() => { P('mem_t1', "UPDATE members SET role='accountant' WHERE company_id=? AND user_id=?").run(c.cid, ctx.session.userId); P('mem_t2', "UPDATE members SET role='owner' WHERE company_id=? AND user_id=?").run(c.cid, uid); P('co_own', 'UPDATE companies SET owner_id=? WHERE id=?').run(uid, c.cid); D.log(c.cid, ctx.session, 'transfer', 'نقل ملكية الشركة'); });
  return { ok: true };
});
route('POST', '/api/c/:cid/delete', async ctx => {
  const c = ctxCompany(ctx, ['owner']); const co = D.getCompany(c.cid);
  const u = P('u_pwget3', 'SELECT pass FROM users WHERE id=?').get(ctx.session.userId); if (!await A.verifyPassword(String(ctx.body.password || ''), u.pass)) throw new HttpError(403, 'كلمة المرور غلط.');
  if (String(ctx.body.name || '').trim() !== co.name) throw bad('اكتب اسم الشركة بالظبط للتأكيد.');
  P('co_del', 'DELETE FROM companies WHERE id=?').run(c.cid); D.notify(c.cid); return { companies: myCompanies(ctx.session.userId) };
});

/* ---------- الإدارة ---------- */
route('GET', '/api/admin/overview', ctx => {
  needAdmin(ctx);
  const users = P('ad_users', 'SELECT u.id,u.email,u.name,u.verified,u.disabled,u.is_admin,u.created_at,u.last_login,(SELECT COUNT(*) FROM members m WHERE m.user_id=u.id) AS companies FROM users u ORDER BY u.id').all();
  const cos = P('ad_cos', "SELECT c.id,c.name,c.disabled,c.rev,c.created_at,c.updated_at,(SELECT u.email FROM users u WHERE u.id=c.owner_id) AS owner,(SELECT COUNT(*) FROM members m WHERE m.company_id=c.id) AS members,(SELECT COUNT(*) FROM records r WHERE r.company_id=c.id AND r.coll='tx' AND r.deleted=0) AS tx FROM companies c ORDER BY c.id").all();
  return { users, companies: cos, smtp: !!cfg.smtp };
});
route('POST', '/api/admin/user', async ctx => {
  const s = needAdmin(ctx); const id = Number(ctx.body.id), act = ctx.body.action;
  const u = P('u_by_id2', 'SELECT id,email,disabled FROM users WHERE id=?').get(id); need(u, 404, 'المستخدم مش موجود.');
  need(id !== s.userId || act === 'reset', 400, 'مينفعش تعمل ده على حسابك.');
  if (act === 'disable') { P('ad_u1', 'UPDATE users SET disabled=1 WHERE id=?').run(id); A.killSessions(id); }
  else if (act === 'enable') P('ad_u2', 'UPDATE users SET disabled=0 WHERE id=?').run(id);
  else if (act === 'verify') P('ad_u3', 'UPDATE users SET verified=1 WHERE id=?').run(id);
  else if (act === 'reset') { const tmp = A.rnd(9); P('ad_u4', 'UPDATE users SET pass=?, pw_changed_at=? WHERE id=?').run(await A.hashPassword(tmp), now(), id); A.killSessions(id, id === s.userId ? s.id : ''); return { ok: true, temp: tmp }; }
  else if (act === 'delete') { need(!P('ad_owner', "SELECT 1 FROM members WHERE user_id=? AND role='owner' LIMIT 1").get(id), 400, 'المستخدم مالك لشركة. احذف الشركة أو انقل ملكيتها الأول.'); P('ad_u5', 'DELETE FROM users WHERE id=?').run(id); }
  else throw bad('إجراء غير معروف.');
  return { ok: true };
});
route('POST', '/api/admin/company', ctx => {
  needAdmin(ctx); const id = Number(ctx.body.id), act = ctx.body.action; need(D.getCompany(id), 404, 'الشركة مش موجودة.');
  if (act === 'disable' || act === 'enable') { P('ad_c1', 'UPDATE companies SET disabled=? WHERE id=?').run(act === 'disable' ? 1 : 0, id); D.notify(id); }
  else if (act === 'delete') { P('ad_c2', 'DELETE FROM companies WHERE id=?').run(id); D.notify(id); }
  else throw bad('إجراء غير معروف.');
  return { ok: true };
});
route('POST', '/api/admin/backup', ctx => { needAdmin(ctx); return { file: require('path').basename(backup()) }; });

function match(method, pathname) {
  for (const r of R) if (r.method === method) { const m = r.re.exec(pathname); if (m) return { r, params: m.groups || {} }; }
  return null;
}
module.exports = { match, ROLE_AR };
