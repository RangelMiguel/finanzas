import { z } from "zod";
import { requireHouseholdAccess, requireSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/access";
import { prisma } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { completeWithUserSettings } from "@/lib/ai/complete";
import { buildFinanceContext } from "@/lib/ai/context";
import { loadPrivateAiSettings, loadPublicAiSettings } from "@/lib/ai/settings";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    await enforceRateLimit({
      key: `ai-ask:${session.userId}`,
      limit: 20,
      windowSec: 60,
    });
    const access = await requireHouseholdAccess(session.userId);
    const pub = await loadPublicAiSettings(session.userId);
    if (!pub.consented) {
      throw new Error("Debes aceptar el aviso de privacidad para usar la IA");
    }
    const settings = await loadPrivateAiSettings(session.userId);
    if (!settings) {
      throw new Error("Configura un proveedor de IA y una llave en Ajustes");
    }

    const body = z
      .object({
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(4000),
            })
          )
          .min(1)
          .max(16),
      })
      .parse(await req.json());

    const household = await prisma.household.findUnique({
      where: { id: access.householdId },
      select: { name: true, currency: true },
    });
    const context = await buildFinanceContext({
      householdId: access.householdId,
      visibility: access.visibility,
      subjectUserId: access.subjectUserId || session.userId,
      currency: household?.currency || "MXN",
      householdName: household?.name || "Finance",
      locale: "es",
    });

    const system = [
      "You are a household finance assistant inside the Finance app.",
      "Answer only from the snapshot of logged data below. If something is missing, say so.",
      "Be concise. Use the household currency. Do not invent balances or transactions.",
      "The user consented to send this snapshot to their own configured AI provider.",
      "",
      "DATA SNAPSHOT:",
      context,
    ].join("\n");

    const result = await completeWithUserSettings(settings, [
      { role: "system", content: system },
      ...body.messages.slice(-12),
    ]);
    return jsonOk({ reply: result.text, model: result.model, provider: result.provider });
  } catch (e) {
    return jsonError(e);
  }
}
