import { createSession } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { createPublicUid, getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getSettings, settingBool } from "@/lib/settings";

const startingBalance = 0;

export async function POST(request: Request) {
  try {
    const settings = getSettings();
    if (!settingBool(settings.registration_enabled, true)) return badRequest("Registration is currently disabled");
    const body = await readJson<{
      email: string;
      password: string;
      confirmPassword: string;
      withdrawalPassword: string;
      confirmWithdrawalPassword: string;
      nickname?: string;
      inviteCode?: string;
    }>(request);
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest("Enter a valid email address");
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
    const inviteRaw = String(body.inviteCode || "").trim();
    const inviteCode = inviteRaw ? inviteRaw.slice(0, 64) : null;

    const database = getDb();
    const result = database
      .prepare(
        "INSERT INTO users (public_uid, username, email, password_hash, withdrawal_password_hash, role, balance, nickname, invite_code_used) VALUES (?, ?, ?, ?, ?, 'trader', ?, ?, ?)"
      )
      .run(createPublicUid(database), email, email, hashPassword(password), hashPassword(withdrawalPassword), startingBalance, nickname, inviteCode);
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
    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "Email is already registered" : undefined;
    return message ? badRequest(message) : handleError(error);
  }
}
