export type Candle = { time: number; open: number; high: number; low: number; close: number };

export type ProviderTicker = {
  symbol: string;
  providerSymbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  source: "okx" | "binance" | "hyperliquid";
};

type OkxResponse<T> = { code: string; msg?: string; data: T[] };
type OkxTicker = {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  volCcy24h?: string;
};
type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
};

const OKX_BASE_URL = process.env.OKX_API_BASE_URL || "https://www.okx.com";
const BINANCE_BASE_URL = process.env.BINANCE_API_BASE_URL || "https://fapi.binance.com";
const MARKET_FETCH_TIMEOUT_MS = Number(process.env.MARKET_DATA_FETCH_TIMEOUT_MS || 1500);

export function toOkxInstId(symbol: string) {
  const base = symbol.replace("-PERP", "").replace("/", "-").split("-")[0].toUpperCase();
  return `${base}-USDC-SWAP`;
}

function toOkxInstIds(symbol: string) {
  const base = symbol.replace("-PERP", "").replace("/", "-").split("-")[0].toUpperCase();
  return [`${base}-USDC-SWAP`, `${base}-USD-SWAP`, `${base}-USDT-SWAP`];
}

export function fromOkxInstId(instId: string) {
  return `${instId.split("-")[0]}-PERP`;
}

export function toBinanceSymbol(symbol: string) {
  return symbol.replace("-PERP", "USDT").replace("/", "").toUpperCase();
}

export function toBinanceUsdcSymbol(symbol: string) {
  return symbol.replace("-PERP", "USDC").replace("/", "").toUpperCase();
}

export function fromBinanceSymbol(symbol: string) {
  if (symbol.endsWith("USDC")) return `${symbol.slice(0, -4)}-PERP`;
  if (symbol.endsWith("USDT")) return `${symbol.slice(0, -4)}-PERP`;
  return symbol;
}

function okxBar(interval: string) {
  if (interval === "1h") return "1H";
  if (interval === "4h") return "4H";
  if (interval === "1d") return "1D";
  return interval;
}

async function fetchJson<T>(input: string | URL, timeoutMs = MARKET_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`Market provider ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeOkxTicker(item: OkxTicker): ProviderTicker {
  const price = Number(item.last);
  const open = Number(item.open24h);
  const priceChange = Number.isFinite(open) && open > 0 ? price - open : 0;
  return {
    symbol: fromOkxInstId(item.instId),
    providerSymbol: item.instId,
    price,
    priceChange,
    priceChangePercent: Number.isFinite(open) && open > 0 ? (priceChange / open) * 100 : 0,
    highPrice: Number(item.high24h),
    lowPrice: Number(item.low24h),
    volume: Number(item.volCcy24h || item.vol24h || 0),
    source: "okx"
  };
}

function okxStableRank(instId: string) {
  if (instId.endsWith("-USDC-SWAP")) return 0;
  if (instId.endsWith("-USD-SWAP")) return 1;
  if (instId.endsWith("-USDT-SWAP")) return 2;
  return 99;
}

function normalizeBinanceTicker(item: BinanceTicker): ProviderTicker {
  return {
    symbol: fromBinanceSymbol(item.symbol),
    providerSymbol: item.symbol,
    price: Number(item.lastPrice),
    priceChange: Number(item.priceChange),
    priceChangePercent: Number(item.priceChangePercent),
    highPrice: Number(item.highPrice),
    lowPrice: Number(item.lowPrice),
    volume: Number(item.volume),
    source: "binance"
  };
}

export async function fetchOkxTicker(symbol: string) {
  let lastError: unknown;
  for (const providerSymbol of toOkxInstIds(symbol)) {
    try {
      const endpoint = new URL("/api/v5/market/ticker", OKX_BASE_URL);
      endpoint.searchParams.set("instId", providerSymbol);
      const payload = await fetchJson<OkxResponse<OkxTicker>>(endpoint);
      if (payload.code !== "0" || !payload.data[0]) throw new Error(payload.msg || "OKX ticker unavailable");
      return normalizeOkxTicker(payload.data[0]);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OKX ticker unavailable");
}

export async function fetchOkxTickers() {
  const endpoint = new URL("/api/v5/market/tickers", OKX_BASE_URL);
  endpoint.searchParams.set("instType", "SWAP");
  const payload = await fetchJson<OkxResponse<OkxTicker>>(endpoint);
  if (payload.code !== "0") throw new Error(payload.msg || "OKX tickers unavailable");
  const preferred = new Map<string, OkxTicker>();
  for (const item of payload.data) {
    if (!item.instId.endsWith("-SWAP") || okxStableRank(item.instId) === 99) continue;
    const symbol = fromOkxInstId(item.instId);
    const existing = preferred.get(symbol);
    if (!existing || okxStableRank(item.instId) < okxStableRank(existing.instId)) preferred.set(symbol, item);
  }
  return Array.from(preferred.values()).map(normalizeOkxTicker);
}

export async function fetchOkxCandles(symbol: string, interval: string, limit: number) {
  let lastError: unknown;
  for (const providerSymbol of toOkxInstIds(symbol)) {
    try {
      const endpoint = new URL("/api/v5/market/candles", OKX_BASE_URL);
      endpoint.searchParams.set("instId", providerSymbol);
      endpoint.searchParams.set("bar", okxBar(interval));
      endpoint.searchParams.set("limit", String(Math.min(limit, 300)));
      const payload = await fetchJson<OkxResponse<string[]>>(endpoint);
      if (payload.code !== "0") throw new Error(payload.msg || "OKX candles unavailable");
      const candles = payload.data
        .map((item) => ({
          time: Math.floor(Number(item[0]) / 1000),
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
          close: Number(item[4])
        }))
        .filter((item) => Number.isFinite(item.time) && Number.isFinite(item.close))
        .sort((a, b) => a.time - b.time);
      return { source: "okx" as const, symbol, providerSymbol, candles };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OKX candles unavailable");
}

export async function fetchBinanceTicker(symbol: string) {
  const endpoint = new URL("/fapi/v1/ticker/24hr", BINANCE_BASE_URL);
  endpoint.searchParams.set("symbol", toBinanceSymbol(symbol));
  return normalizeBinanceTicker(await fetchJson<BinanceTicker>(endpoint));
}

export async function fetchBinanceUsdcTicker(symbol: string) {
  const endpoint = new URL("/fapi/v1/ticker/24hr", BINANCE_BASE_URL);
  endpoint.searchParams.set("symbol", toBinanceUsdcSymbol(symbol));
  return normalizeBinanceTicker(await fetchJson<BinanceTicker>(endpoint));
}

export async function fetchBinanceTickers() {
  const endpoint = new URL("/fapi/v1/ticker/24hr", BINANCE_BASE_URL);
  const payload = await fetchJson<BinanceTicker[]>(endpoint);
  return payload.filter((item) => item.symbol.endsWith("USDT")).map(normalizeBinanceTicker);
}

export async function fetchBinanceCandles(symbol: string, interval: string, limit: number) {
  const providerSymbol = toBinanceSymbol(symbol);
  const endpoint = new URL("/fapi/v1/klines", BINANCE_BASE_URL);
  endpoint.searchParams.set("symbol", providerSymbol);
  endpoint.searchParams.set("interval", interval);
  endpoint.searchParams.set("limit", String(Math.min(limit, 500)));
  const raw = await fetchJson<unknown[][]>(endpoint);
  const candles = raw.map((item) => ({
    time: Math.floor(Number(item[0]) / 1000),
    open: Number(item[1]),
    high: Number(item[2]),
    low: Number(item[3]),
    close: Number(item[4])
  }));
  return { source: "binance" as const, symbol, providerSymbol, candles };
}

/* ── Hyperliquid ── */

const HL_BASE_URL = process.env.HL_API_BASE_URL || "https://api.hyperliquid.xyz";

export function toHyperliquidCoin(symbol: string) {
  return symbol.replace("-PERP", "").toUpperCase();
}

export function fromHyperliquidCoin(coin: string) {
  return `${coin}-PERP`;
}

type HlMetaAndCtxs = [
  { universe: { name: string; szDecimals: number; maxLeverage: number; isDelisted?: boolean }[] },
  { midPx: string; prevDayPx: string; markPx: string; dayNtlVlm: string; dayBaseVlm?: string }[]
];

export async function fetchHyperliquidTickers(): Promise<ProviderTicker[]> {
  const endpoint = new URL("/info", HL_BASE_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARKET_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Hyperliquid ${res.status}`);
    const [meta, ctxs] = (await res.json()) as HlMetaAndCtxs;
    const result: ProviderTicker[] = [];
    for (let i = 0; i < meta.universe.length; i++) {
      const coin = meta.universe[i];
      const ctx = ctxs[i];
      if (!ctx || coin.isDelisted) continue;
      const price = Number(ctx.midPx);
      const prevDay = Number(ctx.prevDayPx);
      const priceChange = Number.isFinite(prevDay) && prevDay > 0 ? price - prevDay : 0;
      const priceChangePercent = Number.isFinite(prevDay) && prevDay > 0 ? (priceChange / prevDay) * 100 : 0;
      result.push({
        symbol: fromHyperliquidCoin(coin.name),
        providerSymbol: coin.name,
        price,
        priceChange,
        priceChangePercent,
        highPrice: price,
        lowPrice: price,
        volume: Number(ctx.dayNtlVlm || 0),
        source: "hyperliquid"
      });
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchHyperliquidTicker(symbol: string): Promise<ProviderTicker> {
  const coin = toHyperliquidCoin(symbol);
  const all = await fetchHyperliquidTickers();
  const found = all.find((t) => t.providerSymbol === coin);
  if (!found) throw new Error(`Hyperliquid ticker not found for ${coin}`);
  return found;
}

const HL_BAR_MAP: Record<string, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1h", "4h": "4h", "1d": "1d" };

export async function fetchHyperliquidCandles(symbol: string, interval: string, limit: number) {
  const coin = toHyperliquidCoin(symbol);
  const bar = HL_BAR_MAP[interval] || "1h";
  const endTime = Date.now();
  const msMap: Record<string, number> = { "1m": 60000, "5m": 300000, "15m": 900000, "30m": 1800000, "1h": 3600000, "4h": 14400000, "1d": 86400000 };
  const ms = msMap[interval] || 3600000;
  const startTime = endTime - limit * ms;
  
  const endpoint = new URL("/info", HL_BASE_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MARKET_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval: bar, startTime, endTime } }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Hyperliquid ${res.status}`);
    const raw = (await res.json()) as { t: number; o: string; c: string; h: string; l: string }[];
    const candles: Candle[] = raw.map((c) => ({
      time: Math.floor(c.t / 1000),
      open: Number(c.o),
      high: Number(c.h),
      low: Number(c.l),
      close: Number(c.c)
    }));
    return { source: "hyperliquid" as const, symbol, providerSymbol: coin, candles };
  } finally {
    clearTimeout(timeout);
  }
}
