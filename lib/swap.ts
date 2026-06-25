import crypto from "node:crypto";
import { getDb, inTransaction } from "./db";
import { debitAvailableAssetBalance, ensureUserAssetRow, syncUserStableBalance } from "./balances";
import { fetchBinanceTicker, fetchBinanceUsdcTicker, fetchOkxTicker, type ProviderTicker } from "./market-data-sources";

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

type PriceOptions = {
  allowFallback?: boolean;
  requireUsdcQuote?: boolean;
};

type PriceResult = { price: number; source: string; quoteAsset?: string };

const STABLE_RATE_FETCH_TIMEOUT_MS = Number(process.env.MARKET_DATA_FETCH_TIMEOUT_MS || 1500);
const STABLE_RATE_CACHE_TTL_MS = 30_000;
const BINANCE_SPOT_API_BASE_URL = process.env.BINANCE_SPOT_API_BASE_URL || "https://api.binance.com";
const OKX_API_BASE_URL = process.env.OKX_API_BASE_URL || "https://www.okx.com";

let usdtUsdcRateCache: { price: number; source: string; expiresAt: number } | null = null;

function assetUsdDecimals(asset: string) {
  return asset === "USDC" ? 2 : 6;
}

function normalizeSwapAsset(asset: string) {
  return String(asset || "").trim().toUpperCase();
}

export function isSwapAsset(asset: string): asset is SwapAsset {
  return (SWAP_SUPPORTED_ASSETS as readonly string[]).includes(normalizeSwapAsset(asset));
}

function quoteAssetFromProviderSymbol(providerSymbol: string) {
  const symbol = providerSymbol.toUpperCase();
  const okxSwap = symbol.match(/^[A-Z0-9]+-([A-Z0-9]+)-SWAP$/);
  if (okxSwap) return okxSwap[1] || "";
  if (symbol.endsWith("USDC")) return "USDC";
  if (symbol.endsWith("USDT")) return "USDT";
  if (symbol.endsWith("USD")) return "USD";
  return "";
}

function validPositivePrice(value: number) {
  return Number.isFinite(value) && value > 0;
}

async function fetchJsonWithTimeout<T>(input: string | URL, timeoutMs = STABLE_RATE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`Stable conversion provider ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBinanceSpotStableRate(symbol: "USDTUSDC" | "USDCUSDT") {
  const endpoint = new URL("/api/v3/ticker/price", BINANCE_SPOT_API_BASE_URL);
  endpoint.searchParams.set("symbol", symbol);
  const payload = await fetchJsonWithTimeout<{ price: string }>(endpoint);
  const price = Number(payload.price);
  if (!validPositivePrice(price)) throw new Error("Stable conversion unavailable");
  return {
    price: symbol === "USDTUSDC" ? price : 1 / price,
    source: `binance:${symbol}`
  };
}

async function fetchOkxSpotStableRate(instId: "USDT-USDC" | "USDC-USDT") {
  const endpoint = new URL("/api/v5/market/ticker", OKX_API_BASE_URL);
  endpoint.searchParams.set("instId", instId);
  const payload = await fetchJsonWithTimeout<{ code: string; msg?: string; data: Array<{ last: string }> }>(endpoint);
  if (payload.code !== "0" || !payload.data[0]) throw new Error(payload.msg || "Stable conversion unavailable");
  const price = Number(payload.data[0].last);
  if (!validPositivePrice(price)) throw new Error("Stable conversion unavailable");
  return {
    price: instId === "USDT-USDC" ? price : 1 / price,
    source: `okx:${instId}`
  };
}

async function fetchFuturesStableRate() {
  try {
    const ticker = await fetchBinanceUsdcTicker("USDT-PERP");
    if (validPositivePrice(ticker.price) && quoteAssetFromProviderSymbol(ticker.providerSymbol) === "USDC") {
      return { price: ticker.price, source: `${ticker.source}:${ticker.providerSymbol}` };
    }
  } catch {
    /* try inverse pair next */
  }
  const ticker = await fetchBinanceTicker("USDC-PERP");
  if (validPositivePrice(ticker.price) && quoteAssetFromProviderSymbol(ticker.providerSymbol) === "USDT") {
    return { price: 1 / ticker.price, source: `${ticker.source}:${ticker.providerSymbol}` };
  }
  throw new Error("Stable conversion unavailable");
}

async function getUsdtUsdcRate() {
  const now = Date.now();
  if (usdtUsdcRateCache && usdtUsdcRateCache.expiresAt > now) return usdtUsdcRateCache;
  const attempts = [
    () => fetchFuturesStableRate(),
    () => fetchBinanceSpotStableRate("USDTUSDC"),
    () => fetchBinanceSpotStableRate("USDCUSDT"),
    () => fetchOkxSpotStableRate("USDT-USDC"),
    () => fetchOkxSpotStableRate("USDC-USDT")
  ];
  for (const attempt of attempts) {
    try {
      const rate = await attempt();
      if (validPositivePrice(rate.price)) {
        usdtUsdcRateCache = { ...rate, expiresAt: now + STABLE_RATE_CACHE_TTL_MS };
        return usdtUsdcRateCache;
      }
    } catch {
      /* try next provider */
    }
  }
  return null;
}

async function safeProviderPrice(ticker: ProviderTicker, options: PriceOptions): Promise<PriceResult | null> {
  if (!Number.isFinite(ticker.price) || ticker.price <= 0) return null;
  const quoteAsset = quoteAssetFromProviderSymbol(ticker.providerSymbol);
  if (quoteAsset === "USDC") return { price: ticker.price, source: ticker.source, quoteAsset };
  if (quoteAsset === "USD") return { price: ticker.price, source: `${ticker.source}:usd`, quoteAsset };
  if (quoteAsset === "USDT") {
    const stableRate = await getUsdtUsdcRate();
    if (!stableRate) return null;
    return {
      price: ticker.price * stableRate.price,
      source: `${ticker.source}:usdt:${stableRate.source}`,
      quoteAsset: "USDC"
    };
  }
  if (options.requireUsdcQuote) return null;
  return { price: ticker.price, source: ticker.source, quoteAsset };
}

export async function getAssetUsdPrice(asset: string, options: PriceOptions = {}): Promise<PriceResult> {
  const allowFallback = options.allowFallback ?? true;
  const target = normalizeSwapAsset(asset);
  if (target === "USDC") return { price: 1, source: "stable" };
  const perpSymbol = ASSET_TO_PERP_SYMBOL[target];
  if (!perpSymbol) {
    if (allowFallback) return { price: FALLBACK_USD_PRICE[target] || 0, source: "fallback" };
    throw new Error("Price unavailable");
  }
  let sawUsdtQuote = false;
  let deferredUsdPrice: PriceResult | null = null;
  let deferredUsdtPrice: PriceResult | null = null;
  try {
    const ticker = await fetchOkxTicker(perpSymbol);
    const quoteAsset = quoteAssetFromProviderSymbol(ticker.providerSymbol);
    if (quoteAsset === "USDT") sawUsdtQuote = true;
    const price = await safeProviderPrice(ticker, options);
    if (price?.quoteAsset === "USDC") return price;
    if (price?.quoteAsset === "USD") deferredUsdPrice = price;
    if (quoteAsset === "USDT" && price) deferredUsdtPrice = price;
  } catch {
    /* swallow and try Binance next */
  }
  try {
    const ticker = await fetchBinanceUsdcTicker(perpSymbol);
    const price = await safeProviderPrice(ticker, options);
    if (price) return price;
  } catch {
    /* swallow and check whether only a USDT quote is available */
  }
  if (deferredUsdPrice) return deferredUsdPrice;
  if (deferredUsdtPrice) return deferredUsdtPrice;
  try {
    const ticker = await fetchBinanceTicker(perpSymbol);
    if (quoteAssetFromProviderSymbol(ticker.providerSymbol) === "USDT" && Number.isFinite(ticker.price) && ticker.price > 0) sawUsdtQuote = true;
    const price = await safeProviderPrice(ticker, options);
    if (price) return price;
  } catch {
    /* swallow and reject below */
  }
  if (allowFallback) return { price: FALLBACK_USD_PRICE[target] || 0, source: "fallback" };
  if (sawUsdtQuote) throw new Error("USDT quoted price requires USDT/USDC conversion");
  throw new Error("Price unavailable");
}

export function generateSwapTxHash(): string {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

function roundAmount(value: number, decimals: number) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeInputAmount(value: number, decimals: number) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.floor(value * factor + Number.EPSILON * factor) / factor;
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
  const from = normalizeSwapAsset(fromAsset);
  const to = normalizeSwapAsset(toAsset);
  if (!isSwapAsset(from)) throw new Error("Unsupported source asset");
  if (!isSwapAsset(to)) throw new Error("Unsupported target asset");
  if (from === to) throw new Error("From and to assets must differ");
  if (!Number.isFinite(fromAmount) || fromAmount <= 0) throw new Error("Invalid amount");
  const normalizedFromAmount = normalizeInputAmount(fromAmount, assetUsdDecimals(from));
  if (normalizedFromAmount <= 0) throw new Error("Amount too small");

  const fromPrice = await getAssetUsdPrice(from, { allowFallback: false, requireUsdcQuote: true });
  const toPrice = await getAssetUsdPrice(to, { allowFallback: false, requireUsdcQuote: true });
  if (!fromPrice.price || !toPrice.price) throw new Error("Price unavailable");
  if (fromPrice.source === "fallback" || toPrice.source === "fallback") throw new Error("Price unavailable");

  const fromUsdValue = normalizedFromAmount * fromPrice.price;
  const toAmountGross = fromUsdValue / toPrice.price;
  const feeAmount = roundAmount(toAmountGross * SWAP_FEE_RATE, assetUsdDecimals(to));
  const toAmount = roundAmount(toAmountGross - feeAmount, assetUsdDecimals(to));
  const feeUsdValue = feeAmount * toPrice.price;
  const rate = fromUsdValue > 0 ? toAmount / normalizedFromAmount : 0;

  return {
    fromAsset: from as SwapAsset,
    toAsset: to as SwapAsset,
    fromAmount: normalizedFromAmount,
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
