import { handleError, json, tooManyRequests } from "@/lib/api";
import { getDb } from "@/lib/db";
import { fetchBinanceCandles, fetchHyperliquidCandles, fetchOkxCandles, toBinanceSymbol, toOkxInstId, type Candle } from "@/lib/market-data-sources";
import { consumeIpRate } from "@/lib/rate-limit";

const klinesLimit = Math.max(1, Number(process.env.PERP_SIM_KLINES_LIMIT || 30));
const klinesWindowMs = Math.max(1000, Number(process.env.PERP_SIM_KLINES_WINDOW_MS || 60_000));

function fallbackCandles(symbol: string): Candle[] {
  const market = getDb().prepare("SELECT id, price FROM markets WHERE symbol = ?").get(symbol) as { id: number; price: number } | undefined;
  if (!market) return [];
  const rows = getDb()
    .prepare("SELECT price, created_at FROM price_ticks WHERE market_id = ? ORDER BY id DESC LIMIT 240")
    .all(market.id) as { price: number; created_at: string }[];
  if (rows.length < 2) {
    const now = Math.floor(Date.now() / 1000);
    return [{ time: now, open: market.price, high: market.price, low: market.price, close: market.price }];
  }
  const orderedRows = rows
    .map((row) => ({ ...row, time: Math.floor(new Date(row.created_at).getTime() / 1000) }))
    .filter((row) => Number.isFinite(row.time))
    .sort((a, b) => a.time - b.time);

  const byTime = new Map<number, { time: number; price: number }>();
  for (const row of orderedRows) byTime.set(row.time, { time: row.time, price: row.price });
  const uniqueRows = Array.from(byTime.values());

  return uniqueRows.map((row, index) => {
    const prev = uniqueRows[Math.max(0, index - 1)].price;
    const open = index === 0 ? row.price : prev;
    const close = row.price;
    return {
      time: row.time,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close
    };
  });
}

export async function GET(request: Request) {
  try {
    const limit = consumeIpRate(request, "klines", klinesLimit, klinesWindowMs);
    if (!limit.allowed) return tooManyRequests("Too many kline requests. Please slow down.", limit.retryAfterMs);

    const url = new URL(request.url);
    const symbol = (url.searchParams.get("symbol") || "BTC-PERP").toUpperCase();
    const interval = url.searchParams.get("interval") || "1m";
    const candleLimit = Math.min(Number(url.searchParams.get("limit") || 200), 500);
    try {
      const data = await fetchOkxCandles(symbol, interval, candleLimit);
      return json({ ...data, okxInstId: data.providerSymbol });
    } catch {
      try {
        const data = await fetchHyperliquidCandles(symbol, interval, candleLimit);
        return json(data);
      } catch {
        try {
          const data = await fetchBinanceCandles(symbol, interval, candleLimit);
          return json({ ...data, binanceSymbol: data.providerSymbol });
        } catch {
          return json({
            source: "local-fallback",
            symbol,
            okxInstId: toOkxInstId(symbol),
            binanceSymbol: toBinanceSymbol(symbol),
            candles: fallbackCandles(symbol)
          });
        }
      }
    }
  } catch (error) {
    return handleError(error);
  }
}
