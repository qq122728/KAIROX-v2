import { handleError, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listUserNotifications, markAllUserNotificationsRead, markUserNotificationRead } from "@/lib/notification-manager";

export async function GET() {
  try {
    const user = await requireUser();
    return json({ ok: true, notifications: listUserNotifications(user.id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ id?: number; all?: boolean }>(request);
    if (body.all) markAllUserNotificationsRead(user.id);
    else if (Number.isInteger(Number(body.id))) markUserNotificationRead(user.id, Number(body.id));
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
