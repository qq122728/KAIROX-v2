import { getDb } from "@/lib/db";
import { fetchBinanceTicker, fetchOkxTicker } from "@/lib/market-data-sources";

type MarketLike = {
  id: number;
  symbol: string;
  price: number;
};

export type ExecutionPrice = {
  price: number;
  source: "okx" | "binance" | "cached";
  providerSymbol?: string;
};

const priceTickMinIntervalSeconds = (() => {
  const parsed = Number(process.env.PRICE_TICK_MIN_INTERVAL_SECONDS);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 15;
})();

function persistProviderPrice(marketId: number, price: number) {
  if (!Number.isFinite(price) || price <= 0) return;
  const db = getDb();
  db.prepare("UPDATE markets SET price = ? WHERE id = ?").run(price, marketId);
  db.prepare(
    `INSERT INTO price_ticks (market_id, price)
     SELECT ?, ?
     WHERE NOT EXISTS (
       SELECT 1
       FROM price_ticks
       WHERE market_id = ?
         AND datetime(created_at) >= datetime('now', ?)
     )`
  ).run(marketId, price, marketId, `-${priceTickMinIntervalSeconds} seconds`);
}

function validPrice(price: number) {
  return Number.isFinite(price) && price > 0;
}

export async function getExecutionPrice(market: MarketLike): Promise<ExecutionPrice> {
  try {
    const ticker = await fetchOkxTicker(market.symbol);
    if (validPrice(ticker.price)) {
      persistProviderPrice(market.id, ticker.price);
      return { price: ticker.price, source: "okx", providerSymbol: ticker.providerSymbol };
    }
  } catch {}

  try {
    const ticker = await fetchBinanceTicker(market.symbol);
    if (validPrice(ticker.price)) {
      persistProviderPrice(market.id, ticker.price);
      return { price: ticker.price, source: "binance", providerSymbol: ticker.providerSymbol };
    }
  } catch {}

  return { price: market.price, source: "cached" };
}
