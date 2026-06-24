# AI Handoff Notes

These notes summarize practical lessons from the pre-launch hardening work. They are intended for future AI agents working on this repo.

## Repository-Specific Skills Learned

- Use `C:\Program Files\nodejs\npm.cmd` on Windows PowerShell. Plain `npm` may fail because `npm.ps1` is blocked by execution policy.
- Use `C:\Program Files\Git\cmd\git.exe` if `git` is not on PATH in the Codex shell.
- Git writes to `.git/index.lock` may require elevated sandbox permission in this environment.
- Next dev only allows one dev server per project directory. If an existing `npm run dev` is running, use `next start` after `npm run build` for isolated smoke tests.
- Always set `PERP_SIM_DB_PATH` for tests. Regression tests intentionally refuse the default `data/perp-lab.sqlite` unless explicitly allowed.
- The app, socket server, and settlement worker must share the same `PERP_SIM_DB_PATH`.
- Production must not use the default realtime secret. Socket and settlement processes now fail fast in production if the secret is missing or default.
- For local smoke tests, use a temporary SQLite DB under `test-artifacts/` and ports such as `3100/3101`.
- After spawning temporary services in a script, stop both the tracked processes and any listeners on the test ports.

## Product Logic Notes

- The frontend no longer decides binary order entry price. The backend fetches a live/cached execution price at order placement.
- If admin presets a binary order result before expiry, the order remains open until expiry.
- If no manual result is set before expiry, the order follows market settlement.
- Binary option loss risk is `stake * (profitRate + 1%)`; the locked amount must be present before settlement can release it.
- `USDC` is the only stable asset shown to users; `USDT` should not reappear in user-facing wallet UI.
- The wallet still needs `BTC`, `ETH`, and `SOL` asset rows and deposit addresses.
- Admin realtime has socket plus polling fallback. Settings forms are protected from being overwritten while dirty.
- K-line chart uses Lightweight Charts and should update series data without recreating the chart every refresh.

## Verification Pattern

Recommended before pushing deployment-sensitive changes:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Then run a temporary DB smoke:

```powershell
$env:PERP_SIM_DB_PATH = "$PWD\test-artifacts\launch-smoke.sqlite"
$env:TEST_DB_PATH = $env:PERP_SIM_DB_PATH
$env:TEST_APP_URL = "http://127.0.0.1:3100"
$env:TEST_SOCKET_URL = "http://127.0.0.1:3101"
$env:SOCKET_INTERNAL_SECRET = "launch-smoke-secret-change-me"
$env:REALTIME_INTERNAL_SECRET = $env:SOCKET_INTERNAL_SECRET
& 'C:\Program Files\nodejs\npm.cmd' run test:regression
& 'C:\Program Files\nodejs\npm.cmd' run test:e2e
```

Do not assume `test:regression` can run without services. It expects the app and socket server to be available.

## Recent Known-Good Commit

The pre-launch hardening commit is:

```text
8924da5 Harden launch readiness checks
```

