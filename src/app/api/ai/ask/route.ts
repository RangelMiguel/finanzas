import { z } from "zod";
import { requireHouseholdAccess, requireSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/access";
import { prisma } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { completeWithTools } from "@/lib/ai/complete";
import { buildFinanceContext } from "@/lib/ai/context";
import { loadPrivateAiSettings, loadPublicAiSettings } from "@/lib/ai/settings";
import { executeFinanceTool, FINANCE_TOOLS } from "@/lib/ai/tools";
import { loadFinancePrivacy } from "@/lib/ai/privacyBook";

const TOOL_RULES = [
  "You can read and change this household with tools.",
  "When the user asks to add, update, or delete a movement, call the matching tool. Do not pretend you saved it.",
  "Amounts are in household currency units, never cents (185.50 not 18550).",
  "Refer to payment sources as Account N / Card N or their ids. Never ask for or repeat names, emails, phones, card numbers, last-four digits, or account numbers.",
  "After the first turn there is no snapshot — use list_* / search_transactions for current numbers.",
  "Do not invent balances or transactions. Confirm what the tool actually saved.",
  "Do not delete unless the user clearly asked.",
].join("\n");

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

    const userTurns = body.messages.filter((m) => m.role === "user").length;
    const firstTurn = userTurns <= 1;
    const household = await prisma.household.findUnique({
      where: { id: access.householdId },
      select: { name: true, currency: true },
    });
    const currency = household?.currency || "MXN";
    const locale = "es";

    let system: string;
    if (firstTurn) {
      const context = await buildFinanceContext({
        householdId: access.householdId,
        visibility: access.visibility,
        subjectUserId: access.subjectUserId || session.userId,
        currency,
        householdName: household?.name || "Finance",
        locale,
      });
      system = [
        "You are a household finance assistant inside the Finance app.",
        "Answer from the snapshot below plus live tool results.",
        "Be concise. Use the household currency.",
        "Format answers in Markdown: headings, lists, tables, and **bold** when they help.",
        "The user consented to send this snapshot to their own configured AI provider.",
        "Later turns in this chat will not repeat the snapshot.",
        TOOL_RULES,
        "",
        "DATA SNAPSHOT:",
        context,
      ].join("\n");
    } else {
      system = [
        "You are a household finance assistant inside the Finance app.",
        "The household snapshot was sent only in the first message of this chat.",
        "Format answers in Markdown: headings, lists, tables, and **bold** when they help.",
        TOOL_RULES,
      ].join("\n");
    }

    const privacy = await loadFinancePrivacy(
      access.householdId,
      access.subjectUserId || session.userId
    );
    const result = await completeWithTools({
      settings,
      messages: [{ role: "system", content: system }, ...body.messages.slice(-12)],
      tools: FINANCE_TOOLS,
      privacy: privacy.book,
      execute: (call) =>
        executeFinanceTool(
          {
            userId: session.userId,
            householdId: access.householdId,
            visibility: access.visibility,
            subjectUserId: access.subjectUserId || session.userId,
            currency,
            locale,
            privacy,
          },
          call
        ),
    });
    return jsonOk({
      reply: result.text,
      model: result.model,
      provider: result.provider,
      actions: result.actions,
    });
  } catch (e) {
    return jsonError(e);
  }
}
