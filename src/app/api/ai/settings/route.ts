import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/access";
import { loadPublicAiSettings, saveAiSettings } from "@/lib/ai/settings";

export async function GET() {
  try {
    const session = await requireSession();
    return jsonOk({ ai: await loadPublicAiSettings(session.userId) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const body = z
      .object({
        provider: z.enum(["xai", "openai", "gemini", "custom"]).optional(),
        baseUrl: z.string().max(300).optional(),
        model: z.string().max(120).optional(),
        apiKey: z.string().max(400).optional(),
        clearKey: z.boolean().optional(),
        consent: z.boolean().optional(),
        shareWithFamily: z.boolean().optional(),
      })
      .parse(await req.json());
    const ai = await saveAiSettings(session.userId, body);
    return jsonOk({ ai });
  } catch (e) {
    return jsonError(e);
  }
}
