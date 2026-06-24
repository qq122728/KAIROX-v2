import { getDb } from "./db";

export type Market = {
  id: number;
  symbol: string;
  base_asset: string;
  price: number;
  max_leverage: number;
  fee_rate: number;
  maintenance_margin_rate: number;
  is_active: number;
  created_at: string;
};

export type Position = {
  id: number;
  user_id: number;
  user_public_uid?: string | null;
  username?: string;
  market_id: number;
  symbol: string;
  side: "long" | "short";
  margin: number;
  leverage: number;
  size: number;
  entry_price: number;
  liquidation_price: number;
  pnl_override: number | null;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  close_price: number | null;
  realized_pnl: number | null;
  close_reason: string | null;
  mark_price: number;
  unrealized_pnl: number;
  equity: number;
  roi: number;
};

export type PriceTick = {
  id: number;
  market_id: number;
  symbol: string;
  price: number;
  created_at: string;
};

export function calcPnl(position: Pick<Position, "side" | "size" | "entry_price" | "pnl_override">, price: number) {
  if (position.pnl_override !== null && position.pnl_override !== undefined) return position.pnl_override;
  const qty = position.size / position.entry_price;
  return position.side === "long" ? qty * (price - position.entry_price) : qty * (position.entry_price - price);
}

export function calcLiqPrice(side: "long" | "short", entryPrice: number, leverage: number, mmr: number) {
  const lossRatio = Math.max(0.01, 1 / leverage - mmr);
  return side === "long" ? entryPrice * (1 - lossRatio) : entryPrice * (1 + lossRatio);
}

export function listMarkets() {
  return getDb().prepare("SELECT * FROM markets ORDER BY symbol").all() as Market[];
}

export function listPriceTicks(marketId?: number, limit = 80) {
  const params: (number | string)[] = [];
  let where = "";
  if (marketId) {
    where = "WHERE t.market_id = ?";
    params.push(marketId);
  }
  params.push(limit);
  const rows = getDb()
    .prepare(
      `SELECT * FROM (
        SELECT t.*, m.symbol
        FROM price_ticks t
        JOIN markets m ON m.id = t.market_id
        ${where}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ?
      ) ORDER BY created_at ASC, id ASC`
    )
    .all(...params) as PriceTick[];
  return rows;
}

export function listOpenPositions(userId?: number) {
  const params: (number | string)[] = [];
  let where = "WHERE p.status = 'open'";
  if (userId) {
    where += " AND p.user_id = ?";
    params.push(userId);
  }
  const rows = getDb()
    .prepare(
      `SELECT p.*, m.symbol, m.price AS mark_price, u.public_uid AS user_public_uid, u.username
       FROM positions p
       JOIN markets m ON m.id = p.market_id
       JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY p.opened_at DESC`
    )
    .all(...params) as Position[];
  return rows.map(enrichPosition);
}

export function listOrders(userId?: number, limit = 100) {
  const params: (number | string)[] = [];
  let where = "";
  if (userId) {
    where = "WHERE o.user_id = ?";
    params.push(userId);
  }
  params.push(limit);
  return getDb()
    .prepare(
      `SELECT o.*, m.symbol, u.public_uid AS user_public_uid, u.username
       FROM orders o
       JOIN markets m ON m.id = o.market_id
       JOIN users u ON u.id = o.user_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT ?`
    )
    .all(...params);
}

export function enrichPosition(row: Position): Position {
  const pnl = calcPnl(row, row.mark_price);
  const equity = row.margin + pnl;
  return {
    ...row,
    unrealized_pnl: pnl,
    equity,
    roi: row.margin > 0 ? pnl / row.margin : 0
  };
}
