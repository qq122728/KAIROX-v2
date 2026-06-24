# Testing

This project has repeatable checks for audit-critical flows and launch process wiring.

## Database Path

All local app and regression-test runs should use `PERP_SIM_DB_PATH`.

Use a disposable test database for regression runs:

```powershell
$env:PERP_SIM_DB_PATH = "$PWD\test-artifacts\regression.sqlite"
$env:SOCKET_INTERNAL_SECRET = 'local-regression-secret'
$env:REALTIME_INTERNAL_SECRET = $env:SOCKET_INTERNAL_SECRET
```

`npm run test:regression` refuses to run against the default app database at `data/perp-lab.sqlite` unless you intentionally set:

```powershell
$env:PERP_SIM_ALLOW_DEFAULT_DB_FOR_TESTS = 'true'
```

## Prerequisites

Start the app and realtime services with the same environment before running API or E2E tests:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev -- --hostname 127.0.0.1 --port 3000
& 'C:\Program Files\nodejs\npm.cmd' run socket
& 'C:\Program Files\nodejs\npm.cmd' run settlement
```

The E2E script defaults to the installed Microsoft Edge browser because the local Playwright package may not have downloaded bundled Chromium yet.

## Commands

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run lint:mjs
& 'C:\Program Files\nodejs\npm.cmd' run build
& 'C:\Program Files\nodejs\npm.cmd' run test:regression
& 'C:\Program Files\nodejs\npm.cmd' run test:e2e
```

`npm run lint` runs both TypeScript checking and `.mjs` syntax checks for `realtime/`, `tests/`, and `scripts/`.

Run the full acceptance chain after the services are already running:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run test:acceptance
```

## Production Process

Create a production environment from `.env.example`, then build and start all required services:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build
& 'C:\Program Files\nodejs\npm.cmd' run start:production
```

`npm run start:production` starts:

- Next.js with `next start`.
- The Socket.IO service from `realtime/socket-server.mjs`.
- The settlement worker from `realtime/settlement-worker.mjs`.

The combined runner refuses production startup when `PERP_SIM_DB_PATH`, `NEXT_PUBLIC_APP_URL`, or `SOCKET_INTERNAL_SECRET` is missing, or when the realtime secret is still the local default. The Next app, Socket.IO server, and settlement worker all read the same `PERP_SIM_DB_PATH`.

## Regression Coverage

`npm run test:regression` verifies:

- `/api/settings` is reachable.
- `POST /internal/emit` rejects requests without `x-realtime-secret`.
- `POST /internal/emit` accepts the configured shared secret.
- A temporary user can log in.
- CSRF blocks cross-site mutations.
- Split user/admin sessions remain stable.
- Public assets expose USDC/BTC/ETH/SOL without USDT.
- Wrong login password changes fail.
- Wrong withdrawal password changes fail.
- Oversized withdrawals fail.
- Insufficient binary orders fail.
- Failed financial operations do not create `binary_orders`, `withdrawals`, or `asset_transactions` rows.
- Manual binary presets wait until expiry and settle through the explicit settlement endpoint.
- Expired binary orders without admin presets follow market settlement.
- Market ticker fallback responds in under 5 seconds.
- Seeded markets include the required mainstream pairs.
- Login lockout blocks repeated failures.

The regression script creates temporary database users and deletes them at the end.

## E2E Coverage

`npm run test:e2e` verifies:

- User login form is not prefilled.
- Admin login form is not prefilled.
- A temporary user can log in through the mobile UI.
- Assets history opens and shows a real list or empty state.
- Security password forms show client/API validation errors instead of fake success.

Screenshots are written to:

```text
test-artifacts/e2e/
```

## Useful Environment Variables

```powershell
$env:PERP_SIM_DB_PATH = "$PWD\test-artifacts\regression.sqlite"
$env:TEST_APP_URL = 'http://127.0.0.1:3000'
$env:TEST_SOCKET_URL = 'http://127.0.0.1:3001'
$env:TEST_ARTIFACT_DIR = "$PWD\test-artifacts\e2e"
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:SOCKET_INTERNAL_SECRET = 'local-regression-secret'
$env:REALTIME_INTERNAL_SECRET = $env:SOCKET_INTERNAL_SECRET
```

Use `PLAYWRIGHT_CHANNEL=bundled` only after running `npx playwright install`.
