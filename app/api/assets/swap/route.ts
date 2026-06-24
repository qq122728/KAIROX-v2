import { requireUser } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { emitRealtime, userRoom } from "@/lib/realtime";
import { buildSwapQuote, executeSwapTransaction, isSwapAsset, SWAP_SUPPORTED_ASSETS } from "@/lib/swap";

type SwapBody = { fromAsset?: string; toAsset?: string; amount?: number | string };

export async function GET(request: Request) {
  try {
    await requireUser();
    const url = new URL(request.url);
    const fromAsset = String(url.searchParams.get("fromAsset") || "");
    const toAsset = String(url.searchParams.get("toAsset") || "");
    const amount = Number(url.searchParams.get("amount") || "0");
    if (!isSwapAsset(fromAsset)) return badRequest("Unsupported source asset");
    if (!isSwapAsset(toAsset)) return badRequest("Unsupported target asset");
    if (!Number.isFinite(amount) || amount <= 0) return badRequest("Invalid amount");
    if (fromAsset === toAsset) return badRequest("From and to assets must differ");

    const quote = await buildSwapQuote(fromAsset, toAsset, amount);
    return json({ ok: true, quote });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<SwapBody>(request);
    const fromAsset = String(body.fromAsset || "");
    const toAsset = String(body.toAsset || "");
    const amount = Number(body.amount);
    if (!isSwapAsset(fromAsset)) return badRequest(`Unsupported source asset. Supported: ${SWAP_SUPPORTED_ASSETS.join(", ")}`);
    if (!isSwapAsset(toAsset)) return badRequest(`Unsupported target asset. Supported: ${SWAP_SUPPORTED_ASSETS.join(", ")}`);
    if (fromAsset === toAsset) return badRequest("From and to assets must differ");
    if (!Number.isFinite(amount) || amount <= 0) return badRequest("Invalid amount");

    let quote;
    try {
      quote = await buildSwapQuote(fromAsset, toAsset, amount);
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Quote unavailable");
    }
    if (!quote.toAmount || quote.toAmount <= 0) return badRequest("Amount too small after fee");

    let receipt;
    try {
      receipt = executeSwapTransaction(user.id, user.balance, quote);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "INSUFFICIENT_BALANCE") return badRequest("Insufficient balance");
      throw error;
    }

    emitRealtime("user:update", { room: userRoom(user.id), payload: { type: "swap:completed", swapId: receipt.swapId } });
    emitRealtime("admin:update", { room: "admin", payload: { type: "swap:completed", swapId: receipt.swapId, userId: user.id } });

    return json({ ok: true, receipt });
  } catch (error) {
    return handleError(error);
  }
}
