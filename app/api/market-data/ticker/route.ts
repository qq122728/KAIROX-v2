import { handleError, json, tooManyRequests } from "@/lib/api";
import { getDb } from "@/lib/db";
import { fetchBinanceTicker, fetchBinanceTickers, fetchOkxTicker, fetchOkxTickers } from "@/lib/market-data-sources";
import { consumeIpRate } from "@/lib/rate-limit";

const tickerLimit = Math.max(1, Number(process.env.PERP_SIM_TICKER_LIMIT || 30));
const tickerWindowMs = Math.max(1000, Number(process.env.PERP_SIM_TICKER_WINDOW_MS || 60_000));

type LocalTicker = {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
};

function fallbackTicker(symbol?: string) {
  const params: string[] = [];
  let where = "";
  if (symbol) {
    where = "WHERE symbol = ?";
    params.push(symbol);
  }
  const markets = getDb()
    .prepare(`SELECT symbol, price FROM markets ${where} ORDER BY symbol`)
    .all(...params) as { symbol: string; price: number }[];
  const tickers: LocalTicker[] = markets.map((market) => {
    const rows = getDb()
      .prepare(
        `SELECT price
         FROM price_ticks
         WHERE market_id = (SELECT id FROM markets WHERE symbol = ?)
         ORDER BY created_at DESC, id DESC
         LIMIT 120`
      )
      .all(market.symbol) as { price: number }[];
    const prices = rows.map((row) => row.price);
    const open = prices.at(-1) ?? market.price;
    const close = prices[0] ?? market.price;
    const high = prices.length ? Math.max(...prices) : market.price;
    const low = prices.length ? Math.min(...prices) : market.price;
    return {
      symbol: market.symbol,
      price: close,
      priceChange: close - open,
      priceChangePercent: open > 0 ? ((close - open) / open) * 100 : 0,
      highPrice: high,
      lowPrice: low,
      volume: 0
    };
  });
  return symbol ? tickers[0] ?? null : tickers;
}

export async function GET(request: Request) {
  try {
    const limit = consumeIpRate(request, "ticker", tickerLimit, tickerWindowMs);
    if (!limit.allowed) return tooManyRequests("Too many ticker requests. Please slow down.", limit.retryAfterMs);

    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol")?.toUpperCase();

    try {
      const ticker = symbol ? await fetchOkxTicker(symbol) : await fetchOkxTickers();
      return json({ source: "okx", ticker });
    } catch {
      try {
        const ticker = symbol ? await fetchBinanceTicker(symbol) : await fetchBinanceTickers();
        return json({ source: "binance", ticker });
      } catch {
        return json({ source: "local-fallback", ticker: fallbackTicker(symbol) });
      }
    }
  } catch (error) {
    return handleError(error);
  }
}
