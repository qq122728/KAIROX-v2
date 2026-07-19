import { getDb } from "./db";
import { emitRealtimeRaw, userRoom } from "./realtime";

export type NotificationRecord = {
  id: number; userId?: number | null; audience: "user" | "admin"; type: string;
  title: string; body: string; entityType?: string | null; entityId?: string | null;
  payload?: Record<string, unknown> | null; readAt?: string | null; createdAt: string;
};

function mapRow(row: Record<string, unknown>): NotificationRecord {
  let payload: Record<string, unknown> | null = null;
  if (typeof row.payload_json === "string") { try { payload = JSON.parse(row.payload_json); } catch {} }
  return { id: Number(row.id), userId: row.user_id == null ? null : Number(row.user_id), audience: row.audience as "user" | "admin", type: String(row.type), title: String(row.title), body: String(row.body || ""), entityType: row.entity_type == null ? null : String(row.entity_type), entityId: row.entity_id == null ? null : String(row.entity_id), payload, readAt: row.read_at == null ? null : String(row.read_at), createdAt: String(row.created_at) };
}

export function createNotification(input: { audience: "user" | "admin"; userId?: number | null; type: string; title: string; body?: string; entityType?: string | null; entityId?: string | number | null; payload?: Record<string, unknown> }) {
  const db = getDb();
  const result = db.prepare("INSERT INTO notifications (user_id,audience,type,title,body,entity_type,entity_id,payload_json) VALUES (?,?,?,?,?,?,?,?)").run(input.userId ?? null, input.audience, input.type, input.title, input.body || "", input.entityType ?? null, input.entityId == null ? null : String(input.entityId), input.payload ? JSON.stringify(input.payload) : null);
  const row = db.prepare("SELECT * FROM notifications WHERE id = ?").get(Number(result.lastInsertRowid)) as Record<string, unknown>;
  const notification = mapRow(row);
  emitRealtimeRaw("notification:event", { room: input.audience === "admin" ? "admin" : userRoom(Number(input.userId)), payload: { notification } });
  return notification;
}

const COPY: Record<string, [string, string, string]> = {
  "user:registered": ["New user registered", "A new account is ready for review.", "user"],
  "deposit:created": ["New deposit request", "A deposit request needs attention.", "deposit"],
  "deposit:update": ["Deposit status updated", "A deposit status has changed.", "deposit"],
  "withdrawal:created": ["New withdrawal request", "A withdrawal request needs attention.", "withdrawal"],
  "withdrawal:update": ["Withdrawal status updated", "A withdrawal status has changed.", "withdrawal"],
  "kyc:created": ["New KYC submission", "A new identity verification needs review.", "kyc"],
  "kyc:update": ["KYC status updated", "Your identity verification status has changed.", "kyc"],
  "binary:created": ["New binary order", "A binary order was placed.", "binary_order"],
  "binary:settled": ["Binary order settled", "A binary order has been settled.", "binary_order"],
  "trade:created": ["New perpetual position", "A new perpetual position was opened.", "position"],
  "fiat_deposit:requested": ["New fiat deposit request", "A fiat deposit request needs attention.", "fiat_deposit"],
  "fiat_deposit:submitted": ["Fiat transfer submitted", "Fiat transfer details were submitted.", "fiat_deposit"],
  "support_message:created": ["New support message", "A new support message is waiting.", "support_message"],
  "support_message:reply": ["New support reply", "Support sent you a new message.", "support_message"],
  "security:password_changed": ["Password changed", "Your login password was changed.", "security"],
  "security:withdrawal_password_changed": ["Withdrawal password changed", "Your withdrawal password was changed.", "security"],
};

export function persistBusinessNotification(event: string, options: { room?: string; payload?: Record<string, unknown> } = {}) {
  const payload = options.payload || {};
  const type = event === "admin:update" ? String(payload.type || "") : event === "support:message" ? (typeof payload.message === "object" && payload.message && (payload.message as { role?: string }).role === "agent" ? "support_message:reply" : "support_message:created") : event;
  const copy = COPY[type];
  if (!copy) return;
  const room = options.room || "";
  const audience = room === "admin" ? "admin" : "user";
  const userId = room.startsWith("user:") ? Number(room.slice(5)) : (typeof payload.userId === "number" ? payload.userId : null);
  if (audience === "user" && (!userId || !Number.isInteger(userId))) return;
  const entityId = (event === "support:message" && typeof payload.message === "object" && payload.message ? (payload.message as { id?: number }).id ?? null : payload.depositId ?? payload.withdrawalId ?? payload.submissionId ?? payload.orderId ?? payload.positionId ?? payload.userId ?? null) as string | number | null;
  const body = type.endsWith(":update") && payload.status ? `${copy[1]} Status: ${payload.status}.` : copy[1];
  createNotification({ audience, userId: audience === "user" ? userId : null, type, title: copy[0], body, entityType: copy[2], entityId, payload });
}

export function listUserNotifications(userId: number, limit = 50) { return (getDb().prepare("SELECT * FROM notifications WHERE audience='user' AND user_id=? ORDER BY id DESC LIMIT ?").all(userId, Math.min(Math.max(limit, 1), 100)) as Record<string, unknown>[]).map(mapRow); }
export function listAdminNotifications(limit = 50) { return (getDb().prepare("SELECT * FROM notifications WHERE audience='admin' ORDER BY id DESC LIMIT ?").all(Math.min(Math.max(limit, 1), 100)) as Record<string, unknown>[]).map(mapRow); }
export function markUserNotificationRead(userId: number, id: number) { getDb().prepare("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id=? AND audience='user' AND user_id=?").run(id, userId); }
export function markAllUserNotificationsRead(userId: number) { getDb().prepare("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE audience='user' AND user_id=? AND read_at IS NULL").run(userId); }
