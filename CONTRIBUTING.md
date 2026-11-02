# Contributing

## Setup

```bash
node --version            # 22.13 or newer (see .nvmrc)
npm run build             # dist/SIYADA.html + server/public/index.html
npm test                  # build + engine tie-out + server tests
```

Browser tests need Python + Playwright once: see [docs/TESTING.md](docs/TESTING.md).

## Where things live

| You want to change | Edit | Then |
|---|---|---|
| Accounting rules | `client/src/engine.js` | `npm run test:engine` must stay at **0 differences** |
| A screen or menu | `client/src/views_*.js`, `core.js`, `style.css` | `npm run build && npm run test:e2e` |
| Server behaviour | `server/lib/*.js` | `npm run test:server` |
| Adding a JS module | add the file to `MODULES` in `scripts/build.js` (order matters) | the build fails if you forget |

`dist/` and `server/public/` are generated — never edit or commit them.

## Rules of the house

1. **No formulas, no hidden state.** Numbers are derived by the engine from the stored transactions; do not store derived values.
2. **No runtime dependencies** in the client or the server unless there is a very strong reason.
3. **Arabic UI.** All user-facing text is Arabic, right-to-left. Keep the existing wording style.
4. **Never commit real data** — workbooks, databases, customer exports, `.env`. Use `scripts/anonymize_fixtures.py` for test data.
5. **Permissions are enforced on the server**, not only hidden in the UI. A new write action needs both: the `WRITE` set in `client/src/net.js` and the role check in `server/lib/api.js`.
6. Every behaviour change comes with a test (see "Adding a test" in docs/TESTING.md).

## Pull requests

- Branch from `main`, keep changes focused, fill in the PR template.
- CI must be green: build, engine, server, browser suites, Docker build.
- Update `CHANGELOG.md` under **Unreleased**.

## Releasing

1. Move the *Unreleased* notes to a new `## [x.y.z] - YYYY-MM-DD` section in `CHANGELOG.md`.
2. Set the same version in `package.json` (and `server/package.json`).
3. Commit, then `git tag vX.Y.Z && git push --tags`.
4. The **Release** workflow tests, builds `SIYADA.html` and `SIYADA_Server.zip`, and publishes them on the Releases page.
