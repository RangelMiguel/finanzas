import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { amountToCents, todayISO } from "@/lib/utils";
import { logActivity } from "@/lib/household";
import { resolveCategoryId } from "@/lib/categorize";
import {
  legacyFieldsFromFundings,
  normalizeExpenseFundings,
  parseSourceKey,
} from "@/lib/transaction-funding";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        accountId: z.string().optional().nullable(),
        creditCardId: z.string().optional().nullable(),
        /** Unified payment source: "account:<id>" | "card:<id>" */
        paymentSource: z.string().optional().nullable(),
        date: z.string().optional(),
        merchant: z.string().optional().nullable(),
        items: z
          .array(
            z.object({
              description: z.string().min(1),
              amount: z.union([z.number(), z.string()]),
              categoryId: z.string().optional().nullable(),
              selected: z.boolean().optional(),
            })
          )
          .min(1),
      })
      .parse(await req.json());

    let accountId = body.accountId || null;
    let creditCardId = body.creditCardId || null;
    if (body.paymentSource) {
      const parsed = parseSourceKey(body.paymentSource);
      if (parsed?.kind === "account") {
        accountId = parsed.id;
        creditCardId = null;
      } else if (parsed?.kind === "card") {
        creditCardId = parsed.id;
        accountId = null;
      }
    }
    // Prefer card when both legacy fields set
    if (creditCardId) accountId = null;

    const categories = await prisma.category.findMany({
      where: { householdId: m.householdId },
    });
    const date = body.date || todayISO();
    const selected = body.items.filter((i) => i.selected !== false);
    if (!selected.length) throw new Error("No items selected");

    const created = [];
    for (const item of selected) {
      let categoryId = item.categoryId || null;
      if (!categoryId) {
        categoryId = resolveCategoryId(item.description, categories, "expense");
      }
      const desc =
        body.merchant && !item.description.includes(body.merchant)
          ? `${item.description}`
          : item.description;

      const amountCents = amountToCents(item.amount);
      const fundings =
        accountId || creditCardId
          ? normalizeExpenseFundings(
              [
                {
                  amountCents,
                  accountId,
                  creditCardId,
                },
              ],
              amountCents
            )
          : [];
      const legacy = legacyFieldsFromFundings(fundings);

      const txn = await prisma.transaction.create({
        data: {
          householdId: m.householdId,
          date,
          amountCents,
          description: desc,
          type: "expense",
          categoryId,
          accountId: legacy.accountId,
          creditCardId: legacy.creditCardId,
          createdById: session.userId,
          spentById: session.userId,
          fundings:
            fundings.length > 0
              ? {
                  create: fundings.map((f) => ({
                    amountCents: f.amountCents,
                    accountId: f.accountId || null,
                    creditCardId: f.creditCardId || null,
                  })),
                }
              : undefined,
        },
      });
      created.push(txn);
    }

    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "import",
      entityType: "ticket",
      summary: `Imported ticket: ${created.length} items${
        body.merchant ? ` (${body.merchant})` : ""
      }`,
    });

    return jsonOk({ created: created.length, transactions: created }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
