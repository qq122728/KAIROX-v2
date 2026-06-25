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

`PERP_SIM_DB_PATH` must point to a persistent server path, not a release/build directory that may be replaced during deployment. For example:

```env
PERP_SIM_DB_PATH=/var/lib/vorx/vorx-beta.sqlite
```

## First-Run Admin Setup

Optional first-run variables:

```env
PERP_SIM_ADMIN_PASSWORD=temporary-admin-password
PERP_SIM_BACKFILL_WITHDRAWAL_PASSWORD=temporary-withdrawal-password
```

Remove these after the first admin account and withdrawal-password backfill are complete.

## Server Agent Runbook

Use this section when a deployment agent prepares a fresh Beta server. Replace every placeholder before starting production.

Recommended server paths:

```bash
APP_DIR=/var/www/vorx
DATA_DIR=/var/lib/vorx
BACKUP_DIR=/var/backups/vorx
DB_PATH=/var/lib/vorx/vorx-beta.sqlite
```

Initial checkout:

```bash
mkdir -p /var/www/vorx /var/lib/vorx /var/backups/vorx
cd /var/www/vorx
git clone https://github.com/qq122728/VORXv1.git .
npm install
```

Create `/var/www/vorx/.env.production.local`:

```env
NODE_ENV=production

PORT=3000
NEXT_HOSTNAME=0.0.0.0

PERP_SIM_DB_PATH=/var/lib/vorx/vorx-beta.sqlite

NEXT_PUBLIC_APP_URL=https://your-beta-domain.example
NEXT_PUBLIC_SOCKET_URL=https://your-beta-domain.example
PERP_SIM_ALLOWED_ORIGINS=https://your-beta-domain.example

SOCKET_HOST=127.0.0.1
SOCKET_PORT=3001
SOCKET_INTERNAL_URL=http://127.0.0.1:3001/internal/emit
SOCKET_INTERNAL_SECRET=replace-with-a-long-random-secret
REALTIME_INTERNAL_SECRET=replace-with-the-same-long-random-secret

PERP_SIM_SQLITE_BUSY_TIMEOUT_MS=5000
SQLITE_BUSY_TIMEOUT_MS=5000
SOCKET_SQLITE_BUSY_TIMEOUT_MS=5000
SETTLEMENT_SQLITE_BUSY_TIMEOUT_MS=5000

SETTLEMENT_INTERVAL_MS=1000

OKX_API_BASE_URL=https://www.okx.com
BINANCE_API_BASE_URL=https://api.binance.com
MARKET_DATA_FETCH_TIMEOUT_MS=5000
PRICE_TICK_MIN_INTERVAL_SECONDS=2

PERP_SIM_LOGIN_MAX_FAILURES=5
PERP_SIM_ADMIN_LOGIN_MAX_FAILURES=5
PERP_SIM_LOGIN_LOCK_MS=900000
PERP_SIM_ADMIN_LOGIN_LOCK_MS=900000

PERP_SIM_REGISTER_LIMIT=5
PERP_SIM_REGISTER_WINDOW_MS=60000

PERP_SIM_SWAP_LIMIT=20
PERP_SIM_SWAP_WINDOW_MS=60000
PERP_SIM_SWAP_QUOTE_LIMIT=60
PERP_SIM_SWAP_QUOTE_WINDOW_MS=60000

PERP_SIM_BINARY_ORDER_LIMIT=30
PERP_SIM_BINARY_ORDER_WINDOW_MS=60000

PERP_SIM_WITHDRAW_PASSWORD_LIMIT=5
PERP_SIM_WITHDRAW_PASSWORD_WINDOW_MS=900000

PERP_SIM_DEPOSIT_LIMIT=10
PERP_SIM_DEPOSIT_WINDOW_MS=60000

PERP_SIM_ADMIN_PASSWORD=replace-with-temporary-admin-password
PERP_SIM_BACKFILL_WITHDRAWAL_PASSWORD=replace-with-temporary-withdrawal-password

PERP_SIM_DEMO_MODE=false

NEXT_PUBLIC_ADMIN_BIG_BINARY_STAKE=500
NEXT_PUBLIC_ADMIN_BIG_TRADE_NOTIONAL=5000
```

Remove `PERP_SIM_ADMIN_PASSWORD` and `PERP_SIM_BACKFILL_WITHDRAWAL_PASSWORD` after first-run setup is complete.

Build checks:

```bash
cd /var/www/vorx
npm run lint
npm run build
```

Recommended PM2 start:

```bash
npm install -g pm2
cd /var/www/vorx
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

PM2 logs:

```bash
pm2 logs vorx-next
pm2 logs vorx-socket
pm2 logs vorx-settlement
```

Nginx single-domain template:

```nginx
server {
    listen 80;
    server_name your-beta-domain.example;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Database backup:

```bash
mkdir -p /var/backups/vorx
if [ -f /var/lib/vorx/vorx-beta.sqlite ]; then
  cp /var/lib/vorx/vorx-beta.sqlite "/var/backups/vorx/vorx-beta-$(date +%Y%m%d-%H%M%S).sqlite"
fi
```

Post-start health checks:

```bash
curl http://127.0.0.1:3000
curl http://127.0.0.1:3001/health
pm2 status
```

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

## Beta Image Storage

For the current Beta release, deposit proof images and KYC images are still stored inside SQLite:

- `deposits.proof_data`
- `kyc_submissions.front_data`
- `kyc_submissions.back_data`

Admin review lists do not return these base64 image fields. They only return lightweight `has_proof`, `has_front`, and `has_back` flags. The admin console loads one image on demand only when an admin clicks the preview action.

This keeps review lists fast enough for Beta, but it also means the SQLite database can grow as users upload images. Treat the database file as both application data and uploaded-image storage.

Before every deployment:

- Back up the SQLite file at `PERP_SIM_DB_PATH`.
- Confirm the backup file exists and is readable.
- Confirm `PERP_SIM_DB_PATH` is outside any directory that deployment scripts replace or clean.

After deployment:

- Confirm admin deposit proof preview works.
- Confirm admin KYC front/back preview works.
- Confirm the review lists still load without returning large base64 payloads.

Future production hardening should move uploaded images to `uploads/` or object storage such as S3, R2, or OSS. In that model, SQLite should keep only metadata such as `storage_key`, `mime`, `size`, and `hash`.

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
