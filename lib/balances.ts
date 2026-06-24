import { getDb } from "./db";

const stableAssets = new Set(["USDC"]);

export function normalizeAsset(asset: string) {
  const normalized = String(asset || "USDC").trim().toUpperCase();
  return normalized === "USDT" ? "USDC" : normalized;
}

export function isStableAsset(asset: string) {
  return stableAssets.has(normalizeAsset(asset));
}

export function assetDebitCandidates(asset: string) {
  return [normalizeAsset(asset)];
}

function ensureAssetRowExists(userId: number, asset: string) {
  const target = normalizeAsset(asset);
  getDb()
    .prepare("INSERT OR IGNORE INTO user_assets (user_id, asset, balance, locked) VALUES (?, ?, 0, 0)")
    .run(userId, target);
}

function consolidateStableBalanceForDebit(userId: number, targetAsset: string, amount: number) {
  const target = normalizeAsset(targetAsset);
  if (!isStableAsset(target)) return true;
  ensureAssetRowExists(userId, target);
  const row = getDb().prepare("SELECT balance FROM user_assets WHERE user_id = ? AND asset = ?").get(userId, target) as { balance: number } | undefined;
  return Number(row?.balance || 0) + Number.EPSILON >= amount;
}

export function ensureUserAssetRow(userId: number, asset: string, legacyStableBalance: number) {
  const target = normalizeAsset(asset);
  const initialBalance = Number.isFinite(legacyStableBalance) ? Math.max(0, legacyStableBalance) : 0;
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO user_assets (user_id, asset, balance, locked)
       SELECT ?, ?,
              CASE
                WHEN ? = 1 AND NOT EXISTS (
                  SELECT 1 FROM user_assets WHERE user_id = ? AND asset = 'USDC'
                )
                THEN ?
                ELSE 0
              END,
              0`
    )
    .run(userId, target, isStableAsset(target) ? 1 : 0, userId, initialBalance);
}

export function syncUserStableBalance(userId: number) {
  getDb()
    .prepare(
      `UPDATE users
       SET balance = COALESCE(
         (SELECT SUM(balance + locked) FROM user_assets WHERE user_id = ? AND asset = 'USDC'),
         balance
       )
       WHERE id = ?`
    )
    .run(userId, userId);
}

export function debitAvailableAssetBalance(userId: number, asset: string, amount: number) {
  const target = normalizeAsset(asset);
  if (isStableAsset(target)) {
    if (!consolidateStableBalanceForDebit(userId, target, amount)) return null;
    const result = getDb()
      .prepare("UPDATE user_assets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ? AND balance >= ?")
      .run(amount, userId, target, amount);
    return Number(result.changes || 0) === 1 ? target : null;
  }
  const update = getDb().prepare(
    "UPDATE user_assets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ? AND balance >= ?"
  );
  for (const candidate of assetDebitCandidates(target)) {
    const result = update.run(amount, userId, candidate, amount);
    if (Number(result.changes || 0) === 1) return candidate;
  }
  return null;
}

export function freezeAvailableAssetBalance(userId: number, asset: string, amount: number) {
  const target = normalizeAsset(asset);
  if (isStableAsset(target)) {
    if (!consolidateStableBalanceForDebit(userId, target, amount)) return null;
    const result = getDb()
      .prepare("UPDATE user_assets SET balance = balance - ?, locked = locked + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ? AND balance >= ?")
      .run(amount, amount, userId, target, amount);
    return Number(result.changes || 0) === 1 ? target : null;
  }
  const update = getDb().prepare(
    "UPDATE user_assets SET balance = balance - ?, locked = locked + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ? AND balance >= ?"
  );
  for (const candidate of assetDebitCandidates(target)) {
    const result = update.run(amount, amount, userId, candidate, amount);
    if (Number(result.changes || 0) === 1) return candidate;
  }
  return null;
}
