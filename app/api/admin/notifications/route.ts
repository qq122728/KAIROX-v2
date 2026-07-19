import { handleError, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { listAdminNotifications } from "@/lib/notification-manager";

export async function GET() {
  try {
    await requireAdmin();
    const notifications = listAdminNotifications(50);
    return json({ ok: true, notifications });
  } catch (error) {
    return handleError(error);
  }
}
