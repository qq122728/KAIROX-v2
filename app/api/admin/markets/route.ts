import { getDb, inTransaction } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { emitRealtime } from "@/lib/realtime";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<{ symbol: string; price: number; maxLeverage: number; feeRate: number; mmr: number }>(request);
    const symbol = body.symbol?.trim().toUpperCase();
    if (!symbol || !symbol.endsWith("-PERP")) return badRequest("交易对格式示例：BTC-PERP");
    if (!Number.isFinite(body.price) || body.price <= 0) return badRequest("价格无效");
    const base = symbol.replace("-PERP", "");
    inTransaction(() => {
      const result = getDb()
        .prepare(
          "INSERT INTO markets (symbol, base_asset, price, max_leverage, fee_rate, maintenance_margin_rate) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(symbol, base, body.price, body.maxLeverage || 20, body.feeRate || 0.0006, body.mmr || 0.005);
      getDb()
        .prepare("INSERT INTO price_ticks (market_id, price) VALUES (?, ?)")
        .run(Number(result.lastInsertRowid), body.price);
    });
    emitRealtime("admin:update", { room: "admin", payload: { type: "market:update" } });
    emitRealtime("market:update", { payload: { symbol } });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<{
      marketId: number;
      price?: number;
      maxLeverage?: number;
      feeRate?: number;
      mmr?: number;
      isActive?: boolean;
    }>(request);
    const marketId = body.marketId;
    if (!marketId) return badRequest("缺少市场");
    const current = getDb().prepare("SELECT * FROM markets WHERE id = ?").get(marketId);
    if (!current) return badRequest("市场不存在");
    if (typeof body.price === "number" && body.price <= 0) return badRequest("价格无效");
    inTransaction(() => {
      getDb()
        .prepare(
          `UPDATE markets
           SET price = COALESCE(?, price),
               max_leverage = COALESCE(?, max_leverage),
               fee_rate = COALESCE(?, fee_rate),
               maintenance_margin_rate = COALESCE(?, maintenance_margin_rate),
               is_active = COALESCE(?, is_active)
           WHERE id = ?`
        )
        .run(
          body.price ?? null,
          body.maxLeverage ?? null,
          body.feeRate ?? null,
          body.mmr ?? null,
          typeof body.isActive === "boolean" ? (body.isActive ? 1 : 0) : null,
          marketId
        );
      if (typeof body.price === "number") {
        getDb().prepare("INSERT INTO price_ticks (market_id, price) VALUES (?, ?)").run(marketId, body.price);
      }
    });
    emitRealtime("admin:update", { room: "admin", payload: { type: "market:update", marketId } });
    emitRealtime("market:update", { payload: { marketId } });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
