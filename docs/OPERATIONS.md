# VORX Beta Operations and Maintenance Runbook

This document is the day-to-day operations guide for VORX Beta. It is written for server agents and human operators who need to diagnose production issues quickly.

## Quick Facts

Production runs three processes:

- `vorx-next`: Next.js app and API, default port `3000`
- `vorx-socket`: Socket.IO realtime server, default port `3001`
- `vorx-settlement`: binary options settlement worker

Important paths:

```bash
APP_DIR=/var/www/vorx
DATA_DIR=/var/lib/vorx
BACKUP_DIR=/var/backups/vorx
DB_PATH=/var/lib/vorx/vorx-beta.sqlite
ENV_FILE=/var/www/vorx/.env.production.local
LOG_DIR=/var/www/vorx/logs
```

Do not store real secrets in Git. The server-local `.env.production.local` is the source of production secrets.

## Daily Health Check

Run this once per day and after every deploy:

```bash
cd /var/www/vorx
pm2 status
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:3001/health
ls -lh /var/lib/vorx/vorx-beta.sqlite
ls -lh /var/backups/vorx | tail
```

Expected:

- `vorx-next`, `vorx-socket`, and `vorx-settlement` are online.
- App responds on `127.0.0.1:3000`.
- Socket health responds on `127.0.0.1:3001/health`.
- SQLite database exists in `/var/lib/vorx`.
- Recent database backups exist in `/var/backups/vorx`.

## Log Locations

PM2 status:

```bash
pm2 status
```

Live logs:

```bash
pm2 logs vorx-next
pm2 logs vorx-socket
pm2 logs vorx-settlement
```

File logs:

```bash
tail -n 200 /var/www/vorx/logs/next-error.log
tail -n 200 /var/www/vorx/logs/socket-error.log
tail -n 200 /var/www/vorx/logs/settlement-error.log
tail -n 200 /var/www/vorx/logs/next-out.log
tail -n 200 /var/www/vorx/logs/socket-out.log
tail -n 200 /var/www/vorx/logs/settlement-out.log
```

Nginx logs are usually:

```bash
tail -n 200 /var/log/nginx/error.log
tail -n 200 /var/log/nginx/access.log
```

## Safe Restart

Restart one process:

```bash
pm2 restart vorx-next
pm2 restart vorx-socket
pm2 restart vorx-settlement
```

Restart all VORX processes:

```bash
pm2 restart vorx-next vorx-socket vorx-settlement
```

After restart:

```bash
pm2 status
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:3001/health
```

## Deployment Update

Use this when deploying a newer commit:

```bash
cd /var/www/vorx
git fetch origin
git status --short
```

If the working tree is not clean, stop and inspect before continuing.

Back up the database:

```bash
mkdir -p /var/backups/vorx
cp /var/lib/vorx/vorx-beta.sqlite "/var/backups/vorx/vorx-beta-$(date +%Y%m%d-%H%M%S).sqlite"
```

Deploy:

```bash
git pull --ff-only origin master
npm install
npm run lint
npm run build
pm2 restart vorx-next vorx-socket vorx-settlement
pm2 status
```

Run the smoke test in the final section of this document.

## Rollback

Rollback code only:

```bash
cd /var/www/vorx
git log --oneline -10
git checkout <previous-good-commit>
npm install
npm run build
pm2 restart vorx-next vorx-socket vorx-settlement
```

Rollback database:

```bash
pm2 stop vorx-next vorx-socket vorx-settlement
cp /var/backups/vorx/<backup-file>.sqlite /var/lib/vorx/vorx-beta.sqlite
pm2 start vorx-next vorx-socket vorx-settlement
```

Only restore a database backup if the data problem is worse than losing changes made after that backup.

## Database Maintenance

Check database file:

```bash
ls -lh /var/lib/vorx/vorx-beta.sqlite
sqlite3 /var/lib/vorx/vorx-beta.sqlite "PRAGMA integrity_check;"
```

Expected:

```text
ok
```

Check duplicate deposit transaction hashes:

```bash
sqlite3 /var/lib/vorx/vorx-beta.sqlite "
SELECT tx_hash, COUNT(*) AS count, GROUP_CONCAT(id) AS ids
FROM deposits
WHERE tx_hash IS NOT NULL
GROUP BY tx_hash
HAVING COUNT(*) > 1;
"
```

Expected: no rows.

Check pending reviews:

```bash
sqlite3 /var/lib/vorx/vorx-beta.sqlite "
SELECT 'deposits' AS type, COUNT(*) FROM deposits WHERE status = 'pending'
UNION ALL
SELECT 'withdrawals', COUNT(*) FROM withdrawals WHERE status = 'pending'
UNION ALL
SELECT 'kyc', COUNT(*) FROM kyc_submissions WHERE status = 'pending';
"
```

Check image-heavy database growth:

```bash
ls -lh /var/lib/vorx/vorx-beta.sqlite
sqlite3 /var/lib/vorx/vorx-beta.sqlite "
SELECT COUNT(*) AS deposit_images FROM deposits WHERE proof_data IS NOT NULL AND proof_data <> '';
SELECT COUNT(*) AS kyc_front_images FROM kyc_submissions WHERE front_data IS NOT NULL AND front_data <> '';
SELECT COUNT(*) AS kyc_back_images FROM kyc_submissions WHERE back_data IS NOT NULL AND back_data <> '';
"
```

## Common Problems

### Site Does Not Open

Symptoms:

- Browser cannot open the domain.
- Nginx returns `502 Bad Gateway`.
- `curl http://127.0.0.1:3000` fails.

Check:

```bash
pm2 status
pm2 logs vorx-next --lines 100
curl -I http://127.0.0.1:3000
tail -n 100 /var/log/nginx/error.log
```

Fix:

- If `vorx-next` is stopped, run `pm2 restart vorx-next`.
- If build files are missing, run `npm run build`, then restart.
- If Nginx points to the wrong port, proxy `/` to `127.0.0.1:3000`.
- If `.env.production.local` is missing, create it from `docs/DEPLOYMENT.md`.

### Admin Login Fails

Symptoms:

- Admin login page opens, but login fails.
- Repeated attempts may lock login temporarily.

Check:

```bash
pm2 logs vorx-next --lines 100
sqlite3 /var/lib/vorx/vorx-beta.sqlite "SELECT id, username, role, is_system FROM users WHERE role = 'admin';"
```

Fix:

- Confirm the admin account exists.
- Confirm `PERP_SIM_ADMIN_PASSWORD` was used only for first setup, then removed.
- If rate limited, wait for `PERP_SIM_ADMIN_LOGIN_LOCK_MS` or restart only if this is a test environment.
- Do not edit password hashes manually unless you have a verified recovery procedure.

### User Login Or Register Fails

Symptoms:

- Users cannot log in or register.
- Register may be disabled in Settings.

Check:

```bash
pm2 logs vorx-next --lines 100
sqlite3 /var/lib/vorx/vorx-beta.sqlite "SELECT key, value FROM settings WHERE key IN ('registration_enabled', 'trading_enabled', 'withdrawals_enabled');"
```

Fix:

- If registration is disabled intentionally, no action is needed.
- If login failures are rate-limit related, wait for the lock window.
- If database errors appear, check SQLite path and permissions.

### Realtime Updates Not Working

Symptoms:

- User balances or admin notifications do not update live.
- Manual refresh works, but realtime does not.

Check:

```bash
pm2 status
curl http://127.0.0.1:3001/health
pm2 logs vorx-socket --lines 100
grep socket /var/log/nginx/error.log | tail -n 50
```

Fix:

- Restart socket: `pm2 restart vorx-socket`.
- Confirm Nginx proxies `/socket.io/` to `127.0.0.1:3001`.
- Confirm WebSocket upgrade headers are configured.
- Confirm `NEXT_PUBLIC_SOCKET_URL` matches the public domain.
- Confirm `SOCKET_INTERNAL_SECRET` and `REALTIME_INTERNAL_SECRET` match.

### Binary Orders Do Not Settle

Symptoms:

- Orders remain open after expiry.
- User funds stay locked.

Check:

```bash
pm2 status
pm2 logs vorx-settlement --lines 200
sqlite3 /var/lib/vorx/vorx-beta.sqlite "SELECT id, user_id, symbol, status, expires_at FROM binary_orders WHERE status = 'open' ORDER BY expires_at ASC LIMIT 20;"
```

Fix:

- Restart settlement worker: `pm2 restart vorx-settlement`.
- Confirm `SETTLEMENT_INTERVAL_MS` is set.
- Confirm the worker uses the same `PERP_SIM_DB_PATH` as the app.
- Confirm market price APIs are reachable from the server.

### Swap Quote Or Swap Submit Fails

Symptoms:

- Swap quote returns an error.
- Swap submit refuses to execute.

Check:

```bash
pm2 logs vorx-next --lines 200
curl -I https://www.okx.com
curl -I https://api.binance.com
sqlite3 /var/lib/vorx/vorx-beta.sqlite "SELECT key, value FROM settings WHERE key = 'trading_enabled';"
```

Fix:

- If `trading_enabled` is off, enable it only if operations approve.
- If OKX and Binance are unavailable, swaps should fail safely. Do not re-enable fixed fallback pricing.
- If USDT/USDC conversion is unavailable, swaps that depend on it should fail safely.
- If rate limited, wait for the configured swap window.

### Portfolio Value Looks Wrong

Symptoms:

- Total balance looks too small after holding BTC, ETH, or SOL.
- Asset page shows partial valuation.

Check:

```bash
pm2 logs vorx-next --lines 200
curl -I https://www.okx.com
curl -I https://api.binance.com
```

Fix:

- If price sources are unreachable, valuation may be partial.
- Confirm `/api/assets` returns `summary.totalEquity`, `valuationStatus`, and `valuationWarnings`.
- Do not manually edit user balances to correct temporary price-source issues.

### Deposit Cannot Be Approved

Symptoms:

- Admin rejects or approves deposit, but action fails.
- Duplicate transaction hash error appears.

Check:

```bash
pm2 logs vorx-next --lines 200
sqlite3 /var/lib/vorx/vorx-beta.sqlite "
SELECT id, user_id, asset, network, amount, tx_hash, status
FROM deposits
ORDER BY created_at DESC
LIMIT 20;
"
```

Fix:

- If duplicate `tx_hash` exists, do not approve the duplicate.
- Confirm asset and network are correct.
- Confirm the record is still `pending`; processed records should not be approved again.

### Deposit Or KYC Image Cannot Be Previewed

Symptoms:

- Admin list shows a record, but image preview fails.
- Preview button is disabled.

Check:

```bash
pm2 logs vorx-next --lines 200
sqlite3 /var/lib/vorx/vorx-beta.sqlite "
SELECT id, CASE WHEN proof_data IS NULL OR proof_data = '' THEN 0 ELSE 1 END AS has_proof
FROM deposits
ORDER BY created_at DESC
LIMIT 20;
"
sqlite3 /var/lib/vorx/vorx-beta.sqlite "
SELECT id,
       CASE WHEN front_data IS NULL OR front_data = '' THEN 0 ELSE 1 END AS has_front,
       CASE WHEN back_data IS NULL OR back_data = '' THEN 0 ELSE 1 END AS has_back
FROM kyc_submissions
ORDER BY created_at DESC
LIMIT 20;
"
```

Fix:

- If `has_proof`, `has_front`, or `has_back` is `0`, no image was stored for that side.
- If the flag is `1` but preview fails, check `/api/admin/deposits/proof` or `/api/admin/kyc/image` errors in `vorx-next` logs.
- Confirm the admin session is valid; image endpoints require admin authentication.
- Large images increase SQLite size. Keep regular backups.

### Withdrawal Fails

Symptoms:

- User withdrawal submit returns an error.
- Repeated wrong withdrawal password attempts return `429`.

Check:

```bash
pm2 logs vorx-next --lines 200
sqlite3 /var/lib/vorx/vorx-beta.sqlite "SELECT key, value FROM settings WHERE key = 'withdrawals_enabled';"
```

Fix:

- If withdrawals are disabled, enable only with operations approval.
- If password failures hit rate limit, wait for `PERP_SIM_WITHDRAW_PASSWORD_WINDOW_MS`.
- Confirm the asset balance is available and not locked.
- Confirm minimum withdrawal rules use USD valuation where needed.

### Admin Risky Action Does Not Execute

Symptoms:

- User adjustment, password reset, market pause, settings save, or address delete does not happen.

Check:

```bash
pm2 logs vorx-next --lines 200
```

Fix:

- Confirm the operator clicked the second confirmation dialog.
- Canceling confirmation must not submit the action.
- Confirm the admin is not trying to adjust own funds, change own role, or promote a user to admin.
- Confirm API request parameters match the intended action.

### Market Data Or Price Source Fails

Symptoms:

- Charts stop updating.
- Swap or portfolio valuation reports price unavailable.

Check:

```bash
curl -I https://www.okx.com
curl -I https://api.binance.com
pm2 logs vorx-next --lines 200
pm2 logs vorx-settlement --lines 200
```

Fix:

- If both upstreams fail, trading flows should fail safely instead of using fixed fallback prices.
- Check server outbound network and DNS.
- Check whether a provider blocks the server region.
- Do not change code to use static prices in production.

### Database Locked Or Slow

Symptoms:

- Logs show `SQLITE_BUSY`, `database is locked`, or slow API responses.

Check:

```bash
pm2 logs vorx-next --lines 200
pm2 logs vorx-socket --lines 200
pm2 logs vorx-settlement --lines 200
ls -lh /var/lib/vorx/vorx-beta.sqlite
```

Fix:

- Confirm all processes use the same `PERP_SIM_DB_PATH`.
- Confirm busy timeout variables are set to `5000` or higher.
- Avoid running heavy SQL queries against production during peak traffic.
- If the database is very large due to uploaded images, increase backup frequency and plan image-storage migration.

### Disk Full

Symptoms:

- Uploads fail.
- Database writes fail.
- PM2 logs grow without limit.

Check:

```bash
df -h
du -sh /var/lib/vorx
du -sh /var/www/vorx/logs
du -sh /var/backups/vorx
```

Fix:

- Move old backups off the server.
- Rotate or archive logs.
- Do not delete the active SQLite file.
- Do not delete the latest known-good backup.

### PM2 Restart Loop

Symptoms:

- `pm2 status` shows repeated restarts.
- Process status is `errored` or restart count keeps increasing.

Check:

```bash
pm2 status
pm2 logs vorx-next --lines 200
pm2 logs vorx-socket --lines 200
pm2 logs vorx-settlement --lines 200
```

Fix:

- Look for missing environment variables.
- Confirm `.env.production.local` exists in `/var/www/vorx`.
- Confirm `node_modules` exists; run `npm install` if needed.
- Confirm `.next` exists; run `npm run build` if needed.
- Confirm ports `3000` and `3001` are not occupied by unrelated processes.

### Nginx 502 Or WebSocket Fails

Symptoms:

- HTTP domain returns `502`.
- App opens, but realtime stays disconnected.

Check:

```bash
nginx -t
tail -n 200 /var/log/nginx/error.log
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:3001/health
```

Fix:

- Proxy `/` to `127.0.0.1:3000`.
- Proxy `/socket.io/` to `127.0.0.1:3001`.
- Include WebSocket upgrade headers for `/socket.io/`.
- Reload Nginx only after `nginx -t` passes.

```bash
nginx -t
systemctl reload nginx
```

## Operational Smoke Test

Run this after every deploy:

- Open public domain.
- Register a user if registration is enabled.
- Log in as user.
- Log in as admin.
- Submit a small deposit request with proof image.
- Confirm admin can preview deposit proof.
- Submit KYC front/back images.
- Confirm admin can preview KYC images.
- Approve or reject a test KYC record.
- Try a small USDC to BTC swap, then BTC to USDC.
- Place a small binary order and wait for settlement.
- Open and close a small perpetual position.
- Confirm Portfolio Value remains reasonable.
- Confirm admin notification center receives events.
- Confirm PM2 processes remain online.

## Incident Severity

P0:

- Users can gain or lose funds incorrectly.
- Admin can bypass security controls.
- Database corruption or data loss.
- Swap or trading uses unsafe fallback prices.
- Withdrawals can be bypassed.

Action: stop affected flows if possible, back up database, capture logs, roll back if needed.

P1:

- Core trading or settlement unavailable.
- Admin cannot review deposits, withdrawals, or KYC.
- Realtime broken but manual refresh works.
- Portfolio valuation partially unavailable.

Action: diagnose with logs, restart affected process, verify smoke test.

P2:

- UI polish issue.
- Copy or layout inconsistency.
- Non-critical reporting mismatch.

Action: schedule fix after production stability is confirmed.

## What Not To Do

- Do not run destructive SQL on production without a fresh backup.
- Do not delete `/var/lib/vorx/vorx-beta.sqlite`.
- Do not place `PERP_SIM_DB_PATH` inside `/var/www/vorx`.
- Do not commit `.env.production.local`.
- Do not use fixed fallback prices for swap or valuation.
- Do not manually credit users to hide a price-source issue.
- Do not restore an old database backup before understanding what data will be lost.

