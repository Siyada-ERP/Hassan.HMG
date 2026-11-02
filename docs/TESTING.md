# Testing

Three layers, from fastest to most realistic. All of them run in CI (`.github/workflows/ci.yml`).

| Layer | Command | What it proves | Time |
|---|---|---|---|
| Engine tie-out | `npm run test:engine` | The posting engine re-creates, from raw transactions, exactly the journal, party balances, item stock / cost and document totals exported by the Excel ERP — per account, per entry, per party, per item, per document. Any difference exits with code 1. | seconds |
| Server | `npm run test:server` | 102 assertions on auth, roles, isolation between companies, sync, conflicts, backups, mail (against a fake SMTP) + 6 on e-mail verification. Uses a temporary data directory. | seconds |
| Browser (E2E) | `npm run test:e2e` | Real Chromium: setup wizard, import, every route renders, invoices and vouchers, reports, printing, mobile menu, weight / pieces, employees and payroll, and **three simultaneous users** syncing through a real server process. | a few minutes |

`npm test` runs the first two after building. Run `npm run test:all` before a release.

## Browser tests: setup

```bash
pip install -r tests/e2e/requirements.txt
python3 -m playwright install --with-deps chromium     # Linux; on Windows/macOS drop --with-deps
npm run build                                          # the suites open dist/SIYADA.html and server/public
python3 tests/e2e/run_all.py          # everything
python3 tests/e2e/run_all.py t7 t9    # only suites whose file name starts with t7 / t9
python3 tests/e2e/run_all.py -v       # print every suite's full output
python3 tests/e2e/run_all.py --retry=1   # run a failing suite once more (what CI does)
```

The suites print `PASS` / `FAIL` lines rather than using exit codes; `run_all.py` reads the output (and exit code, tracebacks, page errors) and returns a proper exit code. Screenshots and PDFs go to `tests/e2e/shots/` (git-ignored) — open them when a suite fails.

The last lines of the runner's output repeat every failing check (`FAILED SUITES AND CHECKS`), so a CI log can be read from the bottom. With `--retry=1` a suite that fails and then passes is reported as **FLAKY** (and as a warning annotation on GitHub); one that still fails fails the run.

**Writing waits that do not race.** Every form (`#frm`) carries `data-edit=""` when it is a *create* form and the document number when it is an *edit* form. Wait for `#frm[data-edit]:not([data-edit=""])` (the edit form) or `#frm[data-edit=""]` (the create form) — a bare `#frm[data-edit]` also matches the form that is still on screen, and on a slow machine the test then types into the old form.

| Suite | Covers |
|---|---|
| `t1_smoke` | Setup wizard, import of the CSV set, every route renders without errors |
| `t2_flows` | Purchase, sale with discount, receipt, expenses, edit and delete with exact balances, balance-sheet equation, persistence across reload, company-name change |
| `t3_print` | A4 print layouts (PDF), mobile screens, journal filter |
| `t4_new` | Price lists, VAT in / out, average cost, e-invoice (ETA) draft fields, year-end closing and re-opening |
| `t5_server` | Server mode with three browsers: roles, invitations, live sync, offline and re-sync, conflict dialog, unique document and journal numbers, viewer restrictions enforced by the server, employees |
| `t6_server2` | Server mode: importing into a server company gives the same totals as offline, session expiry, forgot / reset password, mobile team screen |
| `t7_new` | Pieces column, sales / purchase registers, net quantity after returns, employees and payroll, CSV export |
| `t8_nav` | Top menu behaviour, fly-out flipping, mobile drawer, every menu route exists |
| `t9_weight` | Item weight column and automatic pieces = quantity ÷ weight |

## Fixtures

`tests/fixtures/clean` and `tests/fixtures/manual` are two CSV exports of the same sample company (`manual` is the later one: more transactions plus manual journal entries). They are **anonymised**: customer and supplier names are `عميل <code>` / `مورد <code>`, the company is `شركة تجريبية`, phones and addresses are removed — but every amount, quantity, date and code is kept exactly as exported, which is what makes the tie-out meaningful.

To refresh them from a new export:

```bash
python3 scripts/anonymize_fixtures.py  path/to/export  tests/fixtures/clean
```

The script refuses to finish if any original party name survives in its output. Never commit the raw export.

## Adding a test

- Engine behaviour → extend `tests/engine/engine.test.js` or add a fixture.
- Server behaviour → `server/test/server.test.js` (uses the exported `server.js` and a temp `DATA_DIR`).
- Screens → copy a short suite such as `t9_weight.py`; keep the `PASS` / `FAIL` print convention so `run_all.py` can judge it.
