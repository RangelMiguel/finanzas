import { jsonOk } from "@/lib/access";
import { getVapidPublicKey, vapidConfigured } from "@/lib/web-push";

export async function GET() {
  return jsonOk({
    configured: vapidConfigured(),
    publicKey: getVapidPublicKey(),
  });
}
