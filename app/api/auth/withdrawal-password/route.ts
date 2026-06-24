import { invalidateOtherUserSessions, requireUser } from "@/lib/auth";
import { badRequest, handleError, json, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

type WithdrawalPasswordPayload = {
  currentPassword?: string;
  currentWithdrawalPassword?: string;
  newPassword?: string;
  newWithdrawalPassword?: string;
  confirmPassword?: string;
  confirmWithdrawalPassword?: string;
};

async function changeWithdrawalPassword(request: Request) {
  const user = await requireUser();
  const body = await readJson<WithdrawalPasswordPayload>(request);
  const currentPassword = String(body.currentWithdrawalPassword || body.currentPassword || "").trim();
  const newPassword = String(body.newWithdrawalPassword || body.newPassword || "").trim();
  const confirmPassword = String(body.confirmWithdrawalPassword || body.confirmPassword || "").trim();

  if (!newPassword || newPassword.length < 6) return badRequest("Withdrawal password must be at least 6 characters");
  if (newPassword !== confirmPassword) return badRequest("Withdrawal passwords do not match");

  const row = getDb()
    .prepare("SELECT withdrawal_password_hash FROM users WHERE id = ?")
    .get(user.id) as { withdrawal_password_hash: string | null } | undefined;
  if (!row) return badRequest("User does not exist");
  if (row.withdrawal_password_hash) {
    if (!currentPassword) return badRequest("Current withdrawal password is required");
    if (!verifyPassword(currentPassword, row.withdrawal_password_hash)) return badRequest("Invalid current withdrawal password");
  }

  getDb().prepare("UPDATE users SET withdrawal_password_hash = ? WHERE id = ?").run(hashPassword(newPassword), user.id);
  await invalidateOtherUserSessions(user.id);
  return json({ ok: true });
}

export async function PATCH(request: Request) {
  try {
    return await changeWithdrawalPassword(request);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    return await changeWithdrawalPassword(request);
  } catch (error) {
    return handleError(error);
  }
}
