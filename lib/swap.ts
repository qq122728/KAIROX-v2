import crypto from "node:crypto";
import { getDb, inTransaction } from "./db";
import { debitAvailableAssetBalance, ensureUserAssetRow, normalizeAsset, syncUserStableBalance } from "./balances";
import { fetchBinanceTicker, fetchOkxTicker } from "./market-data-sources";

export const SWAP_FEE_RATE = 0.0025;
export const SWAP_SUPPORTED_ASSETS = ["USDC", "BTC", "ETH", "SOL"] as const;
export type SwapAsset = (typeof SWAP_SUPPORTED_ASSETS)[number];

const FALLBACK_USD_PRICE: Record<string, number> = {
  USDC: 1,
  BTC: 68000,
  ETH: 3600,
  SOL: 165
};

const ASSET_TO_PERP_SYMBOL: Record<string, string> = {
  BTC: "BTC-PERP",
  ETH: "ETH-PERP",
  SOL: "SOL-PERP"
};

function assetUsdDecimals(asset: string) {
  return asset === "USDC" ? 2 : 6;
}

export function isSwapAsset(asset: string): asset is SwapAsset {
  return (SWAP_SUPPORTED_ASSETS as readonly string[]).includes(normalizeAsset(asset));
}

export async function getAssetUsdPrice(asset: string): Promise<{ price: number; source: string }> {
  const target = normalizeAsset(asset);
  if (target === "USDC") return { price: 1, source: "stable" };
  const perpSymbol = ASSET_TO_PERP_SYMBOL[target];
  if (!perpSymbol) return { price: FALLBACK_USD_PRICE[target] || 0, source: "fallback" };
  try {
    const ticker = await fetchOkxTicker(perpSymbol);
    if (Number.isFinite(ticker.price) && ticker.price > 0) return { price: ticker.price, source: "okx" };
  } catch {
    /* swallow and try Binance next */
  }
  try {
    const ticker = await fetchBinanceTicker(perpSymbol);
    if (Number.isFinite(ticker.price) && ticker.price > 0) return { price: ticker.price, source: "binance" };
  } catch {
    /* swallow and use fallback */
  }
  return { price: FALLBACK_USD_PRICE[target] || 0, source: "fallback" };
}

export function generateSwapTxHash(): string {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

function roundAmount(value: number, decimals: number) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type SwapQuote = {
  fromAsset: SwapAsset;
  toAsset: SwapAsset;
  fromAmount: number;
  fromUsdPrice: number;
  toUsdPrice: number;
  fromUsdValue: number;
  toAmountGross: number;
  feeAmount: number;
  feeUsdValue: number;
  toAmount: number;
  rate: number;
  priceSource: { from: string; to: string };
};

export async function buildSwapQuote(fromAsset: string, toAsset: string, fromAmount: number): Promise<SwapQuote> {
  const from = normalizeAsset(fromAsset);
  const to = normalizeAsset(toAsset);
  if (!isSwapAsset(from)) throw new Error("Unsupported source asset");
  if (!isSwapAsset(to)) throw new Error("Unsupported target asset");
  if (from === to) throw new Error("From and to assets must differ");
  if (!Number.isFinite(fromAmount) || fromAmount <= 0) throw new Error("Invalid amount");

  const fromPrice = await getAssetUsdPrice(from);
  const toPrice = await getAssetUsdPrice(to);
  if (!fromPrice.price || !toPrice.price) throw new Error("Price unavailable");

  const fromUsdValue = fromAmount * fromPrice.price;
  const toAmountGross = fromUsdValue / toPrice.price;
  const feeAmount = roundAmount(toAmountGross * SWAP_FEE_RATE, assetUsdDecimals(to));
  const toAmount = roundAmount(toAmountGross - feeAmount, assetUsdDecimals(to));
  const feeUsdValue = feeAmount * toPrice.price;
  const rate = fromUsdValue > 0 ? toAmount / fromAmount : 0;

  return {
    fromAsset: from as SwapAsset,
    toAsset: to as SwapAsset,
    fromAmount: roundAmount(fromAmount, assetUsdDecimals(from)),
    fromUsdPrice: fromPrice.price,
    toUsdPrice: toPrice.price,
    fromUsdValue: roundAmount(fromUsdValue, 2),
    toAmountGross: roundAmount(toAmountGross, assetUsdDecimals(to)),
    feeAmount,
    feeUsdValue: roundAmount(feeUsdValue, 2),
    toAmount,
    rate,
    priceSource: { from: fromPrice.source, to: toPrice.source }
  };
}

export type SwapReceipt = SwapQuote & {
  swapId: number;
  txHash: string;
  completedAt: string;
};

export function executeSwapTransaction(userId: number, legacyStableBalance: number, quote: SwapQuote): SwapReceipt {
  const txHash = generateSwapTxHash();
  const completedAt = new Date().toISOString();
  let insufficient = false;
  let swapId = 0;

  inTransaction(() => {
    ensureUserAssetRow(userId, quote.fromAsset, legacyStableBalance);
    ensureUserAssetRow(userId, quote.toAsset, legacyStableBalance);

    const debited = debitAvailableAssetBalance(userId, quote.fromAsset, quote.fromAmount);
    if (!debited) {
      insufficient = true;
      throw new Error("Insufficient balance");
    }

    getDb()
      .prepare("UPDATE user_assets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = ?")
      .run(quote.toAmount, userId, quote.toAsset);

    syncUserStableBalance(userId);

    const noteOut = `Swap ${quote.fromAsset} → ${quote.toAsset} ${quote.fromAmount} @ rate ${quote.rate.toFixed(8)} tx ${txHash.slice(0, 10)}`;
    const noteIn = `Swap ${quote.fromAsset} → ${quote.toAsset} received ${quote.toAmount} (fee ${quote.feeAmount}) tx ${txHash.slice(0, 10)}`;

    const result = getDb()
      .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, note) VALUES (?, ?, 'swap_out', ?, ?)")
      .run(userId, quote.fromAsset, -quote.fromAmount, noteOut);
    swapId = Number(result.lastInsertRowid);

    getDb()
      .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, note) VALUES (?, ?, 'swap_in', ?, ?)")
      .run(userId, quote.toAsset, quote.toAmount, noteIn);
  });

  if (insufficient) {
    const err = new Error("Insufficient balance") as Error & { code?: string };
    err.code = "INSUFFICIENT_BALANCE";
    throw err;
  }

  return { ...quote, swapId, txHash, completedAt };
}
