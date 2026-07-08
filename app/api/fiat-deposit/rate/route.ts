import { badRequest, handleError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { consumeUserRate } from "@/lib/rate-limit";

const SUPPORTED_CURRENCIES = new Set(["USD", "MYR", "GBP", "EUR", "JPY", "TWD"]);
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 5_000;

interface CacheEntry {
  rate: number;
  fetchedAt: string;
}

const cache = new Map<string, CacheEntry>();

async function fetchUsdRate(currency: string): Promise<{ rate: number; source: string }> {
  // Check cache
  const cached = cache.get(currency);
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
    return { rate: cached.rate, source: "frankfurter" };
  }

  // USD is 1:1
  if (currency === "USD") {
    const entry: CacheEntry = { rate: 1, fetchedAt: new Date().toISOString() };
    cache.set(currency, entry);
    return { rate: 1, source: "fixed" };
  }

  // Fetch from Frankfurter
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v2/rate/USD/${currency}`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    );
    if (!res.ok) {
      throw new Error(`Frankfurter returned ${res.status}`);
    }
    const data = (await res.json()) as { rate: number };
    const usdToFiat = data.rate;
    if (!usdToFiat || !Number.isFinite(usdToFiat) || usdToFiat <= 0) {
      throw new Error(`No rate for ${currency}`);
    }
    // Frankfurter gives USD → fiat; we need fiat → USD
    const fiatToUsd = 1 / usdToFiat;
    const entry: CacheEntry = { rate: fiatToUsd, fetchedAt: new Date().toISOString() };
    cache.set(currency, entry);
    return { rate: fiatToUsd, source: "frankfurter" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const rateLimit = consumeUserRate(user.id, "fiat-rate", 20, 60000);
    if (!rateLimit.allowed) {
      // Return 429
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const currency = (url.searchParams.get("currency") || "").toUpperCase().trim();
    const amountStr = url.searchParams.get("amount") || "0";
    const amountFiat = Number(amountStr);

    if (!currency || !SUPPORTED_CURRENCIES.has(currency)) {
      return badRequest(`Unsupported currency: ${currency}. Supported: ${[...SUPPORTED_CURRENCIES].join(", ")}`);
    }
    if (!Number.isFinite(amountFiat) || amountFiat < 0) {
      return badRequest("amount must be a non-negative number");
    }

    const effectiveAmount = amountFiat || 0;

    const cached = cache.get(currency);
    const isCached = cached != null && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS;

    const { rate, source } = await fetchUsdRate(currency);
    const estimatedUsd = Math.round(effectiveAmount * rate * 100) / 100;

    return json({
      currency,
      amountFiat: effectiveAmount,
      rate: Math.round(rate * 1000000) / 1000000,
      estimatedUsd,
      source,
      fetchedAt: new Date().toISOString(),
      cached: isCached,
    });
  } catch (error) {
    // Don't expose raw errors to frontend
    console.error("Fiat rate API error:", error);
    return new Response(
      JSON.stringify({
        error: "Rate service temporarily unavailable. Please try again later.",
        rate: null,
        source: "none",
        fetchedAt: null,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
