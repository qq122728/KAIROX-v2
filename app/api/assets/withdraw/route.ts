import { requireUser } from "@/lib/auth";
import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { getDb, inTransaction } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { getSettings, settingBool } from "@/lib/settings";
import { emitRealtime, userRoom } from "@/lib/realtime";
import { ensureUserAssetRow, freezeAvailableAssetBalance, isStableAsset, normalizeAsset, syncUserStableBalance } from "@/lib/balances";
import { getAssetUsdPrice } from "@/lib/swap";
import { consumeUserRate } from "@/lib/rate-limit";
import { normalizeNetworkCode } from "@/lib/network-config";


const withdrawalPasswordLimit = Number(process.env.PERP_SIM_WITHDRAW_PASSWORD_LIMIT || 5);
const withdrawalPasswordWindowMs = Number(process.env.PERP_SIM_WITHDRAW_PASSWORD_WINDOW_MS || 10 * 60 * 1000);

async function withdrawalUsdValue(asset: string, amount: number) {
  if (isStableAsset(asset)) return amount;
  const price = await getAssetUsdPrice(asset);
  if (!price.price || price.price <= 0) throw new Error("Price unavailable");
  return amount * price.price;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const settings = getSettings();
    if (!settingBool(settings.withdrawal_enabled || settings.withdrawals_enabled, true)) return badRequest("Withdrawals are currently disabled");

    const body = await readJson<{ asset?: string; amount: number; address: string; network?: string; withdrawalPassword: string; clientRequestId?: string }>(request);
    const clientRequestId = String(body.clientRequestId || "").trim() || null;

    const asset = normalizeAsset(String(body.asset || "USDC"));
    const networkCode = normalizeNetworkCode(String(body.network || ""));
    const amount = Number(body.amount);
    const minUsd = Number(settings.min_withdrawal_usdc || settings.min_withdrawal_amount || 10);
    if (!asset) return badRequest("Asset is required");
    const assetConfig = getDb().prepare("SELECT withdraw_enabled, is_active FROM assets WHERE code = ?").get(asset) as { withdraw_enabled: number; is_active: number } | undefined;
    if (!assetConfig || !assetConfig.is_active || !assetConfig.withdraw_enabled) return badRequest("Withdrawals are disabled for this asset");
    if (!networkCode) return badRequest("Withdrawal network is required");
    if (!Number.isFinite(amount) || amount <= 0) return badRequest("Invalid withdrawal amount");
    const networkConfig = getDb().prepare("SELECT withdraw_enabled, min_withdraw FROM asset_networks WHERE asset = ? AND code = ? AND is_active = 1").get(asset, networkCode) as { withdraw_enabled: number; min_withdraw: number } | undefined;
    if (!networkConfig || !networkConfig.withdraw_enabled) return badRequest("Withdrawals are disabled on this network");
    if (Number(networkConfig.min_withdraw) > 0 && amount < Number(networkConfig.min_withdraw)) return badRequest("Minimum withdrawal amount is " + Number(networkConfig.min_withdraw));
    if (Number.isFinite(minUsd) && minUsd > 0) {
      const usdValue = await withdrawalUsdValue(asset, amount);
      if (usdValue < minUsd) return badRequest(`Minimum withdrawal value is ${minUsd} USDC`);
    }
    if (!body.address?.trim()) return badRequest("Withdrawal address is required");

    const passwordRow = getDb()
      .prepare("SELECT withdrawal_password_hash FROM users WHERE id = ?")
      .get(user.id) as { withdrawal_password_hash: string | null } | undefined;
    if (!passwordRow?.withdrawal_password_hash || !verifyPassword(String(body.withdrawalPassword || "").trim(), passwordRow.withdrawal_password_hash)) {
      return badRequest("Invalid withdrawal password");
    }

    // Idempotency: check existing request with same clientRequestId
    if (clientRequestId) {
      const existing = getDb()
        .prepare("SELECT id, asset, amount, address, network, status, created_at FROM withdrawals WHERE user_id = ? AND client_request_id = ?")
        .get(user.id, clientRequestId) as { id: number; asset: string; amount: number; address: string; network: string | null; status: string; created_at: string } | undefined;
      if (existing) {
        return json({ ok: true, withdrawalId: existing.id, idempotent: true });
      }
    }

    const passwordLimit = consumeUserRate(user.id, "withdrawal-password", withdrawalPasswordLimit, withdrawalPasswordWindowMs);
    if (!passwordLimit.allowed) return tooManyRequests("Too many withdrawal password attempts. Please try again later.", passwordLimit.retryAfterMs);

    let withdrawalId = 0;
    let debitedAsset = asset;
    let insufficientBalance = false;
    try {
      inTransaction(() => {
        ensureUserAssetRow(user.id, asset, user.balance);
        const frozenAsset = freezeAvailableAssetBalance(user.id, asset, amount);
        if (!frozenAsset) {
          insufficientBalance = true;
          throw new Error("Insufficient available balance");
        }
        debitedAsset = frozenAsset;
        if (isStableAsset(debitedAsset)) syncUserStableBalance(user.id);

        const result = getDb()
          .prepare("INSERT INTO withdrawals (user_id, asset, amount, address, network, status, note, client_request_id) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)")
          .run(user.id, debitedAsset, amount, body.address.trim(), networkCode, "User withdrawal request", clientRequestId);
        withdrawalId = Number(result.lastInsertRowid);
        getDb()
          .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, status, note) VALUES (?, ?, 'withdrawal_request', ?, 'pending', ?)")
          .run(user.id, debitedAsset, -amount, `Withdrawal request #${withdrawalId} pending system review`);
      });
    } catch (error) {
      if (insufficientBalance) return badRequest("Insufficient available balance");
      // Unique constraint on (user_id, client_request_id) — race condition: another request won
      if (clientRequestId && error instanceof Error && /UNIQUE.*client_req/i.test(error.message)) {
        const winner = getDb()
          .prepare("SELECT id, asset, amount, address, network, status, created_at FROM withdrawals WHERE user_id = ? AND client_request_id = ?")
          .get(user.id, clientRequestId) as { id: number; asset: string; amount: number; address: string; network: string | null; status: string; created_at: string } | undefined;
        if (winner) return json({ ok: true, withdrawalId: winner.id, idempotent: true });
      }
      throw error;
    }

    emitRealtime("admin:update", { room: "admin", payload: { type: "withdrawal:created", withdrawalId, userId: user.id } });
    emitRealtime("user:update", { room: userRoom(user.id), payload: { type: "withdrawal:created", withdrawalId } });
    return json({ ok: true, withdrawalId });
  } catch (error) {
    return handleError(error);
  }
}
