import { badRequest, handleError, json, readJson } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from "@/lib/login-rate-limit";
import { verifyPassword } from "@/lib/password";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ email?: string; username?: string; password: string }>(request);
    const login = (body.email || body.username || "").trim().toLowerCase();
    assertLoginAllowed("admin", request, login);
    const row = getDb()
      .prepare("SELECT id, role, password_hash FROM users WHERE lower(email) = ? OR lower(username) = ?")
      .get(login, login) as { id: number; role: string; password_hash: string } | undefined;
    if (!row || !verifyPassword(body.password ?? "", row.password_hash)) {
      recordLoginFailure("admin", request, login);
      return badRequest("Invalid admin account or password");
    }
    if (row.role !== "admin") {
      recordLoginFailure("admin", request, login);
      return badRequest("This account does not have admin access");
    }
    clearLoginFailures("admin", request, login);
    await createSession(row.id, "admin");
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
