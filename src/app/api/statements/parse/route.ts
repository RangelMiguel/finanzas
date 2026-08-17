import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/access";
import { parseStatementRules } from "@/lib/statement-parse";
import { extractStatementWithLlm } from "@/lib/llm/extract-statement";
import { loadPrivateAiSettings } from "@/lib/ai/settings";
import { loadFinancePrivacy } from "@/lib/ai/privacyBook";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const access = await requireHouseholdAccess(session.userId);
    const body = z
      .object({
        text: z.string().min(1),
        forceRules: z.boolean().optional(),
      })
      .parse(await req.json());

    let result = parseStatementRules(body.text);
    let llmError: string | null = null;
    const settings = await loadPrivateAiSettings(session.userId);

    if (settings && !body.forceRules) {
      try {
        const privacy = await loadFinancePrivacy(access.householdId, session.userId);
        const llm = await extractStatementWithLlm(body.text, settings, privacy.book);
        if (llm.items.length > 0) {
          result = llm;
        } else {
          llmError = "LLM returned no MSI items; used rules engine";
        }
      } catch (e) {
        llmError = e instanceof Error ? e.message : "LLM failed";
      }
    }

    return jsonOk({
      ...result,
      // normalize for UI (string amounts as before)
      items: result.items.map((i) => ({
        description: i.description,
        totalAmount: String(i.totalAmount),
        months: String(i.months),
        monthlyAmount: String(i.monthlyAmount),
        selected: i.selected !== false,
      })),
      llmAvailable: Boolean(settings),
      llmError,
      ai: settings
        ? { enabled: true as const, provider: settings.provider, model: settings.model }
        : { enabled: false as const, provider: null, model: null },
    });
  } catch (e) {
    return jsonError(e);
  }
}
