import { requireUser } from "@/lib/auth";
import { handleError, json, requireSameOrigin } from "@/lib/api";
import { settleExpiredBinaryOrders } from "@/lib/binary-settlement";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const settled = await settleExpiredBinaryOrders(user.id);
    return json({ ok: true, settled });
  } catch (error) {
    return handleError(error);
  }
}
