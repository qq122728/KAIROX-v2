import { handleError, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const deposits = getDb()
      .prepare("SELECT * FROM fiat_deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
      .all(user.id);
    return json({ deposits });
  } catch (error) {
    return handleError(error);
  }
}
