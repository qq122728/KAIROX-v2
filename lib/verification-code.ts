import crypto from "node:crypto";
import { getDb } from "./db";

const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const SEND_INTERVAL_MS = 60_000; // 1 code per 60s per email
const MAX_CODES_PER_WINDOW = 5; // max 5 codes per email per 10 min
const WINDOW_MS = 10 * 60_000;

export function generateCode(): string {
  // 6-digit numeric
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

export function canSendCode(email: string): { allowed: boolean; retryAfterMs?: number; reason?: string } {
  const db = getDb();

  // Check last send time for this email
  const last = db
    .prepare("SELECT created_at FROM email_verification_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1")
    .get(email) as { created_at: string } | undefined;

  if (last) {
    const elapsed = Date.now() - new Date(last.created_at.replace(" ", "T") + "Z").getTime();
    if (elapsed < SEND_INTERVAL_MS) {
      return { allowed: false, retryAfterMs: SEND_INTERVAL_MS - elapsed, reason: "Please wait before requesting another code" };
    }
  }

  // Check burst limit (max codes per window)
  const count = (
    db.prepare("SELECT COUNT(*) AS c FROM email_verification_codes WHERE email = ? AND created_at > datetime('now', '-10 minutes')").get(email) as { c: number }
  ).c;

  if (count >= MAX_CODES_PER_WINDOW) {
    return { allowed: false, retryAfterMs: WINDOW_MS, reason: "Too many code requests. Please try again later." };
  }

  return { allowed: true };
}

export type CodePurpose = "register" | "login" | "reset_password";

function hashCode(email: string, code: string, purpose: CodePurpose): string {
  return crypto.createHash("sha256").update(`ec:${email}:${code}:${purpose}`).digest("hex");
}

export function storeCode(email: string, code: string, purpose: CodePurpose): void {
  const db = getDb();
  const hash = hashCode(email, code, purpose);
  db.prepare("INSERT INTO email_verification_codes (email, code, purpose) VALUES (?, ?, ?)").run(email, hash, purpose);
}

export function verifyCode(email: string, code: string, purpose: CodePurpose): boolean {
  const db = getDb();
  const hash = hashCode(email, code, purpose);
  const row = db
    .prepare(
      "SELECT id FROM email_verification_codes WHERE email = ? AND code = ? AND purpose = ? AND used = 0 AND created_at > datetime('now', '-5 minutes') ORDER BY created_at DESC LIMIT 1"
    )
    .get(email, hash, purpose) as { id: number } | undefined;

  if (!row) return false;

  // Mark as used
  db.prepare("UPDATE email_verification_codes SET used = 1 WHERE id = ?").run(row.id);
  return true;
}

const RESET_MAX_ATTEMPTS = 5;
const RESET_LOCK_MS = 10 * 60_000; // 10 minutes

export function checkResetPasswordLocked(email: string): { locked: true; reason: string } | { locked: false } {
  const db = getDb();
  const row = db
    .prepare("SELECT attempts, locked_until FROM reset_password_attempts WHERE email = ?")
    .get(email) as { attempts: number; locked_until: string | null } | undefined;

  if (!row) return { locked: false };

  // Check if lock is still active
  if (row.locked_until) {
    // Support both ISO format and SQLite CURRENT_TIMESTAMP format
    const lockTime = new Date(row.locked_until.replace(" ", "T")).getTime();
    if (Number.isFinite(lockTime) && lockTime > Date.now()) {
      return { locked: true, reason: "Too many attempts. Please try again later." };
    }
    // Lock expired or invalid — clear it
    db.prepare("UPDATE reset_password_attempts SET attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE email = ?").run(email);
  }

  return { locked: false };
}

export function recordResetPasswordFailure(email: string): void {
  const db = getDb();
  const lockedUntil = new Date(Date.now() + RESET_LOCK_MS).toISOString();

  db.prepare(
    `INSERT INTO reset_password_attempts (email, attempts, locked_until, updated_at)
     VALUES (?, 1, CASE WHEN ? <= 1 THEN ? ELSE NULL END, CURRENT_TIMESTAMP)
     ON CONFLICT(email) DO UPDATE SET
       attempts = reset_password_attempts.attempts + 1,
       locked_until = CASE WHEN reset_password_attempts.attempts + 1 >= ? THEN ? ELSE NULL END,
       updated_at = CURRENT_TIMESTAMP`
  ).run(email, RESET_MAX_ATTEMPTS, lockedUntil, RESET_MAX_ATTEMPTS, lockedUntil);
}

export function clearResetPasswordAttempts(email: string): void {
  const db = getDb();
  db.prepare("DELETE FROM reset_password_attempts WHERE email = ?").run(email);
}
