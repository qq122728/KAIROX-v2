import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { getDb, inTransaction } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { consumeIpRate } from "@/lib/rate-limit";
import { isStableAsset, normalizeAsset, syncUserStableBalance } from "@/lib/balances";

const MAX_FIAT_DEPOSIT_USDC = Number(process.env.MAX_FIAT_DEPOSIT_USDC || process.env.MAX_FIAT_DEPOSIT_USDT || 10000);
const MAX_DEVIATION = 0.1; // ±10%

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    const rateLimit = consumeIpRate(request, "admin-fiat-confirm", 30, 60000);
    if (!rateLimit.allowed) {
      return tooManyRequests("Too many requests.", rateLimit.retryAfterMs);
    }

    const body = await readJson<{ depositId: number; confirmedUsdt?: number }>(request);
    const depositId = Number(body.depositId);
    if (!Number.isInteger(depositId) || depositId <= 0) return badRequest("Invalid depositId");

    const db = getDb();
    const deposit = db.prepare("SELECT * FROM fiat_deposits WHERE id = ?").get(depositId) as
      | { id: number; user_id: number; status: string; currency: string; estimated_usdt: number; amount_fiat: number; final_rate: number }
      | undefined;
    if (!deposit) return badRequest("Deposit not found");

    if (deposit.status !== "submitted") {
      return badRequest("Deposit must be in 'submitted' status to confirm");
    }

    // Only use estimated_usdt when confirmedUsdt is truly absent (not sent, null, or empty string)
    // Explicit values (0, negative, NaN, string) must be validated strictly
    const rawBody = body as Record<string, unknown>;
    const rawConfirmed = rawBody.confirmedUsdt;
    const hasCustomAmount = rawConfirmed !== undefined && rawConfirmed !== null && String(rawConfirmed).trim() !== "";

    let confirmedUsdt: number;
    if (hasCustomAmount) {
      const n = Number(rawConfirmed);
      if (!Number.isFinite(n) || n <= 0) {
        return badRequest("Confirmed amount must be greater than 0.");
      }
      confirmedUsdt = n;
    } else {
      confirmedUsdt = deposit.estimated_usdt;
    }

    if (!deposit.amount_fiat || !Number.isFinite(deposit.estimated_usdt) || deposit.estimated_usdt <= 0) {
      return badRequest("Deposit amount data is incomplete");
    }

    if (confirmedUsdt > MAX_FIAT_DEPOSIT_USDC) {
      return badRequest(`Confirmed amount exceeds maximum allowed limit (${MAX_FIAT_DEPOSIT_USDC} USDC)`);
    }

    const deviation = Math.abs(confirmedUsdt - deposit.estimated_usdt) / deposit.estimated_usdt;
    if (deviation > MAX_DEVIATION) {
      return badRequest(
        `Confirmed amount differs too much from estimated amount (max ${MAX_DEVIATION * 100}% deviation). Estimated: ${deposit.estimated_usdt.toFixed(2)} USDC`
      );
    }

    // Atomic transaction
    let alreadyConfirmed = false;
    try {
      inTransaction(() => {
        // Re-read inside transaction to prevent race
        const fresh = db.prepare("SELECT id, user_id, status, currency, amount_fiat FROM fiat_deposits WHERE id = ?").get(depositId) as
          | { id: number; user_id: number; status: string; currency: string; amount_fiat: number }
          | undefined;
        if (!fresh || fresh.status !== "submitted") {
          alreadyConfirmed = true;
          throw new Error("Deposit status changed");
        }

        // Add USDT balance — same pattern as existing deposits PATCH
        const asset = normalizeAsset("USDC");
        db.prepare("INSERT INTO user_assets (user_id, asset, balance, locked) VALUES (?, ?, 0, 0) ON CONFLICT(user_id, asset) DO NOTHING")
          .run(fresh.user_id, asset);
        db.prepare("UPDATE user_assets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ?")
          .run(confirmedUsdt, fresh.user_id, asset);

        if (isStableAsset(asset)) syncUserStableBalance(fresh.user_id);

        // Record transaction
        db.prepare(
          "INSERT INTO asset_transactions (user_id, asset, type, amount, status, note, actor_id) VALUES (?, ?, 'deposit', ?, 'completed', ?, ?)"
        ).run(fresh.user_id, asset, confirmedUsdt, `Fiat deposit confirmed: ${fresh.amount_fiat} ${fresh.currency}`, admin.id);

        // Update deposit status
        db.prepare(
          `UPDATE fiat_deposits SET status = 'confirmed', confirmed_usdt = ?, confirm_admin_id = ?, confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(confirmedUsdt, admin.id, depositId);
      });
    } catch (error) {
      if (alreadyConfirmed) return json({ error: "Deposit has already been processed" }, 409);
      throw error;
    }

    // Insert success message
    db
      .prepare(
        `INSERT INTO support_messages (user_id, role, text, message_type, metadata_json, read_by_user, read_by_admin)
         VALUES (?, 'agent', ?, 'fiat_status', ?, 0, 1)`
      )
      .run(
        deposit.user_id,
        `✅ Your deposit of ${deposit.amount_fiat} ${deposit.currency} has been confirmed. ${confirmedUsdt} USDC has been added to your balance.`,
        JSON.stringify({ depositId, status: "confirmed", confirmedUsdt, currency: deposit.currency, amountFiat: deposit.amount_fiat })
      );

    const updated = db.prepare("SELECT * FROM fiat_deposits WHERE id = ?").get(depositId);
    return json({ deposit: updated });
  } catch (error) {
    return handleError(error);
  }
}
