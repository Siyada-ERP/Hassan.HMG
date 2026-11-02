/*
 * Engine tie-out test.
 *
 * Imports a CSV export (tests/fixtures/<set>), lets the engine re-post every
 * transaction from scratch, and compares the result with the totals that the
 * Excel ERP exported: per account, per journal entry, per party, per item,
 * per transaction and per document. Any difference fails the run (exit 1).
 *
 *   node tests/engine/engine.test.js [fixture-dir]     (default: tests/fixtures/clean)
 */
const fs = require('fs'), path = require('path');
const E = require('../../client/src/engine.js');
global.SiyadaEngine = E;
const I = require('../../client/src/importer.js');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'fixtures', 'clean'));
const files = {};
fs.readdirSync(dir).forEach(f => { if (f.endsWith('.csv')) files[f] = fs.readFileSync(path.join(dir, f), 'utf8'); });
let t0 = Date.now();
const S = I.fromCSV(files);
console.log('import ms', Date.now() - t0, 'tx', S.transactions.length, 'manual', S.manual.length, 'parties', S.parties.length, 'items', S.items.length, 'coa', S.coa.length);
t0 = Date.now();
const R = E.build(S);
console.log('build ms', Date.now() - t0, R.counts);
const jl = I.parseTable(files['journal_lines.csv']);
console.log('csv journal lines', jl.length, 'app lines', R.journal.length);
// per-account tie-out
const A = new Map(), B = new Map();
jl.forEach(r => { const a = A.get(r.account_code) || [0, 0]; a[0] += +r.debit; a[1] += +r.credit; A.set(r.account_code, a); });
R.journal.forEach(l => { const a = B.get(l.acc) || [0, 0]; a[0] += l.dr; a[1] += l.cr; B.set(l.acc, a); });
let bad = 0;
new Set([...A.keys(), ...B.keys()]).forEach(k => {
  const a = A.get(k) || [0, 0], b = B.get(k) || [0, 0];
  if (Math.abs(a[0] - b[0]) > 0.005 || Math.abs(a[1] - b[1]) > 0.005) { bad++; console.log('ACC DIFF', k, a.map(x => x.toFixed(2)), b.map(x => x.toFixed(2))); }
});
console.log('account diffs', bad);
// per entry tie-out
const EA = new Map(), EB = new Map();
jl.forEach(r => { const a = EA.get(r.entry_no) || [0, 0, 0, r.entry_date]; a[0] += +r.debit; a[1] += +r.credit; a[2]++; EA.set(r.entry_no, a); });
R.journal.forEach(l => { const k = String(l.en); const a = EB.get(k) || [0, 0, 0, l.date]; a[0] += l.dr; a[1] += l.cr; a[2]++; EB.set(k, a); });
let eb = 0;
new Set([...EA.keys(), ...EB.keys()]).forEach(k => {
  const a = EA.get(k), b = EB.get(k);
  if (!a || !b || Math.abs(a[0] - b[0]) > 0.005 || Math.abs(a[1] - b[1]) > 0.005 || a[2] !== b[2] || a[3] !== b[3]) { eb++; if (eb < 8) console.log('ENTRY DIFF', k, a, b); }
});
console.log('entry diffs', eb, 'entries csv', EA.size, 'app', EB.size);
// party tie-out
const pr = I.parseTable(files['parties.csv']); let pb = 0;
const pm = new Map(R.parties.map(p => [p.code, p]));
pr.forEach(r => { const p = pm.get(r.party_code); if (!p) { pb++; console.log('missing party', r.party_code); return; }
  if (Math.abs(p.balance - +r.balance) > 0.005 || Math.abs(p.debit - +r.total_debit) > 0.005 || Math.abs(p.credit - +r.total_credit) > 0.005 || p.count !== +r.move_count) { pb++; if (pb < 6) console.log('PARTY DIFF', r.party_code, p.balance, r.balance, p.debit, r.total_debit, p.credit, r.total_credit, p.count, r.move_count); } });
console.log('party diffs', pb, 'app parties', R.parties.length, 'csv', pr.length);
// items tie-out
const ir = I.parseTable(files['items.csv']); let ib = 0;
const im = new Map(R.items.map(p => [p.code, p]));
ir.forEach(r => { const p = im.get(r.item_code); if (!p) { ib++; return; }
  const d = [['onHand', 'qty_on_hand'], ['value', 'stock_value'], ['avgCost', 'avg_cost'], ['bought', 'qty_purchased'], ['sold', 'qty_sold'], ['cogs', 'cogs_total'], ['sales', 'sales_total'], ['lastBuy', 'last_purchase_price'], ['lastSell', 'last_sale_price']];
  const bad2 = d.filter(([a, b]) => Math.abs(p[a] - +r[b]) > 0.011);
  if (bad2.length) { ib++; if (ib < 6) console.log('ITEM DIFF', r.item_code, bad2.map(([a, b]) => a + ' app=' + p[a] + ' csv=' + r[b]).join('; ')); } });
console.log('item diffs', ib);
// tx info tie-out (journal number, net, cost, flag)
const tr = I.parseTable(files['transactions.csv']); let tb = 0, fb = 0;
tr.forEach(r => { const i = R.txInfo.get(parseInt(r.id, 10)); if (!i) { tb++; return; }
  if (Math.abs(i.net - +r.net_amount) > 0.005 || Math.abs(i.vat - +r.vat_amount) > 0.005 || Math.abs(i.cost - +r.cost_amount) > 0.005 || i.jno !== +r.journal_no) { tb++; if (tb < 6) console.log('TX DIFF', r.id, i, r.net_amount, r.vat_amount, r.cost_amount, r.journal_no); }
  if ((i.flag || '') !== (r.flag || '')) { fb++; if (fb < 6) console.log('FLAG DIFF', r.id, JSON.stringify(i.flag), JSON.stringify(r.flag)); } });
console.log('tx diffs', tb, 'flag diffs', fb);
// docs tie-out
const dr = I.parseTable(files['documents.csv']); let db = 0; const dm = new Map(R.docs.map(d => [d.doc, d]));
dr.forEach(r => { const d = dm.get(r.doc_no); if (!d) { db++; if (db < 5) console.log('missing doc', r.doc_no); return; }
  if (d.type !== r.doc_type || Math.abs(d.gross - +r.gross_total) > 0.005 || Math.abs(d.net - +r.net_total) > 0.005 || Math.abs(d.paid - +r.paid) > 0.005 || d.lines !== +r.line_count) { db++; if (db < 6) console.log('DOC DIFF', r.doc_no, d, r); } });
console.log('doc diffs', db, 'app docs', R.docs.length, 'csv', dr.length);
console.log(R.checks.map(c => c.stat + ' ' + c.name + ' = ' + c.diff).join('\n'));
// --- verdict (non-zero exit code when anything does not tie out)
const total = bad + eb + pb + ib + tb + fb + db;
const hard = R.checks.filter(c => c.stat === 'bad');
if (total || hard.length) {
  console.error('\nFAILED: ' + total + ' tie-out difference(s), ' + hard.length + ' failed check(s)');
  process.exitCode = 1;
} else {
  console.log('\nPASSED: engine tie-out is exact for ' + path.basename(dir));
}
