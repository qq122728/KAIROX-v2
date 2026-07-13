import { requireUser } from "@/lib/auth";
import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { getDb, inTransaction } from "@/lib/db";
import { getSettings, settingBool } from "@/lib/settings";
import type { Market } from "@/lib/trading";
import { emitRealtime, userRoom } from "@/lib/realtime";
import { ensureUserAssetRow, freezeAvailableAssetBalance, syncUserStableBalance } from "@/lib/balances";
import { getExecutionPrice } from "@/lib/execution-price";
import { binaryOrderRiskAmount, getBinaryOptionPreset } from "@/lib/binary-options";
import { getBinaryTradeSettings } from "@/lib/binary-trade-settings";
import { consumeUserRate } from "@/lib/rate-limit";

const binaryOrderLimit = Math.max(1, Number(process.env.PERP_SIM_BINARY_ORDER_LIMIT || 30));
const binaryOrderWindowMs = Math.max(1000, Number(process.env.PERP_SIM_BINARY_ORDER_WINDOW_MS || 60_000));

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const settings = getSettings();
    const tradeSettings = getBinaryTradeSettings();
    if (!settingBool(settings.trading_enabled, true)) return badRequest("Trading is currently disabled");

    const access = getDb()
      .prepare("SELECT COALESCE(trading_enabled, 1) AS trading_enabled FROM users WHERE id = ?")
      .get(user.id) as { trading_enabled: number } | undefined;
    if (access?.trading_enabled === 0) return badRequest("Account trading is disabled");

    const limit = consumeUserRate(user.id, "binary-order", binaryOrderLimit, binaryOrderWindowMs);
    if (!limit.allowed) return tooManyRequests("Too many order requests. Please slow down.", limit.retryAfterMs);

    const body = await readJson<{ marketId: number; direction: "call" | "put"; stake: number; durationSeconds: number }>(request);
    if (body.direction !== "call" && body.direction !== "put") return badRequest("Invalid direction");
    if (!Number.isFinite(body.stake) || body.stake < tradeSettings.minOrderAmount || body.stake > tradeSettings.maxOrderAmount) return badRequest(`Stake must be between ${tradeSettings.minOrderAmount} and ${tradeSettings.maxOrderAmount} USDC`);
    const preset = getBinaryOptionPreset(body.durationSeconds, settings);
    if (!preset) return badRequest("Invalid duration");
    if (tradeSettings.dailyMaxAmount > 0) {
      const row = getDb().prepare("SELECT COALESCE(SUM(stake), 0) AS total FROM binary_orders WHERE user_id = ? AND created_at >= datetime('now', 'start of day')").get(user.id) as { total: number };
      if (Number(row.total) + body.stake > tradeSettings.dailyMaxAmount) return badRequest(`Daily binary trading limit is ${tradeSettings.dailyMaxAmount} USDC`);
    }

    const market = getDb().prepare("SELECT * FROM markets WHERE id = ?").get(body.marketId) as Market | undefined;
    if (!market || !market.is_active) return badRequest("Market is unavailable");

    const execution = await getExecutionPrice(market);
    const entryPrice = execution.price;
    const riskAmount = binaryOrderRiskAmount(body.stake, preset.odds, null, preset.lossRate);
    const expiresAt = new Date(Date.now() + body.durationSeconds * 1000).toISOString();
    let orderId = 0;

    let insufficientBalance = false;
    try {
      inTransaction(() => {
        ensureUserAssetRow(user.id, "USDC", user.balance);
        const frozenAsset = freezeAvailableAssetBalance(user.id, "USDC", riskAmount);
        if (!frozenAsset) {
          insufficientBalance = true;
          throw new Error("Insufficient balance");
        }
        syncUserStableBalance(user.id);

        const result = getDb()
          .prepare(
            `INSERT INTO binary_orders (user_id, market_id, symbol, direction, stake, odds, duration_seconds, entry_price, risk_amount, win_profit_rate, loss_rate, draw_refund_rate, config_version, expires_at, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(user.id, market.id, market.symbol, body.direction, body.stake, preset.odds, body.durationSeconds, entryPrice, riskAmount, preset.winRate, preset.lossRate, preset.drawRefundRate, tradeSettings.version, expiresAt, `user placed binary order via ${execution.source}`);
        orderId = Number(result.lastInsertRowid);
        getDb()
          .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, note) VALUES (?, ?, 'binary_order_stake', ?, ?)")
          .run(user.id, frozenAsset, -riskAmount, `Binary ${body.direction.toUpperCase()} ${market.symbol} risk frozen ${riskAmount.toFixed(2)}`);
      });
    } catch (error) {
      if (insufficientBalance) return badRequest("Insufficient balance");
      throw error;
    }

    emitRealtime("admin:update", { room: "admin", payload: { type: "binary:created", orderId, userId: user.id } });
    emitRealtime("binary:created", { room: userRoom(user.id), payload: { orderId } });

    return json({ ok: true, orderId, entryPrice, riskAmount, odds: preset.odds, winProfitRate: preset.winRate, lossRate: preset.lossRate, drawRefundRate: preset.drawRefundRate, configVersion: tradeSettings.version, priceSource: execution.source, providerSymbol: execution.providerSymbol });
  } catch (error) {
    return handleError(error);
  }
}
