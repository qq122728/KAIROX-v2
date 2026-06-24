import crypto from "node:crypto";
import { getDb } from "./db";

type LoginScope = "user" | "admin";
type AttemptKey = { key: string; scope: LoginScope; dimension: "ip" | "login" };

const userMaxFailures = Number(process.env.PERP_SIM_LOGIN_MAX_FAILURES || 5);
const adminMaxFailures = Number(process.env.PERP_SIM_ADMIN_LOGIN_MAX_FAILURES || 4);
const userLockMs = Number(process.env.PERP_SIM_LOGIN_LOCK_MS || 10 * 60 * 1000);
const adminLockMs = Number(process.env.PERP_SIM_ADMIN_LOGIN_LOCK_MS || 15 * 60 * 1000);

function maxFailures(scope: LoginScope) {
  return scope === "admin" ? adminMaxFailures : userMaxFailures;
}

function lockMs(scope: LoginScope) {
  return scope === "admin" ? adminLockMs : userLockMs;
}

function hashKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || "local";
}

function normalizedLogin(identifier: string) {
  return identifier.trim().toLowerCase() || "empty-login";
}

function attemptKeys(scope: LoginScope, request: Request, identifier: string): AttemptKey[] {
  const ip = clientIp(request);
  const login = normalizedLogin(identifier);
  return [
    { key: hashKey(`${scope}:ip:${ip}`), scope, dimension: "ip" },
    { key: hashKey(`${scope}:login:${login}`), scope, dimension: "login" }
  ];
}

function isLocked(value: string | null | undefined) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > Date.now();
}

export function assertLoginAllowed(scope: LoginScope, request: Request, identifier: string) {
  getDb().prepare("DELETE FROM login_attempts WHERE locked_until IS NOT NULL AND datetime(locked_until) <= CURRENT_TIMESTAMP").run();
  const rows = attemptKeys(scope, request, identifier).map(({ key }) =>
    getDb().prepare("SELECT locked_until FROM login_attempts WHERE key = ?").get(key) as { locked_until: string | null } | undefined
  );
  if (rows.some((row) => isLocked(row?.locked_until))) {
    throw new Response("Too many login attempts. Try again later.", { status: 429, statusText: "Too Many Requests" });
  }
}

export function recordLoginFailure(scope: LoginScope, request: Request, identifier: string) {
  const limit = maxFailures(scope);
  const lockedUntil = new Date(Date.now() + lockMs(scope)).toISOString();
  const stmt = getDb().prepare(
    `INSERT INTO login_attempts (key, scope, dimension, failures, locked_until, updated_at)
     VALUES (?, ?, ?, 1, CASE WHEN ? <= 1 THEN ? ELSE NULL END, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       failures = login_attempts.failures + 1,
       locked_until = CASE WHEN login_attempts.failures + 1 >= ? THEN ? ELSE login_attempts.locked_until END,
       updated_at = CURRENT_TIMESTAMP`
  );
  for (const item of attemptKeys(scope, request, identifier)) {
    stmt.run(item.key, item.scope, item.dimension, limit, lockedUntil, limit, lockedUntil);
  }
}

export function clearLoginFailures(scope: LoginScope, request: Request, identifier: string) {
  const stmt = getDb().prepare("DELETE FROM login_attempts WHERE key = ?");
  for (const item of attemptKeys(scope, request, identifier)) stmt.run(item.key);
}
