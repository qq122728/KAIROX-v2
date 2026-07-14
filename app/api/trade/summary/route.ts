import { requireUser } from "@/lib/auth";
import { handleError, json } from "@/lib/api";
import { listMarkets, listOpenPositions, listOrders, listPriceTicks } from "@/lib/trading";
import { getDb } from "@/lib/db";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const user = await requireUser();
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
