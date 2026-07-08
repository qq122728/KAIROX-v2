import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { consumeIpRate } from "@/lib/rate-limit";

// Currency-specific required fields
const REQUIRED_FIELDS: Record<string, string[]> = {
  USD: ["bank_name", "account_holder", "account_number"],
  MYR: ["bank_name", "account_holder", "account_number"],
  GBP: ["bank_name", "account_holder", "account_number", "sort_code"],
  EUR: ["bank_name", "account_holder", "iban"],
  JPY: ["bank_name", "branch_name", "account_number", "account_holder"],
  TWD: ["bank_name", "bank_code", "account_number", "account_holder"],
};

function validateBankFields(body: Record<string, unknown>, currency: string): string | null {
  const required = REQUIRED_FIELDS[currency];
  if (!required) return `Unsupported currency: ${currency}`;
  for (const field of required) {
    const val = String(body[field] || "").trim();
    if (!val) return `${field} is required for ${currency}`;
  }
  return null;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const currency = url.searchParams.get("currency") || "";

    let sql = "SELECT * FROM fiat_bank_accounts WHERE 1=1";
    const params: string[] = [];
    if (currency) {
      sql += " AND currency = ?";
      params.push(currency.toUpperCase());
    }
    sql += " ORDER BY sort_order ASC, currency ASC, id ASC";

    const accounts = getDb().prepare(sql).all(...params);
    return json({ accounts });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const rateLimit = consumeIpRate(request, "admin-fiat-bank-accounts", 30, 60000);
    if (!rateLimit.allowed) {
      return tooManyRequests("Too many requests.", rateLimit.retryAfterMs);
    }

    const body = await readJson<Record<string, unknown>>(request);
    const currency = String(body.currency || "").trim().toUpperCase();

    const error = validateBankFields(body, currency);
    if (error) return badRequest(error);

    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO fiat_bank_accounts (
          currency, country_region, bank_name, account_holder, account_number,
          branch_name, swift_code, iban, routing_number, sort_code,
          ach_routing_number, wire_routing_number, bank_code, branch_code,
          institution_number, transit_number, bsb_code, fps_id, paynow_id,
          min_amount, max_amount, default_exchange_rate, default_rate_spread,
          is_active, sort_order
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        currency,
        String(body.country_region || "").trim() || null,
        String(body.bank_name || "").trim(),
        String(body.account_holder || "").trim(),
        String(body.account_number || "").trim() || null,
        String(body.branch_name || "").trim() || null,
        String(body.swift_code || "").trim() || null,
        String(body.iban || "").trim() || null,
        String(body.routing_number || "").trim() || null,
        String(body.sort_code || "").trim() || null,
        String(body.ach_routing_number || "").trim() || null,
        String(body.wire_routing_number || "").trim() || null,
        String(body.bank_code || "").trim() || null,
        String(body.branch_code || "").trim() || null,
        String(body.institution_number || "").trim() || null,
        String(body.transit_number || "").trim() || null,
        String(body.bsb_code || "").trim() || null,
        String(body.fps_id || "").trim() || null,
        String(body.paynow_id || "").trim() || null,
        Number.isFinite(Number(body.min_amount)) ? Number(body.min_amount) : null,
        Number.isFinite(Number(body.max_amount)) ? Number(body.max_amount) : null,
        Number.isFinite(Number(body.default_exchange_rate)) ? Number(body.default_exchange_rate) : null,
        Number.isFinite(Number(body.default_rate_spread)) ? Number(body.default_rate_spread) : null,
        body.is_active !== undefined ? Number(body.is_active) : 1,
        Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      );

    const account = db.prepare("SELECT * FROM fiat_bank_accounts WHERE id = ?").get(Number(result.lastInsertRowid));
    return json({ account });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const rateLimit = consumeIpRate(request, "admin-fiat-bank-accounts", 30, 60000);
    if (!rateLimit.allowed) {
      return tooManyRequests("Too many requests.", rateLimit.retryAfterMs);
    }

    const body = await readJson<Record<string, unknown> & { id: number }>(request);
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return badRequest("Invalid id");

    const db = getDb();
    const existing = db.prepare("SELECT * FROM fiat_bank_accounts WHERE id = ?").get(id) as
      | { currency: string }
      | undefined;
    if (!existing) return badRequest("Bank account not found");

    const currency = String(body.currency || existing.currency).trim().toUpperCase();

    db
      .prepare(
        `UPDATE fiat_bank_accounts SET
          currency = ?, country_region = ?, bank_name = ?, account_holder = ?,
          account_number = ?, branch_name = ?, swift_code = ?, iban = ?,
          routing_number = ?, sort_code = ?, ach_routing_number = ?,
          wire_routing_number = ?, bank_code = ?, branch_code = ?,
          institution_number = ?, transit_number = ?, bsb_code = ?,
          fps_id = ?, paynow_id = ?,
          min_amount = ?, max_amount = ?,
          default_exchange_rate = ?, default_rate_spread = ?,
          is_active = ?, sort_order = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .run(
        currency,
        String(body.country_region || "").trim() || null,
        String(body.bank_name || "").trim(),
        String(body.account_holder || "").trim(),
        String(body.account_number || "").trim() || null,
        String(body.branch_name || "").trim() || null,
        String(body.swift_code || "").trim() || null,
        String(body.iban || "").trim() || null,
        String(body.routing_number || "").trim() || null,
        String(body.sort_code || "").trim() || null,
        String(body.ach_routing_number || "").trim() || null,
        String(body.wire_routing_number || "").trim() || null,
        String(body.bank_code || "").trim() || null,
        String(body.branch_code || "").trim() || null,
        String(body.institution_number || "").trim() || null,
        String(body.transit_number || "").trim() || null,
        String(body.bsb_code || "").trim() || null,
        String(body.fps_id || "").trim() || null,
        String(body.paynow_id || "").trim() || null,
        Number.isFinite(Number(body.min_amount)) ? Number(body.min_amount) : null,
        Number.isFinite(Number(body.max_amount)) ? Number(body.max_amount) : null,
        Number.isFinite(Number(body.default_exchange_rate)) ? Number(body.default_exchange_rate) : null,
        Number.isFinite(Number(body.default_rate_spread)) ? Number(body.default_rate_spread) : null,
        body.is_active !== undefined ? Number(body.is_active) : 1,
        Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
        id,
      );

    const account = db.prepare("SELECT * FROM fiat_bank_accounts WHERE id = ?").get(id);
    return json({ account });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const rateLimit = consumeIpRate(request, "admin-fiat-bank-accounts", 30, 60000);
    if (!rateLimit.allowed) {
      return tooManyRequests("Too many requests.", rateLimit.retryAfterMs);
    }

    const body = await readJson<{ id: number }>(request);
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return badRequest("Invalid id");

    // Soft delete only
    getDb().prepare("UPDATE fiat_bank_accounts SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
