import { handleError, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "";
    const currency = url.searchParams.get("currency") || "";
    const userId = url.searchParams.get("userId") || "";

    let sql = `SELECT fd.*, u.username, u.email
               FROM fiat_deposits fd
               JOIN users u ON u.id = fd.user_id
               WHERE 1=1`;
    const params: (string | number)[] = [];

    if (status) {
      sql += " AND fd.status = ?";
      params.push(status);
    }
    if (currency) {
      sql += " AND fd.currency = ?";
      params.push(currency.toUpperCase());
    }
    if (userId) {
      sql += " AND fd.user_id = ?";
      params.push(Number(userId));
    }

    sql += " ORDER BY fd.created_at DESC LIMIT 200";

    const deposits = getDb().prepare(sql).all(...params);
    return json({ deposits });
  } catch (error) {
    return handleError(error);
  }
}
