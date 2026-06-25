import { badRequest, handleError, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { createPublicUid, getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

type CreateAdminPayload = {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  currentPassword?: string;
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

function verifyCurrentAdminPassword(adminId: number, currentPassword: string) {
  const row = getDb()
    .prepare("SELECT password_hash FROM users WHERE id = ? AND role = 'admin'")
    .get(adminId) as { password_hash: string } | undefined;
  return Boolean(row && verifyPassword(currentPassword, row.password_hash));
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await readJson<CreateAdminPayload>(request);
    const username = cleanUsername(body.username);
    const email = cleanEmail(body.email);
    const password = String(body.password || "").trim();
    const confirmPassword = String(body.confirmPassword || "").trim();
    const currentPassword = String(body.currentPassword || "").trim();

    const usernameError = validateUsername(username);
    if (usernameError) return badRequest(usernameError);
    const emailError = validateEmail(email);
    if (emailError) return badRequest(emailError);
    if (password.length < 8) return badRequest("管理员密码至少 8 位");
    if (password !== confirmPassword) return badRequest("两次输入的管理员密码不一致");
    if (!currentPassword) return badRequest("请输入当前管理员密码确认操作");
    if (!verifyCurrentAdminPassword(admin.id, currentPassword)) return badRequest("当前管理员密码错误");

    const duplicate = getDb()
      .prepare("SELECT id FROM users WHERE lower(username) = ? OR (? <> '' AND lower(email) = ?) LIMIT 1")
      .get(username, email, email) as { id: number } | undefined;
    if (duplicate) return badRequest("管理员账号或邮箱已存在");

    const result = getDb()
      .prepare(
        `INSERT INTO users (public_uid, username, email, password_hash, withdrawal_password_hash, role, balance, remark)
         VALUES (?, ?, ?, ?, NULL, 'admin', 0, ?)`
      )
      .run(createPublicUid(), username, email || null, hashPassword(password), `Created by admin#${admin.id}`);

    return json({ ok: true, adminId: Number(result.lastInsertRowid) });
  } catch (error) {
    return handleError(error);
  }
}
