import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { amountToCents, todayISO } from "@/lib/utils";
import { logActivity } from "@/lib/household";
import { resolveCategoryId } from "@/lib/categorize";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        accountId: z.string().optional().nullable(),
        creditCardId: z.string().optional().nullable(),
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

      const txn = await prisma.transaction.create({
        data: {
          householdId: m.householdId,
          date,
          amountCents: amountToCents(item.amount),
          description: desc,
          type: "expense",
          categoryId,
          accountId: body.accountId || null,
          creditCardId: body.creditCardId || null,
          createdById: session.userId,
          spentById: session.userId,
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
