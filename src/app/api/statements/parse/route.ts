import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/access";
import { parseStatementRules } from "@/lib/statement-parse";
import { extractStatementWithLlm } from "@/lib/llm/extract-statement";
import { getLlmConfig, llmStatusPublic } from "@/lib/llm/config";

export async function POST(req: Request) {
  try {
    await requireSession().then((s) =>
      requireHouseholdAccess(s.userId)
    );
    const body = z
      .object({
        text: z.string().min(1),
        forceRules: z.boolean().optional(),
      })
      .parse(await req.json());

    let result = parseStatementRules(body.text);
    let llmError: string | null = null;
    const cfg = getLlmConfig();

    if (cfg.enabled && !body.forceRules) {
      try {
        const llm = await extractStatementWithLlm(body.text);
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
      llmAvailable: cfg.enabled,
      llmError,
      ai: llmStatusPublic(),
    });
  } catch (e) {
    return jsonError(e);
  }
}
