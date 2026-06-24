import { handleError, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { fetchBinanceCandles, fetchOkxCandles, toBinanceSymbol, toOkxInstId, type Candle } from "@/lib/market-data-sources";

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
    const url = new URL(request.url);
    const symbol = (url.searchParams.get("symbol") || "BTC-PERP").toUpperCase();
    const interval = url.searchParams.get("interval") || "1m";
    const limit = Math.min(Number(url.searchParams.get("limit") || 200), 500);
    try {
      const data = await fetchOkxCandles(symbol, interval, limit);
      return json({ ...data, okxInstId: data.providerSymbol });
    } catch {
      try {
        const data = await fetchBinanceCandles(symbol, interval, limit);
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
  } catch (error) {
    return handleError(error);
  }
}
