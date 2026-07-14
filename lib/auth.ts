import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type User } from "./db";

const sessionCookiePrefix = (process.env.PERP_SIM_SESSION_COOKIE_PREFIX || "__Host-perp_lab").trim() || "__Host-perp_lab";
export const LEGACY_SESSION_COOKIE = "__Host-perp_lab_session";
export const USER_SESSION_COOKIE = sessionCookiePrefix + "_user_session";
export const ADMIN_SESSION_COOKIE = sessionCookiePrefix + "_admin_session";
type SessionScope = "user" | "admin";
type SessionUser = User & { login_enabled: number };

const cookieForScope = (scope: SessionScope) => scope === "admin" ? ADMIN_SESSION_COOKIE : USER_SESSION_COOKIE;
const secureSessionCookies = process.env.NODE_ENV === "production";

function readSessionUser(token: string) {
  return getDb()
    .prepare(
      `SELECT users.id, users.public_uid, users.username, users.email, users.role, users.balance, users.wallet,
              users.kyc_status, users.kyc_verified_at, users.kyc_rejected_reason, users.kyc_latest_submission_id,
              users.created_at, COALESCE(users.login_enabled, 1) AS login_enabled
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ? AND sessions.expires_at > CURRENT_TIMESTAMP`
    )
    .get(token) as SessionUser | undefined;
}

export function invalidateUserSessions(userId: number, exceptToken?: string | null) {
  if (exceptToken) {
    getDb().prepare("DELETE FROM sessions WHERE user_id = ? AND token <> ?").run(userId, exceptToken);
    return;
  }
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export async function invalidateOtherUserSessions(userId: number, scope: SessionScope = "user") {
  const store = await cookies();
  const token = store.get(cookieForScope(scope))?.value || store.get(LEGACY_SESSION_COOKIE)?.value || null;
  invalidateUserSessions(userId, token);
}

export async function createSession(userId: number, scope: SessionScope = "user") {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  getDb()
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .run(token, userId, expires.toISOString());
  const store = await cookies();
  const previousToken = store.get(cookieForScope(scope))?.value;
  if (previousToken) getDb().prepare("DELETE FROM sessions WHERE token = ?").run(previousToken);
  store.set(cookieForScope(scope), token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: secureSessionCookies,
    expires
  });
  store.delete(LEGACY_SESSION_COOKIE);
}

export async function clearSession(scope: SessionScope | "all" = "all") {
  const store = await cookies();
  const names = scope === "all" ? [USER_SESSION_COOKIE, ADMIN_SESSION_COOKIE, LEGACY_SESSION_COOKIE] : [cookieForScope(scope), LEGACY_SESSION_COOKIE];
  for (const name of names) {
    const token = store.get(name)?.value;
    if (token) getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
    store.delete(name);
  }
}

export async function getCurrentUser(scope: SessionScope = "user"): Promise<User | null> {
  const store = await cookies();
  const token = store.get(cookieForScope(scope))?.value || store.get(LEGACY_SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = readSessionUser(token);
  if (row?.login_enabled === 0) {
    invalidateUserSessions(row.id);
    for (const name of [USER_SESSION_COOKIE, ADMIN_SESSION_COOKIE, LEGACY_SESSION_COOKIE]) {
      if (store.get(name)?.value === token) store.delete(name);
    }
    return null;
  }
  if (scope === "admin" && row?.role !== "admin") return null;
  if (scope === "user" && row?.role === "admin" && !store.get(USER_SESSION_COOKIE)?.value) return null;
  return row ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser("admin");
  if (!user) throw new Response("Unauthorized", { status: 401 });
  if (user.role !== "admin") throw new Response("Forbidden", { status: 403 });
  return user;
}
