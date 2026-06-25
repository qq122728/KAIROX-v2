import { badRequest, handleError, json, readJson } from "@/lib/api";
import { invalidateOtherUserSessions, requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

type AdminAccountPayload = {
  username?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

function cleanUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function cleanEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validateUsername(username: string) {
  if (username.length < 3 || username.length > 32) return "管理员账号需为 3-32 个字符";
  if (!/^[a-z0-9._-]+$/.test(username)) return "管理员账号只能包含小写字母、数字、点、下划线和短横线";
  return "";
}

function validateEmail(email: string) {
  if (!email) return "";
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "邮箱格式无效";
  return "";
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<AdminAccountPayload>(request);
    const username = cleanUsername(body.username);
    const email = cleanEmail(body.email);
    const currentPassword = String(body.currentPassword || "").trim();
    const newPassword = String(body.newPassword || "").trim();
    const confirmPassword = String(body.confirmPassword || "").trim();

    const usernameError = validateUsername(username);
    if (usernameError) return badRequest(usernameError);
    const emailError = validateEmail(email);
    if (emailError) return badRequest(emailError);
    if (!currentPassword) return badRequest("请输入当前管理员密码确认操作");

    const current = getDb()
      .prepare("SELECT id, username, email, password_hash FROM users WHERE id = ? AND role = 'admin'")
      .get(admin.id) as { id: number; username: string; email: string | null; password_hash: string } | undefined;
    if (!current || !verifyPassword(currentPassword, current.password_hash)) return badRequest("当前管理员密码错误");

    if (newPassword) {
      if (newPassword.length < 8) return badRequest("新管理员密码至少 8 位");
      if (newPassword !== confirmPassword) return badRequest("两次输入的新密码不一致");
    }

    const duplicate = getDb()
      .prepare("SELECT id FROM users WHERE id <> ? AND (lower(username) = ? OR (? <> '' AND lower(email) = ?)) LIMIT 1")
      .get(admin.id, username, email, email) as { id: number } | undefined;
    if (duplicate) return badRequest("管理员账号或邮箱已存在");

    const nextHash = newPassword ? hashPassword(newPassword) : current.password_hash;
    getDb()
      .prepare("UPDATE users SET username = ?, email = ?, password_hash = ? WHERE id = ? AND role = 'admin'")
      .run(username, email || null, nextHash, admin.id);

    if (newPassword) await invalidateOtherUserSessions(admin.id, "admin");
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
