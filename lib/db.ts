import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { randomInt } from "node:crypto";
import path from "node:path";
import { hashPassword } from "./password";
import { networkConfigDefaults } from "./network-config";
import { defaultAssetConfigs } from "./asset-config";

let db: DatabaseSync | null = null;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

const sqliteBusyTimeoutMs = positiveInteger(process.env.PERP_SIM_SQLITE_BUSY_TIMEOUT_MS || process.env.SQLITE_BUSY_TIMEOUT_MS, 1000);

export function getConfiguredDbPath() {
  const configuredPath = process.env.PERP_SIM_DB_PATH?.trim();
  return configuredPath ? path.resolve(configuredPath) : path.join(process.cwd(), "data", "perp-lab.sqlite");
}

function columnExists(database: DatabaseSync, table: string, column: string) {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

function addColumn(database: DatabaseSync, table: string, column: string, definition: string) {
  if (!columnExists(database, table, column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureBinaryOrderOutcomeSchema(database: DatabaseSync) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'binary_orders'").get() as { sql?: string } | undefined;
  if (!row?.sql || row.sql.includes("'draw'")) return;
  database.exec("PRAGMA foreign_keys = OFF;");
  try {
    database.exec(`BEGIN; CREATE TABLE binary_orders_new (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, market_id INTEGER NOT NULL, symbol TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('call', 'put')), stake REAL NOT NULL, odds REAL NOT NULL, duration_seconds INTEGER NOT NULL, entry_price REAL NOT NULL, settle_price REAL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'won', 'lost', 'draw')), profit REAL, risk_amount REAL, manual_result TEXT CHECK(manual_result IN ('won', 'lost', 'draw') OR manual_result IS NULL), manual_settle_price REAL, manual_note TEXT, manual_result_set_at TEXT, expires_at TEXT NOT NULL, settled_at TEXT, note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, manual_set_by INTEGER, win_profit_rate REAL, loss_rate REAL, draw_refund_rate REAL, config_version INTEGER, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE); INSERT INTO binary_orders_new (id,user_id,market_id,symbol,direction,stake,odds,duration_seconds,entry_price,settle_price,status,profit,risk_amount,manual_result,manual_settle_price,manual_note,manual_result_set_at,expires_at,settled_at,note,created_at,manual_set_by,win_profit_rate,loss_rate,draw_refund_rate,config_version) SELECT id,user_id,market_id,symbol,direction,stake,odds,duration_seconds,entry_price,settle_price,status,profit,risk_amount,manual_result,manual_settle_price,manual_note,manual_result_set_at,expires_at,settled_at,note,created_at,manual_set_by,win_profit_rate,loss_rate,draw_refund_rate,config_version FROM binary_orders; DROP TABLE binary_orders; ALTER TABLE binary_orders_new RENAME TO binary_orders; COMMIT;`);
  } catch (error) {
    try { database.exec("ROLLBACK;"); } catch { /* preserve original error */ }
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }
}

function randomSixDigitUid() {
  return String(randomInt(100000, 1000000));
}

export function createPublicUid(database: DatabaseSync = getDb()) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const uid = randomSixDigitUid();
    const exists = database.prepare("SELECT 1 FROM users WHERE public_uid = ?").get(uid);
    if (!exists) return uid;
  }
  throw new Error("Unable to allocate a unique public UID");
}

function backfillPublicUids(database: DatabaseSync) {
  const rows = database
    .prepare("SELECT id FROM users WHERE public_uid IS NULL OR trim(public_uid) = ''")
    .all() as { id: number }[];
  const update = database.prepare("UPDATE users SET public_uid = ? WHERE id = ?");
  for (const row of rows) update.run(createPublicUid(database), row.id);
}

function consolidateLegacyUsdt(database: DatabaseSync) {
  database
    .prepare(
      `INSERT INTO user_assets (user_id, asset, balance, locked)
       SELECT user_id, 'USDC', SUM(balance), SUM(locked)
       FROM user_assets
       WHERE asset = 'USDT'
       GROUP BY user_id
       ON CONFLICT(user_id, asset) DO UPDATE SET
         balance = user_assets.balance + excluded.balance,
         locked = user_assets.locked + excluded.locked,
         updated_at = CURRENT_TIMESTAMP`
    )
    .run();
  database.prepare("DELETE FROM user_assets WHERE asset = 'USDT'").run();
  database.prepare("UPDATE withdrawals SET asset = 'USDC' WHERE asset = 'USDT'").run();
  database.prepare("UPDATE asset_transactions SET asset = 'USDC' WHERE asset = 'USDT'").run();
  database.prepare("UPDATE deposits SET asset = 'USDC' WHERE asset = 'USDT'").run();
  database
    .prepare(
      `INSERT OR IGNORE INTO deposit_addresses (asset, network, address, is_active, created_at)
       SELECT 'USDC', network, address, is_active, created_at
       FROM deposit_addresses
       WHERE asset = 'USDT'`
    )
    .run();
  database.prepare("DELETE FROM deposit_addresses WHERE asset = 'USDT'").run();
  database
    .prepare(
      `INSERT OR IGNORE INTO user_deposit_addresses (user_id, asset, network, address, is_active, created_at)
       SELECT user_id, 'USDC', network, address, is_active, created_at
       FROM user_deposit_addresses
       WHERE asset = 'USDT'`
    )
    .run();
  database.prepare("DELETE FROM user_deposit_addresses WHERE asset = 'USDT'").run();
  database
    .prepare(
      `UPDATE users
       SET balance = COALESCE((SELECT balance + locked FROM user_assets WHERE user_id = users.id AND asset = 'USDC'), balance)`
    )
    .run();
}

function normalizeStoredDepositNetworks(database: DatabaseSync) {
  database.prepare("UPDATE deposits SET network = UPPER(TRIM(network)) WHERE network IS NOT NULL").run();
  database
    .prepare(
      `UPDATE OR IGNORE deposit_addresses
       SET network = UPPER(TRIM(network))
       WHERE network IS NOT NULL`
    )
    .run();
  database
    .prepare(
      `DELETE FROM deposit_addresses
       WHERE network IS NOT NULL
         AND network <> UPPER(TRIM(network))
         AND EXISTS (
           SELECT 1 FROM deposit_addresses normalized
           WHERE normalized.asset = deposit_addresses.asset
             AND normalized.network = UPPER(TRIM(deposit_addresses.network))
             AND normalized.id <> deposit_addresses.id
         )`
    )
    .run();
  database
    .prepare(
      `UPDATE OR IGNORE user_deposit_addresses
       SET network = UPPER(TRIM(network))
       WHERE network IS NOT NULL`
    )
    .run();
  database
    .prepare(
      `DELETE FROM user_deposit_addresses
       WHERE network IS NOT NULL
         AND network <> UPPER(TRIM(network))
         AND EXISTS (
           SELECT 1 FROM user_deposit_addresses normalized
           WHERE normalized.user_id = user_deposit_addresses.user_id
             AND normalized.asset = user_deposit_addresses.asset
             AND normalized.network = UPPER(TRIM(user_deposit_addresses.network))
             AND normalized.id <> user_deposit_addresses.id
         )`
    )
    .run();
}

function syncAllStableBalances(database: DatabaseSync) {
  database
    .prepare(
      `UPDATE users
       SET balance = COALESCE(
         (SELECT SUM(balance + locked) FROM user_assets WHERE user_id = users.id AND asset = 'USDC'),
         balance
       )`
    )
    .run();
}

type DefaultMarket = {
  symbol: string;
  baseAsset: string;
  price: number;
  maxLeverage: number;
  feeRate: number;
  maintenanceMarginRate: number;
};

const defaultMarkets: DefaultMarket[] = [
  { symbol: "BTC-PERP", baseAsset: "BTC", price: 68000, maxLeverage: 50, feeRate: 0.0006, maintenanceMarginRate: 0.005 },
  { symbol: "ETH-PERP", baseAsset: "ETH", price: 3600, maxLeverage: 50, feeRate: 0.0006, maintenanceMarginRate: 0.005 },
  { symbol: "SOL-PERP", baseAsset: "SOL", price: 165, maxLeverage: 30, feeRate: 0.0008, maintenanceMarginRate: 0.0075 },
  { symbol: "BNB-PERP", baseAsset: "BNB", price: 610, maxLeverage: 30, feeRate: 0.0008, maintenanceMarginRate: 0.0075 },
  { symbol: "XRP-PERP", baseAsset: "XRP", price: 0.52, maxLeverage: 30, feeRate: 0.0008, maintenanceMarginRate: 0.01 },
  { symbol: "ADA-PERP", baseAsset: "ADA", price: 0.45, maxLeverage: 20, feeRate: 0.0008, maintenanceMarginRate: 0.01 },
  { symbol: "DOGE-PERP", baseAsset: "DOGE", price: 0.16, maxLeverage: 20, feeRate: 0.0008, maintenanceMarginRate: 0.01 },
  { symbol: "AVAX-PERP", baseAsset: "AVAX", price: 37, maxLeverage: 20, feeRate: 0.0008, maintenanceMarginRate: 0.01 },
  { symbol: "LINK-PERP", baseAsset: "LINK", price: 17, maxLeverage: 20, feeRate: 0.0008, maintenanceMarginRate: 0.01 },
  { symbol: "DOT-PERP", baseAsset: "DOT", price: 7, maxLeverage: 20, feeRate: 0.0008, maintenanceMarginRate: 0.01 },
  { symbol: "TRX-PERP", baseAsset: "TRX", price: 0.12, maxLeverage: 20, feeRate: 0.0008, maintenanceMarginRate: 0.01 },
  { symbol: "LTC-PERP", baseAsset: "LTC", price: 84, maxLeverage: 20, feeRate: 0.0008, maintenanceMarginRate: 0.01 },
  { symbol: "BCH-PERP", baseAsset: "BCH", price: 480, maxLeverage: 20, feeRate: 0.0008, maintenanceMarginRate: 0.01 },
  { symbol: "NEAR-PERP", baseAsset: "NEAR", price: 7.2, maxLeverage: 20, feeRate: 0.0008, maintenanceMarginRate: 0.01 },
  { symbol: "UNI-PERP", baseAsset: "UNI", price: 10, maxLeverage: 20, feeRate: 0.0008, maintenanceMarginRate: 0.01 }
];

function seedMarkets(database: DatabaseSync) {
  const insert = database.prepare(
    "INSERT OR IGNORE INTO markets (symbol, base_asset, price, max_leverage, fee_rate, maintenance_margin_rate) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const market of defaultMarkets) {
    insert.run(market.symbol, market.baseAsset, market.price, market.maxLeverage, market.feeRate, market.maintenanceMarginRate);
  }
}

function seedPriceTicks(database: DatabaseSync) {
  const markets = database.prepare("SELECT id, price FROM markets").all() as { id: number; price: number }[];
  const existingTick = database.prepare("SELECT 1 AS found FROM price_ticks WHERE market_id = ? LIMIT 1");
  const insertTick = database.prepare("INSERT INTO price_ticks (market_id, price, created_at) VALUES (?, ?, ?)");
  const now = Date.now();
  for (const market of markets) {
    if (existingTick.get(market.id)) continue;
    for (let i = 39; i >= 0; i -= 1) {
      const wave = Math.sin(i / 3) * 0.006 + Math.cos(i / 5) * 0.004;
      const price = market.price * (1 + wave);
      insertTick.run(market.id, Number(price.toFixed(4)), new Date(now - i * 60_000).toISOString());
    }
    insertTick.run(market.id, market.price, new Date(now).toISOString());
  }
}

function seedSettings(database: DatabaseSync) {
  const defaults: Record<string, string> = {
    platform_name: "Perp Lab",
    whatsapp_url: "https://wa.me/10000000000",
    whatsapp_support_url: "https://wa.me/10000000000",
    whatsapp_link: "https://wa.me/10000000000",
    telegram_url: "",
    registration_enabled: "true",
    withdrawal_enabled: "true",
    withdrawals_enabled: "true",
    demo_deposit_enabled: "true",
    default_gift_usdc: "0",
    default_signup_balance: "0",
    signup_bonus: "0",
    min_withdrawal_usdc: "10",
    min_withdrawal_amount: "10",
    min_withdrawal: "10",
    withdrawal_notice: "Withdrawals are reviewed manually. Contact support if you need help.",
    about_content: "KAIROX Protocol is a digital asset trading platform designed for secure account management, efficient trading workflows, funding records, identity verification, and responsive support.",
    terms_content: "By accessing or using this platform, you agree to follow these Terms and all applicable laws and regulations.",
    privacy_content: "We use account information for authentication, KYC verification, funding records, account security, risk control, and customer support.",
    binary_options_config: JSON.stringify([
      { seconds: 60, odds: 0.05 },
      { seconds: 120, odds: 0.15 },
      { seconds: 180, odds: 0.2 },
      { seconds: 300, odds: 0.3 }
    ]),
    binary_trade_config: JSON.stringify({ minOrderAmount: 10, maxOrderAmount: 5000, dailyMaxAmount: 0, version: 1, presets: [
      { seconds: 60, winRate: 0.05, lossRate: 0.06, drawRefundRate: 1 },
      { seconds: 120, winRate: 0.15, lossRate: 0.16, drawRefundRate: 1 },
      { seconds: 180, winRate: 0.2, lossRate: 0.21, drawRefundRate: 1 },
      { seconds: 300, winRate: 0.3, lossRate: 0.31, drawRefundRate: 1 }
    ]}),
    trading_enabled: "true"
  };
  const insert = database.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(defaults)) insert.run(key, value);
}

function seedUsers(database: DatabaseSync) {
  const demoMode = process.env.PERP_SIM_DEMO_MODE === "true";
  const adminPassword = process.env.PERP_SIM_ADMIN_PASSWORD?.trim();
  const demoPassword = process.env.PERP_SIM_DEMO_PASSWORD?.trim();

  if (adminPassword) {
    database
      .prepare("INSERT INTO users (public_uid, username, email, password_hash, withdrawal_password_hash, role, balance) VALUES (?, ?, ?, ?, ?, 'admin', 100000)")
      .run(createPublicUid(database), "admin", "admin@example.com", hashPassword(adminPassword), hashPassword(adminPassword));
  }
  if (demoMode && demoPassword) {
    database
      .prepare("INSERT INTO users (public_uid, username, email, password_hash, withdrawal_password_hash, role, balance) VALUES (?, ?, ?, ?, ?, 'trader', 10000)")
      .run(createPublicUid(database), "demo", "demo@example.com", hashPassword(demoPassword), hashPassword(demoPassword));
  }
}

function initialize(database: DatabaseSync) {
  database.exec(`PRAGMA busy_timeout = ${sqliteBusyTimeoutMs};`);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");

  database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_uid TEXT,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    withdrawal_password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'trader',
    balance REAL NOT NULL DEFAULT 10000,
    wallet TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    dimension TEXT NOT NULL,
    failures INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS markets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    base_asset TEXT NOT NULL,
    price REAL NOT NULL,
    max_leverage REAL NOT NULL DEFAULT 20,
    fee_rate REAL NOT NULL DEFAULT 0.0006,
    maintenance_margin_rate REAL NOT NULL DEFAULT 0.005,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS price_ticks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id INTEGER NOT NULL,
    price REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    market_id INTEGER NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('long', 'short')),
    margin REAL NOT NULL,
    leverage REAL NOT NULL,
    size REAL NOT NULL,
    entry_price REAL NOT NULL,
    liquidation_price REAL NOT NULL,
    pnl_override REAL,
    status TEXT NOT NULL DEFAULT 'open',
    opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT,
    close_price REAL,
    realized_pnl REAL,
    close_reason TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    market_id INTEGER NOT NULL,
    position_id INTEGER,
    action TEXT NOT NULL,
    side TEXT,
    price REAL NOT NULL,
    margin REAL,
    leverage REAL,
    size REAL,
    fee REAL NOT NULL DEFAULT 0,
    pnl REAL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS asset_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    asset TEXT NOT NULL DEFAULT 'USDC',
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    asset TEXT NOT NULL DEFAULT 'USDC',
    balance REAL NOT NULL DEFAULT 0,
    locked REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, asset),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    asset TEXT NOT NULL DEFAULT 'USDC',
    amount REAL NOT NULL,
    address TEXT,
    network TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS deposit_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset TEXT NOT NULL,
    network TEXT NOT NULL,
    address TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(asset, network)
  );

  CREATE TABLE IF NOT EXISTS user_deposit_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    asset TEXT NOT NULL,
    network TEXT NOT NULL,
    address TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, asset, network),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS binary_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    market_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('call', 'put')),
    stake REAL NOT NULL,
    odds REAL NOT NULL,
    duration_seconds INTEGER NOT NULL,
    entry_price REAL NOT NULL,
    settle_price REAL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'won', 'lost')),
    profit REAL,
    risk_amount REAL,
    manual_result TEXT CHECK(manual_result IN ('won', 'lost') OR manual_result IS NULL),
    manual_settle_price REAL,
    manual_note TEXT,
    manual_result_set_at TEXT,
    expires_at TEXT NOT NULL,
    settled_at TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    asset TEXT NOT NULL,
    network TEXT NOT NULL,
    amount REAL NOT NULL,
    tx_hash TEXT,
    proof_name TEXT,
    proof_data TEXT,
    proof_mime TEXT,
    deposit_address TEXT,
    address_source TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    note TEXT,
    admin_note TEXT,
    processed_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (processed_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS kyc_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    legal_name TEXT NOT NULL,
    document_type TEXT NOT NULL,
    front_name TEXT,
    front_data TEXT,
    front_mime TEXT,
    back_name TEXT,
    back_data TEXT,
    back_mime TEXT,
    rejection_reason TEXT,
    reviewed_by INTEGER,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS email_verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reset_password_attempts (
    email TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'agent')),
    text TEXT NOT NULL,
    read_by_user INTEGER NOT NULL DEFAULT 0,
    read_by_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  `);

  database.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    audience TEXT NOT NULL CHECK(audience IN ('user', 'admin')),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT "",
    entity_type TEXT,
    entity_id TEXT,
    payload_json TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );`);
  database.exec("CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(audience, user_id, id);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(audience, user_id, read_at);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_verification_codes(email, created_at);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_support_messages_user_created ON support_messages(user_id, created_at);");

  // Fiat deposit tables
  database.exec(`
    CREATE TABLE IF NOT EXISTS fiat_bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      currency TEXT NOT NULL,
      country_region TEXT,
      bank_name TEXT NOT NULL,
      account_holder TEXT NOT NULL,
      account_number TEXT,
      branch_name TEXT,
      swift_code TEXT,
      iban TEXT,
      routing_number TEXT,
      sort_code TEXT,
      ach_routing_number TEXT,
      wire_routing_number TEXT,
      bank_code TEXT,
      branch_code TEXT,
      institution_number TEXT,
      transit_number TEXT,
      bsb_code TEXT,
      fps_id TEXT,
      paynow_id TEXT,
      extra_json TEXT,
      min_amount REAL,
      max_amount REAL,
      default_exchange_rate REAL,
      default_rate_spread REAL,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS fiat_deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','bank_sent','submitted','confirmed','rejected')),
      reference_code TEXT UNIQUE,
      bank_account_id INTEGER,
      bank_snapshot_json TEXT,
      amount_fiat REAL,
      exchange_rate REAL,
      rate_spread REAL DEFAULT 0,
      final_rate REAL,
      estimated_usdt REAL,
      confirmed_usdt REAL,
      transfer_reference TEXT,
      user_remark TEXT,
      admin_remark TEXT,
      request_message_id INTEGER,
      bank_message_id INTEGER,
      bank_admin_id INTEGER,
      confirm_admin_id INTEGER,
      reject_admin_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      bank_sent_at TEXT,
      submitted_at TEXT,
      confirmed_at TEXT,
      rejected_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (bank_account_id) REFERENCES fiat_bank_accounts(id),
      FOREIGN KEY (bank_admin_id) REFERENCES users(id),
      FOREIGN KEY (confirm_admin_id) REFERENCES users(id),
      FOREIGN KEY (reject_admin_id) REFERENCES users(id)
    )
  `);
  database.exec("CREATE INDEX IF NOT EXISTS idx_fiat_deposits_user_created ON fiat_deposits(user_id, created_at)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_fiat_deposits_status_created ON fiat_deposits(status, created_at)");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_fiat_deposits_ref_code ON fiat_deposits(reference_code) WHERE reference_code IS NOT NULL");
  database.exec("CREATE INDEX IF NOT EXISTS idx_fiat_bank_accounts_currency_active ON fiat_bank_accounts(currency, is_active)");

  addColumn(database, "support_messages", "message_type", "TEXT DEFAULT 'text'");
  addColumn(database, "support_messages", "metadata_json", "TEXT");
  addColumn(database, "fiat_deposits", "proof_name", "TEXT");
  addColumn(database, "fiat_deposits", "proof_data", "TEXT");
  addColumn(database, "fiat_deposits", "proof_mime", "TEXT");
  addColumn(database, "fiat_deposits", "bank_reference_code", "TEXT");
  addColumn(database, "users", "email", "TEXT");
  addColumn(database, "users", "phone", "TEXT");
  addColumn(database, "users", "public_uid", "TEXT");
  addColumn(database, "users", "withdrawal_password_hash", "TEXT");
  addColumn(database, "users", "remark", "TEXT");
  addColumn(database, "users", "trading_enabled", "INTEGER NOT NULL DEFAULT 1");
  addColumn(database, "users", "login_enabled", "INTEGER NOT NULL DEFAULT 1");
  addColumn(database, "users", "kyc_status", "TEXT NOT NULL DEFAULT 'none'");
  addColumn(database, "users", "kyc_verified_at", "TEXT");
  addColumn(database, "users", "kyc_rejected_reason", "TEXT");
  addColumn(database, "users", "kyc_latest_submission_id", "INTEGER");
  addColumn(database, "users", "nickname", "TEXT");
  addColumn(database, "users", "invite_code_used", "TEXT");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL");
  addColumn(database, "asset_transactions", "asset", "TEXT NOT NULL DEFAULT 'USDC'");
  addColumn(database, "asset_transactions", "actor_id", "INTEGER");
  addColumn(database, "withdrawals", "asset", "TEXT NOT NULL DEFAULT 'USDC'");
  addColumn(database, "withdrawals", "network", "TEXT");
  addColumn(database, "withdrawals", "processed_by", "INTEGER");
  addColumn(database, "withdrawals", "client_request_id", "TEXT");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_client_req ON withdrawals(user_id, client_request_id) WHERE client_request_id IS NOT NULL;");
  addColumn(database, "binary_orders", "manual_result", "TEXT");
  addColumn(database, "binary_orders", "risk_amount", "REAL");
  addColumn(database, "binary_orders", "manual_settle_price", "REAL");
  addColumn(database, "binary_orders", "manual_note", "TEXT");
  addColumn(database, "binary_orders", "manual_result_set_at", "TEXT");
  addColumn(database, "binary_orders", "manual_set_by", "INTEGER");
  addColumn(database, "binary_orders", "win_profit_rate", "REAL");
  addColumn(database, "binary_orders", "loss_rate", "REAL");
  addColumn(database, "binary_orders", "draw_refund_rate", "REAL");
  addColumn(database, "binary_orders", "config_version", "INTEGER");
  ensureBinaryOrderOutcomeSchema(database);
  addColumn(database, "deposit_addresses", "updated_by", "INTEGER");
  addColumn(database, "deposit_addresses", "updated_at", "TEXT");
  addColumn(database, "user_deposit_addresses", "updated_by", "INTEGER");
  addColumn(database, "user_deposit_addresses", "updated_at", "TEXT");
  database.exec("CREATE TABLE IF NOT EXISTS asset_networks (id INTEGER PRIMARY KEY AUTOINCREMENT, asset TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'coin', deposit_enabled INTEGER NOT NULL DEFAULT 1, withdraw_enabled INTEGER NOT NULL DEFAULT 1, deposit_fee REAL NOT NULL DEFAULT 0, withdraw_fee REAL NOT NULL DEFAULT 0, min_deposit REAL NOT NULL DEFAULT 0, min_withdraw REAL NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT, UNIQUE(asset, code));");
  database.exec("CREATE TABLE IF NOT EXISTS assets (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, symbol TEXT NOT NULL, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'coin', sort_order INTEGER NOT NULL DEFAULT 0, deposit_enabled INTEGER NOT NULL DEFAULT 1, withdraw_enabled INTEGER NOT NULL DEFAULT 1, trade_enabled INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT)");
  const ensureAsset = database.prepare("INSERT INTO assets (code, symbol, name, icon, sort_order, deposit_enabled, withdraw_enabled, trade_enabled, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(code) DO NOTHING");
  for (const asset of defaultAssetConfigs()) ensureAsset.run(asset.code, asset.symbol, asset.name, asset.icon, asset.sortOrder, asset.depositEnabled ? 1 : 0, asset.withdrawEnabled ? 1 : 0, asset.tradeEnabled ? 1 : 0, asset.isActive ? 1 : 0);

  addColumn(database, "orders", "actor_id", "INTEGER");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;");
  database.exec("CREATE INDEX IF NOT EXISTS idx_login_attempts_locked_until ON login_attempts(locked_until);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_deposits_user_created ON deposits(user_id, created_at);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_deposits_status_created ON deposits(status, created_at);");
  database.exec("DROP INDEX IF EXISTS idx_deposits_tx_asset_network;");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_tx_hash ON deposits(tx_hash) WHERE tx_hash IS NOT NULL;");
  addColumn(database, "deposits", "client_request_id", "TEXT");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_client_req ON deposits(user_id, client_request_id) WHERE client_request_id IS NOT NULL;");
  database.exec("CREATE INDEX IF NOT EXISTS idx_kyc_user_created ON kyc_submissions(user_id, created_at);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_kyc_status_created ON kyc_submissions(status, created_at);");
  normalizeStoredDepositNetworks(database);

  const userCount = database.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  if (userCount.count === 0) {
    seedUsers(database);
  } else {
    database.prepare("UPDATE users SET email = ? WHERE username = 'admin' AND email IS NULL").run("admin@example.com");
    database.prepare("UPDATE users SET email = ? WHERE username = 'demo' AND email IS NULL").run("demo@example.com");
    const backfillWithdrawalPassword = process.env.PERP_SIM_BACKFILL_WITHDRAWAL_PASSWORD?.trim();
    if (backfillWithdrawalPassword) {
      database.prepare("UPDATE users SET withdrawal_password_hash = ? WHERE withdrawal_password_hash IS NULL").run(hashPassword(backfillWithdrawalPassword));
    }
  }
  backfillPublicUids(database);
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_uid ON users(public_uid) WHERE public_uid IS NOT NULL;");
  consolidateLegacyUsdt(database);

  seedMarkets(database);
  seedPriceTicks(database);

  seedSettings(database);

  const insertAddress = database.prepare(
    "INSERT OR IGNORE INTO deposit_addresses (asset, network, address) VALUES (?, ?, ?)"
  );
  insertAddress.run("USDC", "TRC20", "TDefaultUSDCTRC20Address000000000");
  insertAddress.run("USDC", "ERC20", "0xDefaultUSDCERC20Address000000000000000000");
  insertAddress.run("BTC", "BITCOIN", "bc1qdefaultbtcaddress000000000000000000");
  insertAddress.run("ETH", "ERC20", "0xDefaultETHAddress000000000000000000000000");
  insertAddress.run("BNB", "BEP20", "0xDefaultBNBAddress000000000000000000000000");
  insertAddress.run("SOL", "SOL", "DefaultSolanaAddress0000000000000000000000");

  const ensureNetwork = database.prepare("INSERT INTO asset_networks (asset, code, name, icon, deposit_enabled, withdraw_enabled, deposit_fee, withdraw_fee, min_deposit, min_withdraw, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(asset, code) DO NOTHING");
  const configuredNetworks = database.prepare("SELECT DISTINCT asset, UPPER(TRIM(network)) AS code FROM deposit_addresses").all() as { asset: string; code: string }[];
  for (const row of configuredNetworks) {
    const defaults = networkConfigDefaults(row.asset, row.code);
    ensureNetwork.run(defaults.asset, defaults.code, defaults.name, defaults.icon, defaults.depositEnabled ? 1 : 0, defaults.withdrawEnabled ? 1 : 0, defaults.depositFee, defaults.withdrawFee, defaults.minDeposit, defaults.minWithdraw, defaults.isActive ? 1 : 0);
  }

  const users = database.prepare("SELECT id, balance FROM users").all() as { id: number; balance: number }[];
  const insertAsset = database.prepare(
    "INSERT INTO user_assets (user_id, asset, balance) VALUES (?, 'USDC', ?) ON CONFLICT(user_id, asset) DO NOTHING"
  );
  for (const user of users) insertAsset.run(user.id, user.balance);
  consolidateLegacyUsdt(database);
  normalizeStoredDepositNetworks(database);
  syncAllStableBalances(database);
}

export function getDb() {
  if (!db) {
    const dbPath = getConfiguredDbPath();
    const dataDir = path.dirname(dbPath);
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    db = new DatabaseSync(dbPath);
    initialize(db);
  }
  return db;
}

export function inTransaction<T>(work: () => T): T {
  const database = getDb();
  database.exec("BEGIN");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export type User = {
  id: number;
  public_uid: string | null;
  username: string;
  email: string | null;
  withdrawal_password_hash?: string | null;
  role: "admin" | "trader";
  balance: number;
  wallet: string | null;
  kyc_status?: "none" | "pending" | "approved" | "rejected";
  kyc_verified_at?: string | null;
  kyc_rejected_reason?: string | null;
  kyc_latest_submission_id?: number | null;
  created_at: string;
};
