import { getDb, inTransaction } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { getSettings, settingBool } from "@/lib/settings";
import { calcLiqPrice, calcPnl, type Market } from "@/lib/trading";
import { debitAvailableAssetBalance, ensureUserAssetRow, syncUserStableBalance } from "@/lib/balances";
import { emitRealtime, userRoom } from "@/lib/realtime";
import { getExecutionPrice } from "@/lib/execution-price";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ marketId: number; side: "long" | "short"; margin: number; leverage: number }>(request);
    const settings = getSettings();
    if (!settingBool(settings.trading_enabled, true)) return badRequest("Trading is currently disabled");
    const userAccess = getDb()
      .prepare("SELECT COALESCE(trading_enabled, 1) AS trading_enabled FROM users WHERE id = ?")
      .get(user.id) as { trading_enabled: number } | undefined;
    if (userAccess?.trading_enabled === 0) return badRequest("Account trading is disabled");

    const market = getDb().prepare("SELECT * FROM markets WHERE id = ?").get(body.marketId) as Market | undefined;
    if (!market || !market.is_active) return badRequest("Market is unavailable");
    if (body.side !== "long" && body.side !== "short") return badRequest("Invalid side");
    if (!Number.isFinite(body.margin) || body.margin <= 0) return badRequest("Invalid margin");
    if (!Number.isFinite(body.leverage) || body.leverage < 1 || body.leverage > market.max_leverage) {
      return badRequest(`Leverage must be between 1-${market.max_leverage}x`);
    }

    const execution = await getExecutionPrice(market);
    const entryPrice = execution.price;
    const notional = body.margin * body.leverage;
    const fee = notional * market.fee_rate;
    const cost = body.margin + fee;
    const liq = calcLiqPrice(body.side, entryPrice, body.leverage, market.maintenance_margin_rate);

    let insufficientBalance = false;
    let positionId = 0;
    try {
      inTransaction(() => {
        ensureUserAssetRow(user.id, "USDC", user.balance);
        const debitedAsset = debitAvailableAssetBalance(user.id, "USDC", cost);
        if (!debitedAsset) {
          insufficientBalance = true;
          throw new Error("Insufficient balance");
        }
        syncUserStableBalance(user.id);

        const position = getDb()
          .prepare(
            `INSERT INTO positions (user_id, market_id, side, margin, leverage, size, entry_price, liquidation_price)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(user.id, market.id, body.side, body.margin, body.leverage, notional, entryPrice, liq);
        positionId = Number(position.lastInsertRowid);
        getDb()
          .prepare(
            `INSERT INTO orders (user_id, market_id, position_id, action, side, price, margin, leverage, size, fee, note)
             VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(user.id, market.id, positionId, body.side, entryPrice, body.margin, body.leverage, notional, fee, `User opened position via ${execution.source}`);
      });
    } catch (error) {
      if (insufficientBalance) return badRequest("Insufficient balance");
      throw error;
    }
    emitRealtime("admin:update", { room: "admin", payload: { type: "trade:created", positionId, userId: user.id } });
    emitRealtime("user:update", { room: userRoom(user.id), payload: { type: "trade:created", positionId } });
    return json({ ok: true, entryPrice, priceSource: execution.source, providerSymbol: execution.providerSymbol });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ positionId: number }>(request);
    const position = getDb()
      .prepare(
        `SELECT p.*, m.price AS mark_price, m.symbol, m.fee_rate
         FROM positions p JOIN markets m ON m.id = p.market_id
         WHERE p.id = ? AND p.user_id = ? AND p.status = 'open'`
      )
      .get(body.positionId, user.id) as
      | { id: number; market_id: number; symbol: string; side: "long" | "short"; size: number; entry_price: number; margin: number; pnl_override: number | null; mark_price: number; fee_rate: number }
      | undefined;
    if (!position) return badRequest("Position not found");
    const execution = await getExecutionPrice({ id: position.market_id, symbol: position.symbol, price: position.mark_price });
    const closePrice = execution.price;
    const pnl = calcPnl(position, closePrice);
    const fee = position.size * position.fee_rate;
    const payout = Math.max(0, position.margin + pnl - fee);

    let positionAlreadyClosed = false;
    try {
      inTransaction(() => {
        const close = getDb()
          .prepare(
            "UPDATE positions SET status = 'closed', closed_at = CURRENT_TIMESTAMP, close_price = ?, realized_pnl = ?, close_reason = 'user_close' WHERE id = ? AND user_id = ? AND status = 'open'"
          )
          .run(closePrice, pnl - fee, position.id, user.id);
        if (Number(close.changes || 0) !== 1) {
          positionAlreadyClosed = true;
          throw new Error("Position not found");
        }

        if (payout > 0) {
          ensureUserAssetRow(user.id, "USDC", user.balance);
          getDb()
            .prepare("UPDATE user_assets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = 'USDC'")
            .run(payout, user.id);
          syncUserStableBalance(user.id);
        }

        getDb()
          .prepare(
            `INSERT INTO orders (user_id, market_id, position_id, action, side, price, fee, pnl, note)
             VALUES (?, ?, ?, 'close', ?, ?, ?, ?, ?)`
          )
          .run(user.id, position.market_id, position.id, position.side, closePrice, fee, pnl - fee, `User closed position via ${execution.source}`);
      });
    } catch (error) {
      if (positionAlreadyClosed) return badRequest("Position not found");
      throw error;
    }
    return json({ ok: true, closePrice, priceSource: execution.source, providerSymbol: execution.providerSymbol });
  } catch (error) {
    return handleError(error);
  }
}
