export type AssetConfig = { id?: number; code: string; symbol: string; name: string; icon: string; sortOrder: number; depositEnabled: boolean; withdrawEnabled: boolean; tradeEnabled: boolean; isActive: boolean };

const defaults: Array<Omit<AssetConfig, "id">> = [
  { code: "BTC", symbol: "BTC", name: "Bitcoin", icon: "btc", sortOrder: 1, depositEnabled: true, withdrawEnabled: true, tradeEnabled: true, isActive: true },
  { code: "ETH", symbol: "ETH", name: "Ethereum", icon: "eth", sortOrder: 2, depositEnabled: true, withdrawEnabled: true, tradeEnabled: true, isActive: true },
  { code: "USDC", symbol: "USDC", name: "USD Coin", icon: "usdc", sortOrder: 3, depositEnabled: true, withdrawEnabled: true, tradeEnabled: true, isActive: true },
  { code: "SOL", symbol: "SOL", name: "Solana", icon: "sol", sortOrder: 4, depositEnabled: true, withdrawEnabled: true, tradeEnabled: true, isActive: true }
];

export function defaultAssetConfigs() { return defaults; }
export function normalizeAssetCode(value: unknown) { return String(value ?? "").trim().toUpperCase(); }
export function assetConfigFromRow(row: Record<string, unknown>): AssetConfig { return { id: Number(row.id), code: String(row.code), symbol: String(row.symbol), name: String(row.name), icon: String(row.icon || "coin"), sortOrder: Number(row.sort_order || 0), depositEnabled: Boolean(row.deposit_enabled), withdrawEnabled: Boolean(row.withdraw_enabled), tradeEnabled: Boolean(row.trade_enabled), isActive: Boolean(row.is_active) }; }
