import { getDb, inTransaction } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { calcPnl } from "@/lib/trading";
import { ensureUserAssetRow, syncUserStableBalance } from "@/lib/balances";

type AdminPosition = {
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
};

function pnlOverrideBounds(position: Pick<AdminPosition, "margin" | "size">) {
  return {
    min: -Math.max(0, position.margin),
    max: Math.max(0, position.size)
  };
}

function validatePnlOverride(value: number, position: Pick<AdminPosition, "margin" | "size">) {
  if (!Number.isFinite(value)) return "Invalid PnL override";
  const bounds = pnlOverrideBounds(position);
  if (value < bounds.min || value > bounds.max) {
    return `PnL override must be between ${bounds.min} and ${bounds.max}`;
  }
  return null;
}

function clampAdminPnl(value: number, position: Pick<AdminPosition, "margin" | "size">) {
  const bounds = pnlOverrideBounds(position);
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<{ positionId: number; pnlOverride?: number | null; forceClose?: boolean; note?: string }>(request);
    const position = getDb()
      .prepare(
        `SELECT p.*, m.price AS mark_price, m.fee_rate, u.balance AS user_balance
         FROM positions p
         JOIN markets m ON m.id = p.market_id
         JOIN users u ON u.id = p.user_id
         WHERE p.id = ? AND p.status = 'open'`
      )
      .get(body.positionId) as AdminPosition | undefined;
    if (!position) return badRequest("Position not found");
    if (position.user_id === admin.id) return badRequest("Admins cannot modify their own positions");

    if (body.forceClose) {
      const hasManualPnl = typeof body.pnlOverride === "number" || (position.pnl_override !== null && position.pnl_override !== undefined);
      const rawPnl = typeof body.pnlOverride === "number"
        ? body.pnlOverride
        : position.pnl_override !== null && position.pnl_override !== undefined
          ? position.pnl_override
          : calcPnl({ ...position, pnl_override: null }, position.mark_price);
      if (!Number.isFinite(rawPnl)) return badRequest("Invalid PnL");
      const overrideError = hasManualPnl ? validatePnlOverride(rawPnl, position) : null;
      if (overrideError) return badRequest(overrideError);
      const pnl = clampAdminPnl(rawPnl, position);
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
              `INSERT INTO orders (user_id, market_id, position_id, action, side, price, fee, pnl, note, actor_id)
               VALUES (?, ?, ?, 'force_close', ?, ?, ?, ?, ?, ?)`
            )
            .run(position.user_id, position.market_id, position.id, position.side, position.mark_price, fee, pnl - fee, body.note || `Admin #${admin.id} force close`, admin.id);
          getDb()
            .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, status, note, actor_id) VALUES (?, 'USDC', 'admin_force_close', ?, 'completed', ?, ?)")
            .run(position.user_id, payout, `admin#${admin.id} force close position #${position.id}; pnl ${pnl}; fee ${fee}`, admin.id);
        });
      } catch (error) {
        if (positionAlreadyClosed) return badRequest("Position not found");
        throw error;
      }
    } else {
      const nextOverride = typeof body.pnlOverride === "number" ? body.pnlOverride : null;
      if (nextOverride !== null) {
        const overrideError = validatePnlOverride(nextOverride, position);
        if (overrideError) return badRequest(overrideError);
      }
      getDb()
        .prepare("UPDATE positions SET pnl_override = ? WHERE id = ?")
        .run(nextOverride, position.id);
      getDb()
        .prepare(
          `INSERT INTO orders (user_id, market_id, position_id, action, side, price, fee, pnl, note, actor_id)
           VALUES (?, ?, ?, 'pnl_override', ?, ?, 0, ?, ?, ?)`
        )
        .run(position.user_id, position.market_id, position.id, position.side, position.mark_price, nextOverride, `admin#${admin.id} updated pnl override`, admin.id);
    }
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
