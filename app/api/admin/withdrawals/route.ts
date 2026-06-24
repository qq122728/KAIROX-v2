import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { getDb, inTransaction } from "@/lib/db";
import { getSettings, settingBool } from "@/lib/settings";
import { emitRealtime, userRoom } from "@/lib/realtime";
import { ensureUserAssetRow, freezeAvailableAssetBalance, isStableAsset, normalizeAsset, syncUserStableBalance } from "@/lib/balances";

type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid";
type WithdrawalCreatePayload = { userId: number | string; asset?: string; amount: number; address?: string; network?: string; note?: string };

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

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<WithdrawalCreatePayload>(request);
    const asset = normalizeAsset(String(body.asset || "USDC"));
    if (!body.userId) return badRequest("User is required");
    if (!asset) return badRequest("Asset is required");
    if (!Number.isFinite(body.amount) || body.amount <= 0) return badRequest("Invalid withdrawal amount");
    const userId = resolveUserId(body.userId);
    if (!userId) return badRequest("User does not exist");

    const settings = getSettings();
    if (!settingBool(settings.withdrawals_enabled, true)) return badRequest("Withdrawals are disabled");
    const minWithdrawal = Number(settings.min_withdrawal_amount || settings.min_withdrawal_usdc || settings.min_withdrawal || 0);
    if (body.amount < minWithdrawal) return badRequest(`Withdrawal amount cannot be lower than ${minWithdrawal}`);

    const user = getDb().prepare("SELECT id, balance, wallet FROM users WHERE id = ?").get(userId) as
      | { id: number; balance: number; wallet: string | null }
      | undefined;
    if (!user) return badRequest("User does not exist");
    let withdrawalId = 0;
    let frozenAsset = asset;
    let insufficientBalance = false;
    try {
      inTransaction(() => {
        ensureUserAssetRow(userId, asset, user.balance);
        const nextFrozenAsset = freezeAvailableAssetBalance(userId, asset, body.amount);
        if (!nextFrozenAsset) {
          insufficientBalance = true;
          throw new Error("Insufficient user balance");
        }
        frozenAsset = nextFrozenAsset;
        if (isStableAsset(frozenAsset)) syncUserStableBalance(userId);

        const result = getDb()
          .prepare("INSERT INTO withdrawals (user_id, asset, amount, address, network, status, note) VALUES (?, ?, ?, ?, ?, 'pending', ?)")
          .run(userId, frozenAsset, body.amount, body.address?.trim() || user.wallet || null, body.network?.trim() || null, body.note?.trim() || "System created withdrawal");
        withdrawalId = Number(result.lastInsertRowid);
        getDb()
          .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, status, note, actor_id) VALUES (?, ?, 'withdrawal_request', ?, 'pending', ?, ?)")
          .run(userId, frozenAsset, -body.amount, body.note?.trim() || `Withdrawal request #${withdrawalId} (admin#${admin.id})`, admin.id);
      });
    } catch (error) {
      if (insufficientBalance) return badRequest("Insufficient user balance");
      throw error;
    }

    emitRealtime("admin:update", { room: "admin", payload: { type: "withdrawal:created", withdrawalId, userId } });
    emitRealtime("user:update", { room: userRoom(userId), payload: { type: "withdrawal:created", withdrawalId } });
    return json({ ok: true, withdrawalId });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<{ withdrawalId: number; status: WithdrawalStatus; note?: string }>(request);
    if (!body.withdrawalId) return badRequest("Missing withdrawal record");
    if (!["approved", "rejected", "paid"].includes(body.status)) return badRequest("Invalid withdrawal status");

    const row = getDb().prepare("SELECT * FROM withdrawals WHERE id = ?").get(body.withdrawalId) as
      | { id: number; user_id: number; asset: string; amount: number; status: WithdrawalStatus }
      | undefined;
    if (!row) return badRequest("Withdrawal record does not exist");
    let alreadyProcessed = false;
    try {
      inTransaction(() => {
        const update = getDb()
          .prepare(
            `UPDATE withdrawals
             SET status = ?, note = COALESCE(?, note), processed_by = ?, processed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'pending'`
          )
          .run(body.status, body.note?.trim() || null, admin.id, row.id);
        if (Number(update.changes || 0) !== 1) {
          alreadyProcessed = true;
          throw new Error("Withdrawal record has already been processed");
        }

        const asset = normalizeAsset(row.asset);
        if (body.status === "approved" || body.status === "paid") {
          const release = getDb()
            .prepare("UPDATE user_assets SET locked = locked - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ? AND locked >= ?")
            .run(row.amount, row.user_id, asset, row.amount);
          if (Number(release.changes || 0) !== 1) throw new Error("Withdrawal locked balance is inconsistent");
          getDb()
            .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, status, note, actor_id) VALUES (?, ?, 'withdrawal_completed', ?, 'completed', ?, ?)")
            .run(row.user_id, asset, -row.amount, body.note?.trim() || "System processed", admin.id);
        }

        if (body.status === "rejected") {
          const refund = getDb()
            .prepare("UPDATE user_assets SET locked = locked - ?, balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ? AND locked >= ?")
            .run(row.amount, row.amount, row.user_id, asset, row.amount);
          if (Number(refund.changes || 0) !== 1) throw new Error("Withdrawal locked balance is inconsistent");
          if (isStableAsset(asset)) syncUserStableBalance(row.user_id);
          getDb()
            .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, status, note, actor_id) VALUES (?, ?, 'withdrawal_rejected', ?, 'completed', ?, ?)")
            .run(row.user_id, asset, row.amount, body.note?.trim() || "System processed", admin.id);
        }
      });
    } catch (error) {
      if (alreadyProcessed) return json({ error: "Withdrawal record has already been processed" }, 409);
      throw error;
    }

    emitRealtime("admin:update", { room: "admin", payload: { type: "withdrawal:update", withdrawalId: row.id, userId: row.user_id, status: body.status } });
    emitRealtime("user:update", { room: userRoom(row.user_id), payload: { type: "withdrawal:update", withdrawalId: row.id, status: body.status } });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
