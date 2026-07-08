import { badRequest, handleError, json, requireSameOrigin, tooManyRequests } from "@/lib/api";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { consumeUserRate } from "@/lib/rate-limit";

const ALLOWED_PROOF_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PROOF_SIZE = 5 * 1024 * 1024; // 5MB

function cleanFileName(name: string, depositId: number): string {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() || "jpg" : "jpg";
  return `fiat-proof-${depositId}-${Date.now()}.${ext}`;
}

async function fileToData(file: File | null): Promise<{ name: string | null; mime: string | null; data: string | null }> {
  if (!file || file.size === 0) return { name: null, mime: null, data: null };
  if (file.size > MAX_PROOF_SIZE) throw new Error("Proof image must be smaller than 5MB");
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_PROOF_TYPES.has(mime)) {
    throw new Error(`Unsupported file type: ${mime}. Allowed: JPEG, PNG, WebP.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  return { name: file.name, mime, data: `data:${mime};base64,${bytes.toString("base64")}` };
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const rateLimit = consumeUserRate(user.id, "fiat-deposit-submit", 10, 60000);
    if (!rateLimit.allowed) {
      return tooManyRequests("Too many attempts. Please slow down.", rateLimit.retryAfterMs);
    }

    const contentType = request.headers.get("content-type") || "";

    // Support both multipart/form-data (with proof) and application/json (legacy)
    let depositId: number;
    let amountFiat: number;
    let transferReference: string | null = null;
    let userRemark: string | null = null;
    let proofName: string | null = null;
    let proofMime: string | null = null;
    let proofData: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      depositId = Number(form.get("depositId"));
      amountFiat = Number(form.get("amountFiat"));
      transferReference = String(form.get("transferReference") || "").trim() || null;
      userRemark = String(form.get("remark") || "").trim() || null;

      const proofFile = form.get("proof");
      if (proofFile instanceof File) {
        const proof = await fileToData(proofFile);
        if (proof.data) {
          proofName = cleanFileName(proof.name || "proof.jpg", depositId);
          proofMime = proof.mime;
          proofData = proof.data;
        }
      }
    } else {
      // Legacy JSON
      const body = await request.json();
      depositId = Number(body.depositId);
      amountFiat = Number(body.amountFiat);
      transferReference = (body.transferReference || "").trim() || null;
      userRemark = (body.remark || "").trim() || null;
    }

    if (!Number.isInteger(depositId) || depositId <= 0) {
      return badRequest("Invalid depositId");
    }
    if (!Number.isFinite(amountFiat) || amountFiat <= 0) {
      return badRequest("amountFiat must be > 0");
    }

    const db = getDb();
    const deposit = db.prepare("SELECT * FROM fiat_deposits WHERE id = ?").get(depositId) as
      | { id: number; user_id: number; status: string; currency: string; final_rate: number; bank_snapshot_json: string | null }
      | undefined;

    if (!deposit) return badRequest("Deposit not found");
    if (deposit.user_id !== user.id) return badRequest("Deposit not found");

    if (deposit.status !== "bank_sent" && deposit.status !== "submitted") {
      return badRequest("Bank details have not been sent yet");
    }

    // Validate min/max from bank snapshot
    if (deposit.bank_snapshot_json) {
      try {
        const snapshot = JSON.parse(deposit.bank_snapshot_json);
        if (snapshot.min_amount && amountFiat < snapshot.min_amount) {
          return badRequest(`Minimum deposit amount is ${snapshot.min_amount} ${snapshot.currency || ""}`);
        }
        if (snapshot.max_amount && amountFiat > snapshot.max_amount) {
          return badRequest(`Maximum deposit amount is ${snapshot.max_amount} ${snapshot.currency || ""}`);
        }
      } catch { /* ignore */ }
    }

    const finalRate = deposit.final_rate || 0;
    const estimatedUsdt = Math.round(amountFiat * finalRate * 100) / 100;

    db.prepare(
      `UPDATE fiat_deposits
         SET status = 'submitted', amount_fiat = ?, estimated_usdt = ?,
             transfer_reference = ?, user_remark = ?,
             proof_name = ?, proof_data = ?, proof_mime = ?,
             submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`
    ).run(amountFiat, estimatedUsdt, transferReference, userRemark,
          proofName, proofData, proofMime, depositId, user.id);

    const hasProof = proofData != null;

    // Insert support message
    const metadata: Record<string, unknown> = {
      depositId, amountFiat, currency: deposit.currency, estimatedUsdt,
      transferReference, userRemark, hasProof,
    };
    db.prepare(
      `INSERT INTO support_messages (user_id, role, text, message_type, metadata_json, read_by_user, read_by_admin)
       VALUES (?, 'user', ?, 'fiat_transfer', ?, 1, 0)`
    ).run(
      user.id,
      `Transfer info submitted: ${amountFiat} ${deposit.currency}${hasProof ? " (with proof)" : ""}`,
      JSON.stringify(metadata)
    );

    const updated = db.prepare("SELECT * FROM fiat_deposits WHERE id = ?").get(depositId);
    return json({ deposit: updated });
  } catch (error) {
    return handleError(error);
  }
}
