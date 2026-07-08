import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { consumeIpRate, consumeUserRate } from "@/lib/rate-limit";

const MAX_TEXT_LENGTH = 2000;
const USER_SEND_LIMIT = 20;
const USER_SEND_WINDOW_MS = 60_000; // 20 per minute per user
const IP_SEND_LIMIT = 10;
const IP_SEND_WINDOW_MS = 60_000; // 10 per minute per IP

export async function GET() {
  try {
    const user = await requireUser();
    const db = getDb();

    const messages = db
      .prepare(
        "SELECT id, role, text, read_by_user, read_by_admin, created_at, message_type, metadata_json FROM support_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 50"
      )
      .all(user.id) as Array<{
        id: number;
        role: string;
        text: string;
        read_by_user: number;
        read_by_admin: number;
        created_at: string;
        message_type: string | null;
        metadata_json: string | null;
      }>;

    // Mark agent messages as read by user
    db.prepare(
      "UPDATE support_messages SET read_by_user = 1 WHERE user_id = ? AND role = 'agent' AND read_by_user = 0"
    ).run(user.id);

    return json({
      ok: true,
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

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    // IP rate limit
    const ipLimit = consumeIpRate(request, "support-send", IP_SEND_LIMIT, IP_SEND_WINDOW_MS);
    if (!ipLimit.allowed) {
      return tooManyRequests("Too many messages. Please slow down.", ipLimit.retryAfterMs);
    }

    // Per-user rate limit
    const userLimit = consumeUserRate(user.id, "support-send", USER_SEND_LIMIT, USER_SEND_WINDOW_MS);
    if (!userLimit.allowed) {
      return tooManyRequests("Too many messages. Please slow down.", userLimit.retryAfterMs);
    }

    const body = await readJson<{ text: string }>(request);
    const text = (body.text || "").trim();

    if (!text) {
      return badRequest("Message cannot be empty");
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return badRequest(`Message too long (max ${MAX_TEXT_LENGTH} characters)`);
    }

    const db = getDb();
    const result = db
      .prepare(
        "INSERT INTO support_messages (user_id, role, text, read_by_user, read_by_admin) VALUES (?, 'user', ?, 1, 0)"
      )
      .run(user.id, text);

    return json({
      ok: true,
      message: {
        id: result.lastInsertRowid,
        role: "user",
        text,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
