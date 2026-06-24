import { getDb, inTransaction } from "@/lib/db";
import { fetchBinanceTicker, fetchOkxTicker } from "@/lib/market-data-sources";
import { emitRealtime, userRoom } from "@/lib/realtime";
import { binaryOrderRiskAmount } from "@/lib/binary-options";
import { syncUserStableBalance } from "@/lib/balances";

type SettlementResult = "won" | "lost";

type BinaryOrderRow = {
  id: number;
  user_id: number;
  market_id: number;
  symbol: string;
  direction: "call" | "put";
  stake: number;
  odds: number;
  risk_amount?: number | null;
  status: string;
  entry_price: number;
  expires_at: string;
  manual_result?: SettlementResult | null;
  manual_settle_price?: number | null;
  manual_note?: string | null;
};

function orderExpired(order: Pick<BinaryOrderRow, "expires_at">) {
  const expiresAt = new Date(order.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function marketSettlePrice(order: Pick<BinaryOrderRow, "market_id" | "entry_price" | "expires_at">) {
  const beforeExpiry = getDb()
    .prepare(
      `SELECT price
       FROM price_ticks
       WHERE market_id = ?
         AND datetime(created_at) <= datetime(?)
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT 1`
    )
    .get(order.market_id, order.expires_at) as { price: number } | undefined;
  const beforeExpiryPrice = beforeExpiry?.price;
  if (Number.isFinite(beforeExpiryPrice) && Number(beforeExpiryPrice) > 0) return Number(beforeExpiryPrice);

  const latest = getDb()
    .prepare("SELECT price FROM price_ticks WHERE market_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
    .get(order.market_id) as { price: number } | undefined;
  const latestPrice = latest?.price;
  if (Number.isFinite(latestPrice) && Number(latestPrice) > 0) return Number(latestPrice);

  const market = getDb().prepare("SELECT price FROM markets WHERE id = ?").get(order.market_id) as { price: number } | undefined;
  const marketPrice = market?.price;
  return Number.isFinite(marketPrice) && Number(marketPrice) > 0 ? Number(marketPrice) : order.entry_price;
}

function marketResult(order: Pick<BinaryOrderRow, "direction" | "entry_price">, settlePrice: number): SettlementResult {
  if (order.direction === "call") return settlePrice > order.entry_price ? "won" : "lost";
  return settlePrice < order.entry_price ? "won" : "lost";
}

function persistMarketPrice(marketId: number, price: number) {
  if (!Number.isFinite(price) || price <= 0) return;
  getDb().prepare("UPDATE markets SET price = ? WHERE id = ?").run(price, marketId);
  getDb().prepare("INSERT INTO price_ticks (market_id, price) VALUES (?, ?)").run(marketId, price);
}

async function providerSettlePrice(order: Pick<BinaryOrderRow, "symbol" | "market_id">) {
  try {
    const ticker = await fetchOkxTicker(order.symbol);
    persistMarketPrice(order.market_id, ticker.price);
    return ticker.price;
  } catch {
    try {
      const ticker = await fetchBinanceTicker(order.symbol);
      persistMarketPrice(order.market_id, ticker.price);
      return ticker.price;
    } catch {
      return null;
    }
  }
}

export function settleBinaryOrder(orderId: number, result: SettlementResult, settlePrice?: number, note?: string) {
  const order = getDb().prepare("SELECT * FROM binary_orders WHERE id = ?").get(orderId) as BinaryOrderRow | undefined;
  if (!order) throw new Error("Order not found");
  if (order.status !== "open") throw new Error("Order has already been settled");
  if (!orderExpired(order)) throw new Error("Order has not expired yet");

  const price = Number.isFinite(settlePrice) && Number(settlePrice) > 0 ? Number(settlePrice) : order.entry_price;
  const riskAmount = binaryOrderRiskAmount(order.stake, order.odds, order.risk_amount);
  const profit = result === "won" ? order.stake * order.odds : -riskAmount;
  const payout = result === "won" ? riskAmount + order.stake * order.odds : 0;
  let changed = 0;

  inTransaction(() => {
    const update = getDb()
      .prepare(
        `UPDATE binary_orders
         SET status = ?, settle_price = ?, profit = ?, settled_at = CURRENT_TIMESTAMP, note = COALESCE(?, note)
         WHERE id = ? AND status = 'open' AND datetime(expires_at) <= CURRENT_TIMESTAMP`
      )
      .run(result, price, profit, note?.trim() || null, order.id);
    changed = Number(update.changes || 0);
    if (changed !== 1) return;

    const release = getDb()
      .prepare(
        "UPDATE user_assets SET balance = balance + ?, locked = locked - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = 'USDC' AND locked >= ?"
      )
      .run(payout, riskAmount, order.user_id, riskAmount);
    if (Number(release.changes || 0) !== 1) throw new Error("Insufficient locked balance");
    syncUserStableBalance(order.user_id);

    getDb()
      .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, note) VALUES (?, 'USDC', 'binary_order_settlement', ?, ?)")
      .run(order.user_id, profit, note?.trim() || `Manual settlement ${order.symbol} as ${result}`);
  });

  if (changed !== 1) throw new Error("Order has not expired yet or has already been settled");

  emitRealtime("admin:update", { room: "admin", payload: { type: "binary:settled", orderId: order.id, userId: order.user_id } });
  emitRealtime("binary:settled", { room: userRoom(order.user_id), payload: { orderId: order.id, result } });
  emitRealtime("user:update", { room: userRoom(order.user_id), payload: { type: "balance:update" } });
  return { order, result, profit, payout, settlePrice: price };
}

export function setBinaryOrderManualResult(orderId: number, result: SettlementResult, settlePrice?: number, note?: string) {
  const order = getDb().prepare("SELECT * FROM binary_orders WHERE id = ?").get(orderId) as BinaryOrderRow | undefined;
  if (!order) throw new Error("Order not found");
  if (order.status !== "open") throw new Error("Order has already been settled");

  if (orderExpired(order)) {
    if (order.manual_result === "won" || order.manual_result === "lost") {
      const settled = settleBinaryOrder(order.id, order.manual_result, order.manual_settle_price ?? undefined, order.manual_note || `Manual preset settled as ${order.manual_result}`);
      return { action: "settled" as const, ...settled };
    }
    throw new Error("Order has expired and will follow the market result");
  }

  const price = Number.isFinite(settlePrice) && Number(settlePrice) > 0 ? Number(settlePrice) : order.entry_price;
  const manualNote = note?.trim() || `Admin preset ${order.symbol} as ${result}`;

  const update = getDb()
    .prepare(
      `UPDATE binary_orders
       SET manual_result = ?, manual_settle_price = ?, manual_note = ?, manual_result_set_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'open' AND datetime(expires_at) > CURRENT_TIMESTAMP`
    )
    .run(result, price, manualNote, order.id);
  if (Number(update.changes || 0) !== 1) throw new Error("Order has expired and will follow the market result");

  emitRealtime("admin:update", { room: "admin", payload: { type: "binary:configured", orderId: order.id, userId: order.user_id, result } });
  return { action: "configured" as const, order, result, settlePrice: price };
}

export function settleConfiguredExpiredOrders(userId?: number) {
  const params: Array<number | string> = [];
  let userWhere = "";
  if (userId) {
    userWhere = "AND user_id = ?";
    params.push(userId);
  }
  const rows = getDb()
    .prepare(
      `SELECT id, manual_result, manual_settle_price, manual_note
       FROM binary_orders
       WHERE status = 'open'
         AND manual_result IN ('won', 'lost')
         AND datetime(expires_at) <= CURRENT_TIMESTAMP
         ${userWhere}
       ORDER BY expires_at ASC
       LIMIT 50`
    )
    .all(...params) as { id: number; manual_result: SettlementResult; manual_settle_price: number | null; manual_note: string | null }[];

  let settled = 0;
  for (const row of rows) {
    try {
      settleBinaryOrder(row.id, row.manual_result, row.manual_settle_price ?? undefined, row.manual_note || `Manual preset settled as ${row.manual_result}`);
      settled += 1;
    } catch {}
  }
  return settled;
}

export async function settleMarketExpiredOrders(userId?: number) {
  const params: Array<number | string> = [];
  let userWhere = "";
  if (userId) {
    userWhere = "AND user_id = ?";
    params.push(userId);
  }
  const rows = getDb()
    .prepare(
      `SELECT *
       FROM binary_orders
       WHERE status = 'open'
         AND manual_result IS NULL
         AND datetime(expires_at) <= CURRENT_TIMESTAMP
         ${userWhere}
       ORDER BY expires_at ASC
       LIMIT 50`
    )
    .all(...params) as BinaryOrderRow[];

  let settled = 0;
  for (const row of rows) {
    try {
      const price = (await providerSettlePrice(row)) ?? marketSettlePrice(row);
      const result = marketResult(row, price);
      settleBinaryOrder(row.id, result, price, `Market settlement ${row.symbol} at ${price}`);
      settled += 1;
    } catch {}
  }
  return settled;
}

export async function settleExpiredBinaryOrders(userId?: number) {
  return settleConfiguredExpiredOrders(userId) + await settleMarketExpiredOrders(userId);
}
