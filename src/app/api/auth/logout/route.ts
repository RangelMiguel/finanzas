import { clearSessionCookie, clearImpersonationCookie } from "@/lib/auth";
import { jsonOk } from "@/lib/access";

export async function POST() {
  await clearImpersonationCookie();
  await clearSessionCookie();
  return jsonOk({ ok: true });
}
