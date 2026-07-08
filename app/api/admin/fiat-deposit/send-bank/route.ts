import { badRequest, handleError, json, readJson, tooManyRequests } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { consumeIpRate } from "@/lib/rate-limit";
import crypto from "node:crypto";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const rateLimit = consumeIpRate(request, "admin-fiat-send-bank", 30, 60000);
    if (!rateLimit.allowed) {
      return tooManyRequests("Too many requests.", rateLimit.retryAfterMs);
    }

    const body = await readJson<{
      depositId: number;
      bankAccountId: number;
      exchangeRate: number;
      rateSpread?: number;
      finalRate?: number;
    }>(request);

    const depositId = Number(body.depositId);
    const bankAccountId = Number(body.bankAccountId);
    const exchangeRate = Number(body.exchangeRate);
    const rateSpread = Number(body.rateSpread ?? 0);
    const finalRate = Number.isFinite(Number(body.finalRate))
      ? Number(body.finalRate)
      : exchangeRate * (1 - rateSpread);

    if (!Number.isInteger(depositId) || depositId <= 0) return badRequest("Invalid depositId");
    if (!Number.isInteger(bankAccountId) || bankAccountId <= 0) return badRequest("Invalid bankAccountId");
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return badRequest("Invalid exchangeRate");
    if (!Number.isFinite(finalRate) || finalRate <= 0) return badRequest("Invalid finalRate");

    const db = getDb();

    const deposit = db.prepare("SELECT * FROM fiat_deposits WHERE id = ?").get(depositId) as
      | { id: number; user_id: number; currency: string; status: string }
      | undefined;
    if (!deposit) return badRequest("Deposit not found");
    if (deposit.status !== "requested" && deposit.status !== "bank_sent") {
      return badRequest("Deposit is not in a state that can receive bank details");
    }

    const bankAccount = db.prepare("SELECT * FROM fiat_bank_accounts WHERE id = ? AND is_active = 1").get(bankAccountId) as
      | Record<string, unknown>
      | undefined;
    if (!bankAccount) return badRequest("Bank account not found");
    if (String(bankAccount.currency || "").toUpperCase() !== deposit.currency.toUpperCase()) {
      return badRequest(`Bank account currency (${bankAccount.currency}) does not match deposit currency (${deposit.currency})`);
    }

    // Generate unique reference code
    let referenceCode = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const random = crypto.randomBytes(3).toString("hex").toUpperCase();
      const candidate = `VX-${dateStr}-${random}`;
      const exists = db.prepare("SELECT 1 FROM fiat_deposits WHERE reference_code = ?").get(candidate);
      if (!exists) {
        referenceCode = candidate;
        break;
      }
    }
    if (!referenceCode) return badRequest("Could not generate unique reference code");

    const bankSnapshot = JSON.stringify(bankAccount);

    db.prepare(
      `UPDATE fiat_deposits SET
        status = 'bank_sent',
        bank_account_id = ?,
        bank_snapshot_json = ?,
        exchange_rate = ?,
        rate_spread = ?,
        final_rate = ?,
        reference_code = ?,
        bank_admin_id = ?,
        bank_sent_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(bankAccountId, bankSnapshot, exchangeRate, rateSpread, finalRate, referenceCode, admin.id, depositId);

    // Build bank info message
    const bankInfo = {
      bank_name: bankAccount.bank_name,
      account_holder: bankAccount.account_holder,
      account_number: bankAccount.account_number,
      currency: deposit.currency,
      reference_code: referenceCode,
      exchange_rate: exchangeRate,
      final_rate: finalRate,
    };
    // Add currency-specific fields
    const extraFields: string[] = [];
    if (bankAccount.swift_code) extraFields.push(`SWIFT: ${bankAccount.swift_code}`);
    if (bankAccount.iban) extraFields.push(`IBAN: ${bankAccount.iban}`);
    if (bankAccount.sort_code) extraFields.push(`Sort Code: ${bankAccount.sort_code}`);
    if (bankAccount.routing_number) extraFields.push(`Routing: ${bankAccount.routing_number}`);
    if (bankAccount.branch_name) extraFields.push(`Branch: ${bankAccount.branch_name}`);
    if (bankAccount.branch_code) extraFields.push(`Branch Code: ${bankAccount.branch_code}`);
    if (bankAccount.bank_code) extraFields.push(`Bank Code: ${bankAccount.bank_code}`);

    const bankMsg = [
      `🏦 **Bank Transfer Details**`,
      ``,
      `Bank: ${bankAccount.bank_name}`,
      `Account Name: ${bankAccount.account_holder}`,
      `Account Number: ${bankAccount.account_number}`,
      ...(extraFields.length ? [...extraFields, ""] : [""]),
      `Reference Code: \`${referenceCode}\``,
      `Rate: 1 ${deposit.currency} = ${finalRate} USDT`,
      ``,
      `Please include the reference code in your transfer remark.`,
      `After payment, use **Submit Transfer Info** to send your transfer amount.`,
    ].join("\n");

    const msgResult = db
      .prepare(
        `INSERT INTO support_messages (user_id, role, text, message_type, metadata_json, read_by_user, read_by_admin)
         VALUES (?, 'agent', ?, 'fiat_bank', ?, 0, 1)`
      )
      .run(deposit.user_id, bankMsg, JSON.stringify({ depositId, ...bankInfo }));

    db.prepare("UPDATE fiat_deposits SET bank_message_id = ? WHERE id = ?").run(
      Number(msgResult.lastInsertRowid),
      depositId,
    );

    const updated = db.prepare("SELECT * FROM fiat_deposits WHERE id = ?").get(depositId);
    return json({ deposit: updated });
  } catch (error) {
    return handleError(error);
  }
}
