# Pre-Launch Fix Specification

## Goal

Prepare `perp-sim` for a safer pre-launch build by fixing the highest-risk audit findings before broader product polish.

## Scope And Ownership

### Worker A: Authentication And Security

Owned files:
- `lib/auth.ts`
- `app/api/admin/users/route.ts`
- `app/api/auth/password/route.ts`
- `app/api/auth/withdrawal-password/route.ts`
- `realtime/socket-server.mjs`
- `lib/realtime.ts`

Required changes:
- Enforce `login_enabled` for existing sessions in `getCurrentUser`.
- When an admin disables login for a user, invalidate that user's existing sessions.
- When a user changes login password or withdrawal password, invalidate other active sessions where appropriate.
- Set session cookies with `secure: true` in production.
- Reject production startup when realtime internal secret is missing or still using the local default.
- Bind the socket server to localhost by default unless an explicit host is configured.

Acceptance:
- Disabled users cannot continue using old cookies.
- Admin/user password reset does not leave stale sessions usable.
- Local development still works without HTTPS.
- Production cannot silently use `perp-sim-local-realtime-secret`.

### Worker B: Funds And Settlement Integrity

Owned files:
- `app/api/admin/positions/route.ts`
- `lib/binary-settlement.ts`
- `realtime/settlement-worker.mjs`
- `lib/binary-options.ts` only if needed for shared formula parity

Required changes:
- Admin force-close must credit `user_assets.USDC.balance`, then sync the legacy user stable balance.
- Admin force-close update must include `status = 'open'` and check `changes === 1` before crediting funds or inserting ledger rows.
- Binary settlement must release locked risk with a conditional update requiring `locked >= riskAmount`; do not use `MAX(0, locked - riskAmount)`.
- Worker and API settlement must use the same risk fallback formula.
- Worker settlement should use the same OKX then Binance then local fallback logic as API settlement, or at least avoid divergent settlement behavior.
- Manual result preset must only be written while the order is still open and unexpired in the same SQL update.

Acceptance:
- Repeated admin force-close cannot double-credit.
- A binary order cannot settle if its locked risk is missing or insufficient.
- Historic `risk_amount IS NULL` orders settle consistently in worker and API.
- Expired orders without manual preset follow market settlement.

### Worker C: Admin Realtime And Chart UX

Owned files:
- `app/admin/page.tsx`
- `app/components/realtime-client.ts`
- `app/components/CandleChart.tsx`
- `app/components/MarketData.tsx`

Required changes:
- Admin page must have a polling fallback if socket connection fails or disconnects.
- Admin page should show a small realtime connection state indicator.
- Realtime reloads must not overwrite dirty, unsaved Settings form input.
- Candle chart should initialize once and update series data without recreating the chart every refresh.
- Keep the current visual structure; do not redesign the UI.

Acceptance:
- Admin data updates even when socket server is unavailable.
- Settings text being edited is not reset by unrelated admin realtime events.
- K-line refresh no longer feels like a full chart reload.

### Worker D: Deploy, Environment, And Tests

Owned files:
- `package.json`
- `.env.example`
- `lib/db.ts`
- `tests/regression.mjs`
- `TESTING.md`
- new helper scripts under `scripts/` if needed

Required changes:
- Add a documented `PERP_SIM_DB_PATH` and make app, worker, and tests use it consistently.
- Regression tests must refuse to run against the default local app database unless explicitly allowed.
- Add script coverage for MJS syntax checks, including realtime workers and tests.
- Add a production process script or documented command that starts Next, socket, and settlement together.
- Add `.env.example` with required launch variables.

Acceptance:
- Tests do not accidentally mutate `data/perp-lab.sqlite`.
- `npm run lint` or a new check script covers `.mjs` syntax.
- A deployer can see which env vars and processes are required.

## Global Rules

- Do not revert unrelated user or agent changes.
- Keep patches scoped to owned files.
- Prefer existing project patterns and SQLite transaction helpers.
- After changes, report files changed and exact tests/checks run.
- If a requested change conflicts with another worker's ownership, stop and report instead of editing outside your area.

