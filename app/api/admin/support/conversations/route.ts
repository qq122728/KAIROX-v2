import { handleError, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    await requireAdmin();
    const db = getDb();

    // Get the latest message per user, plus unread count
    const conversations = db
      .prepare(
        `SELECT
           u.id AS userId,
           u.username,
           u.email,
           (SELECT text FROM support_messages WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS lastMessage,
           (SELECT created_at FROM support_messages WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS lastMessageAt,
           (SELECT COUNT(*) FROM support_messages WHERE user_id = u.id AND role = 'user' AND read_by_admin = 0) AS unreadCount
         FROM users u
         WHERE u.id IN (SELECT DISTINCT user_id FROM support_messages)
         ORDER BY lastMessageAt DESC
         LIMIT 50`
      )
      .all() as Array<{
        userId: number;
        username: string;
        email: string | null;
        lastMessage: string | null;
        lastMessageAt: string | null;
        unreadCount: number;
      }>;

    return json({ ok: true, conversations });
  } catch (error) {
    return handleError(error);
  }
}
