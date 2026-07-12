import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { networkConfigDefaults, normalizeNetworkCode } from "@/lib/network-config";

const supportedAssets = new Set(["USDC", "BTC", "ETH", "SOL"]);

type NetworkPayload = {
  id?: number;
  asset?: string;
  code?: string;
  name?: string;
  icon?: string;
  depositEnabled?: boolean;
  withdrawEnabled?: boolean;
  depositFee?: number;
  withdrawFee?: number;
  minDeposit?: number;
  minWithdraw?: number;
  isActive?: boolean;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isNonNegativeNumber(value: unknown) {
  if (value == null || value === "") return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

function nonNegativeNumber(value: unknown, fallback: number) {
  return value == null || value === "" ? fallback : Number(value);
}

export async function GET() {
  try {
    await requireAdmin();
    return json({ networks: getDb().prepare("SELECT id, asset, code, name, icon, deposit_enabled, withdraw_enabled, deposit_fee, withdraw_fee, min_deposit, min_withdraw, is_active, created_at, updated_at FROM asset_networks ORDER BY asset, id").all() });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<NetworkPayload>(request);
    const asset = clean(body.asset).toUpperCase();
    const code = normalizeNetworkCode(clean(body.code));
    if (!supportedAssets.has(asset)) return badRequest("Unsupported asset");
    if (!code) return badRequest("Network code is required");
    if (![body.depositFee, body.withdrawFee, body.minDeposit, body.minWithdraw].every(isNonNegativeNumber)) return badRequest("Network fees and minimums must be non-negative numbers");
    const defaults = networkConfigDefaults(asset, code);
    const name = clean(body.name) || defaults.name;
    const icon = clean(body.icon) || defaults.icon;
    const depositFee = nonNegativeNumber(body.depositFee, defaults.depositFee);
    const withdrawFee = nonNegativeNumber(body.withdrawFee, defaults.withdrawFee);
    const minDeposit = nonNegativeNumber(body.minDeposit, defaults.minDeposit);
    const minWithdraw = nonNegativeNumber(body.minWithdraw, defaults.minWithdraw);
    getDb().prepare(
      "INSERT INTO asset_networks (asset, code, name, icon, deposit_enabled, withdraw_enabled, deposit_fee, withdraw_fee, min_deposit, min_withdraw, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(asset, code) DO UPDATE SET name=excluded.name, icon=excluded.icon, deposit_enabled=excluded.deposit_enabled, withdraw_enabled=excluded.withdraw_enabled, deposit_fee=excluded.deposit_fee, withdraw_fee=excluded.withdraw_fee, min_deposit=excluded.min_deposit, min_withdraw=excluded.min_withdraw, is_active=excluded.is_active, updated_at=CURRENT_TIMESTAMP"
    ).run(asset, code, name, icon, body.depositEnabled === false ? 0 : 1, body.withdrawEnabled === false ? 0 : 1, depositFee, withdrawFee, minDeposit, minWithdraw, body.isActive === false ? 0 : 1);
    void admin;
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson<NetworkPayload>(request);
    if (!body.id) return badRequest("Network ID is required");
    const current = getDb().prepare("SELECT * FROM asset_networks WHERE id = ?").get(body.id) as Record<string, unknown> | undefined;
    if (!current) return badRequest("Network does not exist");
    if (![body.depositFee, body.withdrawFee, body.minDeposit, body.minWithdraw].every(isNonNegativeNumber)) return badRequest("Network fees and minimums must be non-negative numbers");
    const defaults = networkConfigDefaults(String(current.asset), String(current.code));
    const depositFee = nonNegativeNumber(body.depositFee, Number(current.deposit_fee ?? defaults.depositFee));
    const withdrawFee = nonNegativeNumber(body.withdrawFee, Number(current.withdraw_fee ?? defaults.withdrawFee));
    const minDeposit = nonNegativeNumber(body.minDeposit, Number(current.min_deposit ?? defaults.minDeposit));
    const minWithdraw = nonNegativeNumber(body.minWithdraw, Number(current.min_withdraw ?? defaults.minWithdraw));
    getDb().prepare(
      "UPDATE asset_networks SET name=?, icon=?, deposit_enabled=?, withdraw_enabled=?, deposit_fee=?, withdraw_fee=?, min_deposit=?, min_withdraw=?, is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).run(
      clean(body.name) || String(current.name || defaults.name),
      clean(body.icon) || String(current.icon || defaults.icon),
      typeof body.depositEnabled === "boolean" ? (body.depositEnabled ? 1 : 0) : Number(current.deposit_enabled || 0),
      typeof body.withdrawEnabled === "boolean" ? (body.withdrawEnabled ? 1 : 0) : Number(current.withdraw_enabled || 0),
      depositFee,
      withdrawFee,
      minDeposit,
      minWithdraw,
      typeof body.isActive === "boolean" ? (body.isActive ? 1 : 0) : Number(current.is_active || 0),
      body.id
    );
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
