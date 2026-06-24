# Deployment Guide

This guide is for the next AI agent or operator deploying `perp-sim` on a server.

## What Runs In Production

Production requires three long-running processes that share the same environment and SQLite database:

- Next.js app/API: serves frontend pages and API routes.
- Socket.IO server: powers realtime admin/user updates.
- Settlement worker: closes expired binary orders.

Use the combined runner unless your process manager starts the three services separately:

```powershell
npm run build
npm run start:production
```

On Linux:

```bash
npm run build
npm run start:production
```

## Required Runtime

- Node.js 24.x is known to work in this repo.
- Run `npm install` before build/start.
- SQLite is used through Node's built-in `node:sqlite`.
- The server must persist the SQLite file path configured by `PERP_SIM_DB_PATH`.

## Environment

Start from `.env.example`, but never commit real secrets.

Required production variables:

```env
PERP_SIM_DB_PATH=/absolute/path/to/perp-sim.sqlite
NEXT_PUBLIC_APP_URL=https://your-domain.example
NEXT_PUBLIC_SOCKET_URL=https://your-socket-domain.example
PERP_SIM_ALLOWED_ORIGINS=https://your-domain.example,https://www.your-domain.example
SOCKET_INTERNAL_URL=http://127.0.0.1:3001/internal/emit
SOCKET_INTERNAL_SECRET=replace-with-long-random-secret
REALTIME_INTERNAL_SECRET=replace-with-same-long-random-secret
PORT=3000
SOCKET_PORT=3001
SOCKET_HOST=127.0.0.1
```

Optional first-run variables:

```env
PERP_SIM_ADMIN_PASSWORD=temporary-first-admin-password
PERP_SIM_BACKFILL_WITHDRAWAL_PASSWORD=temporary-withdrawal-password
```

After the admin user exists, remove the first-run password variables from the production environment.

Optional SQLite stability tuning:

```env
SETTLEMENT_INTERVAL_MS=5000
PERP_SIM_SQLITE_BUSY_TIMEOUT_MS=1000
SETTLEMENT_SQLITE_BUSY_TIMEOUT_MS=1500
SOCKET_SQLITE_BUSY_TIMEOUT_MS=1000
PRICE_TICK_MIN_INTERVAL_SECONDS=15
MARKET_DATA_FETCH_TIMEOUT_MS=1500
```

These defaults are already conservative in code. Keep them near these values while SQLite is the production database; lowering the settlement interval or writing every market tick can reintroduce lock contention.

## Security Requirements

- `SOCKET_INTERNAL_SECRET` must be a long random value and must not be `perp-sim-local-realtime-secret`.
- `PERP_SIM_ADMIN_PASSWORD`, database files, `.env.local`, and real secrets must never be committed.
- Keep `SOCKET_HOST=127.0.0.1` unless the socket process is protected by a private network or reverse proxy.
- Production session cookies are marked `secure`, so use HTTPS for real deployments.

## Reverse Proxy

Recommended shape:

- Public app domain proxies to Next on `127.0.0.1:3000`.
- Socket route/domain proxies to Socket.IO on `127.0.0.1:3001`.
- WebSocket upgrade headers must be enabled for Socket.IO.
- Forwarded headers must be passed so CSRF checks see the public origin.

If using one domain, proxy `/socket.io/` to the socket server and everything else to Next, then set:

```env
NEXT_PUBLIC_SOCKET_URL=https://your-domain.example
SOCKET_INTERNAL_URL=http://127.0.0.1:3001/internal/emit
PERP_SIM_ALLOWED_ORIGINS=https://your-domain.example,https://www.your-domain.example
```

Required proxy headers for the Next app:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

## Pre-Deploy Checks

Run locally or on the server before switching traffic:

```bash
npm run lint
npm run build
```

Run a temporary DB smoke test if possible:

```bash
export PERP_SIM_DB_PATH="$PWD/test-artifacts/deploy-smoke.sqlite"
export TEST_DB_PATH="$PERP_SIM_DB_PATH"
export TEST_APP_URL="http://127.0.0.1:3000"
export TEST_SOCKET_URL="http://127.0.0.1:3001"
export SOCKET_INTERNAL_SECRET="deploy-smoke-secret-change-me"
export REALTIME_INTERNAL_SECRET="$SOCKET_INTERNAL_SECRET"
npm run test:regression
npm run test:e2e
```

Do not run regression tests against the production database.

## Manual Acceptance

After deployment:

- Open the frontend and login/register.
- Open admin login and verify dashboard loads.
- Submit a deposit, KYC, withdrawal, and binary order from the frontend.
- Confirm the admin panel updates in realtime or shows polling fallback.
- Confirm bell notification plays after browser audio is unlocked by a click.
- Confirm binary orders settle after expiry.
- Confirm assets show `USDC`, `BTC`, `ETH`, `SOL`, and no `USDT`.
- Confirm profile UID is six digits.

## Backup And Rollback

SQLite backup before deploy:

```bash
cp "$PERP_SIM_DB_PATH" "$PERP_SIM_DB_PATH.$(date +%Y%m%d-%H%M%S).bak"
```

Git rollback:

```bash
git log --oneline -5
git checkout <previous-good-commit>
npm install
npm run build
npm run start:production
```

Prefer stopping all three production processes before restoring a SQLite backup.
