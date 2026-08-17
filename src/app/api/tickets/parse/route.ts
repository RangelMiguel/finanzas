import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { parseTicketText } from "@/lib/ticket-parse";
import { resolveCategoryId } from "@/lib/categorize";
import { extractReceiptWithLlm } from "@/lib/llm/extract-receipt";
import { loadPrivateAiSettings } from "@/lib/ai/settings";
import { loadFinancePrivacy } from "@/lib/ai/privacyBook";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const body = z
      .object({
        text: z.string().min(1),
        forceRules: z.boolean().optional(),
      })
      .parse(await req.json());

    const categories = await prisma.category.findMany({
      where: { householdId: m.householdId },
    });

    let engine: "llm" | "rules" = "rules";
    let provider: string | null = null;
    let model: string | null = null;
    let parsed = parseTicketText(body.text);
    let llmError: string | null = null;

    const settings = await loadPrivateAiSettings(session.userId);
    if (settings && !body.forceRules) {
      try {
        const privacy = await loadFinancePrivacy(m.householdId, session.userId);
        const llm = await extractReceiptWithLlm(body.text, settings, privacy.book);
        // Prefer LLM if it found items; otherwise keep rules
        if (llm.items.length > 0) {
          parsed = llm;
          engine = "llm";
          provider = llm.provider;
          model = llm.model;
        } else {
          engine = "rules";
          llmError = "LLM returned no items; used rules engine";
        }
      } catch (e) {
        llmError = e instanceof Error ? e.message : "LLM failed";
        // keep rules result
        engine = "rules";
      }
    }

    const items = parsed.items.map((it) => {
      const categoryId = resolveCategoryId(
        it.description,
        categories,
        "expense"
      );
      const cat = categories.find((c) => c.id === categoryId);
      return {
        ...it,
        categoryId,
        categoryName: cat?.name ?? it.suggestedCategoryName,
        categoryIcon: cat?.icon ?? "📦",
        selected: true,
      };
    });

    return jsonOk({
      ...parsed,
      items,
      categories: categories.filter((c) => c.type === "expense"),
      engine,
      provider,
      model,
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
