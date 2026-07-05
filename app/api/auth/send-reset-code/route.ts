import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { sendEmailCode } from "@/lib/email";
import { canSendCode, generateCode, storeCode, checkResetPasswordLocked } from "@/lib/verification-code";
import { getDb } from "@/lib/db";
import { consumeIpRate } from "@/lib/rate-limit";

const sendLimit = Math.max(1, Number(process.env.EMAIL_CODE_SEND_LIMIT || 3));
const sendWindowMs = Math.max(1000, Number(process.env.EMAIL_CODE_SEND_WINDOW_MS || 60_000));

export async function POST(request: Request) {
  try {
    const limit = consumeIpRate(request, "reset-code-send", sendLimit, sendWindowMs);
    if (!limit.allowed) return tooManyRequests("Too many requests. Please try again later.", limit.retryAfterMs);

    const body = await readJson<{ email: string }>(request);
    const email = body.email?.trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return badRequest("Enter a valid email address");
    }

    const db = getDb();

    // Check if email exists — but DON'T reveal this to the caller
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;

    // Security: always return the same ambiguous message regardless of email existence
    if (!user) {
      // If the email doesn't exist, still return ok to avoid user enumeration
      return json({ ok: true });
    }

    // Check if this email is locked out from reset_password
    const lockCheck = checkResetPasswordLocked(email);
    if (lockCheck.locked) {
      return tooManyRequests(lockCheck.reason);
    }

    const rateCheck = canSendCode(email);
    if (!rateCheck.allowed) {
      return tooManyRequests(rateCheck.reason || "Please wait", rateCheck.retryAfterMs);
    }

    const code = generateCode();
    storeCode(email, code, "reset_password");
    sendEmailCode(email, code, "reset_password");

    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
