import { createHash, randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { badRequest, handleError, json } from "@/lib/api";
import { consumeIpRate } from "@/lib/rate-limit";
import { getDb } from "@/lib/db";
import { KYC_UPLOAD_CONFIG, type KycFileType } from "@/lib/kyc-config";
import { processKycImage, cleanupOrphanFiles } from "@/lib/kyc-image-processor";

const VALID_FILE_TYPES = new Set<string>(["front", "back", "selfie"]);

function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const rate = consumeIpRate(request, "kyc-upload", KYC_UPLOAD_CONFIG.UPLOAD_RATE_LIMIT, KYC_UPLOAD_CONFIG.UPLOAD_RATE_WINDOW_MS);
    if (!rate.allowed) return json({ error: "上传太频繁，请稍后再试", errorCode: "RATE_LIMITED" }, 429);

    const form = await request.formData();
    const file = form.get("file");
    const fileType = String(form.get("fileType") || "").trim();
    if (!(file instanceof File) || file.size === 0) return badRequest("请选择文件");
    if (!VALID_FILE_TYPES.has(fileType)) return badRequest("无效的文件类型");
    if (file.size > KYC_UPLOAD_CONFIG.RAW_MAX_BYTES) return json({ error: "文件超过 25MB 限制", errorCode: "FILE_TOO_LARGE" }, 413);

    const buf = Buffer.from(await file.arrayBuffer());
    const result = await processKycImage(buf, file.name);
    if (!result.ok) return json({ error: result.message, errorCode: result.errorCode }, 400);

    // Generate token and store in DB
    const token = randomBytes(32).toString("hex");
    const tokenHash = sha256hex(token);
    const expiresAt = new Date(Date.now() + KYC_UPLOAD_CONFIG.TOKEN_TTL_MS).toISOString();

    getDb()
      .prepare(
        `INSERT INTO kyc_upload_tokens (token_hash, user_id, file_type, storage_key, mime_type, byte_size, width, height, sha256, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(tokenHash, user.id, fileType, result.storageKey, result.mimeType, result.byteSize, result.width, result.height, result.sha256, expiresAt);

    // Fire-and-forget cleanup (don't block upload response)
    cleanupOrphanFiles().catch(() => {});

    return json({ ok: true, uploadToken: token, fileType, byteSize: result.byteSize, width: result.width, height: result.height });
  } catch (error) {
    return handleError(error);
  }
}
