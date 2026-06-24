# VORX Protocol — Post-Refactor Audit & Fix Plan

> **Generated:** 2026-06-24
> **Scope:** Findings from a parallel 6-agent code audit covering the FluxPerp → VORX Protocol rebrand and 5-tab information-architecture refactor (tasks #1–#54).
> **Status:** Plan only — no code modified.

---

## 1. Methodology

Six independent review agents ran in parallel against the codebase, each focused on a distinct dimension. Findings below were de-duplicated and cross-referenced:

| Agent | Scope |
|---|---|
| `ts-types` | TypeScript correctness, dead code, stale prop types |
| `react-perf` | useEffect deps, state management, re-render hot paths |
| `css-cascade` | `!important` wars, redefined selectors, stale rules |
| `mobile-ux` | iOS Safari, safe-area, touch targets, PWA |
| `security` | CSRF, auth, input validation, rate limiting |
| `a11y` | WCAG 2.1 AA, ARIA, semantic HTML, focus management |

**Two agents (ts-types + react-perf) independently flagged the same Critical data-consistency bug** (TradeTab favorites duplicate state), giving us high confidence it is real.

---

## 2. Findings Overview

| Severity | Count |
|---|---|
| 🔴 **Critical (P0)** | 22 |
| 🟠 **High (P1)** | 49 |
| 🟡 **Medium (P2)** | ~45 |
| 🟢 **Low (P3)** | ~84 |
| **Total** | **~200** |

Estimated total remediation effort: **~2 hours** (P0 + P1 only).

---

## 3. P0 — Must Fix Immediately

> Affects functional correctness, data consistency, or fully blocks a class of users.

### P0-1: Duplicate favorites state in TradeTab

- **Severity:** 🔴 Critical
- **Files:** `app/components/FluxMobileApp.tsx` (lines ~1177-1188, also references ~214, ~1538)
- **Root cause:** When favorites was lifted to the FluxMobileApp parent (task #48) and migrated to localStorage key `vorx_market_favorites_v1`, the `TradeTab` pair selector was overlooked. It still has its own internal `favorites: Set<string>` and `toggleFavorite()` writing to legacy key `flux:fav-markets`.
- **User impact:** Star a market in Markets tab → it appears in Home Favorites. But the Trade tab's "Select pair" overlay shows a completely different favorites list. Two unsynced stores; one is invisible to the user.
- **Fix:** Delete TradeTab's local `useState<Set<string>>` for favorites and its local `toggleFavorite`. Accept `favorites` + `toggleFavorite` as props from FluxMobileApp. Remove the `flux:fav-markets` write completely.
- **Verification:** Star BTC in Markets → open Trade pair selector → expect BTC starred there too. Confirm `localStorage.getItem("flux:fav-markets")` is no longer set after star/unstar.
- **Backend changes required:** None.

### P0-2: Register form silently drops nickname + invite code

- **Severity:** 🔴 Critical
- **Files:** `app/components/FluxMobileApp.tsx:243, 498-507, 701-702`
- **Root cause:** The registration UI collects `authForm.name` (Nickname) and `authForm.invite` (Invite Code), but the `register()` function only sends `email`, `password`, `confirmPassword`, `withdrawalPassword`, `confirmWithdrawalPassword` to `/api/auth/register`. The two fields never leave the client.
- **User impact:** Users who enter a nickname or invite code see no error, but the values are discarded. If invite codes are used for promotions or referrals, all data is lost. Trust impact.
- **Fix:** Either (a) wire `name` and `invite` into the `/api/auth/register` POST body and update `app/api/auth/register/route.ts` to accept and persist them, OR (b) remove both fields from the UI if they have no backend use.
- **Verification:** Register a user with nickname + invite code → query DB to confirm both stored OR confirm UI no longer collects them.
- **Backend changes required:** **Yes** if option (a) — schema may need `nickname` and `invite_code_used` columns on `users`.

### P0-3: iOS Safari auto-zoom on input focus (multiple forms)

- **Severity:** 🔴 Critical (mobile-only, but iOS share is huge)
- **Files:** `app/mobile-polish.css:3408, 3402, 6190, 1670, 7641, 2989` (auth-input-wrap, mobile-field input, kyc-input, kyc-select, amount-stepper input)
- **Root cause:** iOS Safari zooms the entire viewport when focusing an input with `font-size < 16px`. The page never reliably zooms back out — layout shifts persist after blur.
- **User impact:** Every iPhone user filling out login, register, KYC, withdraw, or order amount sees the page suddenly enlarge and shift on the first tap into a field. Looks broken / amateur.
- **Fix:** Bump every focusable input/select/textarea to `font-size: 16px !important`. We already do this on `.chat-input` (line 7573) — apply identically to: `.auth-input-wrap input`, `.mobile-field input`, `.kyc-input`, `.kyc-select`, `.amount-stepper input`, `.sec-input`.
- **Verification:** Open `/login` on a real iPhone → focus the email field → expect no page zoom.
- **Backend changes required:** None.

### P0-4: PWA manifest only declares 1024×1024 icon

- **Severity:** 🔴 Critical (blocks Android install)
- **Files:** `app/manifest.ts:17-27`
- **Root cause:** Chrome/Android requires `192×192` and `512×512` PNG icons to satisfy the PWA install criteria. Without them, the "Add to Home Screen" prompt never fires; Android falls back to a downscaled blurry 1024 image for the splash.
- **User impact:** Android users cannot install the app as a PWA. Splash screen looks blurry.
- **Fix:** Export `vorx-appicon-192.png` and `vorx-appicon-512.png` from the existing 1024 source. Add both to the `icons[]` array in `app/manifest.ts` with appropriate `sizes` fields. Optionally add a `maskable` variant.
- **Verification:** Open the app in Android Chrome → expect "Add VORX to Home Screen" banner. Verify `/manifest.webmanifest` lists 3 icon sizes.
- **Backend changes required:** None (asset-only).

### P0-5: 17 places use `outline: none` without `:focus-visible` replacement

- **Severity:** 🔴 Critical (blocks keyboard users entirely)
- **Files:** `app/mobile-polish.css:653, 1673, 2615, 2959, 2991, 3406, 3600, 4059, 4199, 4352, 4830, 5014, 6188, 6299, 6660, 7575, 7643`
- **Root cause:** The codebase strips browser focus rings (`outline: none !important`) on most interactive elements but never replaces them with a `:focus-visible` indicator.
- **User impact:** Tab-key users see no focus indicator anywhere — they cannot tell which control is active. Effectively unusable without a mouse.
- **Fix:** Add a global focus-visible rule near the top of `mobile-polish.css`:
  ```css
  *:focus-visible {
    outline: 2px solid var(--brand-accent-blue, #5B8DFF) !important;
    outline-offset: 2px !important;
    border-radius: 4px !important;
  }
  ```
  Keep individual `outline: none` rules but never strip from `:focus-visible`.
- **Verification:** Open any page → press Tab repeatedly → expect a visible blue ring on each focusable element.
- **Backend changes required:** None.

### P0-6: Five modals missing `role="dialog"`, focus trap, and Esc handler

- **Severity:** 🔴 Critical (screen-reader users blocked)
- **Files:** `app/components/FluxMobileApp.tsx`
  - TradeSheet: line ~1300
  - SwapAssetPicker: ~2658
  - SwapSuccessModal: ~2697
  - SecurityChangeSuccessModal: ~2905
  - MarketSelector (pair picker): ~1217
- **Root cause:** Each is a `<div>` with a click backdrop and inner content. None declare `role="dialog"`, `aria-modal="true"`, or `aria-labelledby`. None trap focus. None close on Esc. Focus is not returned to the trigger on close.
- **User impact:** Screen readers don't announce a dialog has opened. Keyboard users can Tab into the page behind the modal. Esc does nothing.
- **Fix:** For each modal, add:
  ```jsx
  <div role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <h2 id="modal-title">...</h2>
  </div>
  ```
  Plus: focus trap (any small library or hand-rolled), focus return on close, and `useEffect` keydown listener for `Escape`.
- **Verification:** Open each modal → press Esc → expect close. Tab through → focus should stay inside. NVDA/VoiceOver announces "dialog".
- **Backend changes required:** None.

### P0-7: Three competing `:root` palette definitions cause color flicker

- **Severity:** 🔴 Critical (visual)
- **Files:**
  - `app/mobile-polish.css:1238-1262` (legacy neon palette: `--bg:#000`, `--green:#00ff8a`)
  - `app/mobile-polish.css:5208-5229` (VORX Soft Dark: `--bg:#111820`, `--green:#16C784`)
  - `app/styles.css:3-14` (third palette: `--bg:#0b0f14`, `--good:#20c997`)
- **Root cause:** Three `:root` blocks define overlapping CSS custom property names with different values. The last block to load wins, which can vary by route depending on stylesheet order.
- **User impact:** Page-to-page color flicker. Inconsistent component theming.
- **Fix:** Keep only the VORX Soft Dark `:root` at line 5208. Delete the other two. Audit downstream consumers for tokens that no longer exist (`--blue`, `--soft`, `--r-card`, `--line2`, `--panel2`, `--text`, `--muted`) and update to current names.
- **Verification:** Search for `var(--blue)`, `var(--text)`, etc. → ensure none remain. Visual diff Home/Markets/Trade/Account routes.
- **Backend changes required:** None.

### P0-8: Order tags still use legacy neon palette

- **Severity:** 🔴 Critical (visual)
- **Files:** `app/mobile-polish.css:2659-2660`
- **Root cause:** `.order-card .tag.call` / `.put` hardcode `#00ff8a` and `#ff4f69` instead of using `var(--green)` / `var(--red)` from the Binance Soft Dark token set.
- **User impact:** CALL/PUT tags on the (already removed from Trade tab but still rendered in Orders tab) order cards glow neon, clashing with the rest of the Soft Dark UI.
- **Fix:**
  ```css
  .order-card .tag.call { color: var(--green); background: var(--green-soft); }
  .order-card .tag.put  { color: var(--red);   background: var(--red-soft); }
  ```
- **Verification:** Open Orders tab with at least one closed CALL and PUT order → expect tags in soft green / soft red.
- **Backend changes required:** None.

### P0-9: `load()` polling closure captures stale `currentSymbol`

- **Severity:** 🔴 Critical
- **Files:** `app/components/FluxMobileApp.tsx:282-321, 344-371`
- **Root cause:** `load()` reads `currentSymbol` at line ~321 (`if (!summary.markets.find(m => m.symbol === currentSymbol)...`), but the polling effect at 344-371 has `[]` deps. Every poll reuses the function captured on first mount → it sees the initial `currentSymbol` forever.
- **User impact:** If the user switches markets, the periodic refresh logic for "fallback to first market" still references the initial market. Subtle wrong-state issues on long sessions.
- **Fix:** Either (a) wrap `load` in `useCallback([currentSymbol])` and include in effect deps, or (b) use `useRef` for `currentSymbol` and read `.current` inside `load`.
- **Verification:** Open Trade tab → switch from BTC to ETH → wait one polling cycle (12s) → confirm no console errors and currentSymbol remains ETH.
- **Backend changes required:** None.

### P0-10: Toast `setTimeout` has no cleanup or ref

- **Severity:** 🔴 Critical (memory + UX)
- **Files:** `app/components/FluxMobileApp.tsx:410-413`
- **Root cause:** `showToast` creates a 2400ms timer to clear toast state. Calling it twice quickly: second timer fires and clears the third toast prematurely. If the component unmounts mid-timeout, `setState` is called on an unmounted component (React warning + tiny leak).
- **User impact:** Toasts can disappear earlier than expected. Console warnings in dev.
- **Fix:** Track timer in `useRef`; clear previous before scheduling new; clear on unmount.
- **Verification:** Trigger 3 toasts in quick succession → expect all 3 to show full duration.
- **Backend changes required:** None.

---

## 4. P1 — Should Fix Soon

> Affects security, performance, mobile UX, or accessibility but doesn't immediately break a user flow.

### Security

#### P1-S1: No rate limit on Swap POST
- **Files:** `app/api/assets/swap/route.ts:27-63`
- **Impact:** Scripted client can grind through 0.25% fees, hammer OKX/Binance fetch path, exhaust DB writes.
- **Fix:** Apply a per-user token bucket modeled on `lib/login-rate-limit.ts`.

#### P1-S2: Swap bypasses settings & per-user trading_enabled
- **Files:** `app/api/assets/swap/route.ts:27-63`
- **Impact:** Admin can disable trading and withdrawals but cannot disable swap. Users with `trading_enabled=0` (e.g. KYC rejected) can still swap.
- **Fix:** Gate on `settingBool(settings.trading_enabled)` and per-user lookup (mirror pattern at `binary-orders/route.ts:17-20`).

#### P1-S3: No rate limit on /api/auth/register
- **Files:** `app/api/auth/register/route.ts:9-52`
- **Impact:** Mass account creation, UID pool exhaustion, email bombing.
- **Fix:** Call `assertLoginAllowed("user", request, email)` or a register-specific limiter before INSERT.

#### P1-S4: Withdrawal password change doesn't require login password
- **Files:** `app/api/auth/withdrawal-password/route.ts:15-37`
- **Impact:** Hijacked session can rotate withdrawal password without re-auth, then drain funds.
- **Fix:** Require `currentPassword` (login) on withdrawal-password PATCH.

### Mobile UX

#### P1-M1: Touch targets smaller than 44×44
- **Files:** `app/mobile-polish.css:4406-4411` (`.sheet-close` 28px), `:1905-1906` (`.ml-star` 18px), `:3432` (`.auth-input-eye` ~26px)
- **Impact:** Hard to tap on phone.
- **Fix:** Keep visual size, expand hit area via `padding` + negative margins.

#### P1-M2: `app/styles.css` uses `min-height: 100vh` with no dvh fallback
- **Files:** `app/styles.css:39, 356, 499, 500`
- **Impact:** Bottom of page hidden behind iPhone address bar.
- **Fix:** Add `min-height: 100dvh` declaration after each.

#### P1-M3: `maximumScale: 1` blocks pinch-zoom
- **Files:** `app/layout.tsx:30`
- **Impact:** A11y violation — users with low vision cannot enlarge content.
- **Fix:** Remove unless required by a specific compliance need.

#### P1-M4: `max-width: 100vw` causes 1px overflow scroll on some viewports
- **Files:** `app/mobile-polish.css:5237, 5240, 5243`
- **Fix:** Replace `100vw` with `100%`.

#### P1-M5: Missing `-webkit-backdrop-filter` prefix
- **Files:** `app/mobile-polish.css:694, 4973, 5057`
- **Impact:** iOS Safari ≤15 doesn't blur the modal backdrop.
- **Fix:** Add the prefixed property next to each `backdrop-filter`.

### A11y

#### P1-A1: Many `<button>` elements missing `type="button"`
- **Files:** `app/components/FluxMobileApp.tsx:1088, 1133, 1239, 1633, 1671, 1672, 1737, 1760, 1907, 1966, 2005, 2024, 2316, 2344, 1204, 1159`
- **Impact:** Inside AuthScreen `<form>`, an unintentional Enter keypress may submit the form.
- **Fix:** Add `type="button"` to every button that isn't an explicit form submit.

#### P1-A2: Nested `<button>` is invalid HTML
- **Files:** `app/components/FluxMobileApp.tsx:1133, 1144, 1239-1252, 1633-1652`
- **Impact:** Market row is a `<button>` containing a star toggle that's also a `<button>`. Browsers may ignore the inner button or focus oddly.
- **Fix:** Make the outer container a `<div role="button" tabIndex={0}>` with key handler, or restructure so the star is a sibling sharing the same parent.

#### P1-A3: `--text-muted: #687281` fails WCAG AA contrast on `--bg: #111820`
- **Files:** `app/mobile-polish.css:5214` (token), used in `.pc-period`, `.pc-axis`, `.equity-stat small`, etc.
- **Impact:** 4.2:1 contrast where 4.5:1 is required.
- **Fix:** Bump to `#7A8497` or darker bg.

#### P1-A4: Many inputs missing `aria-label` or label association
- **Files:** `app/components/FluxMobileApp.tsx:1601-1612, 1220, 2663, 1359, 781-782, 2978-2986, 2962-2972, 3207-3220`
- **Impact:** Screen readers announce inputs without context.
- **Fix:** Add `aria-label` to each search/textarea, and use `htmlFor` / `id` pairing on KYC select + legalName.

#### P1-A5: Toast missing `role="status"` / `aria-live`
- **Files:** `app/components/FluxMobileApp.tsx:594`
- **Impact:** Screen reader users miss success/error feedback after every form submit.
- **Fix:** Add `role="status" aria-live="polite"` to `.mobile-toast-wrap` (or `assertive` for `err` type).

#### P1-A6: Bottom nav missing `aria-current="page"` and nav label
- **Files:** `app/components/FluxMobileApp.tsx:980-985`
- **Impact:** Screen readers can't tell which tab is active.
- **Fix:** Add `aria-label="Primary"` to `<nav>`; `aria-current="page"` to active button.

#### P1-A7: Filter chips and Order tabs need `aria-pressed`
- **Files:** Markets filter row, Orders Open/History tabs, Period toggle
- **Fix:** Add `aria-pressed={isActive}` on each toggle-style button.

### React Performance

#### P1-R1: `openOrders` / `history` recomputed every render
- **Files:** `app/components/FluxMobileApp.tsx:259-263`
- **Impact:** O(n) filter producing new array refs each render → cascading re-renders in every list consumer.
- **Fix:** Wrap in `useMemo(() => orders.filter(...), [orders])`.

#### P1-R2: Inline arrow handlers in tab render
- **Files:** `app/components/FluxMobileApp.tsx:624-628`
- **Impact:** New `onSelect`, `onOpenRunningOrder`, etc. created each parent render. Tab children re-render.
- **Fix:** Wrap each handler in `useCallback` with stable deps.

#### P1-R3: TradeSheet inline `style={{ width: ringSize, ... }}` rebuilt every `now` tick
- **Files:** `app/components/FluxMobileApp.tsx:1425`
- **Fix:** Hoist constant style objects outside component, or `useMemo`.

#### P1-R4: HomeTab Favorites IIFE re-runs every render
- **Files:** `app/components/FluxMobileApp.tsx:1110-1157`
- **Fix:** Wrap in `useMemo([rows, favorites])`.

---

## 5. P2 — Can Fix Later

> Performance polish, dead code, CSS hygiene.

- **Dead code:**
  - `UserIdenticon`, `identiconPalette`, `hashSeed` — replaced by `VorxAccountAvatar` (FluxMobileApp.tsx:1837-1885)
  - `seenSettledIds` state — set but never read (FluxMobileApp.tsx:231, 268-271)
  - `Wallet` icon in `ICONS` map (line 994) — never referenced; can drop the lucide import
  - `TermsPage.onAgree?` prop — every caller renders without it
- **Stale prop types:**
  - `MobileHeader` types `tickers`, `support` but doesn't read them
  - `HomeTab` types `query`, `setQuery`, `sort`, `setSort`, `availableBalance` — all unused
  - `StackContent` types `logout` — unused
  - `StaticPage` types `settings` — unused
  - `AssetPicker` types `title` — unused
  - `AuthField` types `right?: ReactNode` — unused
- **CSS redefinition cleanup:**
  - `.mobile-bottom` redefined 7× (lines 1057, 1949, 2523, 3061, 3233, 5427)
  - `.portfolio-card` redefined 5× (lines 1839, 2130, 2382, 3133, 5266)
  - `.market-list` redefined 6×
  - `.mobile-shell` redefined 5×
- **Selectors targeting deleted JSX:**
  - `.indicator-strip`, `.chart-source` (621-650, 4758-4759)
  - `.brand-mark` (243-294, 303-322, 368-371, 803-805, 3277-3285)
  - `.profile-identicon`, `.pixel-identicon` (1079, 6923-6924, 7859-7867)
  - `.order-tabs`, `.order-list` (681-695, 1466-1467, 2593-2623)
  - `.logout-outline` (line 8054)
- **Hardcoded colors bypassing tokens:**
  - `#0a0a0a`, `#050505` panel backgrounds in lines 1446, 1676, 1703, 2181, 2564, 2859, 2921, 3952
  - Should use `var(--panel)` / `var(--bg)`
- **React perf medium:**
  - `applyPublicSettings` defined inline, captured stale by effects with `[]` deps
  - Sparkline points recomputed per list row each render
  - Swap quote fetch effect lacks AbortController
  - flip-button `setTimeout(350)` not cleared on unmount

---

## 6. P3 — Nice to Have

- **CSS hygiene:**
  - `mobile-polish.css` has 4238 `!important` declarations (~53% of rules). Consider scoping a `.theme-vorx` parent to eliminate most.
  - 50+ orphan classes from old design (`accordion`, `wallet-list`, `pair-menu`, `trade-ticket`, `direction-lock`, etc.) — full list in agent report.
  - Google Fonts `@import` at top of `styles.css` blocks first paint.
- **Type literals drift:**
  - `StackPage.about.title: "About" | "About VORX"` — both used; canonicalize.
- **Decorative SVGs should declare `aria-hidden="true"`:**
  - Many `ChevronRight`, `Star`, `Search`, `Bell` SVGs in buttons that already have text labels.
- **Trade direction arrows `↗`/`↘` and trophy/lost icons** in TradeSheet — wrap in `aria-hidden`.
- **Misc:**
  - `BootScreen` "Loading account" has no `aria-live`
  - Chat typing indicator dots have no SR text
  - Sec error and form errors need `role="alert"` and `aria-describedby` linkage

---

## 7. Remediation Batches

### Batch A — Data consistency & registration submission (~15 min)

**Goal:** Eliminate duplicate state stores and silent data loss.

**Tasks:**
- A1. Remove TradeTab's local `favorites` state; accept props from FluxMobileApp.
- A2. Decide: wire register form `nickname` + `invite` to API, or remove from UI. If wiring:
  - Update `register()` body to include both fields.
  - Update `app/api/auth/register/route.ts` to accept and persist.
  - Add DB columns if needed (migration via `lib/db.ts`).
- A3. Once A1 done, remove legacy `flux:fav-markets` localStorage key (optional one-time cleanup via a side-effect).

**Files touched:**
- `app/components/FluxMobileApp.tsx`
- `app/api/auth/register/route.ts` (if option A in A2)
- `lib/db.ts` (if schema change in A2)

**Risk points:**
- Existing users with data under `flux:fav-markets` will silently lose those favorites unless A3 includes a one-shot migration that merges into `vorx_market_favorites_v1`.
- Register API expansion needs CSRF + input validation per existing patterns.

**Backend required:** Yes if A2 wires fields.

**Validation:**
```bash
npm run lint
npm run build
# Manual: star BTC in Markets → open Trade pair selector → expect BTC starred.
# Manual: register with nickname → confirm in DB.
```

---

### Batch B — Mobile iOS / PWA / touch targets (~20 min)

**Goal:** Fix the worst iOS-specific UX issues that visibly break on real devices.

**Tasks:**
- B1. Bump all focusable input font-size to `16px` (P0-3 list of selectors).
- B2. Export `vorx-appicon-192.png` and `vorx-appicon-512.png`; update `app/manifest.ts`.
- B3. Replace `100vh` with `100dvh` in `app/styles.css` (4 occurrences). Reorder mobile-polish.css line 1233 so `dvh` is the fallback target.
- B4. Replace `max-width: 100vw` → `100%` (mobile-polish.css:5237, 5240, 5243).
- B5. Expand hit-area for `.sheet-close`, `.ml-star`, `.auth-input-eye` via padding + negative margin.
- B6. Remove `maximumScale: 1` from `app/layout.tsx` (or document why it's needed).
- B7. Add `-webkit-backdrop-filter` prefix in 3 places.

**Files touched:**
- `app/mobile-polish.css`
- `app/styles.css`
- `app/manifest.ts`
- `app/layout.tsx`
- `public/brand/` (new icon export)

**Risk points:**
- Bumping input font-size to 16px may visually enlarge some forms — verify desktop view doesn't look bloated.
- Removing `maximumScale` enables pinch-zoom; some interactive layouts may shift unexpectedly when zoomed.

**Backend required:** No.

**Validation:**
```bash
npm run lint
npm run build
# Manual: real iPhone /login → focus email → expect no zoom.
# Manual: Android Chrome → expect "Install VORX" prompt or menu option.
# Manual: pinch-zoom on any page → expect zoom works.
```

---

### Batch C — Accessibility baseline (~30 min)

**Goal:** Reach WCAG 2.1 AA basics — keyboard and screen-reader users can operate the app.

**Tasks:**
- C1. Add global `*:focus-visible` outline rule.
- C2. Add `role="dialog" aria-modal="true" aria-labelledby` + Esc handler + focus return on the 5 modals (TradeSheet, SwapSuccessModal, SecurityChangeSuccessModal, SwapAssetPicker, MarketSelector).
- C3. Add `type="button"` to every button that isn't a form submitter (~17 locations).
- C4. Fix nested `<button>` in market-line / Home favorites — convert outer to `div role="button"` or restructure.
- C5. Add `aria-label` to icon-only buttons (search inputs, eye toggles, chat textarea, KYC select).
- C6. Add `aria-current="page"` to active bottom-nav button; `aria-label` to `<nav>`.
- C7. Add `role="status" aria-live="polite"` to `.mobile-toast-wrap`.
- C8. Add `aria-pressed` to Markets filter chips, Order Open/History tabs, Period toggle.
- C9. Lighten `--text-muted` from `#687281` to `#7A8497` for AA contrast.
- C10. Add `aria-hidden="true"` to decorative SVGs adjacent to text labels.

**Files touched:**
- `app/components/FluxMobileApp.tsx`
- `app/mobile-polish.css`

**Risk points:**
- Adding focus-visible globally may surface places where the outline is visually awkward — be ready to scope-out specific elements.
- Restructuring nested `<button>` requires care to keep tap-target behavior identical.

**Backend required:** No.

**Validation:**
```bash
npm run lint
npm run build
# Manual: Tab through Home page → expect focus ring on every focusable.
# Manual: Open Swap → execute swap → expect VoiceOver announces "dialog Swap Successful".
# Manual: Press Esc on any modal → expect close.
# Tool: Lighthouse a11y audit on /login, /, /markets → expect score ≥ 90.
```

---

### Batch D — Security hardening (~20 min)

**Goal:** Close the rate-limit and gate gaps before exposing to the internet.

**Tasks:**
- D1. Add per-user rate limit to `POST /api/assets/swap`.
- D2. Gate `/api/assets/swap` on `settings.trading_enabled` and user-level `trading_enabled`.
- D3. Add rate limit to `/api/auth/register` (reuse `assertLoginAllowed` or build register-specific).
- D4. Require `currentPassword` (login) on `/api/auth/withdrawal-password` PATCH.
- D5. (Optional) Replace `error.message` passthrough in `swap/route.ts` with curated error codes.
- D6. (Optional) Verify `allowedOrigins` `127.0.0.1` only enabled in `NODE_ENV !== "production"`.

**Files touched:**
- `app/api/assets/swap/route.ts`
- `app/api/auth/register/route.ts`
- `app/api/auth/withdrawal-password/route.ts`
- `lib/login-rate-limit.ts` (extend) or new `lib/swap-rate-limit.ts`
- `lib/api.ts` (origin allowlist)

**Risk points:**
- Adding withdrawal-password login check is a UX change — existing flows that hit this endpoint must be updated to collect the login password.
- Rate limit thresholds need calibration; too tight blocks legit users.

**Backend required:** This entire batch is backend.

**Validation:**
```bash
npm run lint
npm run build
npm run test:regression
# Manual: spam POST /api/assets/swap → expect 429 after threshold.
# Manual: admin disables trading_enabled → user cannot swap.
# Manual: try changing withdrawal password without current password → expect 400.
```

---

### Batch E — Dead code, CSS, performance cleanup (~30 min)

**Goal:** Reduce noise so future audits surface real issues, not historical cruft.

**Tasks:**
- E1. Delete `UserIdenticon` + `identiconPalette` + `hashSeed` (FluxMobileApp.tsx:1837-1885). Update lucide-react import (drop `Wallet`).
- E2. Remove `seenSettledIds` state and related setters.
- E3. Drop unused props from component types (MobileHeader, HomeTab, StackContent, StaticPage, AssetPicker, AuthField).
- E4. Delete CSS selectors targeting deleted JSX (P2 list).
- E5. Consolidate the 3 `:root` blocks into one (carry over only VORX Soft Dark tokens).
- E6. Replace hardcoded `#0a0a0a` / `#050505` with `var(--bg)` / `var(--panel)`.
- E7. Consolidate `.mobile-bottom` (7×) → 1, `.portfolio-card` (5×) → 1, `.market-list` (6×) → 1, `.mobile-shell` (5×) → 1.
- E8. Wrap `openOrders` / `history` / Favorites filter / HomeTab quick-actions in `useMemo`.
- E9. Wrap parent tab-render handlers in `useCallback`.
- E10. Hoist TradeSheet ring constant styles outside component or `useMemo`.
- E11. Add AbortController to Swap quote fetch effect.
- E12. Track Toast and flip-button setTimeouts via `useRef` + cleanup on unmount.

**Files touched:**
- `app/components/FluxMobileApp.tsx`
- `app/mobile-polish.css`
- `app/styles.css`

**Risk points:**
- CSS consolidation is the riskiest — visual regression possible. Recommend doing one selector at a time and snapshotting before/after.
- React memoization in this large single-file component requires care to keep dep arrays correct.

**Backend required:** No.

**Validation:**
```bash
npm run lint
npm run build
# Manual: visual diff Home / Markets / Trade / Orders / Account / Swap / KYC / Login / Landing
#         against current screenshots — should be pixel-equivalent.
# DevTools: React Profiler on Markets list scroll → confirm fewer re-renders.
```

---

## 8. Recommended Execution Order

1. **Batch A** (data integrity — non-negotiable before any further user testing)
2. **Batch B** (iOS — affects 50%+ of mobile traffic)
3. **Batch D** (security — required before public launch)
4. **Batch C** (a11y — required for compliance, blocks keyboard/SR users)
5. **Batch E** (cleanup — quality of life, defer if time-constrained)

Batches A + B + D can be done in parallel by separate contributors; C and E depend on having those landed first.

---

## 9. Out of Scope (Not Audited Here)

- Admin panel (`/admin/*`) — still uses old FluxPerp Chinese UI and styles. Separate effort.
- Production deployment env-var configuration.
- Real device testing on iOS / Android (recommended before launch).
- Image performance — landing-bg.png (166KB) + vorx-main.png (391KB) etc. could shrink ~60% via WebP / AVIF + `next/image`.
- Notifications real implementation (Bell button currently shows a toast only).
- Today/30D Portfolio toggle wiring to historical data (currently decorative).

---

## 10. Sign-off Checklist (after applying P0 + P1)

- [ ] `npm run lint` clean
- [ ] `npm run build` clean
- [ ] `npm run test:regression` passes
- [ ] `npm run test:e2e` passes (if Playwright env set up)
- [ ] Real iPhone test: /login → focus email → no zoom
- [ ] Real Android test: Add to Home Screen prompt fires
- [ ] Tab through Home page: visible focus indicator everywhere
- [ ] Star a market in Markets → see in Trade pair selector + Home Favorites
- [ ] Register a user → all submitted fields visible in DB
- [ ] Swap rate-limited at expected threshold
- [ ] Lighthouse a11y score ≥ 90 on Landing, Login, Home

---

*End of plan. Generated by 6 parallel review agents; cross-referenced and prioritized. No code modified.*
