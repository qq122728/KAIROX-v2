/** @deprecated Legacy verification-code login route retained for backwards compatibility; new clients use /api/auth/login. */
import { createSession } from "@/lib/auth";
import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from "@/lib/login-rate-limit";
import { verifyCode } from "@/lib/verification-code";
import { getDb } from "@/lib/db";

const emailLoginLimit = Math.max(1, Number(process.env.EMAIL_LOGIN_LIMIT || 5));
const emailLoginWindowMs = Math.max(1000, Number(process.env.EMAIL_LOGIN_WINDOW_MS || 60_000));

export async function POST(request: Request) {
  try {
    const body = await readJson<{ email: string; code: string }>(request);
    const email = body.email?.trim().toLowerCase();
    const code = body.code?.trim();

    if (!email || !code) return badRequest("Email and verification code are required");
    if (code.length !== 6 || !/^\d{6}$/.test(code)) return badRequest("Invalid verification code");

    assertLoginAllowed("user", request, email);

    const row = getDb()
      .prepare("SELECT id, COALESCE(login_enabled, 1) AS login_enabled FROM users WHERE email = ?")
      .get(email) as { id: number; login_enabled: number } | undefined;

    if (!row) {
      recordLoginFailure("user", request, email);
      return badRequest("Invalid email or code");
    }

    if (row.login_enabled === 0) return badRequest("Account login is disabled");

    const valid = verifyCode(email, code, "login");
    if (!valid) {
      recordLoginFailure("user", request, email);
      return badRequest("Invalid or expired verification code");
    }

    clearLoginFailures("user", request, email);
    await createSession(row.id, "user");
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
