import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const dbPath = path.resolve(process.env.PERP_SIM_DB_PATH?.trim() || path.join(process.cwd(), "data", "perp-lab.sqlite"));
const intervalMs = positiveInteger(process.env.SETTLEMENT_INTERVAL_MS, 5000);
const sqliteBusyTimeoutMs = positiveInteger(process.env.SETTLEMENT_SQLITE_BUSY_TIMEOUT_MS || process.env.PERP_SIM_SQLITE_BUSY_TIMEOUT_MS, 1500);
const priceTickMinIntervalSeconds = positiveInteger(process.env.PRICE_TICK_MIN_INTERVAL_SECONDS, 15);
const okxBaseUrl = process.env.OKX_API_BASE_URL || "https://www.okx.com";
const binanceBaseUrl = process.env.BINANCE_API_BASE_URL || "https://fapi.binance.com";
const marketFetchTimeoutMs = Number(process.env.MARKET_DATA_FETCH_TIMEOUT_MS || 1500);
const socketInternalUrl = process.env.SOCKET_INTERNAL_URL || "http://127.0.0.1:3001/internal/emit";
const defaultSocketInternalSecret = "perp-sim-local-realtime-secret";
const configuredSocketInternalSecret = (process.env.SOCKET_INTERNAL_SECRET || process.env.REALTIME_INTERNAL_SECRET || "").trim();
if (process.env.NODE_ENV === "production" && (!configuredSocketInternalSecret || configuredSocketInternalSecret === defaultSocketInternalSecret)) {
  console.error("[settlement] SOCKET_INTERNAL_SECRET or REALTIME_INTERNAL_SECRET must be set to a non-default value in production");
  process.exit(1);
}
const socketInternalSecret = configuredSocketInternalSecret || defaultSocketInternalSecret;
if (!existsSync(path.dirname(dbPath))) mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA busy_timeout = ${sqliteBusyTimeoutMs}; PRAGMA journal_mode = WAL;`);

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function addColumn(table, column, definition) {
  if (!columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function tableExists(table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

let schemaReady = false;
function ensureSchemaReady() {
  if (schemaReady) return true;
  if (!tableExists("binary_orders") || !tableExists("user_assets") || !tableExists("asset_transactions")) return false;
  addColumn("binary_orders", "manual_result", "TEXT");
  addColumn("binary_orders", "risk_amount", "REAL");
  addColumn("binary_orders", "manual_settle_price", "REAL");
  addColumn("binary_orders", "manual_note", "TEXT");
  addColumn("binary_orders", "manual_result_set_at", "TEXT");
  schemaReady = true;
  return true;
}

function emit(event, room, payload = {}) {
  fetch(socketInternalUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-realtime-secret": socketInternalSecret },
    body: JSON.stringify({ event, room, payload })
  }).catch(() => {});
}

function binaryOrderRiskAmount(stake, odds, riskAmount) {
  const storedRisk = Number(riskAmount);
  if (Number.isFinite(storedRisk) && storedRisk > 0) return storedRisk;
  return Number((stake * (odds + 0.01)).toFixed(8));
}

function syncUserStableBalance(userId) {
  db.prepare(
    `UPDATE users
     SET balance = COALESCE(
       (SELECT SUM(balance) FROM user_assets WHERE user_id = ? AND asset = 'USDC'),
       balance
     )
     WHERE id = ?`
  ).run(userId, userId);
}

function releaseSettlementFunds(userId, payout, riskAmount) {
  const release = db
    .prepare("UPDATE user_assets SET balance = balance + ?, locked = locked - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = 'USDC' AND locked >= ?")
    .run(payout, riskAmount, userId, riskAmount);
  if (Number(release.changes || 0) !== 1) return false;
  syncUserStableBalance(userId);
  return true;
}

function settleConfigured(order) {
  const result = order.manual_result;
  if (result !== "won" && result !== "lost") return false;
  const price = Number.isFinite(order.manual_settle_price) && Number(order.manual_settle_price) > 0 ? Number(order.manual_settle_price) : order.entry_price;
  const riskAmount = binaryOrderRiskAmount(order.stake, order.odds, order.risk_amount);
  const profit = result === "won" ? order.stake * order.odds : -riskAmount;
  const payout = result === "won" ? riskAmount + order.stake * order.odds : 0;
  const note = order.manual_note || `Manual preset settled as ${result}`;

  db.exec("BEGIN");
  try {
    const update = db
      .prepare(
        `UPDATE binary_orders
         SET status = ?, settle_price = ?, profit = ?, settled_at = CURRENT_TIMESTAMP, note = COALESCE(?, note)
         WHERE id = ? AND status = 'open' AND datetime(expires_at) <= CURRENT_TIMESTAMP`
      )
      .run(result, price, profit, note, order.id);
    if (Number(update.changes || 0) !== 1) {
      db.exec("ROLLBACK");
      return false;
    }
    if (!releaseSettlementFunds(order.user_id, payout, riskAmount)) {
      db.exec("ROLLBACK");
      return false;
    }
    db.prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, note) VALUES (?, 'USDC', 'binary_order_settlement', ?, ?)").run(order.user_id, profit, note);
    db.exec("COMMIT");
    emit("admin:update", "admin", { type: "binary:settled", orderId: order.id, userId: order.user_id });
    emit("binary:settled", `user:${order.user_id}`, { orderId: order.id, result });
    emit("user:update", `user:${order.user_id}`, { type: "balance:update" });
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    console.error("[settlement]", error);
    return false;
  }
}

function marketSettlePrice(order) {
  const beforeExpiry = db
    .prepare(
      `SELECT price
       FROM price_ticks
       WHERE market_id = ?
         AND datetime(created_at) <= datetime(?)
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT 1`
    )
    .get(order.market_id, order.expires_at);
  if (Number.isFinite(beforeExpiry?.price) && Number(beforeExpiry?.price) > 0) return Number(beforeExpiry.price);

  const latest = db.prepare("SELECT price FROM price_ticks WHERE market_id = ? ORDER BY created_at DESC, id DESC LIMIT 1").get(order.market_id);
  if (Number.isFinite(latest?.price) && Number(latest?.price) > 0) return Number(latest.price);

  const market = db.prepare("SELECT price FROM markets WHERE id = ?").get(order.market_id);
  return Number.isFinite(market?.price) && Number(market?.price) > 0 ? Number(market.price) : order.entry_price;
}

function marketResult(order, settlePrice) {
  if (order.direction === "call") return settlePrice > order.entry_price ? "won" : "lost";
  return settlePrice < order.entry_price ? "won" : "lost";
}

function toOkxInstIds(symbol) {
  const base = String(symbol || "").replace("-PERP", "").replace("/", "-").split("-")[0].toUpperCase();
  return [`${base}-USDC-SWAP`, `${base}-USD-SWAP`, `${base}-USDT-SWAP`];
}

function toBinanceSymbol(symbol) {
  return String(symbol || "").replace("-PERP", "USDT").replace("/", "").toUpperCase();
}

async function fetchOkxPrice(symbol) {
  for (const instId of toOkxInstIds(symbol)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), marketFetchTimeoutMs);
    try {
      const endpoint = new URL("/api/v5/market/ticker", okxBaseUrl);
      endpoint.searchParams.set("instId", instId);
      const res = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      if (!res.ok) continue;
      const payload = await res.json();
      if (payload?.code !== "0" || !payload?.data?.[0]) continue;
      const price = Number(payload.data[0].last);
      if (Number.isFinite(price) && price > 0) return price;
    } catch {
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function fetchBinancePrice(symbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), marketFetchTimeoutMs);
  try {
    const endpoint = new URL("/fapi/v1/ticker/24hr", binanceBaseUrl);
    endpoint.searchParams.set("symbol", toBinanceSymbol(symbol));
    const res = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;
    const payload = await res.json();
    const price = Number(payload?.lastPrice);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function persistMarketPrice(marketId, price) {
  if (!Number.isFinite(price) || price <= 0) return;
  db.prepare("UPDATE markets SET price = ? WHERE id = ?").run(price, marketId);
  db.prepare(
    `INSERT INTO price_ticks (market_id, price)
     SELECT ?, ?
     WHERE NOT EXISTS (
       SELECT 1
       FROM price_ticks
       WHERE market_id = ?
         AND datetime(created_at) >= datetime('now', ?)
     )`
  ).run(marketId, price, marketId, `-${priceTickMinIntervalSeconds} seconds`);
}

async function providerSettlePrice(order) {
  const okxPrice = await fetchOkxPrice(order.symbol);
  if (okxPrice) {
    persistMarketPrice(order.market_id, okxPrice);
    return okxPrice;
  }

  const binancePrice = await fetchBinancePrice(order.symbol);
  if (binancePrice) {
    persistMarketPrice(order.market_id, binancePrice);
    return binancePrice;
  }

  return null;
}

async function settleMarket(order) {
  const price = (await providerSettlePrice(order)) ?? marketSettlePrice(order);
  const result = marketResult(order, price);
  const riskAmount = binaryOrderRiskAmount(order.stake, order.odds, order.risk_amount);
  const profit = result === "won" ? order.stake * order.odds : -riskAmount;
  const payout = result === "won" ? riskAmount + order.stake * order.odds : 0;
  const note = `Market settlement ${order.symbol} at ${price}`;

  db.exec("BEGIN");
  try {
    const update = db
      .prepare(
        `UPDATE binary_orders
         SET status = ?, settle_price = ?, profit = ?, settled_at = CURRENT_TIMESTAMP, note = ?
         WHERE id = ?
           AND status = 'open'
           AND datetime(expires_at) <= CURRENT_TIMESTAMP
           AND manual_result IS NULL`
      )
      .run(result, price, profit, note, order.id);
    if (Number(update.changes || 0) !== 1) {
      db.exec("ROLLBACK");
      return false;
    }
    if (!releaseSettlementFunds(order.user_id, payout, riskAmount)) {
      db.exec("ROLLBACK");
      return false;
    }
    db.prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, note) VALUES (?, 'USDC', 'binary_order_settlement', ?, ?)").run(order.user_id, profit, note);
    db.exec("COMMIT");
    emit("admin:update", "admin", { type: "binary:settled", orderId: order.id, userId: order.user_id });
    emit("binary:settled", `user:${order.user_id}`, { orderId: order.id, result });
    emit("user:update", `user:${order.user_id}`, { type: "balance:update" });
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    console.error("[settlement]", error);
    return false;
  }
}

let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    if (!ensureSchemaReady()) return;
    const configured = db
      .prepare(
        `SELECT *
         FROM binary_orders
         WHERE status = 'open'
           AND manual_result IN ('won', 'lost')
           AND datetime(expires_at) <= CURRENT_TIMESTAMP
         ORDER BY expires_at ASC
         LIMIT 50`
      )
      .all();
    for (const order of configured) settleConfigured(order);

    const pending = db
      .prepare(
        `SELECT *
         FROM binary_orders
         WHERE status = 'open'
           AND manual_result IS NULL
           AND datetime(expires_at) <= CURRENT_TIMESTAMP
         ORDER BY expires_at ASC
         LIMIT 50`
      )
      .all();
    for (const order of pending) await settleMarket(order);
  } finally {
    ticking = false;
  }
}

setInterval(() => {
  tick().catch((error) => console.error("[settlement]", error));
}, intervalMs);
tick().catch((error) => console.error("[settlement]", error));
console.log(`[settlement] preset-or-market mode running every ${intervalMs}ms with OKX/Binance/local market fallback`);
