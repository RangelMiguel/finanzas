import { requireSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/access";
import { loadPrivateAiSettings } from "@/lib/ai/settings";

export async function GET() {
  try {
    const session = await requireSession();
    const settings = await loadPrivateAiSettings(session.userId);
    if (!settings) {
      return jsonOk({
        enabled: false,
        provider: null,
        model: null,
        reason: "Configura un proveedor de IA y una llave en Ajustes",
      });
    }
    return jsonOk({
      enabled: true,
      provider: settings.provider,
      model: settings.model,
      reason: null,
    });
  } catch (e) {
    return jsonError(e);
  }
}
