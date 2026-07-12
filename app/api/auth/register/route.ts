import { createSession } from "@/lib/auth";
import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { createPublicUid, getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getSettings, settingBool } from "@/lib/settings";
import { consumeIpRate } from "@/lib/rate-limit";
import { emitRealtime } from "@/lib/realtime";
import { normalizeEmail, normalizePhone } from "@/lib/auth-identifier";

const startingBalance = 0;

const registerLimit = Math.max(1, Number(process.env.PERP_SIM_REGISTER_LIMIT || 5));
const registerWindowMs = Math.max(1000, Number(process.env.PERP_SIM_REGISTER_WINDOW_MS || 60_000));

export async function POST(request: Request) {
  try {
    const settings = getSettings();
    if (!settingBool(settings.registration_enabled, true)) return badRequest("Registration is currently disabled");
    const limit = consumeIpRate(request, "register", registerLimit, registerWindowMs);
    if (!limit.allowed) return tooManyRequests("Too many registration attempts. Please try again later.", limit.retryAfterMs);
    const body = await readJson<{
      identifierType?: "email" | "phone";
      email?: string;
      phone?: string;
      countryCode?: string;
      password: string;
      confirmPassword: string;
      withdrawalPassword: string;
      confirmWithdrawalPassword: string;
      nickname?: string;
      inviteCode?: string;
      referralCode?: string;
    }>(request);
    const identifierType = body.identifierType || (body.email ? "email" : "phone");
    let email: string | null = null;
    let phone: string | null = null;
    try {
      if (identifierType === "email") {
        email = normalizeEmail(body.email);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest("Enter a valid email address");
      } else if (identifierType === "phone") {
        phone = normalizePhone(body.phone, body.countryCode);
      } else return badRequest("Choose email or phone registration");
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Enter a valid identifier");
    }
    const password = String(body.password || "").trim();
    const confirmPassword = String(body.confirmPassword || "").trim();
    const withdrawalPassword = String(body.withdrawalPassword || "").trim();
    const confirmWithdrawalPassword = String(body.confirmWithdrawalPassword || "").trim();
    if (!password || password.length < 6) return badRequest("Login password must be at least 6 characters");
    if (password !== confirmPassword) return badRequest("Login passwords do not match");
    if (!withdrawalPassword || withdrawalPassword.length < 6) return badRequest("Withdrawal password must be at least 6 characters");
    if (withdrawalPassword !== confirmWithdrawalPassword) return badRequest("Withdrawal passwords do not match");
    const nicknameRaw = String(body.nickname || "").trim();
    const nickname = nicknameRaw ? nicknameRaw.slice(0, 64) : null;
    const inviteRaw = String(body.referralCode || body.inviteCode || "").trim();
    const inviteCode = inviteRaw ? inviteRaw.slice(0, 64) : null;

    const database = getDb();
    const result = database
      .prepare(
        "INSERT INTO users (public_uid, username, email, phone, password_hash, withdrawal_password_hash, role, balance, nickname, invite_code_used) VALUES (?, ?, ?, ?, ?, ?, 'trader', ?, ?, ?)"
      )
      .run(createPublicUid(database), email || phone, email, phone, hashPassword(password), hashPassword(withdrawalPassword), startingBalance, nickname, inviteCode);
    const userId = Number(result.lastInsertRowid);
    database
      .prepare("INSERT INTO user_assets (user_id, asset, balance) VALUES (?, 'USDC', ?) ON CONFLICT(user_id, asset) DO NOTHING")
      .run(userId, startingBalance);
    if (startingBalance > 0) {
      database
        .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, note) VALUES (?, 'USDC', 'signup_bonus', ?, ?)")
        .run(userId, startingBalance, "Signup simulated USDC");
    }
    await createSession(userId, "user");
    emitRealtime("admin:update", { room: "admin", payload: { type: "user:registered", userId, email, phone } });
    return json({ ok: true });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    const message = raw.includes("users.phone") ? "Phone number is already registered" : raw.includes("UNIQUE") ? "Email is already registered" : undefined;
    return message ? badRequest(message) : handleError(error);
  }
}
