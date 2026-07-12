import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { emitRealtime, userRoom } from "@/lib/realtime";
import { normalizeAsset } from "@/lib/balances";
import { normalizeNetwork } from "@/lib/networks";
import { networkConfigDefaults } from "@/lib/network-config";

const supportedAssets = new Set(["USDC", "BTC", "ETH", "SOL"]);

type AddressPayload = {
  id?: number;
  userId?: number | string;
  asset?: string;
  network?: string;
  address?: string;
  scope: "default" | "user";
  isActive?: boolean;
};

function clean(input?: string) {
  return (input || "").trim();
}

function resolveUserId(input?: number | string) {
  const raw = clean(String(input ?? ""));
  if (!raw) return null;
  const database = getDb();
  const byPublicUid = database.prepare("SELECT id FROM users WHERE public_uid = ?").get(raw) as { id: number } | undefined;
  if (byPublicUid) return byPublicUid;
  const numericId = Number(raw);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  return database.prepare("SELECT id FROM users WHERE id = ?").get(numericId) as { id: number } | undefined;
}

export async function GET() {
  try {
    await requireAdmin();
    return json({
      defaultAddresses: getDb().prepare("SELECT id, asset, UPPER(TRIM(network)) AS network, address, is_active, created_at FROM deposit_addresses WHERE asset IN ('USDC', 'BTC', 'ETH', 'SOL') ORDER BY asset, network").all(),
      userAddresses: getDb()
        .prepare(
          `SELECT a.id, a.user_id, a.asset, UPPER(TRIM(a.network)) AS network, a.address, a.is_active, a.created_at,
                  u.public_uid AS user_public_uid, u.email, u.username
           FROM user_deposit_addresses a
           JOIN users u ON u.id = a.user_id
           WHERE a.asset IN ('USDC', 'BTC', 'ETH', 'SOL')
           ORDER BY a.created_at DESC`
        )
        .all()
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<AddressPayload>(request);
    const asset = normalizeAsset(clean(body.asset));
    const network = normalizeNetwork(clean(body.network));
    const address = clean(body.address);
    if (!asset || !network || !address) return badRequest("Asset, network, and address are required");
    if (!supportedAssets.has(asset)) return badRequest("Unsupported asset");
    const defaults = networkConfigDefaults(asset, network);
    getDb().prepare("INSERT INTO asset_networks (asset, code, name, icon, deposit_enabled, withdraw_enabled, deposit_fee, withdraw_fee, min_deposit, min_withdraw, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(asset, code) DO NOTHING").run(defaults.asset, defaults.code, defaults.name, defaults.icon, 1, 1, defaults.depositFee, defaults.withdrawFee, defaults.minDeposit, defaults.minWithdraw, 1);

    let resolvedUserId: number | undefined;
    if (body.scope === "default") {
      getDb()
        .prepare(
          `INSERT INTO deposit_addresses (asset, network, address, is_active, updated_by, updated_at)
           VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(asset, network) DO UPDATE SET address = excluded.address, is_active = 1, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`
        )
        .run(asset, network, address, admin.id);
    } else {
      const user = resolveUserId(body.userId);
      if (!user) return badRequest("User does not exist");
      resolvedUserId = user.id;
      getDb()
        .prepare(
          `INSERT INTO user_deposit_addresses (user_id, asset, network, address, is_active, updated_by, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id, asset, network) DO UPDATE SET address = excluded.address, is_active = 1, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`
        )
        .run(resolvedUserId, asset, network, address, admin.id);
    }

    emitRealtime("admin:update", { room: "admin", payload: { type: "deposit-addresses:update" } });
    emitRealtime("deposit-addresses:update", { payload: { scope: body.scope, userId: resolvedUserId } });
    if (resolvedUserId) emitRealtime("user:update", { room: userRoom(resolvedUserId), payload: { type: "deposit-addresses:update" } });

    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<AddressPayload>(request);
    if (!body.id) return badRequest("Address ID is required");
    const table = body.scope === "user" ? "user_deposit_addresses" : "deposit_addresses";
    const current = body.scope === "user" ? getDb().prepare("SELECT user_id FROM user_deposit_addresses WHERE id = ?").get(body.id) as { user_id: number } | undefined : undefined;
    getDb()
      .prepare(`UPDATE ${table} SET address = COALESCE(?, address), is_active = COALESCE(?, is_active), updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(clean(body.address) || null, typeof body.isActive === "boolean" ? (body.isActive ? 1 : 0) : null, admin.id, body.id);
    emitRealtime("admin:update", { room: "admin", payload: { type: "deposit-addresses:update" } });
    emitRealtime("deposit-addresses:update", { payload: { scope: body.scope } });
    if (current?.user_id) emitRealtime("user:update", { room: userRoom(current.user_id), payload: { type: "deposit-addresses:update" } });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<{ id: number; scope: "default" | "user" }>(request);
    if (!body.id) return badRequest("Address ID is required");
    const table = body.scope === "user" ? "user_deposit_addresses" : "deposit_addresses";
    const current = body.scope === "user" ? getDb().prepare("SELECT user_id FROM user_deposit_addresses WHERE id = ?").get(body.id) as { user_id: number } | undefined : undefined;
    getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(body.id);
    emitRealtime("admin:update", { room: "admin", payload: { type: "deposit-addresses:update" } });
    emitRealtime("deposit-addresses:update", { payload: { scope: body.scope } });
    if (current?.user_id) emitRealtime("user:update", { room: userRoom(current.user_id), payload: { type: "deposit-addresses:update" } });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
