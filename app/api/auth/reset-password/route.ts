import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { getDb } from "@/lib/db";
import { verifyCode, checkResetPasswordLocked, recordResetPasswordFailure, clearResetPasswordAttempts } from "@/lib/verification-code";
import { hashPassword } from "@/lib/password";
import { consumeIpRate } from "@/lib/rate-limit";

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60_000; // 10 minutes
const resetAttemptLimit = Math.max(1, Number(process.env.RESET_PASSWORD_MAX_ATTEMPTS || MAX_ATTEMPTS));
const resetWindowMs = Math.max(60_000, Number(process.env.RESET_PASSWORD_WINDOW_MS || ATTEMPT_WINDOW_MS));

export async function POST(request: Request) {
  try {
    const db = getDb();

    const body = await readJson<{
      email: string;
      code: string;
      newPassword: string;
      confirmPassword: string;
    }>(request);
    const email = body.email?.trim().toLowerCase();
    const code = body.code?.trim();
    const newPassword = body.newPassword || "";
    const confirmPassword = body.confirmPassword || "";

    // Validate inputs
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return badRequest("Enter a valid email address");
    }
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return badRequest("Enter a valid 6-digit verification code");
    }
    if (!newPassword) {
      return badRequest("New password is required");
    }
    if (newPassword.length < 6) {
      return badRequest("Password must be at least 6 characters");
    }
    if (newPassword !== confirmPassword) {
      return badRequest("Passwords do not match");
    }

    // IP rate limit
    const ipLimit = consumeIpRate(request, "reset-password", resetAttemptLimit, resetWindowMs);
    if (!ipLimit.allowed) {
      return tooManyRequests("Too many requests. Please try again later.", ipLimit.retryAfterMs);
    }

    // Per-email lock check
    const lockCheck = checkResetPasswordLocked(email);
    if (lockCheck.locked) {
      return tooManyRequests(lockCheck.reason);
    }

    // Verify the code
    if (!verifyCode(email, code, "reset_password")) {
      // Record the failure
      recordResetPasswordFailure(email);
      return badRequest("Invalid or expired verification code");
    }

    // Code verified — clear failure attempts
    clearResetPasswordAttempts(email);

    // Find user
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
    if (!user) {
      // Shouldn't happen if code was verified, but be safe
      return badRequest("Account not found");
    }

    // Update password
    const passwordHash = hashPassword(newPassword);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);

    // Delete all sessions for this user — force re-login
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);

    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
