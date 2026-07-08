import { badRequest, handleError, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const db = getDb();

    const { searchParams } = new URL(request.url);
    const userIdStr = searchParams.get("userId");
    const userId = Number(userIdStr);

    if (!userIdStr || !Number.isInteger(userId) || userId <= 0) {
      return badRequest("Invalid userId");
    }

    // Verify user exists
    const userExists = db.prepare("SELECT id, username, email FROM users WHERE id = ?").get(userId) as { id: number; username: string; email: string | null } | undefined;
    if (!userExists) {
      return badRequest("User not found");
    }

    const messages = db
      .prepare(
        "SELECT id, role, text, read_by_user, read_by_admin, created_at, message_type, metadata_json FROM support_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 100"
      )
      .all(userId) as Array<{
        id: number;
        role: string;
        text: string;
        read_by_user: number;
        read_by_admin: number;
        created_at: string;
        message_type: string | null;
        metadata_json: string | null;
      }>;

    // Mark user messages as read by admin
    db.prepare(
      "UPDATE support_messages SET read_by_admin = 1 WHERE user_id = ? AND role = 'user' AND read_by_admin = 0"
    ).run(userId);

    return json({
      ok: true,
      user: { id: userExists.id, username: userExists.username, email: userExists.email },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        createdAt: m.created_at,
        message_type: m.message_type || "text",
        metadata_json: m.metadata_json,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
