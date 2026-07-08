import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { consumeIpRate } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    const rateLimit = consumeIpRate(request, "admin-fiat-reject", 30, 60000);
    if (!rateLimit.allowed) {
      return tooManyRequests("Too many requests.", rateLimit.retryAfterMs);
    }

    const body = await readJson<{ depositId: number; remark: string }>(request);
    const depositId = Number(body.depositId);
    const remark = (body.remark || "").trim();

    if (!Number.isInteger(depositId) || depositId <= 0) return badRequest("Invalid depositId");
    if (!remark) return badRequest("Rejection remark is required");

    const db = getDb();
    const deposit = db.prepare("SELECT * FROM fiat_deposits WHERE id = ?").get(depositId) as
      | { id: number; user_id: number; status: string; currency: string }
      | undefined;
    if (!deposit) return badRequest("Deposit not found");

    if (deposit.status === "confirmed" || deposit.status === "rejected") {
      return badRequest(`Cannot reject a deposit that is already ${deposit.status}`);
    }

    db.prepare(
      `UPDATE fiat_deposits SET status = 'rejected', admin_remark = ?, reject_admin_id = ?, rejected_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(remark, admin.id, depositId);

    // Insert rejection message
    db
      .prepare(
        `INSERT INTO support_messages (user_id, role, text, message_type, metadata_json, read_by_user, read_by_admin)
         VALUES (?, 'agent', ?, 'fiat_status', ?, 0, 1)`
      )
      .run(
        deposit.user_id,
        `❌ Your deposit request has been rejected.\nReason: ${remark}`,
        JSON.stringify({ depositId, status: "rejected", remark })
      );

    const updated = db.prepare("SELECT * FROM fiat_deposits WHERE id = ?").get(depositId);
    return json({ deposit: updated });
  } catch (error) {
    return handleError(error);
  }
}
