import { getDb, inTransaction } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { calcPnl } from "@/lib/trading";
import { ensureUserAssetRow, syncUserStableBalance } from "@/lib/balances";

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<{ positionId: number; pnlOverride?: number | null; forceClose?: boolean; note?: string }>(request);
    const position = getDb()
      .prepare(
        `SELECT p.*, m.price AS mark_price, m.fee_rate, u.balance AS user_balance
         FROM positions p
         JOIN markets m ON m.id = p.market_id
         JOIN users u ON u.id = p.user_id
         WHERE p.id = ? AND p.status = 'open'`
      )
      .get(body.positionId) as
      | {
          id: number;
          user_id: number;
          market_id: number;
          side: "long" | "short";
          margin: number;
          size: number;
          entry_price: number;
          pnl_override: number | null;
          mark_price: number;
          fee_rate: number;
          user_balance: number;
        }
      | undefined;
    if (!position) return badRequest("Position not found");

    if (body.forceClose) {
      const pnl = typeof body.pnlOverride === "number" ? body.pnlOverride : calcPnl(position, position.mark_price);
      const fee = position.size * position.fee_rate;
      const payout = Math.max(0, position.margin + pnl - fee);
      let positionAlreadyClosed = false;

      try {
        inTransaction(() => {
          const close = getDb()
            .prepare(
              "UPDATE positions SET status = 'closed', closed_at = CURRENT_TIMESTAMP, close_price = ?, realized_pnl = ?, close_reason = 'admin_force' WHERE id = ? AND status = 'open'"
            )
            .run(position.mark_price, pnl - fee, position.id);
          if (Number(close.changes || 0) !== 1) {
            positionAlreadyClosed = true;
            throw new Error("Position not found");
          }

          ensureUserAssetRow(position.user_id, "USDC", position.user_balance);
          const credit = getDb()
            .prepare("UPDATE user_assets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = 'USDC'")
            .run(payout, position.user_id);
          if (Number(credit.changes || 0) !== 1) throw new Error("Unable to credit user asset balance");
          syncUserStableBalance(position.user_id);

          getDb()
            .prepare(
              `INSERT INTO orders (user_id, market_id, position_id, action, side, price, fee, pnl, note)
               VALUES (?, ?, ?, 'force_close', ?, ?, ?, ?, ?)`
            )
            .run(position.user_id, position.market_id, position.id, position.side, position.mark_price, fee, pnl - fee, body.note || "Admin force close");
        });
      } catch (error) {
        if (positionAlreadyClosed) return badRequest("Position not found");
        throw error;
      }
    } else {
      getDb()
        .prepare("UPDATE positions SET pnl_override = ? WHERE id = ?")
        .run(typeof body.pnlOverride === "number" ? body.pnlOverride : null, position.id);
    }
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
