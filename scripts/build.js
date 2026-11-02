#!/usr/bin/env node
/*
 * SIYADA build script.
 *
 * Inlines client/src/style.css and every client/src/*.js module into
 * client/src/index.html and writes ONE self-contained file:
 *
 *     dist/SIYADA.html
 *
 * The same file is copied to server/public/index.html (when the server folder
 * exists), so the offline file and the server serve exactly the same app.
 *
 * Usage:  node scripts/build.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'client', 'src');
const DIST = path.join(ROOT, 'dist');

// Load order matters: each module registers itself on the shared APP object.
const MODULES = [
  'engine.js',    // posting rules: state -> balanced journal + derived tables + consistency checks (no DOM)
  'importer.js',  // CSV parser + conversion of the exported CSV file set into app state
  'util.js',      // shared helpers: DOM, formatting, dialogs, tables, Arabic number words
  'store.js',     // defaults for a new company, persistence (IndexedDB / localStorage), JSON backup
  'core.js',      // state, routing, shell and menu, company-name propagation, setup wizard
  'views_a.js',   // dashboard, checks, settings, account mapping, import, backup
  'views_b.js',   // master data and lists: parties, items, chart of accounts, treasury, journal, documents
  'views_c.js',   // data entry: invoices, vouchers, transfers, manual entries, document view/print
  'views_d.js',   // reports: ledger, trial balance, income statement, balance sheet, party statements
  'views_e.js',   // year-end closing, VAT report, e-invoice (ETA) draft, price lists, alerts
  'views_f.js',   // sales/purchase references, net quantity after returns, employees and payroll
  'net.js',       // server mode client: sessions, snapshot load, diff-based sync, long-poll, roles
  'net_ui.js',    // server mode screens: login, register, reset, invites, company picker, admin
];

const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

// Guard: a new .js file that is not listed above would silently be left out of the build.
const onDisk = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
const unlisted = onDisk.filter(f => !MODULES.includes(f));
const missing = MODULES.filter(f => !onDisk.includes(f));
if (unlisted.length || missing.length) {
  console.error('build: module list out of sync with client/src');
  if (unlisted.length) console.error('  not in MODULES  :', unlisted.join(', '));
  if (missing.length) console.error('  missing on disk :', missing.join(', '));
  process.exit(1);
}

const js = MODULES.map(f => '/* ===== ' + f + ' ===== */\n' + read(f)).join('\n');
if (js.indexOf('</script') >= 0) throw new Error('build: "</script" found inside the JavaScript bundle');

const html = read('index.html')
  .replace('/*CSS*/', () => read('style.css'))
  .replace('/*JS*/', () => js);

// Syntax check of the combined script (throws on error, never executes it).
new Function(js);

fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, 'SIYADA.html');
fs.writeFileSync(out, html);
console.log('built', path.relative(ROOT, out), '(' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB)');

const serverDir = path.join(ROOT, 'server');
if (fs.existsSync(serverDir)) {
  const pub = path.join(serverDir, 'public');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'index.html'), html);
  console.log('copied to', path.relative(ROOT, path.join(pub, 'index.html')));
}
