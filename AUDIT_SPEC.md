# Perp Sim Audit Specification

Date: 2026-05-26

This document turns the initial code and UI review into an implementation-ready specification. It focuses on correctness, safety, and user-facing interaction gaps in the local simulated trading platform.

## Scope

- Next.js App Router pages and API routes under `app/`
- SQLite persistence and schema initialization under `lib/db.ts`
- Trading, binary-option settlement, asset, deposit, withdrawal, and KYC flows
- Socket.IO realtime bridge under `realtime/`
- Mobile frontend flows, with special attention to Assets, Trade, Profile, Security, and Admin

## Priority Legend

- P0: Funds, settlement, or security behavior is materially incorrect.
- P1: Important product behavior is misleading, unsafe, or inconsistent.
- P2: UX, maintainability, or operational issue that should be fixed soon.

## P0: Expired Binary Orders Do Not Settle

### Problem

Binary orders are stored with ISO timestamps such as `2026-05-26T17:24:46.673Z`, but settlement queries compare them directly against SQLite `CURRENT_TIMESTAMP`, which uses a `YYYY-MM-DD HH:MM:SS` format. Because this is a string comparison, expired orders from the same date can remain open indefinitely.

### Evidence

- `app/api/binary-orders/route.ts` creates `expiresAt` with `new Date(...).toISOString()`.
- `app/api/trade/summary/route.ts` queries `expires_at <= CURRENT_TIMESTAMP`.
- `realtime/settlement-worker.mjs` also queries `expires_at <= CURRENT_TIMESTAMP`.
- Runtime inspection found expired orders that still had `status = 'open'`, while `datetime(expires_at) <= CURRENT_TIMESTAMP` correctly returned true.

### Required Fix

- Normalize stored timestamps or normalize query comparisons.
- Use `datetime(expires_at) <= CURRENT_TIMESTAMP` in all settlement queries, or store all timestamps in SQLite-native `YYYY-MM-DD HH:MM:SS` format.
- Apply the same rule consistently to API fallback settlement and the standalone settlement worker.
- Add a regression test or script that creates an already-expired order and confirms settlement runs.

### Acceptance Criteria

- An order expires and settles within the configured settlement interval.
- Refreshing `/api/trade/summary` also settles any expired current-user orders.
- The Trade page never shows expired open orders stuck at `0s`.
- Settlement remains idempotent if worker and API refresh run at the same time.

## P0: Admin Deposit and Withdrawal Review Is Not Idempotent

### Problem

Admin review endpoints first read a pending record, then update it inside a transaction, but they do not check whether the guarded update actually changed a row before applying balance mutations. Duplicate clicks or concurrent requests can double-credit deposits or double-refund rejected withdrawals.

### Evidence

- `app/api/admin/deposits/route.ts` updates `deposits` with `WHERE status = 'pending'`, then credits the user without checking `changes`.
- `app/api/admin/withdrawals/route.ts` updates `withdrawals` with `WHERE status = 'pending'`, then releases or consumes locked funds without checking `changes`.

### Required Fix

- In each review transaction, perform the guarded status update first.
- If `changes !== 1`, abort the transaction and return a 409 or 400 response indicating that the record has already been processed.
- Only mutate balances, locks, and ledger rows after the guarded update succeeds.
- Disable action buttons client-side after click, but do not rely on the client for correctness.

### Acceptance Criteria

- Double-clicking Approve/Reject produces exactly one balance mutation.
- Two concurrent requests for the same review record produce exactly one successful mutation.
- The losing request receives a clear "already processed" response.
- Ledger rows are created once per final review action.

## P1: Balance Mutations Are Not Atomic Enough

### Problem

Several flows read available balance outside the final mutation and then deduct inside a transaction using unconditional updates or `MAX(0, balance - ?)`. This can hide insufficient-funds bugs and can cause `users.balance` and `user_assets.balance` to drift apart.

### Evidence

- `app/api/binary-orders/route.ts` reads USDC balance, then deducts stake later.
- `app/api/assets/withdraw/route.ts` reads balance, then freezes funds later.
- `app/api/trade/positions/route.ts` checks `users.balance`, then deducts both `users` and `user_assets`.
- Runtime inspection found a user where `users.balance` and `user_assets.USDC.balance` differed.

### Required Fix

- Treat `user_assets` as the source of truth for multi-asset balances.
- Use conditional updates such as `UPDATE user_assets SET balance = balance - ? WHERE user_id = ? AND asset = ? AND balance >= ?`.
- Check `changes === 1` before creating orders, withdrawals, or ledger rows.
- Reconcile or remove the legacy `users.balance` field, or update it from a single helper after the asset mutation succeeds.
- Avoid `MAX(0, balance - ?)` for financial mutations because it masks overdrafts.

### Acceptance Criteria

- Concurrent order placement cannot spend more than the available balance.
- Withdrawal freezing cannot over-freeze or silently clamp balances.
- `users.balance` and `user_assets.USDC.balance` either stay synchronized or the UI/API stops using the legacy field.
- Failed financial operations do not create ledger rows.

## P1: Socket.IO Realtime Bridge Has No Authentication Boundary

### Problem

The socket server accepts internal emit requests and room joins without authentication. Any process or browser able to reach port 3001 can emit arbitrary realtime events or join another user's room.

### Evidence

- `realtime/socket-server.mjs` exposes `POST /internal/emit` without a shared secret.
- `user:join` accepts any `userId` supplied by the client.
- `admin:join` does not verify that the socket belongs to an admin session.

### Required Fix

- Require an internal shared secret header for `/internal/emit`.
- Pass a signed session token or short-lived realtime token when connecting.
- Validate user identity server-side before joining `user:{id}`.
- Validate admin identity before joining the `admin` room.

### Acceptance Criteria

- Requests to `/internal/emit` without the secret fail.
- A normal user cannot subscribe to another user's room.
- A non-admin cannot subscribe to the admin room.
- Existing UI refresh behavior continues to work after authentication is added.

## P1: Frontend Contains Fake-Success Interactions

### Problem

Some screens show success messages without making API calls. This is misleading for users and masks missing backend functionality.

### Evidence

- Security page password changes show `Password updated` even with empty fields.
- Withdrawal password changes show success without persistence.
- Swap page shows a success toast but has no real swap endpoint or transaction record.
- Asset history buttons are visible but do not navigate or open records.

### Required Fix

- Implement real APIs for password changes, withdrawal password changes, and swap, or mark those controls as disabled/unavailable.
- Add client validation before submit.
- Show API errors inline.
- Connect asset history buttons to actual deposit, withdrawal, and funding transaction views.

### Acceptance Criteria

- Empty password forms cannot submit successfully.
- Password changes persist and require current password where appropriate.
- Swap either creates a real transaction or is clearly disabled.
- Deposit History, Withdraw History, and Funding Records display real records or a clear empty state.

## P1: Demo Credentials Are Hard-Coded and Pre-Filled

### Problem

The app seeds predictable admin and demo credentials and pre-fills them in frontend forms. This is acceptable only for disposable local demos, not for any shared environment.

### Evidence

- `lib/db.ts` seeds `admin/admin123` and `demo/demo123`.
- Mobile login defaults to `demo@example.com` / `demo123`.
- Admin login defaults to `admin` / `admin123`.

### Required Fix

- Gate seeded demo credentials behind an explicit local/demo environment flag.
- Remove password prefill from production-like builds.
- Force admin password initialization through environment variables or a first-run setup command.

### Acceptance Criteria

- Production-like startup never creates default admin credentials.
- Login forms do not expose passwords by default.
- Local demo mode remains convenient when explicitly enabled.

## P2: Market Data Fallback Is Too Slow

### Problem

When Binance is unreachable or slow, API routes can wait roughly 10 seconds before using local fallback data. The Trade page can show `Loading market data` long enough to appear broken.

### Evidence

- `app/api/market-data/tickers/route.ts` fetches Binance without an explicit timeout.
- `app/api/market-data/klines/route.ts` fetches Binance without an explicit timeout.
- Runtime checks showed fallback responses taking about 10 seconds.

### Required Fix

- Use `AbortController` with a short timeout, for example 1500-2500 ms.
- Return local fallback immediately on timeout.
- Add frontend states that distinguish loading, fallback, empty, and error.

### Acceptance Criteria

- Market pages render fallback data quickly when Binance is unavailable.
- The chart does not appear permanently blank or stuck on loading.
- The UI labels the data source clearly.

## P2: Lint Script Is Broken Under Next.js 16

### Problem

`npm run lint` calls `next lint`, which is no longer valid in the installed Next.js version. The command fails with `Invalid project directory ...\lint`.

### Required Fix

- Add ESLint explicitly, or replace the script with a supported command.
- Keep `npm run build` and `tsc --noEmit` as separate verification steps.

### Acceptance Criteria

- `npm run lint` exits successfully or reports real lint findings.
- CI/local verification instructions match available tooling.

## P2: Documentation Encoding Must Stay UTF-8

### Problem

Some terminal reads displayed Chinese content as mojibake, while Node UTF-8 reads showed the files correctly. This can still confuse future reviews and manual edits in non-UTF-8 shells.

### Required Fix

- Keep all project Markdown and source files UTF-8.
- Prefer tooling that reads files as UTF-8.
- Avoid copying terminal mojibake back into source files.

### Acceptance Criteria

- Chinese UI copy renders correctly in browser.
- Markdown files open correctly in editors configured for UTF-8.
- No mojibake text is introduced in new commits.

## Frontend Review Checklist

## Playwright Follow-up: Assets Page

The Assets page was rechecked with Playwright in a 430 x 932 mobile viewport after logging in with the demo account. Screenshots were captured in the project root as:

- `pw-assets-overview.png`
- `pw-deposit-asset-picker.png`
- `pw-deposit-address.png`
- `pw-withdraw-form.png`
- `pw-swap-page.png`

### Confirmed Asset Page Issues

- The overview displays a `USDC` wallet balance, but the Deposit and Withdraw pickers list `USDT`, `BTC`, `ETH`, `BNB`, and `SOL`; `USDC` is not selectable even though it is the displayed wallet asset.
- `Deposit History`, `Withdraw History`, and `Funding Records` are clickable-looking buttons, but Playwright confirmed that clicking them does not change URL, page text, stack state, or open any record view.
- Deposit submission can be attempted with an empty amount. The UI waits for the API to return `Invalid deposit amount` instead of blocking the request client-side.
- Withdraw submission can be attempted with a blank address and blank withdrawal password. The UI waits for the API to return `Withdrawal address is required` instead of blocking the request client-side.
- The Swap page shows `Swap preview submitted` and returns to Assets, but no real swap transaction, confirmation, or record is created.
- The Swap flip control renders the literal text `&varr;` instead of an arrow/icon.
- The deposit QR image is loaded from `https://api.qrserver.com/...`, which is a third-party dependency and exposes deposit addresses to that service. In restricted/offline environments it may render as a blank white square.
- Asset picker rows say `Available balance` but do not show the actual selected-asset balance.
- Numeric precision is inconsistent: the Assets overview shows `$9,676.58`, while the wallet row shows `9676.578400`.

### Asset Page Acceptance Criteria

- The asset shown in the wallet row must be selectable in Deposit and Withdraw, or the wallet display must use the same asset naming as the picker.
- History rows must navigate to or open real record lists backed by `/api/assets`.
- Deposit and Withdraw forms must block invalid submissions before sending the request.
- Swap must either be implemented end-to-end or visibly disabled with no fake success state.
- QR codes must be generated locally or by a trusted controlled endpoint.
- The flip control must render as a proper icon or text arrow.
- Amount display precision must be consistent and intentional across overview and wallet rows.

### Mobile Assets Page

- Total Equity, Available, Frozen, and PnL must match backend asset calculations.
- Deposit flow must show only active asset/network combinations.
- Deposit address copy should provide visible success or failure feedback.
- Deposit proof upload should validate file type and size before submit.
- Withdraw flow must show available balance for the selected asset.
- Withdraw submit must prevent empty address, invalid amount, and empty password before calling the API.
- Deposit History must show submitted deposits.
- Withdraw History must show submitted withdrawals.
- Funding Records must show asset transaction history.
- Swap must either be implemented or clearly disabled.

### Mobile Trade Page

- Expired orders must not remain in Open with `0s`.
- Payout labels must use one asset name consistently.
- Stake input must clamp to the backend min/max before opening the confirmation sheet.
- Chart must render fallback data quickly when external market data is unavailable.

### Mobile Profile and Security

- Password forms must call real APIs.
- Empty forms must show validation errors.
- KYC rejected state should display the rejection reason when available.
- Support links should be validated and should not default to `#` unless intentionally disabled.

### Admin

- Review buttons must become pending/disabled after click.
- Review endpoints must remain correct even if buttons are clicked multiple times.
- Large or suspicious balances should be visually obvious in user and dashboard views.
- Admin market price edits should validate input before `onBlur` mutation.

## Suggested Implementation Order

1. Fix timestamp comparison and binary-order settlement.
2. Make deposit and withdrawal review endpoints idempotent.
3. Centralize financial balance mutation helpers.
4. Replace fake-success frontend actions with real APIs or disabled states.
5. Add realtime authentication boundaries.
6. Improve market-data fallback latency and chart states.
7. Repair lint tooling and add regression coverage.
