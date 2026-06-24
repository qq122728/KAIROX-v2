import { createSession } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from "@/lib/login-rate-limit";
import { verifyPassword } from "@/lib/password";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ email: string; username?: string; password: string }>(request);
    const login = (body.email || body.username || "").trim().toLowerCase();
    assertLoginAllowed("user", request, login);
    const row = getDb()
      .prepare("SELECT id, password_hash, COALESCE(login_enabled, 1) AS login_enabled FROM users WHERE lower(email) = ? OR lower(username) = ?")
      .get(login, login) as { id: number; password_hash: string; login_enabled: number } | undefined;
    const password = String(body.password || "").trim();
    if (!row || !verifyPassword(password, row.password_hash)) {
      recordLoginFailure("user", request, login);
      return badRequest("Invalid email or password");
    }
    if (row.login_enabled === 0) return badRequest("Account login is disabled");
    clearLoginFailures("user", request, login);
    await createSession(row.id, "user");
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
