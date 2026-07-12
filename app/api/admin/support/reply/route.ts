import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { consumeIpRate } from "@/lib/rate-limit";

const MAX_TEXT_LENGTH = 2000;
const ADMIN_SEND_LIMIT = 30;
const ADMIN_SEND_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  try {
    await requireAdmin();

    // Rate limit
    const ipLimit = consumeIpRate(request, "admin-support-reply", ADMIN_SEND_LIMIT, ADMIN_SEND_WINDOW_MS);
    if (!ipLimit.allowed) {
      return tooManyRequests("Too many messages. Please slow down.", ipLimit.retryAfterMs);
    }

    const body = await readJson<{ userId: number; text: string }>(request);
    const userId = Number(body.userId);
    const text = (body.text || "").trim();

    if (!Number.isInteger(userId) || userId <= 0) {
      return badRequest("Invalid userId");
    }
    if (!text) {
      return badRequest("Message cannot be empty");
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return badRequest(`Message too long (max ${MAX_TEXT_LENGTH} characters)`);
    }

    const db = getDb();

    // Verify user exists
    const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!userExists) {
      return badRequest("User not found");
    }

    const result = db
      .prepare(
        "INSERT INTO support_messages (user_id, role, text, read_by_user, read_by_admin) VALUES (?, 'agent', ?, 0, 1)"
      )
      .run(userId, text);

    try {
      const { emitRealtime, userRoom } = await import("@/lib/realtime");
      emitRealtime("support:message", {
        room: userRoom(userId),
        payload: {
          userId,
          message: { id: Number(result.lastInsertRowid), role: "agent", text, createdAt: new Date().toISOString(), message_type: "text" },
        },
      });
    } catch { /* realtime is best-effort */ }

    return json({
      ok: true,
      message: {
        id: result.lastInsertRowid,
        role: "agent",
        text,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
