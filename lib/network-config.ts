export type AssetNetworkConfig = {
  id?: number;
  asset: string;
  code: string;
  name: string;
  icon: string;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  depositFee: number;
  withdrawFee: number;
  minDeposit: number;
  minWithdraw: number;
  isActive: boolean;
};

const NETWORK_DEFAULTS: Record<string, { name: string; icon: string }> = {
  TRC20: { name: "Tron", icon: "trx" },
  ERC20: { name: "Ethereum", icon: "eth" },
  BITCOIN: { name: "Bitcoin", icon: "btc" },
  SOL: { name: "Solana", icon: "sol" },
  BEP20: { name: "BNB Chain", icon: "bnb" },
  POLYGON: { name: "Polygon", icon: "polygon" },
  ARBITRUM: { name: "Arbitrum", icon: "arbitrum" },
  BASE: { name: "Base", icon: "base" },
  TON: { name: "TON", icon: "ton" },
  AVALANCHE: { name: "Avalanche", icon: "avalanche" }
};

export function normalizeNetworkCode(code: string) {
  return String(code || "").trim().toUpperCase();
}

export function networkConfigDefaults(asset: string, code: string): AssetNetworkConfig {
  const normalizedAsset = String(asset || "").trim().toUpperCase();
  const normalizedCode = normalizeNetworkCode(code);
  const fallback = NETWORK_DEFAULTS[normalizedCode] || { name: normalizedCode, icon: "coin" };
  return {
    asset: normalizedAsset,
    code: normalizedCode,
    name: fallback.name,
    icon: fallback.icon,
    depositEnabled: true,
    withdrawEnabled: true,
    depositFee: 0,
    withdrawFee: 1,
    minDeposit: 0,
    minWithdraw: 0,
    isActive: true
  };
}

export function networkConfigFromRow(row: Record<string, unknown>): AssetNetworkConfig {
  return {
    id: typeof row.id === "number" ? row.id : Number(row.id),
    asset: String(row.asset || ""),
    code: String(row.code || ""),
    name: String(row.name || row.code || ""),
    icon: String(row.icon || "coin"),
    depositEnabled: Boolean(row.deposit_enabled),
    withdrawEnabled: Boolean(row.withdraw_enabled),
    depositFee: Number(row.deposit_fee || 0),
    withdrawFee: Number(row.withdraw_fee || 0),
    minDeposit: Number(row.min_deposit || 0),
    minWithdraw: Number(row.min_withdraw || 0),
    isActive: Boolean(row.is_active)
  };
}
