import { requireUser } from "@/lib/auth";
import { handleError, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { listOpenPositions } from "@/lib/trading";
import { getSettings } from "@/lib/settings";
import { sanitizePublicRecords, type PublicRecordRow } from "@/lib/public-records";

const supportedAssets = ["USDC", "BTC", "ETH", "SOL"];

export async function GET() {
  try {
    const user = await requireUser();
    const positions = listOpenPositions(user.id);
    const marginUsed = positions.reduce((sum, position) => sum + position.margin, 0);
    const unrealizedPnl = positions.reduce((sum, position) => sum + position.unrealized_pnl, 0);
    const transactions = sanitizePublicRecords(getDb()
      .prepare("SELECT * FROM asset_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100")
      .all(user.id) as PublicRecordRow[]);
    const withdrawals = sanitizePublicRecords(getDb()
      .prepare("SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 100")
      .all(user.id) as PublicRecordRow[]);
    const deposits = sanitizePublicRecords(getDb()
      .prepare("SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 100")
      .all(user.id) as PublicRecordRow[]);
    const assetRows = getDb()
      .prepare("SELECT asset, balance, locked, updated_at FROM user_assets WHERE user_id = ? AND asset IN ('USDC', 'BTC', 'ETH', 'SOL') ORDER BY asset")
      .all(user.id) as { asset: string; balance: number; locked: number; updated_at: string }[];
    const assetsByName = new Map(assetRows.map((item) => [item.asset, item]));
    const assets = supportedAssets.map((asset) => assetsByName.get(asset) || {
      asset,
      balance: asset === "USDC" ? user.balance : 0,
      locked: 0,
      updated_at: null
    });
    const stable = assets.find((item) => item.asset === "USDC");
    const availableBalance = Number(stable?.balance ?? user.balance);
    const lockedBalance = Number(stable?.locked || 0);
    const depositAddresses = getDb()
      .prepare(
        `SELECT d.asset, UPPER(TRIM(d.network)) AS network,
                COALESCE(u.address, d.address) AS address,
                CASE WHEN u.address IS NULL THEN 'default' ELSE 'custom' END AS source
         FROM deposit_addresses d
         LEFT JOIN user_deposit_addresses u
           ON u.user_id = ? AND u.asset = d.asset AND UPPER(TRIM(u.network)) = UPPER(TRIM(d.network)) AND u.is_active = 1
         WHERE d.is_active = 1
           AND d.asset IN ('USDC', 'BTC', 'ETH', 'SOL')
         UNION
         SELECT u.asset, UPPER(TRIM(u.network)) AS network, u.address, 'custom' AS source
         FROM user_deposit_addresses u
         WHERE u.user_id = ? AND u.is_active = 1
           AND u.asset IN ('USDC', 'BTC', 'ETH', 'SOL')
           AND NOT EXISTS (
             SELECT 1 FROM deposit_addresses d
             WHERE d.asset = u.asset AND UPPER(TRIM(d.network)) = UPPER(TRIM(u.network)) AND d.is_active = 1
           )
         ORDER BY asset, network`
      )
      .all(user.id, user.id);
    return json({
      user,
      settings: getSettings(),
      assets,
      depositAddresses,
      summary: {
        availableBalance,
        marginUsed,
        unrealizedPnl,
        totalEquity: availableBalance + lockedBalance + marginUsed + unrealizedPnl
      },
      transactions,
      withdrawals,
      deposits
    });
  } catch (error) {
    return handleError(error);
  }
}
