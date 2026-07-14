import { requireUser } from "@/lib/auth";
import { handleError, json } from "@/lib/api";
import { listMarkets, listOpenPositions, listOrders, listPriceTicks } from "@/lib/trading";
import { getDb } from "@/lib/db";
import { getBinaryTradeSettings } from "@/lib/binary-trade-settings";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const user = await requireUser();
    const tradeSettings = getBinaryTradeSettings();
    const usedRow = getDb().prepare("SELECT COALESCE(SUM(stake), 0) AS total FROM binary_orders WHERE user_id = ? AND created_at >= datetime('now', 'start of day')").get(user.id) as { total: number };
    const dailyUsed = Number(usedRow?.total || 0);
    const dailyRemaining = tradeSettings.dailyMaxAmount > 0 ? Math.max(0, tradeSettings.dailyMaxAmount - dailyUsed) : null;
    return json({
      user,
      markets: listMarkets(),
      priceTicks: listPriceTicks(undefined, 240),
      positions: listOpenPositions(user.id),
      orders: getBinaryOrders(user.id),
      legacyOrders: listOrders(user.id, 100),
      binaryTrade: { dailyUsed, dailyRemaining, minOrderAmount: tradeSettings.minOrderAmount, maxOrderAmount: tradeSettings.maxOrderAmount }
    });
  } catch (error) {
    return handleError(error);
  }
}

function getBinaryOrders(userId: number) {
  return getDb()
    .prepare("SELECT * FROM binary_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100")
    .all(userId);
}
