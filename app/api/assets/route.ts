import { requireUser } from "@/lib/auth";
import { handleError, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { listOpenPositions } from "@/lib/trading";
import { getSettings } from "@/lib/settings";
import { sanitizePublicRecords, type PublicRecordRow } from "@/lib/public-records";
import { getAssetUsdPrice } from "@/lib/swap";
import { networkConfigFromRow } from "@/lib/network-config";
import { assetConfigFromRow } from "@/lib/asset-config";

function roundUsd(value: number) {
  return Number(value.toFixed(2));
}

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
    const assetConfigs = (getDb().prepare("SELECT * FROM assets WHERE is_active = 1 ORDER BY sort_order, id").all() as Record<string, unknown>[]).map(assetConfigFromRow);
    const assetRows = getDb().prepare("SELECT asset, balance, locked, updated_at FROM user_assets WHERE user_id = ? ORDER BY asset").all(user.id) as { asset: string; balance: number; locked: number; updated_at: string }[];
    const assetsByName = new Map(assetRows.map((item) => [item.asset, item]));
    const assets = assetConfigs.map((config) => ({ ...config, asset: config.code, balance: assetsByName.get(config.code)?.balance ?? (config.code === "USDC" ? user.balance : 0), locked: assetsByName.get(config.code)?.locked ?? 0, updated_at: assetsByName.get(config.code)?.updated_at ?? null }));
    const valuationWarnings: string[] = [];
    let valuationStatus: "complete" | "partial" = "complete";
    const assetsWithValuation = await Promise.all(assets.map(async (item) => {
      const balance = Number(item.balance || 0);
      const locked = Number(item.locked || 0);
      const totalAmount = balance + locked;
      if (item.asset === "USDC") {
        return {
          ...item,
          usdPrice: 1,
          usdValue: roundUsd(balance),
          lockedUsdValue: roundUsd(locked),
          totalUsdValue: roundUsd(totalAmount)
        };
      }

      try {
        const { price } = await getAssetUsdPrice(item.asset, { allowFallback: false, requireUsdcQuote: true });
        const usdPrice = Number(price);
        if (!Number.isFinite(usdPrice) || usdPrice <= 0) throw new Error("Price unavailable");
        return {
          ...item,
          usdPrice,
          usdValue: roundUsd(balance * usdPrice),
          lockedUsdValue: roundUsd(locked * usdPrice),
          totalUsdValue: roundUsd(totalAmount * usdPrice)
        };
      } catch {
        if (totalAmount > 0) {
          valuationStatus = "partial";
          valuationWarnings.push(`${item.asset} price unavailable`);
        }
        return {
          ...item,
          usdPrice: null,
          usdValue: null,
          lockedUsdValue: null,
          totalUsdValue: null
        };
      }
    }));
    const stable = assets.find((item) => item.asset === "USDC");
    const availableBalance = Number(stable?.balance ?? user.balance);
    const portfolioUsdValue = assetsWithValuation.reduce((sum, item) => {
      return sum + (typeof item.totalUsdValue === "number" ? item.totalUsdValue : 0);
    }, 0);
    const depositAddresses = getDb()
      .prepare(
        `SELECT d.asset, UPPER(TRIM(d.network)) AS network,
                COALESCE(u.address, d.address) AS address,
                CASE WHEN u.address IS NULL THEN 'default' ELSE 'custom' END AS source
         FROM deposit_addresses d
         LEFT JOIN user_deposit_addresses u
           ON u.user_id = ? AND u.asset = d.asset AND UPPER(TRIM(u.network)) = UPPER(TRIM(d.network)) AND u.is_active = 1
         WHERE d.is_active = 1
           AND EXISTS (SELECT 1 FROM assets a WHERE a.code = d.asset AND a.is_active = 1 AND a.deposit_enabled = 1)
         UNION
         SELECT u.asset, UPPER(TRIM(u.network)) AS network, u.address, 'custom' AS source
         FROM user_deposit_addresses u
         WHERE u.user_id = ? AND u.is_active = 1
           AND EXISTS (SELECT 1 FROM assets a WHERE a.code = u.asset AND a.is_active = 1 AND a.deposit_enabled = 1)
           AND NOT EXISTS (
             SELECT 1 FROM deposit_addresses d
             WHERE d.asset = u.asset AND UPPER(TRIM(d.network)) = UPPER(TRIM(u.network)) AND d.is_active = 1
           )
         ORDER BY asset, network`
      )
      .all(user.id, user.id);
    const networks = (getDb()
      .prepare("SELECT id, asset, code, name, icon, deposit_enabled, withdraw_enabled, deposit_fee, withdraw_fee, min_deposit, min_withdraw, is_active FROM asset_networks WHERE is_active = 1 ORDER BY asset, id")
      .all() as Record<string, unknown>[]).map(networkConfigFromRow);
    return json({
      user,
      settings: getSettings(),
      assets: assetsWithValuation,
      depositAddresses,
      networks,
      assetConfigs,
      summary: {
        availableBalance,
        marginUsed,
        unrealizedPnl,
        totalEquity: roundUsd(portfolioUsdValue + marginUsed + unrealizedPnl),
        valuationStatus,
        valuationWarnings
      },
      transactions,
      withdrawals,
      deposits
    });
  } catch (error) {
    return handleError(error);
  }
}
