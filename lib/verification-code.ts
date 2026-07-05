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

export function storeCode(email: string, code: string, purpose: "register" | "login"): void {
  const db = getDb();
  db.prepare("INSERT INTO email_verification_codes (email, code, purpose) VALUES (?, ?, ?)").run(email, code, purpose);
}

export function verifyCode(email: string, code: string, purpose: "register" | "login"): boolean {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id FROM email_verification_codes WHERE email = ? AND code = ? AND purpose = ? AND used = 0 AND created_at > datetime('now', '-5 minutes') ORDER BY created_at DESC LIMIT 1"
    )
    .get(email, code, purpose) as { id: number } | undefined;

  if (!row) return false;

  // Mark as used
  db.prepare("UPDATE email_verification_codes SET used = 1 WHERE id = ?").run(row.id);
  return true;
}
