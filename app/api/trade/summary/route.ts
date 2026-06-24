import { requireUser } from "@/lib/auth";
import { handleError, json } from "@/lib/api";
import { listMarkets, listOpenPositions, listOrders, listPriceTicks } from "@/lib/trading";
import { getDb } from "@/lib/db";
import { settleExpiredBinaryOrders } from "@/lib/binary-settlement";

export async function GET() {
  try {
    const user = await requireUser();
    /* Self-heal: drain this user's expired-but-unsettled binary orders before reading,
       so the summary that the client polls is always coherent with status transitions
       even when the background settlement worker is not running. Per-order errors are
       already swallowed inside settleExpiredBinaryOrders. */
    try { await settleExpiredBinaryOrders(user.id); } catch { /* settlement is best-effort */ }
    return json({
      user,
      markets: listMarkets(),
      priceTicks: listPriceTicks(undefined, 240),
      positions: listOpenPositions(user.id),
      orders: getBinaryOrders(user.id),
      legacyOrders: listOrders(user.id, 100)
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
