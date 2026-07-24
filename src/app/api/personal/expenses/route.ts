import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { amountToCents, budgetPeriodKey, todayISO } from "@/lib/utils";

function periodFromDate(date: string): string {
  const [y, m, d] = date.split("-").map((x) => parseInt(x, 10));
  return budgetPeriodKey(new Date(y, m - 1, d));
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        description: z.string().min(1),
        amount: z.union([z.number(), z.string()]),
        date: z.string().optional(),
        personalBudgetId: z.string().nullable().optional(),
      })
      .parse(await req.json());
    const date = body.date || todayISO();
    const period = periodFromDate(date);
    const amountCents = amountToCents(body.amount);

    if (body.personalBudgetId) {
      const budget = await prisma.personalBudget.findFirst({
        where: {
          id: body.personalBudgetId,
          householdId: m.householdId,
          userId: session.userId,
        },
        include: { expenses: true },
      });
      if (!budget) throw new Error("Personal budget not found");
      if (budget.period !== period) {
        throw new Error(
          `Expense date falls in period ${period}, but budget is for ${budget.period}`
        );
      }
      const spent = budget.expenses.reduce((s, e) => s + e.amountCents, 0);
      if (spent + amountCents > budget.amountCents) {
        throw new Error(
          `Exceeds personal budget "${budget.name}". Remaining ${((budget.amountCents - spent) / 100).toFixed(2)}`
        );
      }
    }

    const row = await prisma.personalExpense.create({
      data: {
        householdId: m.householdId,
        userId: session.userId,
        description: body.description,
        amountCents,
        date,
        period,
        personalBudgetId: body.personalBudgetId || null,
      },
    });
    return jsonOk({ expense: row }, 201);
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
        description: z.string().optional(),
        amount: z.union([z.number(), z.string()]).optional(),
        date: z.string().optional(),
        personalBudgetId: z.string().nullable().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.personalExpense.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Not found");
    if (existing.userId !== session.userId && m.role !== "owner" && m.role !== "admin") {
      throw new Error("Forbidden");
    }
    const date = body.date || existing.date;
    const row = await prisma.personalExpense.update({
      where: { id: body.id },
      data: {
        description: body.description,
        amountCents:
          body.amount !== undefined ? amountToCents(body.amount) : undefined,
        date,
        period: periodFromDate(date),
        personalBudgetId: body.personalBudgetId,
      },
    });
    return jsonOk({ expense: row });
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
    const existing = await prisma.personalExpense.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Not found");
    if (existing.userId !== session.userId && m.role !== "owner" && m.role !== "admin") {
      throw new Error("Forbidden");
    }
    await prisma.personalExpense.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
