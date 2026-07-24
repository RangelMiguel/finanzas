import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";

/** Copy budgets from one half-month period to another */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        fromPeriod: z.string().optional(),
        toPeriod: z.string().optional(),
        // legacy aliases
        fromMonth: z.string().optional(),
        toMonth: z.string().optional(),
      })
      .parse(await req.json());

    const fromPeriod =
      body.fromPeriod ||
      (body.fromMonth
        ? body.fromMonth.includes("-1") || body.fromMonth.includes("-2")
          ? body.fromMonth
          : `${body.fromMonth}-1`
        : "");
    const toPeriod =
      body.toPeriod ||
      (body.toMonth
        ? body.toMonth.includes("-1") || body.toMonth.includes("-2")
          ? body.toMonth
          : `${body.toMonth}-1`
        : "");
    if (!fromPeriod || !toPeriod) throw new Error("fromPeriod and toPeriod required");

    const source = await prisma.budget.findMany({
      where: { householdId: m.householdId, period: fromPeriod },
    });
    let created = 0;
    for (const b of source) {
      await prisma.budget.upsert({
        where: {
          householdId_categoryId_period: {
            householdId: m.householdId,
            categoryId: b.categoryId,
            period: toPeriod,
          },
        },
        create: {
          householdId: m.householdId,
          categoryId: b.categoryId,
          amountCents: b.amountCents,
          period: toPeriod,
        },
        update: { amountCents: b.amountCents },
      });
      created++;
    }
    return jsonOk({ copied: created });
  } catch (e) {
    return jsonError(e);
  }
}
