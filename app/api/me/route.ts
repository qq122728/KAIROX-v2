import { getCurrentUser } from "@/lib/auth";
import { handleError, json } from "@/lib/api";

export async function GET() {
  try {
    return json({ user: await getCurrentUser() });
  } catch (error) {
    return handleError(error);
  }
}
