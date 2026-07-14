import crypto from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";

const appUrl = process.env.TEST_APP_URL || "http://127.0.0.1:3000";
const socketUrl = process.env.TEST_SOCKET_URL || "http://127.0.0.1:3001";
const socketSecret = process.env.SOCKET_INTERNAL_SECRET || process.env.REALTIME_INTERNAL_SECRET || "perp-sim-local-realtime-secret";
const defaultLocalDbPath = path.resolve(process.cwd(), "data", "perp-lab.sqlite");
const configuredDbPath = process.env.PERP_SIM_DB_PATH?.trim();
const legacyTestDbPath = process.env.TEST_DB_PATH?.trim();
const allowDefaultDb = process.env.PERP_SIM_ALLOW_DEFAULT_DB_FOR_TESTS === "true";
const testPassword = "RegressionPass123!";
const testWithdrawalPassword = "WithdrawalPass123!";
const testEmail = `regression-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
const adminPassword = "AdminRegressionPass123!";
const adminEmail = `admin-regression-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

function normalizePathForCompare(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

if (configuredDbPath && legacyTestDbPath && normalizePathForCompare(configuredDbPath) !== normalizePathForCompare(legacyTestDbPath)) {
  throw new Error("PERP_SIM_DB_PATH and TEST_DB_PATH point to different files. Use PERP_SIM_DB_PATH for both app and regression tests.");
}

if (!configuredDbPath && legacyTestDbPath) {
  console.warn("TEST_DB_PATH is deprecated for regression tests; use PERP_SIM_DB_PATH so the app and tests share one DB setting.");
}

const dbPath = path.resolve(configuredDbPath || legacyTestDbPath || defaultLocalDbPath);

if (normalizePathForCompare(dbPath) === normalizePathForCompare(defaultLocalDbPath) && !allowDefaultDb) {
  throw new Error(
    `Refusing to run regression tests against the default local app database at ${defaultLocalDbPath}. ` +
      "Set PERP_SIM_DB_PATH to a disposable test database, or set PERP_SIM_ALLOW_DEFAULT_DB_FOR_TESTS=true if this mutation is intentional."
  );
}

let cookieHeader = "";
let testUserId = 0;
let testAdminId = 0;
let registeredUserId = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function getDb() {
  assert(existsSync(dbPath), `Database not found at ${dbPath}. Start the Next dev server first.`);
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return db;
}

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function createPublicUid(db) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const uid = String(crypto.randomInt(100000, 1000000));
    if (!db.prepare("SELECT 1 FROM users WHERE public_uid = ?").get(uid)) return uid;
  }
  throw new Error("Unable to allocate test public UID");
}

function ensurePublicUidSchema(db) {
  if (!columnExists(db, "users", "public_uid")) db.exec("ALTER TABLE users ADD COLUMN public_uid TEXT");
  const missing = db.prepare("SELECT id FROM users WHERE public_uid IS NULL OR trim(public_uid) = ''").all();
  const update = db.prepare("UPDATE users SET public_uid = ? WHERE id = ?");
  for (const row of missing) update.run(createPublicUid(db), row.id);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_uid ON users(public_uid) WHERE public_uid IS NOT NULL;");
}

function createTestUser() {
  const db = getDb();
  try {
    ensurePublicUidSchema(db);
    const result = db
      .prepare("INSERT INTO users (public_uid, username, email, password_hash, withdrawal_password_hash, role, balance) VALUES (?, ?, ?, ?, ?, 'trader', ?)")
      .run(createPublicUid(db), testEmail, testEmail, hashPassword(testPassword), hashPassword(testWithdrawalPassword), 20);
    const userId = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO user_assets (user_id, asset, balance, locked) VALUES (?, 'USDC', 20, 0)").run(userId);
    return userId;
  } finally {
    db.close();
  }
}

function createTestAdmin() {
  const db = getDb();
  try {
    ensurePublicUidSchema(db);
    const result = db
      .prepare("INSERT INTO users (public_uid, username, email, password_hash, withdrawal_password_hash, role, balance) VALUES (?, ?, ?, ?, ?, 'admin', ?)")
      .run(createPublicUid(db), adminEmail, adminEmail, hashPassword(adminPassword), hashPassword(adminPassword), 0);
    return Number(result.lastInsertRowid);
  } finally {
    db.close();
  }
}

function cleanupTestUser() {
  if (!testUserId && !testAdminId && !registeredUserId) return;
  const db = getDb();
  try {
    const ids = [testUserId, testAdminId, registeredUserId].filter(Boolean);
    for (const id of ids) {
      for (const table of ["sessions", "asset_transactions", "withdrawals", "deposits", "kyc_submissions", "binary_orders", "positions", "orders", "user_assets", "user_deposit_addresses"]) {
        try {
          db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id);
        } catch {}
      }
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
    }
    try {
      db
        .prepare(
          `DELETE FROM withdrawals
           WHERE address LIKE 'TRegressionAddress%'
              OR user_id IN (SELECT id FROM users WHERE lower(COALESCE(email, username, '')) LIKE 'regression-%@example.test')`
        )
        .run();
    } catch {}
    try {
      db.prepare("DELETE FROM login_attempts").run();
    } catch {}
  } finally {
    db.close();
  }
}

function resetLoginAttempts() {
  const db = getDb();
  try {
    try {
      db.prepare("DELETE FROM login_attempts").run();
    } catch {}
  } finally {
    db.close();
  }
}

function userCounts() {
  const db = getDb();
  try {
    return {
      binaryOrders: Number(db.prepare("SELECT COUNT(*) AS count FROM binary_orders WHERE user_id = ?").get(testUserId).count),
      withdrawals: Number(db.prepare("SELECT COUNT(*) AS count FROM withdrawals WHERE user_id = ?").get(testUserId).count),
      ledger: Number(db.prepare("SELECT COUNT(*) AS count FROM asset_transactions WHERE user_id = ?").get(testUserId).count)
    };
  } finally {
    db.close();
  }
}

function marketSymbols() {
  const db = getDb();
  try {
    return db.prepare("SELECT symbol FROM markets ORDER BY symbol").all().map((row) => row.symbol);
  } finally {
    db.close();
  }
}

function rememberCookies(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return;
  const cookie = setCookie.split(";")[0];
  cookieHeader = cookieHeader ? `${cookieHeader}; ${cookie}` : cookie;
}

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const method = String(options.method || "GET").toUpperCase();
  const target = new URL(String(url));
  const appOrigin = new URL(appUrl).origin;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && target.origin === appOrigin && !headers.Origin && !headers.origin) {
    headers.Origin = appOrigin;
  }
  if (cookieHeader) headers.Cookie = cookieHeader;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(url, { ...options, headers });
  rememberCookies(response);
  return response;
}

async function expectStatus(label, responsePromise, expectedStatus) {
  const response = await responsePromise;
  const body = await response.text();
  assert(response.status === expectedStatus, `${label}: expected ${expectedStatus}, got ${response.status}. Body: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  const results = [];
  // Trigger the formal application bootstrap/migrations before direct DB access.
  await fetch(new URL("/api/auth/register", appUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  resetLoginAttempts();
  testUserId = createTestUser();
  testAdminId = createTestAdmin();

  try {
    await expectStatus("settings unauthenticated", request(new URL("/api/settings", appUrl)), 401);
    results.push("settings: unauthenticated 401");

    const originalCookieHeader = cookieHeader;
    const registrationEmail = `new-user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    cookieHeader = "";
    await expectStatus(
      "register without signup bonus",
      request(new URL("/api/auth/register", appUrl), {
        method: "POST",
        body: JSON.stringify({
          identifierType: "email",
          email: registrationEmail,
          phone: "",
          password: testPassword,
          confirmPassword: testPassword,
          withdrawalPassword: testWithdrawalPassword,
          confirmWithdrawalPassword: testWithdrawalPassword
        })
      }),
      200
    );
    const registeredDb = getDb();
    try {
      const registered = registeredDb
        .prepare(
          `SELECT u.id, u.balance, COALESCE(a.balance, -1) AS asset_balance,
                  (SELECT COUNT(*) FROM asset_transactions WHERE user_id = u.id AND type = 'signup_bonus') AS bonus_rows
           FROM users u
           LEFT JOIN user_assets a ON a.user_id = u.id AND a.asset = 'USDC'
           WHERE lower(u.email) = ?`
        )
        .get(registrationEmail);
      assert(registered, "registered user was not created");
      registeredUserId = Number(registered.id);
      assert(Number(registered.balance) === 0, `registered user legacy balance should be 0: ${JSON.stringify(registered)}`);
      assert(Number(registered.asset_balance) === 0, `registered user USDC balance should be 0: ${JSON.stringify(registered)}`);
      assert(Number(registered.bonus_rows) === 0, `register should not create signup bonus ledger: ${JSON.stringify(registered)}`);
    } finally {
      registeredDb.close();
    }
    cookieHeader = originalCookieHeader;
    results.push("registration: no signup bonus or starting funds");

    await expectStatus(
      "socket emit without secret",
      request(new URL("/internal/emit", socketUrl), {
        method: "POST",
        body: JSON.stringify({ event: "settings:update" })
      }),
      401
    );
    results.push("socket emit without secret: 401");

    await expectStatus(
      "socket emit with secret",
      request(new URL("/internal/emit", socketUrl), {
        method: "POST",
        headers: { "x-realtime-secret": socketSecret },
        body: JSON.stringify({ event: "settings:update" })
      }),
      200
    );
    results.push("socket emit with secret: 200");

    await expectStatus(
      "login",
      request(new URL("/api/auth/login", appUrl), {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: testPassword })
      }),
      200
    );
    results.push("login: 200");

    const settingsPayload = await expectStatus("settings after login", request(new URL("/api/settings", appUrl)), 200);
    for (const key of ["about_content", "terms_content", "privacy_content"]) {
      assert(typeof settingsPayload?.settings?.[key] === "string", `settings: missing ${key}`);
    }
    results.push("settings: authenticated 200");

    const me = await expectStatus("me", request(new URL("/api/me", appUrl)), 200);
    assert(me?.user?.id === testUserId, `me: expected test user ${testUserId}, got ${me?.user?.id}`);
    results.push("me: test user session");

    await expectStatus(
      "csrf blocks cross-site mutation",
      request(new URL("/api/auth/password", appUrl), {
        method: "PATCH",
        headers: { Origin: "https://evil.example" },
        body: JSON.stringify({ currentPassword: "wrong", newPassword: testPassword, confirmPassword: testPassword })
      }),
      403
    );
    results.push("csrf cross-site mutation: 403");

    await expectStatus(
      "admin login in same browser",
      request(new URL("/api/auth/admin-login", appUrl), {
        method: "POST",
        body: JSON.stringify({ email: adminEmail, password: adminPassword })
      }),
      200
    );
    const meAfterAdminLogin = await expectStatus("me after admin login", request(new URL("/api/me", appUrl)), 200);
    assert(meAfterAdminLogin?.user?.id === testUserId, `user session was replaced by admin login: got ${meAfterAdminLogin?.user?.id}`);
    await expectStatus("admin summary after split session", request(new URL("/api/admin/summary", appUrl)), 200);
    results.push("split user/admin sessions: stable");

    const publicNoteDb = getDb();
    try {
      publicNoteDb
        .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, status, note) VALUES (?, 'USDC', 'admin_adjust', 1, 'completed', ?)")
        .run(testUserId, "admin processed adjustment");
    } finally {
      publicNoteDb.close();
    }
    const assetPayload = await expectStatus("assets", request(new URL("/api/assets", appUrl)), 200);
    const assetNames = new Set((assetPayload.assets || []).map((row) => row.asset));
    const depositAssetNames = new Set((assetPayload.depositAddresses || []).map((row) => row.asset));
    for (const asset of ["USDC", "BTC", "ETH", "SOL"]) {
      assert(assetNames.has(asset), `assets: missing ${asset} asset row`);
      assert(depositAssetNames.has(asset), `assets: missing ${asset} deposit address`);
    }
    const publicAdjustment = (assetPayload.transactions || []).find((row) => row.type === "system_adjustment");
    assert(publicAdjustment?.note === "System processed", `assets: internal note was not sanitized: ${JSON.stringify(publicAdjustment)}`);
    assert(!(assetPayload.transactions || []).some((row) => row.type === "admin_adjust" || /admin|administrator/i.test(String(row.note || ""))), `assets: internal funding terms leaked: ${JSON.stringify(assetPayload.transactions)}`);
    results.push("assets: funding records use public system wording");
    assert(!assetNames.has("USDT") && !depositAssetNames.has("USDT"), "assets: USDT should not be exposed");
    assert(!depositAssetNames.has("BNB"), "assets: BNB should not be exposed in public wallet assets");
    results.push("assets: USDC/BTC/ETH/SOL exposed without USDT");

    await expectStatus(
      "wrong login password change",
      request(new URL("/api/auth/password", appUrl), {
        method: "PATCH",
        body: JSON.stringify({ currentPassword: "wrong", newPassword: testPassword, confirmPassword: testPassword })
      }),
      400
    );
    results.push("wrong login password change: 400");

    await expectStatus(
      "wrong withdrawal password change",
      request(new URL("/api/auth/withdrawal-password", appUrl), {
        method: "PATCH",
        body: JSON.stringify({
          currentWithdrawalPassword: "wrong",
          newWithdrawalPassword: testWithdrawalPassword,
          confirmWithdrawalPassword: testWithdrawalPassword
        })
      }),
      400
    );
    results.push("wrong withdrawal password change: 400");

    const before = userCounts();

    await expectStatus(
      "oversized withdrawal",
      request(new URL("/api/assets/withdraw", appUrl), {
        method: "POST",
        body: JSON.stringify({
          asset: "USDC",
          network: "TRC20",
          amount: 999_999_999,
          address: "TRegressionAddress000000000000000000",
          withdrawalPassword: testWithdrawalPassword
        })
      }),
      400
    );
    results.push("oversized withdrawal: 400");

    const firstMarket = getDb().prepare("SELECT id FROM markets ORDER BY id LIMIT 1").get();
    assert(firstMarket?.id, "No market found for binary-order regression");
    await expectStatus(
      "insufficient binary order",
      request(new URL("/api/binary-orders", appUrl), {
        method: "POST",
        body: JSON.stringify({ marketId: firstMarket.id, direction: "call", stake: 5000, durationSeconds: 30, entryPrice: 1 })
      }),
      400
    );
    results.push("insufficient binary order: 400");

    const after = userCounts();
    assert(after.binaryOrders === before.binaryOrders, "Failed binary order created a binary_orders row");
    assert(after.withdrawals === before.withdrawals, "Failed withdrawal created a withdrawals row");
    assert(after.ledger === before.ledger, "Failed financial operation created an asset_transactions row");
    results.push("failed financial operations: no DB side effects");

    const manualOrder = await expectStatus(
      "manual-settlement binary order",
      request(new URL("/api/binary-orders", appUrl), {
        method: "POST",
        body: JSON.stringify({ marketId: firstMarket.id, direction: "call", stake: 10, durationSeconds: 300, entryPrice: 1 })
      }),
      200
    );
    await expectStatus(
      "early manual preset",
      request(new URL("/api/admin/orders", appUrl), {
        method: "PATCH",
        body: JSON.stringify({ orderId: manualOrder.orderId, result: "won", settlePrice: 1, note: "Regression preset win" })
      }),
      200
    );
    const presetDb = getDb();
    try {
      const preset = presetDb.prepare("SELECT status, manual_result, profit FROM binary_orders WHERE id = ?").get(manualOrder.orderId);
      assert(preset?.status === "open", `Preset result closed order before expiry: ${JSON.stringify(preset)}`);
      assert(preset.manual_result === "won", `Preset result was not stored: ${JSON.stringify(preset)}`);
      assert(preset.profit == null, `Preset result wrote profit before expiry: ${JSON.stringify(preset)}`);
    } finally {
      presetDb.close();
    }
    const preManualSummary = await expectStatus("summary before preset expiry", request(new URL("/api/trade/summary", appUrl)), 200);
    const pendingManualOrder = (preManualSummary.orders || []).find((order) => order.id === manualOrder.orderId);
    assert(pendingManualOrder?.status === "open", `Preset order closed before expiry in summary: ${JSON.stringify(pendingManualOrder)}`);
    assert(pendingManualOrder?.profit == null, `Preset order exposed profit before expiry: ${JSON.stringify(pendingManualOrder)}`);
    const expiryDb = getDb();
    try {
      expiryDb.prepare("UPDATE binary_orders SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), manualOrder.orderId);
    } finally {
      expiryDb.close();
    }
    const passivePostExpirySummary = await expectStatus("summary after preset expiry before explicit settlement", request(new URL("/api/trade/summary", appUrl)), 200);
    const stillPendingManualOrder = (passivePostExpirySummary.orders || []).find((order) => order.id === manualOrder.orderId);
    assert(stillPendingManualOrder?.status === "open", `GET summary settled expired order: ${JSON.stringify(stillPendingManualOrder)}`);
    const expiredSettlement = await expectStatus(
      "explicit expired settlement",
      request(new URL("/api/binary-orders/settle-expired", appUrl), { method: "POST" }),
      200
    );
    assert(Number(expiredSettlement?.settled) >= 1, `Explicit settlement did not settle preset order: ${JSON.stringify(expiredSettlement)}`);
    const postExpirySummary = await expectStatus("summary after explicit preset settlement", request(new URL("/api/trade/summary", appUrl)), 200);
    const completedManualOrder = (postExpirySummary.orders || []).find((order) => order.id === manualOrder.orderId);
    assert(completedManualOrder?.status === "won", `Preset order did not settle as won after expiry: ${JSON.stringify(completedManualOrder)}`);
    assert(Math.abs(Number(completedManualOrder.profit) - Number(manualOrder.winProfitRate) * 10) < 0.000001, `Preset order profit mismatch after expiry: ${JSON.stringify(completedManualOrder)}`);
    const settlementDb = getDb();
    try {
      const settled = settlementDb.prepare("SELECT status, manual_result, profit FROM binary_orders WHERE id = ?").get(manualOrder.orderId);
      assert(settled?.status === "won", `Manual settlement did not mark order won: ${JSON.stringify(settled)}`);
      assert(settled.manual_result === "won", `Manual preset result was not retained: ${JSON.stringify(settled)}`);
      assert(Math.abs(Number(settled.profit) - Number(manualOrder.winProfitRate) * 10) < 0.000001, `Manual settlement profit mismatch: ${JSON.stringify(settled)}`);
    } finally {
      settlementDb.close();
    }
    results.push("manual binary preset: waits until expiry and settles via POST");

    const marketBalanceDb = getDb();
    let marketBalanceBefore;
    try {
      marketBalanceBefore = marketBalanceDb.prepare("SELECT balance, locked FROM user_assets WHERE user_id = ? AND asset = 'USDC'").get(testUserId);
    } finally {
      marketBalanceDb.close();
    }
    const marketOrder = await expectStatus(
      "market-settlement binary order",
      request(new URL("/api/binary-orders", appUrl), {
        method: "POST",
        body: JSON.stringify({ marketId: firstMarket.id, direction: "call", stake: 10, durationSeconds: 300, entryPrice: 1 })
      }),
      200
    );
    const marketExpiryDb = getDb();
    try {
      marketExpiryDb.prepare("UPDATE binary_orders SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), marketOrder.orderId);
    } finally {
      marketExpiryDb.close();
    }
    const marketSettlement = await expectStatus(
      "explicit market fallback settlement",
      request(new URL("/api/binary-orders/settle-expired", appUrl), { method: "POST" }),
      200
    );
    assert(Number(marketSettlement?.settled) >= 1, `Market fallback did not settle expired order: ${JSON.stringify(marketSettlement)}`);
    const marketDb = getDb();
    try {
      const settled = marketDb.prepare("SELECT status, manual_result, stake, odds, risk_amount, win_profit_rate, loss_rate, draw_refund_rate, entry_price, settle_price, profit, created_at, expires_at FROM binary_orders WHERE id = ?").get(marketOrder.orderId);
      assert(["won", "lost", "draw"].includes(settled?.status), `Market fallback did not close order: ${JSON.stringify(settled)}`);
      assert(settled.manual_result == null, `Market fallback should not write manual_result: ${JSON.stringify(settled)}`);
      assert(Number(settled.settle_price) > 0, `Market fallback did not use a valid market price: ${JSON.stringify(settled)}`);
      const expectedProfit = settled.status === "won"
        ? Number(settled.stake) * Number(settled.win_profit_rate ?? settled.odds)
        : settled.status === "draw"
          ? Number(settled.risk_amount) * Number(settled.draw_refund_rate ?? 1) - Number(settled.risk_amount)
          : -Number(settled.risk_amount);
      assert(Math.abs(Number(settled.profit) - expectedProfit) < 0.000001, `Market fallback profit mismatch: ${JSON.stringify(settled)}`);
      const balances = marketDb.prepare("SELECT balance, locked FROM user_assets WHERE user_id = ? AND asset = 'USDC'").get(testUserId);
      assert(Math.abs(Number(balances.locked) - Number(marketBalanceBefore.locked)) < 0.000001, `Market fallback did not release locked balance: ${JSON.stringify({ before: marketBalanceBefore, after: balances, settled })}`);
      assert(Math.abs(Number(balances.balance) - (Number(marketBalanceBefore.balance) + expectedProfit)) < 0.000001, `Market fallback balance mismatch: ${JSON.stringify({ before: marketBalanceBefore, after: balances, settled, expectedProfit })}`);
    } finally {
      marketDb.close();
    }
    results.push("expired binary without admin preset: follows market");

    await expectStatus(
      "USDC withdrawal",
      request(new URL("/api/assets/withdraw", appUrl), {
        method: "POST",
        body: JSON.stringify({
          asset: "USDC",
          network: "TRC20",
          amount: 15,
          address: "TRegressionAddress000000000000000000",
          withdrawalPassword: testWithdrawalPassword
        })
      }),
      200
    );
    const splitDb = getDb();
    const splitRows = splitDb
      .prepare("SELECT asset, balance, locked FROM user_assets WHERE user_id = ? ORDER BY asset")
      .all(testUserId);
    splitDb.close();
    const usdcRow = splitRows.find((row) => row.asset === "USDC");
    assert(!splitRows.some((row) => row.asset === "USDT"), `Expected no USDT asset rows, got ${JSON.stringify(splitRows)}`);
    assert(usdcRow?.locked === 15, `Expected 15 USDC locked after withdrawal, got ${JSON.stringify(splitRows)}`);
    results.push("USDC withdrawal: 200");

    const start = performance.now();
    await expectStatus("market ticker", request(new URL("/api/market-data/ticker?symbol=BTC-PERP", appUrl)), 200);
    const elapsed = Math.round(performance.now() - start);
    assert(elapsed < 5_000, `market ticker took ${elapsed}ms`);
    results.push(`market ticker: 200 in ${elapsed}ms`);

    const symbols = marketSymbols();
    const requiredMarkets = ["BTC-PERP", "ETH-PERP", "SOL-PERP", "BNB-PERP", "XRP-PERP", "ADA-PERP", "DOGE-PERP", "AVAX-PERP", "LINK-PERP", "DOT-PERP", "TRX-PERP", "LTC-PERP", "BCH-PERP", "NEAR-PERP", "UNI-PERP"];
    assert(symbols.length >= requiredMarkets.length, `Expected at least ${requiredMarkets.length} markets, got ${symbols.length}: ${symbols.join(", ")}`);
    for (const symbol of requiredMarkets) {
      assert(symbols.includes(symbol), `Missing seeded market ${symbol}`);
    }
    const tickCountBeforeDb = getDb();
    const priceTicksBefore = Number(tickCountBeforeDb.prepare("SELECT COUNT(*) AS count FROM price_ticks").get().count);
    tickCountBeforeDb.close();
    const tickerPayload = await expectStatus("market tickers", request(new URL("/api/market-data/tickers", appUrl)), 200);
    for (const symbol of ["BTC-PERP", "BNB-PERP", "XRP-PERP", "UNI-PERP"]) {
      assert(tickerPayload?.tickers?.[symbol], `market tickers: missing ${symbol}`);
    }
    const tickCountAfterDb = getDb();
    const priceTicksAfter = Number(tickCountAfterDb.prepare("SELECT COUNT(*) AS count FROM price_ticks").get().count);
    tickCountAfterDb.close();
    assert(priceTicksAfter === priceTicksBefore, `market tickers GET should be read-only, ticks before=${priceTicksBefore} after=${priceTicksAfter}`);
    const tickerRows = Object.values(tickerPayload.tickers || {});
    if (tickerRows.length && tickerRows.every((row) => row.source === "local-fallback")) {
      assert(tickerRows.some((row) => Number(row.change) > 0), "local fallback tickers should include gainers");
      assert(tickerRows.some((row) => Number(row.change) < 0), "local fallback tickers should include losers");
    }
    results.push("market tickers: read-only cache response");
    results.push(`markets seeded: ${symbols.length} including 15 mainstream pairs`);

    const lockoutEmail = `lockout-${Date.now()}@example.test`;
    for (let i = 0; i < 5; i += 1) {
      await expectStatus(
        `login lockout failure ${i + 1}`,
        request(new URL("/api/auth/login", appUrl), {
          method: "POST",
          body: JSON.stringify({ email: lockoutEmail, password: "wrong-password" })
        }),
        400
      );
    }
    await expectStatus(
      "login lockout blocks repeated attempts",
      request(new URL("/api/auth/login", appUrl), {
        method: "POST",
        body: JSON.stringify({ email: lockoutEmail, password: "wrong-password" })
      }),
      429
    );
    results.push("login lockout after repeated failures: 429");

    console.log(["Regression smoke passed", ...results.map((item) => `- ${item}`)].join("\n"));
  } finally {
    cleanupTestUser();
  }
}

main().catch((error) => {
  cleanupTestUser();
  console.error(error);
  process.exit(1);
});
