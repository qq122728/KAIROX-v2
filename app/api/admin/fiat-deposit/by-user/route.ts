import { badRequest, handleError, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const userId = Number(url.searchParams.get("userId") || 0);
    if (!Number.isInteger(userId) || userId <= 0) {
      return badRequest("Invalid userId");
    }

    const deposits = getDb()
      .prepare("SELECT * FROM fiat_deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
      .all(userId);
    return json({ deposits });
  } catch (error) {
    return handleError(error);
  }
}
