import { createReadStream } from "node:fs";
import { statSync } from "node:fs";
import { requireAdmin } from "@/lib/auth";
import { badRequest, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getSubmissionFilePath } from "@/lib/kyc-image-processor";

function parsePositiveId(value: string | null) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const submissionId = parsePositiveId(params.get("submissionId"));
    const fileId = parsePositiveId(params.get("fileId"));
    const side = params.get("side");

    if (fileId) {
      const row = getDb()
        .prepare("SELECT storage_key, mime_type FROM kyc_files WHERE id = ? LIMIT 1")
        .get(fileId) as { storage_key: string; mime_type: string } | undefined;
      if (!row) return json({ error: "图片不存在" }, 404);
      const fp = getSubmissionFilePath(row.storage_key);
      if (!fp) return json({ error: "图片文件不存在" }, 404);
      const stream = createReadStream(fp);
      return new Response(stream as unknown as BodyInit, {
        headers: {
          "Content-Type": row.mime_type || "image/jpeg",
          "Content-Length": String(statSync(fp).size),
          "Cache-Control": "private, no-store",
          "Content-Disposition": "inline",
        },
      });
    }

    if (submissionId && (side === "front" || side === "back")) {
      const file = getDb()
        .prepare("SELECT storage_key, mime_type FROM kyc_files WHERE submission_id = ? AND file_type = ? LIMIT 1")
        .get(submissionId, side) as { storage_key: string; mime_type: string } | undefined;
      if (file) {
        const fp = getSubmissionFilePath(file.storage_key);
        if (fp) {
          const stream = createReadStream(fp);
          return new Response(stream as unknown as BodyInit, {
            headers: {
              "Content-Type": file.mime_type || "image/jpeg",
              "Content-Length": String(statSync(fp).size),
              "Cache-Control": "private, no-store",
              "Content-Disposition": "inline",
            },
          });
        }
      }
      const column = side === "front" ? "front_data" : "back_data";
      const row = getDb()
        .prepare(`SELECT ${column} AS image_data FROM kyc_submissions WHERE id = ? LIMIT 1`)
        .get(submissionId) as { image_data: string | null } | undefined;
      if (row?.image_data) return json({ src: row.image_data });
      return json({ error: "身份图片不存在" }, 404);
    }

    if (submissionId) {
      const files = getDb()
        .prepare("SELECT id, file_type, mime_type, byte_size, width, height, created_at FROM kyc_files WHERE submission_id = ? ORDER BY id")
        .all(submissionId);
      return json({ files });
    }

    return badRequest("请指定 submissionId 或 fileId");
  } catch {
    return json({ error: "Internal server error" }, 500);
  }
}
