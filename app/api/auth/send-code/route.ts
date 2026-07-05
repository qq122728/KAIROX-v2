import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { sendEmailCode } from "@/lib/email";
import { canSendCode, generateCode, storeCode } from "@/lib/verification-code";
import { getDb } from "@/lib/db";
import { consumeIpRate } from "@/lib/rate-limit";

const sendLimit = Math.max(1, Number(process.env.EMAIL_CODE_SEND_LIMIT || 3));
const sendWindowMs = Math.max(1000, Number(process.env.EMAIL_CODE_SEND_WINDOW_MS || 60_000));

export async function POST(request: Request) {
  try {
    const limit = consumeIpRate(request, "email-code-send", sendLimit, sendWindowMs);
    if (!limit.allowed) return tooManyRequests("Too many requests. Please try again later.", limit.retryAfterMs);

    const body = await readJson<{ email: string; purpose: "register" | "login" }>(request);
    const email = body.email?.trim().toLowerCase();
    const purpose = body.purpose === "login" ? "login" : "register";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return badRequest("Enter a valid email address");
    }

    const db = getDb();

    if (purpose === "register") {
      const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (exists) return badRequest("This email is already registered");
    } else {
      const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (!exists) return badRequest("No account found with this email");
    }

    const rateCheck = canSendCode(email);
    if (!rateCheck.allowed) {
      return tooManyRequests(rateCheck.reason || "Please wait", rateCheck.retryAfterMs);
    }

    const code = generateCode();
    storeCode(email, code, purpose);
    sendEmailCode(email, code, purpose);

    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
