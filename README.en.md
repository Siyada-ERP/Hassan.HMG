# SIYADA — accounting for trading companies

Double-entry accounting for trading businesses: sales, purchases, stock, treasury, customers, suppliers, employees and the full set of financial reports. The UI is Arabic (right-to-left).

One code base, two ways to run it:

| Mode | What it is |
|---|---|
| **Single file (offline)** | `SIYADA.html` opens in any browser — no install, no internet. Data lives in the browser (IndexedDB) with JSON backup / restore. |
| **Server (multi-user)** | A Node.js server with **zero npm dependencies** and SQLite: many companies, users with roles (owner / accountant / viewer), near-real-time sync, daily backups. |

> Arabic README: [README.md](README.md)

## Highlights

- One posting engine (`client/src/engine.js`) turns transactions into balanced journal entries and audits itself with consistency checks. **No spreadsheet formulas anywhere.**
- Sales / purchase invoices, returns, receipt and payment vouchers, pieces-per-unit-weight handling.
- Sales / purchase registers (one row per invoice, expandable lines), net quantity after returns per customer / supplier / item.
- Moving-average stock costing, reorder levels, price lists.
- General ledger, trial balance, income statement, balance sheet, party statements, treasury, year-end closing.
- VAT report and an unsigned e-invoice (ETA) JSON draft.
- Employees: advances and repayments, monthly payroll with advance deduction, payslips, statements.
- Imports the CSV export of the original Excel ERP and ties out to the cent (verified by automated tests).

## Quick start

Requires **Node.js ≥ 22.13**.

```bash
npm run build     # dist/SIYADA.html  (also copied to server/public/)
npm start         # server on http://localhost:3000 — the first account becomes the service admin
```

or simply open `dist/SIYADA.html` in a browser for the offline mode. `server/start-windows.bat` (Windows) and `server/start.sh` (Linux / macOS) also work from a fresh checkout: they build the app page on first run.

## Tests

```bash
npm test          # build + engine tie-out + server tests (102 + 6)
npm run test:e2e  # real-browser suites (Python + Playwright) — see docs/TESTING.md
```

## Repository layout

```text
client/src/   app source (JS modules, CSS, HTML shell) — bundled into one file by scripts/build.js
server/       Node.js server (lib/, tests, Dockerfile, Caddy, systemd)
scripts/      build.js · pack.py (release bundle) · anonymize_fixtures.py
tests/        engine/ (number tie-out) · e2e/ (Playwright) · fixtures/ (anonymised sample data)
docs/         ARCHITECTURE.md · TESTING.md · DEPLOYMENT.ar.md (Arabic)
.github/      CI, release workflow, issue / PR templates
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together, [CONTRIBUTING.md](CONTRIBUTING.md) to contribute, and [SECURITY.md](SECURITY.md) to report a vulnerability.

## Privacy rule for this repository

Never commit real company data (Excel workbooks, SQLite databases, customer exports). `.gitignore` blocks the usual suspects, and `scripts/anonymize_fixtures.py` produces safe test data from a real export.

## License

All rights reserved — see [LICENSE](LICENSE).
