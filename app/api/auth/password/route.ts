import { invalidateOtherUserSessions, requireUser } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { emitRealtime, userRoom } from "@/lib/realtime";

type PasswordPayload = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

async function changePassword(request: Request) {
  const user = await requireUser();
  const body = await readJson<PasswordPayload>(request);
  const currentPassword = String(body.currentPassword || "").trim();
  const newPassword = String(body.newPassword || "").trim();
  const confirmPassword = String(body.confirmPassword || "").trim();

  if (!currentPassword) return badRequest("Current password is required");
  if (!newPassword || newPassword.length < 6) return badRequest("Login password must be at least 6 characters");
  if (newPassword !== confirmPassword) return badRequest("Login passwords do not match");

  const row = getDb()
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(user.id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) return badRequest("Invalid current password");

  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), user.id);
  await invalidateOtherUserSessions(user.id);
  emitRealtime("user:update", { room: userRoom(user.id), payload: { type: "security:password_changed" } });
  return json({ ok: true });
}

export async function PATCH(request: Request) {
  try {
    return await changePassword(request);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    return await changePassword(request);
  } catch (error) {
    return handleError(error);
  }
}
