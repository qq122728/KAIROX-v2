import { requireUser } from "@/lib/auth";
import { badRequest, handleError, json, requireSameOrigin } from "@/lib/api";
import { getDb, inTransaction } from "@/lib/db";
import { emitRealtime, userRoom } from "@/lib/realtime";

async function fileToData(file: File | null) {
  if (!file || file.size === 0) return { name: null, mime: null, data: null };
  if (file.size > 2_000_000) throw new Error("KYC image must be smaller than 2MB");
  const bytes = Buffer.from(await file.arrayBuffer());
  return { name: file.name, mime: file.type || "application/octet-stream", data: `data:${file.type || "application/octet-stream"};base64,${bytes.toString("base64")}` };
}

export async function GET() {
  try {
    const user = await requireUser();
    const submission = getDb()
      .prepare("SELECT * FROM kyc_submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(user.id);
    return json({ kycStatus: user.kyc_status || "none", submission });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const form = await request.formData();
    const legalName = String(form.get("legalName") || "").trim();
    const documentType = String(form.get("documentType") || "").trim();
    if (!legalName || !documentType) return badRequest("Legal name and document type are required");
    const front = await fileToData(form.get("front") instanceof File ? form.get("front") as File : null);
    const back = await fileToData(form.get("back") instanceof File ? form.get("back") as File : null);

    let submissionId = 0;
    inTransaction(() => {
      const result = getDb()
        .prepare(
          `INSERT INTO kyc_submissions (user_id, legal_name, document_type, front_name, front_data, front_mime, back_name, back_data, back_mime)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(user.id, legalName, documentType, front.name, front.data, front.mime, back.name, back.data, back.mime);
      submissionId = Number(result.lastInsertRowid);
      getDb()
        .prepare("UPDATE users SET kyc_status = 'pending', kyc_rejected_reason = NULL, kyc_latest_submission_id = ? WHERE id = ?")
        .run(submissionId, user.id);
    });

    emitRealtime("admin:update", { room: "admin", payload: { type: "kyc:created", submissionId, userId: user.id } });
    emitRealtime("user:update", { room: userRoom(user.id), payload: { type: "kyc:update", status: "pending" } });
    return json({ ok: true, submissionId });
  } catch (error) {
    return handleError(error);
  }
}
