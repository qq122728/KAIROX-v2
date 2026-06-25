import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { handleError, json } from "@/lib/api";
import { listMarkets, listOpenPositions, listOrders, listPriceTicks } from "@/lib/trading";
import { getSettings } from "@/lib/settings";

export async function GET() {
  try {
    const admin = await requireAdmin();
    const users = getDb()
      .prepare(
        `SELECT u.id, u.public_uid, u.username, u.email, u.role, u.balance, u.wallet, u.remark,
                COALESCE(u.trading_enabled, 1) AS trading_enabled,
                COALESCE(u.login_enabled, 1) AS login_enabled,
                u.created_at,
                COALESCE((SELECT SUM(balance + locked) FROM user_assets WHERE user_id = u.id AND asset = 'USDC'), u.balance) AS total_assets
         FROM users u
         ORDER BY u.created_at DESC`
      )
      .all();
    const assetRows = getDb()
      .prepare("SELECT user_id, asset, balance, locked FROM user_assets WHERE asset IN ('USDC', 'BTC', 'ETH', 'SOL') ORDER BY asset")
      .all();
    const ledger = getDb()
      .prepare(
        `SELECT t.*, u.public_uid AS user_public_uid, u.username, u.email
         FROM asset_transactions t
         JOIN users u ON u.id = t.user_id
         ORDER BY t.created_at DESC
         LIMIT 100`
      )
      .all();
    const binaryOrders = getDb()
      .prepare(
        `SELECT o.*, u.public_uid AS user_public_uid, u.username, u.email
         FROM binary_orders o
         JOIN users u ON u.id = o.user_id
         ORDER BY o.created_at DESC
         LIMIT 300`
      )
      .all();
    const deposits = getDb()
      .prepare(
        `SELECT d.id, d.user_id, d.asset, d.network, d.amount, d.tx_hash,
                d.proof_name, d.proof_mime,
                CASE WHEN d.proof_data IS NULL OR d.proof_data = '' THEN 0 ELSE 1 END AS has_proof,
                d.deposit_address, d.address_source, d.status, d.note, d.admin_note, d.processed_by,
                d.created_at, d.processed_at,
                u.public_uid AS user_public_uid, u.email, u.username
         FROM deposits d
         JOIN users u ON u.id = d.user_id
         ORDER BY d.created_at DESC
         LIMIT 300`
      )
      .all();
    const kycSubmissions = getDb()
      .prepare(
        `SELECT k.id, k.user_id, k.status, k.legal_name, k.document_type,
                k.front_name, k.front_mime,
                CASE WHEN k.front_data IS NULL OR k.front_data = '' THEN 0 ELSE 1 END AS has_front,
                k.back_name, k.back_mime,
                CASE WHEN k.back_data IS NULL OR k.back_data = '' THEN 0 ELSE 1 END AS has_back,
                k.rejection_reason, k.reviewed_by, k.reviewed_at, k.created_at, k.updated_at,
                u.public_uid AS user_public_uid, u.email, u.username
         FROM kyc_submissions k
         JOIN users u ON u.id = k.user_id
         ORDER BY k.created_at DESC
         LIMIT 300`
      )
      .all();
    const withdrawals = getDb()
      .prepare(
        `SELECT w.*, u.public_uid AS user_public_uid, u.username, u.email
         FROM withdrawals w
         JOIN users u ON u.id = w.user_id
         ORDER BY w.created_at DESC
         LIMIT 200`
      )
      .all();
    const stats = getDb()
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM users) AS users,
          (SELECT COUNT(*) FROM positions WHERE status = 'open') AS open_positions,
          (SELECT COALESCE(SUM(realized_pnl), 0) FROM positions WHERE status = 'closed') AS trader_realized_pnl,
          (SELECT COALESCE(SUM(fee), 0) FROM orders) AS fees,
          (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') AS pending_withdrawals,
          (SELECT COUNT(*) FROM deposits WHERE status = 'pending') AS pending_deposits,
          (SELECT COUNT(*) FROM kyc_submissions WHERE status = 'pending') AS pending_kyc,
          (SELECT COUNT(*) FROM binary_orders WHERE status = 'open') AS open_binary_orders,
          (SELECT COUNT(*) FROM markets) AS markets,
          (SELECT COALESCE(SUM(balance + locked), 0) FROM user_assets WHERE asset = 'USDC') AS total_stable_balance,
          (SELECT COALESCE(SUM(locked), 0) FROM user_assets WHERE asset = 'USDC') AS total_stable_locked
        `
      )
      .get();
    return json({
      stats,
      currentAdmin: {
        id: admin.id,
        public_uid: admin.public_uid,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        created_at: admin.created_at
      },
      settings: getSettings(),
      users,
      assetRows,
      ledger,
      deposits,
      kycSubmissions,
      markets: listMarkets(),
      priceTicks: listPriceTicks(undefined, 240),
      positions: listOpenPositions(),
      orders: binaryOrders,
      legacyOrders: listOrders(undefined, 200),
      withdrawals
    });
  } catch (error) {
    return handleError(error);
  }
}
