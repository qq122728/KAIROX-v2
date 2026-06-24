import crypto from "node:crypto";

/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Single-process only (next dev / next start). For multi-instance deployments
 * this would need to move to Redis or the database; the existing login_attempts
 * pattern is per-process too, so this is consistent.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

function gc(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function hashKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || "local";
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

export function consumeRate(rawKey: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  gc(now);
  const key = hashKey(rawKey);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: Math.max(1, bucket.resetAt - now) };
  }
  bucket.count += 1;
  return { allowed: true };
}

export function consumeIpRate(request: Request, scope: string, limit: number, windowMs: number) {
  return consumeRate(`${scope}:ip:${clientIp(request)}`, limit, windowMs);
}

export function consumeUserRate(userId: number, scope: string, limit: number, windowMs: number) {
  return consumeRate(`${scope}:user:${userId}`, limit, windowMs);
}
