import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { consumeUserRate } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const rateLimit = consumeUserRate(user.id, "fiat-deposit-submit", 10, 60000);
    if (!rateLimit.allowed) {
      return tooManyRequests("Too many attempts. Please slow down.", rateLimit.retryAfterMs);
    }

    const body = await readJson<{
      depositId: number;
      amountFiat: number;
      transferReference?: string;
      remark?: string;
    }>(request);

    const depositId = Number(body.depositId);
    const amountFiat = Number(body.amountFiat);
    const transferReference = (body.transferReference || "").trim() || null;
    const userRemark = (body.remark || "").trim() || null;

    if (!Number.isInteger(depositId) || depositId <= 0) {
      return badRequest("Invalid depositId");
    }
    if (!Number.isFinite(amountFiat) || amountFiat <= 0) {
      return badRequest("amountFiat must be > 0");
    }

    const db = getDb();
    const deposit = db.prepare("SELECT * FROM fiat_deposits WHERE id = ?").get(depositId) as
      | { id: number; user_id: number; status: string; currency: string; final_rate: number; bank_snapshot_json: string | null }
      | undefined;

    if (!deposit) return badRequest("Deposit not found");
    if (deposit.user_id !== user.id) return badRequest("Deposit not found");

    if (deposit.status !== "bank_sent" && deposit.status !== "submitted") {
      return badRequest("Bank details have not been sent yet");
    }

    // Validate min/max from bank snapshot
    if (deposit.bank_snapshot_json) {
      try {
        const snapshot = JSON.parse(deposit.bank_snapshot_json);
        if (snapshot.min_amount && amountFiat < snapshot.min_amount) {
          return badRequest(`Minimum deposit amount is ${snapshot.min_amount} ${snapshot.currency || ""}`);
        }
        if (snapshot.max_amount && amountFiat > snapshot.max_amount) {
          return badRequest(`Maximum deposit amount is ${snapshot.max_amount} ${snapshot.currency || ""}`);
        }
      } catch { /* ignore */ }
    }

    const finalRate = deposit.final_rate || 0;
    const estimatedUsdt = Math.round(amountFiat * finalRate * 100) / 100;

    db.prepare(
      `UPDATE fiat_deposits SET status = 'submitted', amount_fiat = ?, estimated_usdt = ?, transfer_reference = ?, user_remark = ?, submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
    ).run(amountFiat, estimatedUsdt, transferReference, userRemark, depositId, user.id);

    // Insert support message
    db
      .prepare(
        `INSERT INTO support_messages (user_id, role, text, message_type, metadata_json, read_by_user, read_by_admin)
         VALUES (?, 'user', ?, 'fiat_transfer', ?, 1, 0)`
      )
      .run(
        user.id,
        `Transfer info submitted: ${amountFiat} ${deposit.currency}`,
        JSON.stringify({ depositId, amountFiat, currency: deposit.currency, estimatedUsdt, transferReference, userRemark })
      );

    const updated = db.prepare("SELECT * FROM fiat_deposits WHERE id = ?").get(depositId);
    return json({ deposit: updated });
  } catch (error) {
    return handleError(error);
  }
}
