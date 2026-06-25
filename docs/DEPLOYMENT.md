# VORX Beta Deployment

This checklist is for preparing a Beta deployment from the current repository.

## Required Processes

VORX Beta needs three long-running processes sharing the same environment and SQLite database:

- Next.js app and API
- Socket.IO realtime server
- Binary options settlement worker

The bundled production runner starts all three:

```bash
npm install
npm run build
npm run start:production
```

For Windows PowerShell:

```powershell
npm install
npm.cmd run build
npm.cmd run start:production
```

## Required Environment

Start from `.env.example` and create a server-local `.env.production.local` or process-manager environment.

Minimum production variables:

```env
NODE_ENV=production
PERP_SIM_DB_PATH=/absolute/path/to/vorx-beta.sqlite
NEXT_PUBLIC_APP_URL=https://your-beta-domain.example
NEXT_PUBLIC_SOCKET_URL=https://your-beta-domain.example
PERP_SIM_ALLOWED_ORIGINS=https://your-beta-domain.example
SOCKET_HOST=127.0.0.1
SOCKET_PORT=3001
SOCKET_INTERNAL_URL=http://127.0.0.1:3001/internal/emit
SOCKET_INTERNAL_SECRET=replace-with-a-long-random-secret
REALTIME_INTERNAL_SECRET=replace-with-the-same-long-random-secret
PORT=3000
NEXT_HOSTNAME=0.0.0.0
```

Production startup refuses to run if `PERP_SIM_DB_PATH`, `NEXT_PUBLIC_APP_URL`, or a non-default realtime secret is missing.

## First-Run Admin Setup

Optional first-run variables:

```env
PERP_SIM_ADMIN_PASSWORD=temporary-admin-password
PERP_SIM_BACKFILL_WITHDRAWAL_PASSWORD=temporary-withdrawal-password
```

Remove these after the first admin account and withdrawal-password backfill are complete.

## Reverse Proxy

Use HTTPS in front of the app.

Recommended single-domain routing:

- `/socket.io/` -> `127.0.0.1:3001`
- everything else -> `127.0.0.1:3000`

Required headers for the Next app:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

Socket.IO must have WebSocket upgrade enabled.

## Pre-Deploy Checks

Run before switching traffic:

```bash
npm run lint
npm run build
git status --short
```

Expected:

- lint passes
- build passes
- `git status --short` is empty

## Database Checks

Before launch, confirm the production database is backed up and has no duplicate deposit transaction hashes:

```sql
SELECT tx_hash, COUNT(*) AS count, GROUP_CONCAT(id) AS ids
FROM deposits
WHERE tx_hash IS NOT NULL
GROUP BY tx_hash
HAVING COUNT(*) > 1;
```

Expected result: no rows.

## Beta Smoke Test

After deployment:

- User login/register works.
- Admin login works.
- WebSocket health endpoint responds at `/health` on the socket service.
- Admin notification center receives deposit, withdrawal, binary order, and swap events.
- Binary order settles after expiry.
- Swap USDC -> BTC and BTC -> USDC keeps Portfolio Value reasonable.
- Perpetual open/close writes `orders` and `asset_transactions`.
- Deposit duplicate `tx_hash` is rejected.
- Withdrawal password repeated failures return 429.
- Admin cannot adjust own funds, change own role, or force-close own positions.
- `/api/assets` returns `valuationStatus` and per-asset USD values.

## Runtime Notes

- Keep `SOCKET_HOST=127.0.0.1` unless the socket server is protected by a private network or reverse proxy.
- Keep `SOCKET_INTERNAL_SECRET` and `REALTIME_INTERNAL_SECRET` identical unless intentionally separating internal emit secrets.
- Do not run regression tests against the production database.
- Back up the SQLite file before every deploy.

## Rollback

Stop all three processes before restoring a database backup.

Code rollback:

```bash
git log --oneline -5
git checkout <previous-good-commit>
npm install
npm run build
npm run start:production
```

Database backup example:

```bash
cp "$PERP_SIM_DB_PATH" "$PERP_SIM_DB_PATH.$(date +%Y%m%d-%H%M%S).bak"
```
