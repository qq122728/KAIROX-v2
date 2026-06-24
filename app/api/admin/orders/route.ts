import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { setBinaryOrderManualResult } from "@/lib/binary-settlement";

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<{ orderId: number; result: "won" | "lost"; settlePrice?: number; note?: string }>(request);
    if (!body.orderId) return badRequest("Missing order");
    if (body.result !== "won" && body.result !== "lost") return badRequest("Invalid settlement result");

    try {
      const result = setBinaryOrderManualResult(body.orderId, body.result, body.settlePrice, body.note || `Admin preset as ${body.result}`, admin.id);
      return json({ ok: true, action: result.action });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Unable to settle order");
    }
  } catch (error) {
    return handleError(error);
  }
}
