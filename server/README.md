# SIYADA server

Node.js ≥ 22.13, **no npm dependencies**, SQLite through the built-in `node:sqlite`.

```bash
# from the repository root
npm run build              # puts the app into server/public/index.html
cd server
cp .env.example .env       # then edit
node server.js             # http://localhost:3000
```

| Command | What |
|---|---|
| `npm test` (in `server/`) | 102 + 6 assertions, temp data dir |
| `node cli.js users` · `reset-password <email>` · `make-admin <email>` · `backup` | admin tools on the server host |
| `docker compose up -d --build` | server + Caddy with automatic HTTPS (needs `DOMAIN` in `.env`) |

How it works: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). Full deployment guide (Arabic): [../docs/DEPLOYMENT.ar.md](../docs/DEPLOYMENT.ar.md).
