import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { getDb, inTransaction } from "@/lib/db";
import { emitRealtime, userRoom } from "@/lib/realtime";

export async function GET() {
  try {
    await requireAdmin();
    const submissions = getDb()
      .prepare(
        `SELECT k.*, u.public_uid AS user_public_uid, u.email, u.username
         FROM kyc_submissions k
         JOIN users u ON u.id = k.user_id
         ORDER BY k.created_at DESC
         LIMIT 300`
      )
      .all();
    return json({ submissions });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<{ submissionId: number; status: "approved" | "rejected"; reason?: string }>(request);
    if (!body.submissionId) return badRequest("Missing KYC submission");
    if (body.status !== "approved" && body.status !== "rejected") return badRequest("Invalid review status");
    if (body.status === "rejected" && !body.reason?.trim()) return badRequest("Rejection reason is required");

    const row = getDb().prepare("SELECT * FROM kyc_submissions WHERE id = ?").get(body.submissionId) as
      | { id: number; user_id: number; status: string }
      | undefined;
    if (!row) return badRequest("KYC submission does not exist");

    const rejectionReason = body.status === "rejected" ? (body.reason || "").trim() : null;

    inTransaction(() => {
      getDb()
        .prepare(
          `UPDATE kyc_submissions
           SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .run(body.status, rejectionReason, admin.id, row.id);
      getDb()
        .prepare(
          `UPDATE users
           SET kyc_status = ?, kyc_verified_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE kyc_verified_at END,
               kyc_rejected_reason = ?, kyc_latest_submission_id = ?
           WHERE id = ?`
        )
        .run(body.status, body.status, rejectionReason, row.id, row.user_id);
    });

    emitRealtime("admin:update", { room: "admin", payload: { type: "kyc:update", submissionId: row.id, userId: row.user_id, status: body.status } });
    emitRealtime("user:update", { room: userRoom(row.user_id), payload: { type: "kyc:update", status: body.status } });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
