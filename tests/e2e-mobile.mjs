import crypto from "node:crypto";
import { accessSync, constants, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";

const appUrl = process.env.TEST_APP_URL || "http://127.0.0.1:3000";
const dbPath = process.env.TEST_DB_PATH || path.join(process.cwd(), "data", "perp-lab.sqlite");
const artifactDir = process.env.TEST_ARTIFACT_DIR || path.join(process.cwd(), "test-artifacts", "e2e");
function findBrowserExecutable() {
  const candidates = [process.env.CHROME_BIN, "chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge", "msedge"].filter(Boolean);
  const bundled = ["/home/hermes/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome", "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome"];
  for (const candidate of candidates) {
    try { return candidate.startsWith("/") ? (accessSync(candidate, constants.X_OK), candidate) : execFileSync("sh", ["-lc", `command -v ${candidate}`], { encoding: "utf8" }).trim(); } catch {}
  }
  for (const candidate of bundled) {
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  return null;
}
const testPassword = "E2ePass123!";
const testWithdrawalPassword = "E2eWithdraw123!";
let activeLoginPassword = testPassword;
const testEmail = `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

let testUserId = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function getDb() {
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
      .run(createPublicUid(db), testEmail, testEmail, hashPassword(testPassword), hashPassword(testWithdrawalPassword), 100);
    const userId = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO user_assets (user_id, asset, balance, locked) VALUES (?, 'USDC', 100, 0)").run(userId);
    db
      .prepare("INSERT INTO asset_networks (asset, code, name, icon, deposit_enabled, withdraw_enabled, deposit_fee, withdraw_fee, min_deposit, min_withdraw, is_active, updated_at) VALUES ('USDC', 'BEP20', 'BNB Chain', 'bnb', 1, 1, 0, 1, 0, 15, 1, CURRENT_TIMESTAMP) ON CONFLICT(asset, code) DO UPDATE SET name=excluded.name, icon=excluded.icon, deposit_enabled=excluded.deposit_enabled, withdraw_enabled=excluded.withdraw_enabled, min_withdraw=excluded.min_withdraw, is_active=excluded.is_active, updated_at=CURRENT_TIMESTAMP")
      .run();
    db
      .prepare("INSERT INTO deposits (user_id, asset, network, amount, tx_hash, status, admin_note) VALUES (?, 'USDC', 'TRC20', 12, '0xE2EAdminNoteDeposit', 'approved', ?)")
      .run(userId, "后台通过");
    db
      .prepare("INSERT INTO withdrawals (user_id, asset, amount, address, network, status, note) VALUES (?, 'USDC', 7, 'TWithdrawE2EAddress', 'TRC20', 'approved', ?)")
      .run(userId, "后台通过");
    db
      .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, status, note) VALUES (?, 'USDC', 'deposit', 12, 'completed', ?)")
      .run(userId, "后台通过");
    return userId;
  } finally {
    db.close();
  }
}

function cleanupTestUser() {
  if (!testUserId) return;
  const db = getDb();
  try {
    for (const table of ["sessions", "asset_transactions", "withdrawals", "deposits", "kyc_submissions", "binary_orders", "positions", "orders", "user_assets", "user_deposit_addresses"]) {
      try {
        db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(testUserId);
      } catch {}
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
    try {
      db
        .prepare(
          `DELETE FROM withdrawals
           WHERE address LIKE 'TWithdrawE2EAddress%'
              OR user_id IN (SELECT id FROM users WHERE lower(COALESCE(email, username, '')) LIKE 'e2e-%@example.test')`
        )
        .run();
    } catch {}
  } finally {
    db.close();
  }
}

async function main() {
  mkdirSync(artifactDir, { recursive: true });
  testUserId = createTestUser();
  let browser;

  try {
    const executablePath = findBrowserExecutable();
    if (!executablePath) throw new Error("No Chromium-compatible browser found. Set CHROME_BIN or install a supported browser.");
    console.log(`Using browser: ${executablePath}`);
    browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const viewportWidth = Number(process.env.TEST_VIEWPORT_WIDTH || 390);
    const viewportHeight = Number(process.env.TEST_VIEWPORT_HEIGHT || (viewportWidth >= 800 ? 900 : 844));
    const context = await browser.newContext({ viewport: { width: viewportWidth, height: viewportHeight }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(new URL("/login", appUrl).toString(), { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(artifactDir, "login-empty.png"), fullPage: true });
    assert(!(await page.locator("#auth-email").inputValue()), "Login email field is prefilled");
    assert(!(await page.locator("#auth-password").inputValue()), "Login password field is prefilled");

    await page.goto(new URL("/admin/login", appUrl).toString(), { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(artifactDir, "admin-login-empty.png"), fullPage: true });
    const adminPrefilled = await page.locator("input").evaluateAll((inputs) => inputs.some((input) => input.value));
    assert(!adminPrefilled, "Admin login form is prefilled");

    await page.goto(new URL("/login", appUrl).toString(), { waitUntil: "networkidle" });
    await page.locator("#auth-email").fill(testEmail);
    await page.locator("#auth-password").fill(testPassword);
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForURL(/markets|trade|assets|profile/, { timeout: 15_000 });

    const navigationEntryCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
    await page.locator('.mobile-bottom button[aria-label="Home"]').waitFor({ timeout: 15_000 });
    await page.locator('.mobile-bottom button[aria-label="Home"]').click();
    await page.getByRole("button", { name: "View assets" }).click();
    await page.locator(".assets-screen").waitFor({ timeout: 10_000 });
    const afterTabNavigationEntryCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
    assert(afterTabNavigationEntryCount === navigationEntryCount, "Bottom tab switch caused a document navigation");
    for (const asset of ["USDC", "BTC", "ETH", "SOL"]) {
      await page.getByText(asset, { exact: true }).first().waitFor({ timeout: 10_000 });
    }
    assert(await page.getByText("USDT", { exact: true }).count() === 0, "Assets page should not show USDT");
    await page.screenshot({ path: path.join(artifactDir, "assets-overview.png"), fullPage: true });
    await page.getByTestId("activity-deposit").click();
    await page.getByTestId("record-list-deposits").waitFor({ timeout: 10_000 });
    assert(await page.getByText("后台通过").count() === 0, "Deposit history should not show admin approval notes");
    await page.screenshot({ path: path.join(artifactDir, "assets-history.png"), fullPage: true });
    await page.locator(".mobile-header button").first().click();
    await page.getByTestId("activity-withdraw").click();
    await page.getByTestId("record-list-withdrawals").waitFor({ timeout: 10_000 });
    assert(await page.getByText("后台通过").count() === 0, "Withdraw history should not show admin approval notes");
    await page.locator(".record-button").first().click();
    await page.getByText("Withdrawal Details").waitFor({ timeout: 10_000 });
    await page.getByText(/Request ID/i).waitFor({ timeout: 10_000 });
    await page.locator(".mobile-header button").first().click();
    await page.locator(".mobile-header button").first().click();
    await page.getByTestId("assets-view-all").click();
    await page.getByTestId("record-list-transactions").waitFor({ timeout: 10_000 });
    assert(await page.getByText("后台通过").count() === 0, "Funding records should not show admin approval notes");
    await page.getByText("System processed").first().waitFor({ timeout: 10_000 });
    await page.locator(".mobile-header button").first().click();

    await page.getByText("Withdraw", { exact: true }).click();
    await page.getByRole("button", { name: /USDC/i }).first().click();
    await page.getByRole("button", { name: /BEP20/i }).first().click();
    await page.locator('input[placeholder="Enter USDC address"]').fill("TWithdrawDetailE2EAddress000000000");
    await page.locator('input[type="password"]').fill(testWithdrawalPassword);
    const withdrawalAmount = page.getByRole("spinbutton", { name: "Amount (USDC)" });
    const withdrawalSubmit = page.getByRole("button", { name: /^Withdraw$/ });
    await withdrawalAmount.fill("");
    assert(await withdrawalSubmit.isDisabled(), "Empty withdrawal amount should disable submit");
    await page.getByText("Withdrawal amount is required").waitFor({ timeout: 10_000 });
    await withdrawalAmount.fill("0");
    assert(await withdrawalSubmit.isDisabled(), "Zero withdrawal amount should disable submit");
    await page.getByText("Withdrawal amount must be greater than 0").waitFor({ timeout: 10_000 });
    await withdrawalAmount.fill("-1");
    assert(await withdrawalSubmit.isDisabled(), "Negative withdrawal amount should disable submit");
    await withdrawalAmount.fill("14");
    assert(await withdrawalSubmit.isDisabled(), "Below-network-minimum withdrawal should disable submit");
    await page.getByText("Minimum withdrawal is 15.00 USDC").waitFor({ timeout: 10_000 });
    await withdrawalAmount.fill("101");
    assert(await withdrawalSubmit.isDisabled(), "Withdrawal above available balance should disable submit");
    await page.getByText("Withdrawal amount cannot exceed available balance").waitFor({ timeout: 10_000 });
    await withdrawalAmount.fill("15");
    assert(await withdrawalSubmit.isEnabled(), "Network-minimum withdrawal should enable submit");
    await withdrawalSubmit.click();
    await page.getByText("Withdrawal Details").waitFor({ timeout: 10_000 });
    await page.locator(".detail-status small").getByText("Submitted", { exact: true }).waitFor({ timeout: 10_000 });
    await page.getByText(/Request ID/i).waitFor({ timeout: 10_000 });
    await page.screenshot({ path: path.join(artifactDir, "withdrawal-detail.png"), fullPage: true });
    await page.locator(".mobile-header button").first().click();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: "View assets" }).click();
    await page.locator(".assets-screen").waitFor({ timeout: 10_000 });
    await page.getByTestId("activity-withdraw").click();
    await page.getByTestId("record-list-withdrawals").waitFor({ timeout: 10_000 });

    await page.goto(new URL("/profile", appUrl).toString(), { waitUntil: "networkidle" });
    await page.getByText(/UID\s*:?\s*\d{6}/).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: /Security/ }).click();
    if ((await page.getByRole("button", { name: /^Save Changes$/ }).count()) === 0) {
      await page.getByRole("button", { name: /Change Password/ }).click();
    }
    const loginSave = page.getByRole("button", { name: /^Save Changes$/ }).first();
    assert(await loginSave.isDisabled(), "Login password save should be disabled until required fields are filled");
    await page.locator('input[placeholder="Enter current password"]').fill("wrong");
    await page.locator('input[placeholder="At least 6 characters"]').fill(testPassword);
    await page.locator('input[placeholder="Re-enter new password"]').fill(testPassword);
    await page.getByRole("button", { name: /^Save Changes$/ }).first().click();
    await page.getByText("Invalid current password").waitFor({ timeout: 10_000 });
    await page.locator('input[placeholder="Enter current password"]').fill(activeLoginPassword);
    await page.locator('input[placeholder="At least 6 characters"]').fill("E2eNewPass123!");
    await page.locator('input[placeholder="Re-enter new password"]').fill("E2eNewPass123!");
    const loginSaveEnabled = page.getByRole("button", { name: /^Save Changes$/ }).first();
    assert(await loginSaveEnabled.isEnabled(), "Login password save should enable after valid fields are filled");
    await loginSaveEnabled.click();
    await page.getByText("Password changed successfully.").waitFor({ timeout: 10_000 });
    activeLoginPassword = "E2eNewPass123!";
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Withdrawal Password/ }).click();
    const withdrawalSave = page.getByRole("button", { name: /^Save Changes$/ }).first();
    assert(await withdrawalSave.isDisabled(), "Withdrawal password save should be disabled until required fields are filled");
    await page.locator('input[placeholder="Enter current withdrawal password"]').fill(testWithdrawalPassword);
    await page.locator('input[placeholder="Enter your login password to confirm"]').fill(activeLoginPassword);
    await page.locator('input[placeholder="At least 6 characters"]').fill("E2eNewWithdraw123!");
    await page.locator('input[placeholder="Re-enter new password"]').fill("E2eNewWithdraw123!");
    const withdrawalSaveEnabled = page.getByRole("button", { name: /^Save Changes$/ }).first();
    assert(await withdrawalSaveEnabled.isEnabled(), "Withdrawal password save should enable after valid fields are filled");
    await withdrawalSaveEnabled.click();
    await page.getByText("Withdrawal password updated successfully.").waitFor({ timeout: 10_000 });
    await page.screenshot({ path: path.join(artifactDir, "security-validation.png"), fullPage: true });

    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(" | ")}`);
    console.log(`E2E mobile smoke passed. Screenshots: ${artifactDir}`);
  } finally {
    if (browser) await browser.close();
    cleanupTestUser();
  }
}

main().catch((error) => {
  cleanupTestUser();
  console.error(error);
  process.exit(1);
});
