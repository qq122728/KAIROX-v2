import { handleError, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const deposit = getDb()
      .prepare(
        `SELECT * FROM fiat_deposits WHERE user_id = ? AND status NOT IN ('confirmed','rejected') ORDER BY created_at DESC LIMIT 1`
      )
      .get(user.id) as Record<string, unknown> | undefined;
    if (deposit) {
      delete deposit.proof_data; // never expose base64 to user
    }
    return json({ deposit: deposit || null });
  } catch (error) {
    return handleError(error);
  }
}
