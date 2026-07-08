import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { consumeIpRate, consumeUserRate } from "@/lib/rate-limit";

const VALID_CURRENCIES = new Set(["USD", "MYR", "GBP", "EUR", "JPY", "TWD"]);
const REQUEST_LIMIT = 5;
const REQUEST_WINDOW_MS = 3600_000;
const IP_LIMIT = 20;
const IP_WINDOW_MS = 3600_000;

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const ipLimit = consumeIpRate(request, "fiat-deposit-request", IP_LIMIT, IP_WINDOW_MS);
    if (!ipLimit.allowed) {
      return tooManyRequests("Too many requests. Please try again later.", ipLimit.retryAfterMs);
    }

    const userLimit = consumeUserRate(user.id, "fiat-deposit-request", REQUEST_LIMIT, REQUEST_WINDOW_MS);
    if (!userLimit.allowed) {
      return tooManyRequests("Too many requests. Please try again later.", userLimit.retryAfterMs);
    }

    const body = await readJson<{ currency: string }>(request);
    const currency = (body.currency || "").trim().toUpperCase();

    if (!VALID_CURRENCIES.has(currency)) {
      return badRequest("Invalid currency. Supported: USD, MYR, GBP, EUR, JPY, TWD");
    }

    const db = getDb();

    // Check for existing unfinished deposit
    const existing = db
      .prepare("SELECT * FROM fiat_deposits WHERE user_id = ? AND status NOT IN ('confirmed','rejected') ORDER BY created_at DESC LIMIT 1")
      .get(user.id) as Record<string, unknown> | undefined;
    if (existing) {
      return json({ deposit: existing });
    }

    // Create deposit record
    const depositResult = db
      .prepare("INSERT INTO fiat_deposits (user_id, currency, status) VALUES (?, ?, 'requested')")
      .run(user.id, currency);
    const depositId = Number(depositResult.lastInsertRowid);

    // Insert support message
    const msgResult = db
      .prepare(
        "INSERT INTO support_messages (user_id, role, text, message_type, metadata_json, read_by_user, read_by_admin) VALUES (?, 'user', ?, 'fiat_request', ?, 1, 0)"
      )
      .run(
        user.id,
        `Fiat deposit request created. Currency: ${currency}. Please wait for support to provide bank transfer details.`,
        JSON.stringify({ currency, depositId })
      );

    // Link message to deposit
    db.prepare("UPDATE fiat_deposits SET request_message_id = ? WHERE id = ?").run(
      Number(msgResult.lastInsertRowid),
      depositId,
    );

    const deposit = db.prepare("SELECT * FROM fiat_deposits WHERE id = ?").get(depositId);
    return json({ deposit });
  } catch (error) {
    return handleError(error);
  }
}
