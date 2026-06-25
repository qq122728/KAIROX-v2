import { requireAdmin } from "@/lib/auth";
import { badRequest, handleError, json } from "@/lib/api";
import { getDb } from "@/lib/db";

type DepositProofRow = {
  proof_data: string | null;
};

function parsePositiveId(value: string | null) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const depositId = parsePositiveId(new URL(request.url).searchParams.get("depositId"));
    if (!depositId) return badRequest("充值记录参数无效");

    const row = getDb()
      .prepare("SELECT proof_data FROM deposits WHERE id = ? LIMIT 1")
      .get(depositId) as DepositProofRow | undefined;
    if (!row?.proof_data) return json({ error: "充值凭证图片不存在" }, 404);

    return json({ src: row.proof_data });
  } catch (error) {
    return handleError(error);
  }
}
