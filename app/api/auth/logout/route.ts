import { clearSession } from "@/lib/auth";
import { handleError, json, requireSameOrigin } from "@/lib/api";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await clearSession();
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
