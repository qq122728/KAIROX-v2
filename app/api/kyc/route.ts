import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { badRequest, handleError, json, requireSameOrigin } from "@/lib/api";
import { getDb, inTransaction } from "@/lib/db";
import { emitRealtime, userRoom } from "@/lib/realtime";
import { moveToSubmissions, moveBackToTmp, verifyTmpFile, tmpFileExists } from "@/lib/kyc-image-processor";
import { shouldFail, FAULT_POINTS, resetFaults } from "@/lib/kyc-fault-inject";

const REQUIRED_FILE_TYPES = ["front", "back"] as const;

function sha256hex(input: string): string { return createHash("sha256").update(input).digest("hex"); }

type TokenEntry = { token: string; tokenHash: string; fileType: string; storageKey: string; sha256: string; byteSize: number };

export async function GET() {
  try {
    const user = await requireUser();
    const submission = getDb().prepare("SELECT * FROM kyc_submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(user.id);
    return json({ kycStatus: user.kyc_status || "none", submission });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const legalName = String(body.legalName || "").trim();
    const documentType = String(body.documentType || "").trim();
    const rawTokens: string[] = Array.isArray(body.uploadTokens) ? body.uploadTokens : [];

    if (!legalName || !documentType) return badRequest("Legal name and document type are required");
    if (!rawTokens.length) return badRequest("请先上传证件照片");

    // --------------- Phase 1: Resolve & validate ALL tokens atomically ---------------

    // Deduplicate
    const uniqueTokens = [...new Set(rawTokens.map(t => String(t)))];
    if (uniqueTokens.length !== rawTokens.length) return badRequest("发现重复的上传凭证");

    const entries: TokenEntry[] = [];
    const seenTypes = new Set<string>();

    for (const token of uniqueTokens) {
      const tokenHash = sha256hex(token);
      const row = getDb()
        .prepare(
          `SELECT file_type, storage_key, sha256, byte_size FROM kyc_upload_tokens
           WHERE token_hash = ? AND user_id = ? AND consumed_at IS NULL AND expires_at > datetime('now')
           LIMIT 1`
        )
        .get(tokenHash, user.id) as { file_type: string; storage_key: string; sha256: string; byte_size: number } | undefined;

      if (!row) return badRequest("上传已过期，请重新上传证件照片");
      if (!REQUIRED_FILE_TYPES.includes(row.file_type as any)) return badRequest("无效的文件类型");

      // Type must not repeat
      if (seenTypes.has(row.file_type)) return badRequest("请勿重复上传同一面证件");
      seenTypes.add(row.file_type);

      // Verify file integrity
      if (!verifyTmpFile(row.storage_key, row.sha256, row.byte_size)) {
        return badRequest("上传文件已失效，请重新上传");
      }

      entries.push({ token, tokenHash, fileType: row.file_type, storageKey: row.storage_key, sha256: row.sha256, byteSize: row.byte_size });
    }

    // Must have both front and back
    if (!seenTypes.has("front") || !seenTypes.has("back")) return badRequest("请上传证件正反面");

    // --------------- Phase 2: Atomic transaction with file compensation ---------------

    const movedFiles: string[] = []; // track files moved to submissions/
    let submissionId = 0;

    try {
      inTransaction(() => {
        // Step 1: Conditionally consume ALL tokens
        for (const entry of entries) {
          const result = getDb()
            .prepare(
              `UPDATE kyc_upload_tokens SET consumed_at = datetime('now')
               WHERE token_hash = ? AND user_id = ? AND consumed_at IS NULL AND expires_at > datetime('now')`
            )
            .run(entry.tokenHash, user.id);
          if (result.changes !== 1) {
            throw new Error("TOKEN_ALREADY_CONSUMED");
          }
        }

        // Step 2: Move files from tmp/ → submissions/
        for (const entry of entries) {
          moveToSubmissions(entry.storageKey);
          movedFiles.push(entry.storageKey);
          if (movedFiles.length === 1 && shouldFail(FAULT_POINTS.AFTER_FIRST_MOVE)) throw new Error("FAULT_AFTER_FIRST_MOVE");
          if (movedFiles.length === 2 && shouldFail(FAULT_POINTS.AFTER_SECOND_MOVE)) throw new Error("FAULT_AFTER_SECOND_MOVE");
        }

        // Step 3: Insert submission + files
        const result = getDb()
          .prepare("INSERT INTO kyc_submissions (user_id, legal_name, document_type) VALUES (?, ?, ?)")
          .run(user.id, legalName, documentType);
        submissionId = Number(result.lastInsertRowid);

        if (shouldFail(FAULT_POINTS.AFTER_SUBMISSION_INSERT)) throw new Error("FAULT_AFTER_SUBMISSION_INSERT");

        const insertFile = getDb().prepare(
          "INSERT INTO kyc_files (submission_id, file_type, storage_key, mime_type, byte_size, width, height, sha256) VALUES (?, ?, ?, 'image/jpeg', ?, 0, 0, ?)"
        );
        for (const entry of entries) {
          insertFile.run(submissionId, entry.fileType, entry.storageKey, entry.byteSize, entry.sha256);
          if (shouldFail(FAULT_POINTS.AFTER_FIRST_FILE_INSERT) && entries.indexOf(entry) === 0) throw new Error("FAULT_AFTER_FIRST_FILE_INSERT");
        }

        if (shouldFail(FAULT_POINTS.BEFORE_COMMIT)) throw new Error("FAULT_BEFORE_COMMIT");

        getDb()
          .prepare("UPDATE users SET kyc_status = 'pending', kyc_rejected_reason = NULL, kyc_latest_submission_id = ? WHERE id = ?")
          .run(submissionId, user.id);
      });
    } catch (err: any) {
      // --- Compensation: move files back to tmp/ ---
      for (const key of movedFiles) {
        if (shouldFail(FAULT_POINTS.MOVE_BACK_FAILS)) {
          console.error("[kyc] moveBackToTmp simulated failure for key:", key.substring(0, 8) + "...");
          continue; // simulate failure
        }
        moveBackToTmp(key);
      }
      if (err?.message === "TOKEN_ALREADY_CONSUMED") return badRequest("上传已过期，请重新上传证件照片");
      throw err;
    }

    // --------------- Phase 3: Emit realtime ---------------

    emitRealtime("admin:update", { room: "admin", payload: { type: "kyc:created", submissionId, userId: user.id } });
    emitRealtime("user:update", { room: userRoom(user.id), payload: { type: "kyc:update", status: "pending" } });
    return json({ ok: true, submissionId });

  } catch (error) {
    return handleError(error);
  }
}
