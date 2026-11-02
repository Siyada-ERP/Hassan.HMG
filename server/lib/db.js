'use strict';
/* قاعدة البيانات: SQLite عن طريق node:sqlite (مدمجة في Node 22.13+) */
const fs = require('fs'), path = require('path');
const cfg = require('./config');

// نخفي تحذير "experimental" الخاص بـ sqlite فقط
const _ew = process.emitWarning;
process.emitWarning = function (w, ...a) { if (/SQLite/i.test(String(w && w.message || w))) return; return _ew.call(process, w, ...a); };
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) {
  console.error('\nالسيرفر محتاج Node.js نسخة 22.13 أو أحدث (نسختك: ' + process.version + ').\nنزّل النسخة الأحدث من https://nodejs.org وجرّب تاني.\n');
  process.exit(1);
}

fs.mkdirSync(cfg.dataDir, { recursive: true });
const file = process.env.DB_FILE || path.join(cfg.dataDir, 'siyada.db');
const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0, is_admin INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, last_login TEXT, pw_changed_at TEXT
);
CREATE TABLE IF NOT EXISTS companies(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, owner_id INTEGER, rev INTEGER NOT NULL DEFAULT 0, epoch INTEGER NOT NULL DEFAULT 0,
  counters TEXT NOT NULL DEFAULT '{}', disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS members(
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner','accountant','viewer')), created_at TEXT NOT NULL, PRIMARY KEY(company_id, user_id)
);
CREATE INDEX IF NOT EXISTS members_user ON members(user_id);
CREATE TABLE IF NOT EXISTS invites(
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE, email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('accountant','viewer')), token TEXT NOT NULL UNIQUE, invited_by INTEGER,
  created_at TEXT NOT NULL, expires_at INTEGER NOT NULL, accepted_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions(
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, ip TEXT, ua TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS tokens(
  hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER
);
CREATE TABLE IF NOT EXISTS records(
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE, coll TEXT NOT NULL, key TEXT NOT NULL,
  data TEXT, rev INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, aux TEXT,
  PRIMARY KEY(company_id, coll, key)
);
CREATE INDEX IF NOT EXISTS records_rev ON records(company_id, rev);
CREATE INDEX IF NOT EXISTS records_aux ON records(company_id, aux) WHERE aux IS NOT NULL;
CREATE TABLE IF NOT EXISTS activity(
  id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE, user_id INTEGER, email TEXT,
  ts TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS activity_co ON activity(company_id, id);
`;
db.exec(SCHEMA);

const st = {};
const P = (name, sql) => st[name] || (st[name] = db.prepare(sql));

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (e2) { } throw e; }
}
const now = () => new Date().toISOString();

/* نسخة احتياطية يومية (VACUUM INTO) + تنظيف النسخ القديمة */
function backup() {
  const dir = path.join(cfg.dataDir, 'backups'); fs.mkdirSync(dir, { recursive: true });
  const d = new Date(); const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  const f = path.join(dir, 'siyada-' + stamp + '.db');
  if (fs.existsSync(f)) return f;
  db.exec("VACUUM INTO '" + f.replace(/'/g, "''") + "'");
  const all = fs.readdirSync(dir).filter(x => /^siyada-\d{8}-\d{4}\.db$/.test(x)).sort();
  while (all.length > cfg.backupKeep) { try { fs.unlinkSync(path.join(dir, all.shift())); } catch (e) { break; } }
  return f;
}

module.exports = { db, st, P, tx, now, backup, file };
