import { prisma } from "./db";
import { logActivity } from "./household";
import {
  budgetRemainingCents,
  spentByCategoryInRange,
} from "./budget-math";
import { budgetPeriodBounds, todayISO } from "./utils";

export type GoalAllocRow = {
  period: string;
  categoryId: string;
  amountCents: number;
};

/** Mid-period envelope deductions (source=`budget`) keyed by category. */
export function sumGoalAllocations(
  rows: { categoryId?: string | null; amountCents: number }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.categoryId || r.amountCents <= 0) continue;
    out[r.categoryId] = (out[r.categoryId] || 0) + r.amountCents;
  }
  return out;
}

export async function loadGoalAllocations(opts: {
  householdId: string;
  period: string | string[];
}): Promise<GoalAllocRow[]> {
  const periods = Array.isArray(opts.period) ? opts.period : [opts.period];
  if (periods.length === 0) return [];
  const rows = await prisma.goalReserve.findMany({
    where: {
      householdId: opts.householdId,
      period: { in: periods },
      source: "budget",
      categoryId: { not: null },
    },
    select: { period: true, categoryId: true, amountCents: true },
  });
  return rows
    .filter((r): r is GoalAllocRow => Boolean(r.categoryId))
    .map((r) => ({
      period: r.period,
      categoryId: r.categoryId,
      amountCents: r.amountCents,
    }));
}

export function allocationsForPeriod(
  rows: GoalAllocRow[],
  period: string
): Record<string, number> {
  return sumGoalAllocations(rows.filter((r) => r.period === period));
}

export async function allocateBudgetToGoal(opts: {
  householdId: string;
  userId: string;
  goalId: string;
  categoryId: string;
  amountCents: number;
  period: string;
  notes?: string | null;
  date?: string;
}) {
  const amountCents = Math.round(opts.amountCents);
  if (amountCents <= 0) throw new Error("Monto inválido");

  const goal = await prisma.goal.findFirst({
    where: { id: opts.goalId, householdId: opts.householdId },
    include: { reserves: { select: { amountCents: true } } },
  });
  if (!goal) throw new Error("Meta no encontrada");
  if (goal.status === "cancelled") {
    throw new Error("No puedes reservar en una meta cancelada");
  }

  const closed = await prisma.budgetPeriodClose.findUnique({
    where: {
      householdId_period: {
        householdId: opts.householdId,
        period: opts.period,
      },
    },
    select: { id: true },
  });
  if (closed) {
    throw new Error(
      "Esta quincena ya está cerrada. Deshaz el cierre para mover más sobrante a metas."
    );
  }

  const [budget, category, spendRows, existingAlloc] = await Promise.all([
    prisma.budget.findUnique({
      where: {
        householdId_categoryId_period: {
          householdId: opts.householdId,
          categoryId: opts.categoryId,
          period: opts.period,
        },
      },
    }),
    prisma.category.findFirst({
      where: {
        id: opts.categoryId,
        householdId: opts.householdId,
        type: "expense",
      },
      select: { id: true, name: true, icon: true },
    }),
    prisma.transaction.findMany({
      where: {
        householdId: opts.householdId,
        deletedAt: null,
        date: {
          gte: budgetPeriodBounds(opts.period).start,
          lte: budgetPeriodBounds(opts.period).end,
        },
        OR: [
          { type: "expense" },
          { type: "transfer", categoryId: { not: null } },
        ],
      },
      select: {
        categoryId: true,
        amountCents: true,
        type: true,
        date: true,
      },
    }),
    prisma.goalReserve.aggregate({
      where: {
        householdId: opts.householdId,
        period: opts.period,
        categoryId: opts.categoryId,
        source: "budget",
      },
      _sum: { amountCents: true },
    }),
  ]);

  if (!budget || !category) {
    throw new Error("No hay presupuesto para esa categoría en esta quincena");
  }

  const spent =
    spentByCategoryInRange(
      spendRows,
      budgetPeriodBounds(opts.period).start,
      budgetPeriodBounds(opts.period).end
    )[opts.categoryId] || 0;
  const already = existingAlloc._sum.amountCents || 0;
  const remaining = budgetRemainingCents(
    budget.amountCents,
    budget.emergencyCents || 0,
    spent,
    already
  );
  if (amountCents > remaining) {
    throw new Error(
      `Solo quedan ${(remaining / 100).toFixed(2)} en ${category.name}`
    );
  }

  const date = opts.date || todayISO();
  const result = await prisma.$transaction(async (tx) => {
    const reserve = await tx.goalReserve.create({
      data: {
        householdId: opts.householdId,
        goalId: goal.id,
        categoryId: category.id,
        source: "budget",
        amountCents,
        period: opts.period,
        date,
        notes: opts.notes || null,
        createdById: opts.userId,
      },
      include: {
        account: { select: { id: true, name: true, icon: true } },
        category: { select: { id: true, name: true, icon: true } },
      },
    });

    const totalReserved =
      goal.reserves.reduce((s, r) => s + r.amountCents, 0) + amountCents;
    let status = goal.status;
    if (status === "active" && totalReserved >= goal.targetAmountCents) {
      status = "completed";
      await tx.goal.update({
        where: { id: goal.id },
        data: { status: "completed" },
      });
    }

    return { reserve, status };
  });

  await logActivity({
    householdId: opts.householdId,
    userId: opts.userId,
    action: "reserve",
    entityType: "goal",
    entityId: goal.id,
    summary: `Destinó ${(amountCents / 100).toFixed(2)} del presupuesto ${category.name} a meta ${goal.name}`,
  });

  return result;
}

export async function assertBudgetReserveUndoable(opts: {
  householdId: string;
  period: string;
}) {
  const closed = await prisma.budgetPeriodClose.findUnique({
    where: {
      householdId_period: {
        householdId: opts.householdId,
        period: opts.period,
      },
    },
    select: { id: true },
  });
  if (closed) {
    throw new Error(
      "Esta quincena ya está cerrada. Deshaz el cierre para revertir destinos a metas."
    );
  }
}
