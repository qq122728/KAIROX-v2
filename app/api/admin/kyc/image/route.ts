import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json } from "@/lib/api";
import { getDb } from "@/lib/db";

type KycImageSide = "front" | "back";
type KycImageRow = {
  image_data: string | null;
};

function parsePositiveId(value: string | null) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseSide(value: string | null): KycImageSide | null {
  return value === "front" || value === "back" ? value : null;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const submissionId = parsePositiveId(params.get("submissionId"));
    const side = parseSide(params.get("side"));
    if (!submissionId || !side) return badRequest("身份图片参数无效");

    const column = side === "front" ? "front_data" : "back_data";
    const row = getDb()
      .prepare(`SELECT ${column} AS image_data FROM kyc_submissions WHERE id = ? LIMIT 1`)
      .get(submissionId) as KycImageRow | undefined;
    if (!row?.image_data) return json({ error: "身份图片不存在" }, 404);

    return json({ src: row.image_data });
  } catch (error) {
    return handleError(error);
  }
}
