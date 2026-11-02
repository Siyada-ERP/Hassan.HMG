# Architecture

SIYADA is one browser application that can run **offline from a single file** or **against a server**. The server stores data and enforces permissions; all accounting logic lives in the client.

```text
 ┌────────────── client/src (bundled into ONE html file) ──────────────┐
 │ engine.js  importer.js  util.js  store.js  core.js  views_a … views_f │
 │                       net.js  net_ui.js   (server mode only)          │
 └───────────────┬───────────────────────────────────┬───────────────────┘
        offline  │ IndexedDB (localStorage fallback) │  server mode
                 ▼                                   ▼
            browser storage              HTTPS ── server/ (Node + SQLite)
```

## Client

### Build

`scripts/build.js` inlines `client/src/style.css` and every module into `client/src/index.html` and writes `dist/SIYADA.html` (also copied to `server/public/index.html`). There is no bundler or transpiler: the modules are plain scripts that attach to a shared `APP` object, so **the order in `MODULES` matters** and the build fails if a file in `client/src` is not listed there.

### Modules

| Module | Responsibility |
|---|---|
| `engine.js` | Pure accounting engine, no DOM. `E.build(state)` re-posts every transaction and returns the journal, party / item / document tables, per-transaction info and consistency checks. Amounts are rounded with `r2` (half-up to 2 decimals). |
| `importer.js` | CSV parser and conversion of the exported CSV file set into application state. |
| `util.js` | DOM helpers, number / date formatting, dialogs, `APP.table`, CSV export, Arabic number words. |
| `store.js` | Defaults for a new company, persistence, JSON backup / restore, `normalizeState`. |
| `core.js` | Router, shell, top menu (`MENU` tree), setup wizard, company-name propagation. |
| `views_a.js` | Dashboard, checks, settings, account mapping, import, backup. |
| `views_b.js` | Master data and lists: parties, items, chart of accounts, treasury, journal, documents, transactions. |
| `views_c.js` | Data entry: invoices, vouchers, transfers, manual entries, document view and print. |
| `views_d.js` | Reports: ledger, trial balance, income statement, balance sheet, statements. |
| `views_e.js` | Year-end closing, VAT report, e-invoice draft, price lists, alerts. |
| `views_f.js` | Sales / purchase registers, net quantity after returns, employees, advances, payroll. |
| `net.js`, `net_ui.js` | Server mode: sessions, snapshot load, diff-based sync, long-poll, role-based UI, login and admin screens. |

### State and derived data

The persisted state `S` is small and plain:

```text
S = { settings, coa, mapping, parties, items, priceLists, employees,
      transactions, manual, meta }
```

Everything else is **derived**: `APP.R = E.build(APP.S)` recomputes the journal and all balances after each change. Nothing derived is stored, so a number can never disagree with the entries behind it.

- `transactions` — trading documents and vouchers (sale, purchase, returns, receipts, payments, expense, income, transfer), one row per line.
- `manual` — manual journal entries. Employee advances, repayments and payroll are manual entries tagged with `emp` / `kind`; payroll entries are posted per employee as `SAL-YYYYMM-<code>`.
- `mapping` — links business categories (sales, expense categories, payment methods …) to chart-of-accounts codes.

### UI conventions

- **Routing:** hash routes `#/route/arg`. A route is `APP.routes[name] = { title, html, after, results }`; the top menu is generated from the `MENU` tree in `core.js` (`APP.buildNav`).
- **Events:** delegated. Elements carry `data-act` (handler in `APP.acts`), `data-on` (`APP.ons`), `data-f` (filter fields that re-render `#results` through `APP.debouncedResults`).
- **Company name:** stored once in settings and rendered by the shell, every report header and every print layout.
- **Read-only role:** `body.ro` hides every write control; the server enforces the same rule independently.

## Server

Zero npm dependencies: `node:http`, `node:crypto`, `node:zlib` and the built-in `node:sqlite` (Node ≥ 22.13).

| File | Responsibility |
|---|---|
| `server.js` | HTTP server, static file, security headers (CSP), routing to the API, daily backup timer. |
| `lib/config.js` | All settings from environment variables or `server/.env`. |
| `lib/db.js` | SQLite schema and backups. |
| `lib/auth.js` | scrypt password hashing, sessions, one-time tokens, rate limiting. |
| `lib/data.js` | Company data store: revisioned records, conflict detection, document-number allocation, long-poll. |
| `lib/api.js` | `/api/...` endpoints: accounts, companies, team, data. |
| `lib/mail.js` | SMTP client written on `node:net` / `node:tls`; falls back to writing `data/outbox/`. |
| `cli.js` | Admin commands: `users`, `reset-password`, `make-admin`, `backup`. |

### Tables

`users`, `companies`, `members` (role: `owner` / `accountant` / `viewer`), `invites`, `sessions`, `tokens`, `activity`, and **`records`** — the company data.

### Sync model

Company data is stored as **records** `(company_id, coll, key) → data, rev, deleted`, where `coll` is one of `settings, mapping, coa, parties, items, prices, tx, man, closings, emps`. Every company has a monotonically increasing `rev`.

1. On login the client loads a **snapshot** (`/api/c/:cid/snapshot`).
2. Edits are sent as **diffs** (`/api/c/:cid/mutate`), each carrying the revision of the record it was based on. The server rejects stale edits with a conflict, so two people editing the same record never overwrite each other silently.
3. Clients receive other people's changes with **long-poll** on `/api/c/:cid/changes?since=<rev>&wait=1` (the server holds the request until something changes or `LONGPOLL_MS` elapses).
4. Document and journal numbers are allocated by the server (`/api/c/:cid/alloc`); a duplicate number is renumbered and the user is told.

### Security model

Permissions are enforced on the server for every request (membership + role), not only hidden in the UI. Passwords use scrypt; sessions are `HttpOnly` + `SameSite` cookies stored hashed; mutating requests need a custom header and an origin check (CSRF); CSP allows only the application script; login / reset / registration are rate limited and do not reveal whether an email exists; activation, reset and invitation tokens are single-use, expiring and stored hashed. The server speaks plain HTTP and **must** run behind HTTPS (the supplied Caddy setup does this).

## Design decisions

- **No formulas, no hidden state.** All figures come from the engine; the CSV importer proves the engine reproduces the original Excel ERP to the cent (`tests/engine`).
- **One file to deploy.** The same bundle serves offline use and the server, so there is a single behaviour to test.
- **No runtime dependencies** on either side, which keeps installs trivial and the supply-chain surface small.
