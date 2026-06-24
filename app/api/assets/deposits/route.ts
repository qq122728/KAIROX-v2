import { requireUser } from "@/lib/auth";
import { badRequest, handleError, json, requireSameOrigin, tooManyRequests } from "@/lib/api";
import { getDb, inTransaction } from "@/lib/db";
import { emitRealtime, userRoom } from "@/lib/realtime";
import { normalizeAsset } from "@/lib/balances";
import { sanitizePublicRecords, type PublicRecordRow } from "@/lib/public-records";
import { normalizeNetwork } from "@/lib/networks";
import { consumeUserRate } from "@/lib/rate-limit";

const supportedAssets = new Set(["USDC", "BTC", "ETH", "SOL"]);
const depositLimit = Math.max(1, Number(process.env.PERP_SIM_DEPOSIT_LIMIT || 10));
const depositWindowMs = Math.max(1000, Number(process.env.PERP_SIM_DEPOSIT_WINDOW_MS || 60_000));

function isDuplicateTxHashError(error: unknown) {
  return error instanceof Error && /deposits\.tx_hash|idx_deposits_tx_hash/i.test(error.message);
}

async function fileToData(file: File | null) {
  if (!file || file.size === 0) return { name: null, mime: null, data: null };
  if (file.size > 2_000_000) throw new Error("Proof image must be smaller than 2MB");
  const bytes = Buffer.from(await file.arrayBuffer());
  return { name: file.name, mime: file.type || "application/octet-stream", data: `data:${file.type || "application/octet-stream"};base64,${bytes.toString("base64")}` };
}

export async function GET() {
  try {
    const user = await requireUser();
    const deposits = sanitizePublicRecords(getDb().prepare("SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").all(user.id) as PublicRecordRow[]);
    return json({ deposits });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const limit = consumeUserRate(user.id, "deposit", depositLimit, depositWindowMs);
    if (!limit.allowed) return tooManyRequests("Too many deposit requests. Please slow down.", limit.retryAfterMs);

    const form = await request.formData();
    const asset = normalizeAsset(String(form.get("asset") || "USDC"));
    const network = normalizeNetwork(String(form.get("network") || ""));
    const amount = Number(form.get("amount") || 0);
    const txHash = String(form.get("txHash") || "").trim() || null;
    if (!asset || !network) return badRequest("Asset and network are required");
    if (!supportedAssets.has(asset)) return badRequest("Unsupported asset");
    if (!Number.isFinite(amount) || amount <= 0) return badRequest("Invalid deposit amount");
    if (txHash) {
      const existingTx = getDb().prepare("SELECT id FROM deposits WHERE tx_hash = ? LIMIT 1").get(txHash) as { id: number } | undefined;
      if (existingTx) return badRequest("Transaction hash has already been submitted");
    }

    const address = getDb()
      .prepare(
        `SELECT d.asset, d.network,
                COALESCE(u.address, d.address) AS address,
                CASE WHEN u.address IS NULL THEN 'default' ELSE 'custom' END AS source
         FROM deposit_addresses d
         LEFT JOIN user_deposit_addresses u
           ON u.user_id = ? AND u.asset = d.asset AND UPPER(TRIM(u.network)) = UPPER(TRIM(d.network)) AND u.is_active = 1
         WHERE d.asset = ? AND UPPER(TRIM(d.network)) = ? AND d.is_active = 1
         UNION
         SELECT u.asset, u.network, u.address, 'custom' AS source
         FROM user_deposit_addresses u
         WHERE u.user_id = ? AND u.asset = ? AND UPPER(TRIM(u.network)) = ? AND u.is_active = 1
         LIMIT 1`
      )
      .get(user.id, asset, network, user.id, asset, network) as { address: string; source: string } | undefined;
    if (!address?.address) return badRequest("No active deposit address for this asset/network");

    const proof = await fileToData(form.get("proof") instanceof File ? form.get("proof") as File : null);
    let depositId = 0;
    try {
      inTransaction(() => {
        const result = getDb()
          .prepare(
            `INSERT INTO deposits (user_id, asset, network, amount, tx_hash, proof_name, proof_data, proof_mime, deposit_address, address_source, status, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
          )
          .run(user.id, asset, network, amount, txHash, proof.name, proof.data, proof.mime, address.address, address.source, "User submitted deposit");
        depositId = Number(result.lastInsertRowid);
        getDb()
          .prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, status, note) VALUES (?, ?, 'deposit_request', ?, 'pending', ?)")
          .run(user.id, asset, amount, `Deposit request #${depositId} pending system review`);
      });
    } catch (error) {
      if (isDuplicateTxHashError(error)) return badRequest("Transaction hash has already been submitted");
      throw error;
    }

    emitRealtime("admin:update", { room: "admin", payload: { type: "deposit:created", depositId, userId: user.id } });
    emitRealtime("user:update", { room: userRoom(user.id), payload: { type: "deposit:created", depositId } });
    return json({ ok: true, depositId });
  } catch (error) {
    return handleError(error);
  }
}
