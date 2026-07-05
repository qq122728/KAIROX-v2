import { requireUser } from "@/lib/auth";
import { handleError, json, requireSameOrigin, tooManyRequests } from "@/lib/api";
import { settleExpiredBinaryOrders } from "@/lib/binary-settlement";
import { consumeUserRate } from "@/lib/rate-limit";

const settleLimit = Math.max(1, Number(process.env.PERP_SIM_SETTLE_LIMIT || 10));
const settleWindowMs = Math.max(1000, Number(process.env.PERP_SIM_SETTLE_WINDOW_MS || 30_000));

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const limit = consumeUserRate(user.id, "settle-expired", settleLimit, settleWindowMs);
    if (!limit.allowed) return tooManyRequests("Too many settlement requests. Please slow down.", limit.retryAfterMs);
    const settled = await settleExpiredBinaryOrders(user.id);
    return json({ ok: true, settled });
  } catch (error) {
    return handleError(error);
  }
}
