import { handleError, json, tooManyRequests } from "@/lib/api";
import { listMarkets } from "@/lib/trading";
import { getDb } from "@/lib/db";
import { fetchBinanceTickers, fetchOkxTickers, type ProviderTicker } from "@/lib/market-data-sources";
import { consumeIpRate } from "@/lib/rate-limit";

const tickersLimit = Math.max(1, Number(process.env.PERP_SIM_TICKERS_LIMIT || 20));
const tickersWindowMs = Math.max(1000, Number(process.env.PERP_SIM_TICKERS_WINDOW_MS || 60_000));

type MarketTicker = { price: number; change: number; source: string };

function hashSymbol(symbol: string) {
  let hash = 2166136261;
  for (let i = 0; i < symbol.length; i += 1) {
    hash ^= symbol.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function simulatedChange(symbol: string) {
  const raw = ((hashSymbol(symbol) % 1201) - 600) / 100;
  if (Math.abs(raw) >= 0.35) return Number(raw.toFixed(2));
  return Number((raw < 0 ? raw - 0.35 : raw + 0.35).toFixed(2));
}

function localTicker(market: { id: number; symbol: string; price: number }) {
  const rows = getDb()
    .prepare("SELECT price FROM price_ticks WHERE market_id = ? ORDER BY created_at DESC, id DESC LIMIT 120")
    .all(market.id) as { price: number }[];
  const prices = rows.map((row) => Number(row.price)).filter((price) => Number.isFinite(price) && price > 0);
  const close = prices[0] ?? market.price;
  const open = prices.at(-1) ?? market.price;
  const tickChange = open > 0 ? ((close - open) / open) * 100 : 0;
  const change = Math.abs(tickChange) >= 0.75 ? tickChange : simulatedChange(market.symbol);
  return { price: close, change: Number(change.toFixed(2)), source: "local-fallback" };
}

function providerTicker(ticker: ProviderTicker): MarketTicker {
  return {
    price: Number(ticker.price),
    change: Number(ticker.priceChangePercent.toFixed(2)),
    source: ticker.source
  };
}

async function fetchProviderTickers() {
  try {
    return await fetchOkxTickers();
  } catch {
    return await fetchBinanceTickers();
  }
}

export async function GET(request: Request) {
  try {
    const limit = consumeIpRate(request, "tickers", tickersLimit, tickersWindowMs);
    if (!limit.allowed) return tooManyRequests("Too many ticker requests. Please slow down.", limit.retryAfterMs);

    const markets = listMarkets();
    const result: Record<string, MarketTicker> = {};
    try {
      const data = await fetchProviderTickers();
      const bySymbol = new Map(data.map((item) => [item.symbol, item]));
      markets.forEach((market) => {
        const ticker = bySymbol.get(market.symbol);
        if (ticker) {
          result[market.symbol] = providerTicker(ticker);
        } else {
          result[market.symbol] = localTicker(market);
        }
      });
    } catch {
      markets.forEach((market) => {
        result[market.symbol] = localTicker(market);
      });
    }
    return json({ tickers: result });
  } catch (error) {
    return handleError(error);
  }
}
