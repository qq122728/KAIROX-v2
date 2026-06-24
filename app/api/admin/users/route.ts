import { getDb, inTransaction } from "@/lib/db";
import { invalidateUserSessions, requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { emitRealtime, userRoom } from "@/lib/realtime";
import { ensureUserAssetRow, isStableAsset, normalizeAsset, syncUserStableBalance } from "@/lib/balances";

const supportedAssets = new Set(["USDC", "BTC", "ETH", "SOL"]);

type UserPatch = {
  userId: number | string;
  delta?: number;
  asset?: string;
  operation?: "credit" | "debit" | "freeze" | "unfreeze";
  role?: "admin" | "trader";
  remark?: string;
  tradingEnabled?: boolean;
  loginEnabled?: boolean;
  loginPassword?: string;
  withdrawalPassword?: string;
};

function resolveUserId(input?: number | string) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const database = getDb();
  const byPublicUid = database.prepare("SELECT id FROM users WHERE public_uid = ?").get(raw) as { id: number } | undefined;
  if (byPublicUid) return byPublicUid.id;
  const numericId = Number(raw);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const byId = database.prepare("SELECT id FROM users WHERE id = ?").get(numericId) as { id: number } | undefined;
  return byId?.id ?? null;
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<UserPatch>(request);
    if (!body.userId) return badRequest("Missing user");

    const userId = resolveUserId(body.userId);
    if (!userId) return badRequest("User does not exist");
    const targetUser = getDb().prepare("SELECT id, role, balance FROM users WHERE id = ?").get(userId) as
      | { id: number; role: "admin" | "trader"; balance: number }
      | undefined;
    if (!targetUser) return badRequest("User does not exist");
    const asset = normalizeAsset(body.asset || "USDC");
    if (!/^[A-Z0-9]{2,12}$/.test(asset)) return badRequest("Invalid asset");
    if (!supportedAssets.has(asset)) return badRequest("Unsupported asset");

    if (typeof body.delta === "number" && Number.isFinite(body.delta) && body.delta !== 0) {
      if (targetUser.id === admin.id) return badRequest("Admins cannot adjust their own funds");
      const amount = Math.abs(body.delta);
      const operation = body.operation || (body.delta >= 0 ? "credit" : "debit");

      let invalidBalance = false;
      try {
        inTransaction(() => {
          ensureUserAssetRow(userId, asset, targetUser.balance);

          if (operation === "credit") {
            getDb()
              .prepare("UPDATE user_assets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ?")
              .run(amount, userId, asset);
          }

          if (operation === "debit") {
            const debit = getDb()
              .prepare("UPDATE user_assets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ? AND balance >= ?")
              .run(amount, userId, asset, amount);
            if (Number(debit.changes || 0) !== 1) {
              invalidBalance = true;
              throw new Error("Insufficient user balance");
            }
          }

          if (operation === "freeze") {
            const freeze = getDb()
              .prepare(
                "UPDATE user_assets SET balance = balance - ?, locked = locked + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ? AND balance >= ?"
              )
              .run(amount, amount, userId, asset, amount);
            if (Number(freeze.changes || 0) !== 1) {
              invalidBalance = true;
              throw new Error("Insufficient user balance");
            }
          }

          if (operation === "unfreeze") {
            const unfreeze = getDb()
              .prepare(
                "UPDATE user_assets SET locked = locked - ?, balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ? AND locked >= ?"
              )
              .run(amount, amount, userId, asset, amount);
            if (Number(unfreeze.changes || 0) !== 1) {
              invalidBalance = true;
              throw new Error("Insufficient locked balance");
            }
          }

          if (isStableAsset(asset)) syncUserStableBalance(userId);
          getDb()
            .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, note, actor_id) VALUES (?, ?, 'admin_adjust', ?, ?, ?)")
            .run(userId, asset, operation === "debit" || operation === "freeze" ? -amount : amount, `admin#${admin.id} ${operation}`, admin.id);
        });
      } catch (error) {
        if (invalidBalance) return badRequest(operation === "unfreeze" ? "Insufficient locked balance" : "Insufficient user balance");
        throw error;
      }
    }

    if (body.role === "admin" || body.role === "trader") {
      if (targetUser.id === admin.id) return badRequest("Admins cannot change their own role");
      if (body.role === "admin" && targetUser.role !== "admin") return badRequest("Promoting users to admin is not allowed here");
      getDb().prepare("UPDATE users SET role = ? WHERE id = ?").run(body.role, userId);
    }
    if (typeof body.remark === "string") {
      getDb().prepare("UPDATE users SET remark = ? WHERE id = ?").run(body.remark.trim(), userId);
    }
    if (typeof body.tradingEnabled === "boolean") {
      getDb().prepare("UPDATE users SET trading_enabled = ? WHERE id = ?").run(body.tradingEnabled ? 1 : 0, userId);
    }
    if (typeof body.loginEnabled === "boolean") {
      getDb().prepare("UPDATE users SET login_enabled = ? WHERE id = ?").run(body.loginEnabled ? 1 : 0, userId);
      if (!body.loginEnabled) invalidateUserSessions(userId);
    }
    if (typeof body.loginPassword === "string") {
      const loginPassword = body.loginPassword.trim();
      if (loginPassword.length < 6) return badRequest("Login password must be at least 6 characters");
      getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(loginPassword), userId);
      invalidateUserSessions(userId);
    }
    if (typeof body.withdrawalPassword === "string") {
      const withdrawalPassword = body.withdrawalPassword.trim();
      if (withdrawalPassword.length < 6) return badRequest("Withdrawal password must be at least 6 characters");
      getDb().prepare("UPDATE users SET withdrawal_password_hash = ? WHERE id = ?").run(hashPassword(withdrawalPassword), userId);
      invalidateUserSessions(userId);
    }

    emitRealtime("admin:update", { room: "admin", payload: { type: "user:update", userId } });
    emitRealtime("user:update", { room: userRoom(userId), payload: { type: "account:update" } });

    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
