import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { getDb, inTransaction } from "@/lib/db";
import { emitRealtime, userRoom } from "@/lib/realtime";
import { isStableAsset, normalizeAsset, syncUserStableBalance } from "@/lib/balances";

export async function GET() {
  try {
    await requireAdmin();
    const deposits = getDb()
      .prepare(
        `SELECT d.*, u.public_uid AS user_public_uid, u.email, u.username
         FROM deposits d
         JOIN users u ON u.id = d.user_id
         ORDER BY d.created_at DESC
         LIMIT 300`
      )
      .all();
    return json({ deposits });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<{ depositId: number; status: "approved" | "rejected"; adminNote?: string }>(request);
    if (!body.depositId) return badRequest("缺少充值记录");
    if (body.status !== "approved" && body.status !== "rejected") return badRequest("审核状态无效");
    const row = getDb().prepare("SELECT * FROM deposits WHERE id = ?").get(body.depositId) as
      | { id: number; user_id: number; asset: string; amount: number; status: string }
      | undefined;
    if (!row) return badRequest("充值记录不存在");

    let alreadyProcessed = false;
    try {
      inTransaction(() => {
        const update = getDb()
          .prepare("UPDATE deposits SET status = ?, admin_note = ?, processed_by = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'")
          .run(body.status, body.adminNote?.trim() || null, admin.id, row.id);
        if (Number(update.changes || 0) !== 1) {
          alreadyProcessed = true;
          throw new Error("Deposit record has already been processed");
        }

        if (body.status === "approved") {
          const asset = normalizeAsset(row.asset);
          getDb()
            .prepare("INSERT INTO user_assets (user_id, asset, balance, locked) VALUES (?, ?, 0, 0) ON CONFLICT(user_id, asset) DO NOTHING")
            .run(row.user_id, asset);
          getDb()
            .prepare("UPDATE user_assets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ?")
            .run(row.amount, row.user_id, asset);
          if (isStableAsset(asset)) syncUserStableBalance(row.user_id);
          getDb()
            .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, status, note) VALUES (?, ?, 'deposit', ?, 'completed', ?)")
            .run(row.user_id, asset, row.amount, "System processed");
        }
      });
    } catch (error) {
      if (alreadyProcessed) return json({ error: "Deposit record has already been processed" }, 409);
      throw error;
    }

    emitRealtime("admin:update", { room: "admin", payload: { type: "deposit:update", depositId: row.id, userId: row.user_id, status: body.status } });
    emitRealtime("user:update", { room: userRoom(row.user_id), payload: { type: "deposit:update", depositId: row.id, status: body.status } });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
