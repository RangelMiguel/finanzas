import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import {
  amountToCents,
  budgetPeriodKey,
  monthBudgetPeriods,
  parseBudgetPeriod,
} from "@/lib/utils";
import { personalPool } from "@/lib/personal";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        name: z.string().min(1),
        amount: z.union([z.number(), z.string()]),
        period: z.string().optional(),
        /** this_period | both_periods — copy amount to both halves of the month */
        scope: z.enum(["this_period", "both_periods"]).default("this_period"),
        notes: z.string().nullable().optional(),
      })
      .parse(await req.json());
    const period = body.period || budgetPeriodKey();
    const amountCents = amountToCents(body.amount);
    const { monthKey: mk } = parseBudgetPeriod(period);
    const targets =
      body.scope === "both_periods"
        ? [...monthBudgetPeriods(mk)]
        : [period];

    const created = [];
    for (const p of targets) {
      const pool = await personalPool({
        householdId: m.householdId,
        userId: session.userId,
        period: p,
      });
      const existingBudgets = await prisma.personalBudget.findMany({
        where: {
          householdId: m.householdId,
          userId: session.userId,
          period: p,
        },
      });
      const allocated = existingBudgets.reduce((s, b) => s + b.amountCents, 0);
      if (allocated + amountCents > pool.totalPoolCents + 1) {
        throw new Error(
          `Exceeds personal pool for ${p}. Available for budgets: ${((pool.totalPoolCents - allocated) / 100).toFixed(2)}`
        );
      }

      const row = await prisma.personalBudget.create({
        data: {
          householdId: m.householdId,
          userId: session.userId,
          name: body.name,
          amountCents,
          period: p,
          notes: body.notes ?? null,
        },
      });
      created.push(row);
    }
    return jsonOk({ budget: created[0], budgets: created }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        id: z.string(),
        name: z.string().optional(),
        amount: z.union([z.number(), z.string()]).optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.personalBudget.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Not found");
    if (existing.userId !== session.userId && m.role !== "owner" && m.role !== "admin") {
      throw new Error("Forbidden");
    }
    const row = await prisma.personalBudget.update({
      where: { id: body.id },
      data: {
        name: body.name,
        amountCents:
          body.amount !== undefined ? amountToCents(body.amount) : undefined,
        notes: body.notes,
      },
    });
    return jsonOk({ budget: row });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id required");
    const existing = await prisma.personalBudget.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Not found");
    if (existing.userId !== session.userId && m.role !== "owner" && m.role !== "admin") {
      throw new Error("Forbidden");
    }
    await prisma.personalExpense.updateMany({
      where: { personalBudgetId: id },
      data: { personalBudgetId: null },
    });
    await prisma.personalBudget.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
