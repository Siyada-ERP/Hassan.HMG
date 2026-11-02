#!/usr/bin/env node
'use strict';
/* أدوات إدارة من سطر الأوامر (للمدير على السيرفر نفسه):
     node cli.js users                      عرض المستخدمين
     node cli.js reset-password <email>     كلمة مرور مؤقتة جديدة
     node cli.js make-admin <email>         ترقية مستخدم لمدير الخدمة
     node cli.js backup                     نسخة احتياطية الآن                */
const dbm = require('./lib/db'), A = require('./lib/auth'), { P } = dbm;
(async () => {
  const [cmd, a] = process.argv.slice(2);
  if (cmd === 'users') { P('c_users', 'SELECT id,email,verified,disabled,is_admin,last_login FROM users ORDER BY id').all().forEach(u => console.log(u.id + '\t' + u.email + (u.is_admin ? '\t[مدير]' : '') + (u.disabled ? '\t[موقوف]' : '') + '\t' + (u.last_login || '-'))); }
  else if (cmd === 'reset-password' && a) {
    const u = P('c_u', 'SELECT id FROM users WHERE email=?').get(a.trim().toLowerCase()); if (!u) { console.error('المستخدم مش موجود.'); process.exit(1); }
    const tmp = A.rnd(9); P('c_pw', 'UPDATE users SET pass=?, pw_changed_at=? WHERE id=?').run(await A.hashPassword(tmp), dbm.now(), u.id); A.killSessions(u.id); console.log('كلمة المرور المؤقتة: ' + tmp);
  } else if (cmd === 'make-admin' && a) { const r = P('c_adm', 'UPDATE users SET is_admin=1 WHERE email=?').run(a.trim().toLowerCase()); console.log(r.changes ? 'تم.' : 'المستخدم مش موجود.'); }
  else if (cmd === 'backup') console.log(dbm.backup());
  else console.log('الأوامر: users | reset-password <email> | make-admin <email> | backup');
  dbm.db.close();
})();
