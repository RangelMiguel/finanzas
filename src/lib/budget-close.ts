import { prisma } from "./db";
import { logActivity } from "./household";
import {
  budgetPeriodBounds,
  budgetPeriodKey,
  isBudgetPeriodCloseable,
  nextBudgetPeriod,
  prevBudgetPeriod,
  todayISO,
} from "./utils";
import { ensurePeriodBudgets } from "./budget-defaults";
import {
  budgetRemainingCents,
  parseCarryovers,
  spentByCategoryInRange,
  type CarryoverJson,
} from "./budget-math";

export type CloseLine = {
  categoryId: string;
  categoryName: string;
  icon: string;
  amountCents: number;
  emergencyCents: number;
  spentCents: number;
  remainingCents: number;
};

export type CloseStatus = {
  period: string;
  toPeriod: string;
  bounds: { start: string; end: string };
  closed: boolean;
  closedAt: string | null;
  canClose: boolean;
  canUndo: boolean;
  tooEarly: boolean;
  carryovers: CloseLine[];
  totalRemainingCents: number;
};

const spendSelect = {
  categoryId: true,
  amountCents: true,
  type: true,
  date: true,
} as const;

async function loadPeriodSpend(
  householdId: string,
  start: string,
  end: string
) {
  return prisma.transaction.findMany({
    where: {
      householdId,
      deletedAt: null,
      date: { gte: start, lte: end },
      OR: [
        { type: "expense" },
        { type: "transfer", categoryId: { not: null } },
      ],
    },
    select: spendSelect,
  });
}

export async function getCloseStatus(
  householdId: string,
  period: string,
  today = todayISO()
): Promise<CloseStatus> {
  const { start, end } = budgetPeriodBounds(period);
  const toPeriod = nextBudgetPeriod(period);
  const existing = await prisma.budgetPeriodClose.findUnique({
    where: { householdId_period: { householdId, period } },
  });

  const budgets = await prisma.budget.findMany({
    where: { householdId, period },
    include: { category: { select: { name: true, icon: true } } },
  });
  const spendRows = await loadPeriodSpend(householdId, start, end);
  const spentByCat = spentByCategoryInRange(spendRows, start, end);

  const carryovers: CloseLine[] = budgets
    .map((b) => {
      const spentCents = spentByCat[b.categoryId] || 0;
      return {
        categoryId: b.categoryId,
        categoryName: b.category.name,
        icon: b.category.icon,
        amountCents: b.amountCents,
        emergencyCents: b.emergencyCents,
        spentCents,
        remainingCents: budgetRemainingCents(
          b.amountCents,
          b.emergencyCents,
          spentCents
        ),
      };
    })
    .filter((row) => row.remainingCents > 0)
    .sort((a, b) => b.remainingCents - a.remainingCents);

  const tooEarly = !isBudgetPeriodCloseable(period, today);
  const closed = !!existing;

  return {
    period,
    toPeriod,
    bounds: { start, end },
    closed,
    closedAt: existing ? existing.createdAt.toISOString() : null,
    canClose: !closed && !tooEarly,
    canUndo: closed,
    tooEarly,
    carryovers,
    totalRemainingCents: carryovers.reduce((s, r) => s + r.remainingCents, 0),
  };
}

/** Oldest ended, unclosed period that already has budget rows (look back 8 halves). */
export async function findPendingClose(
  householdId: string,
  today = todayISO()
): Promise<CloseStatus | null> {
  let cursor = budgetPeriodKey(new Date(today + "T12:00:00"));
  if (!isBudgetPeriodCloseable(cursor, today)) {
    cursor = prevBudgetPeriod(cursor);
  }

  let oldest: string | null = null;
  for (let i = 0; i < 8; i++) {
    if (!isBudgetPeriodCloseable(cursor, today)) break;
    const [closed, count] = await Promise.all([
      prisma.budgetPeriodClose.findUnique({
        where: { householdId_period: { householdId, period: cursor } },
        select: { id: true },
      }),
      prisma.budget.count({ where: { householdId, period: cursor } }),
    ]);
    if (!closed && count > 0) oldest = cursor;
    cursor = prevBudgetPeriod(cursor);
  }
  if (!oldest) return null;
  return getCloseStatus(householdId, oldest, today);
}

export async function closeBudgetPeriod(opts: {
  householdId: string;
  period: string;
  userId?: string;
  today?: string;
}): Promise<CloseStatus> {
  const today = opts.today || todayISO();
  const status = await getCloseStatus(opts.householdId, opts.period, today);
  if (status.closed) throw new Error("Esta quincena ya está cerrada");
  if (status.tooEarly) {
    throw new Error(
      `Aún no puedes cerrar esta quincena. El último día es ${status.bounds.end}.`
    );
  }

  await ensurePeriodBudgets(opts.householdId, status.toPeriod);

  const payload: CarryoverJson[] = status.carryovers.map((c) => ({
    categoryId: c.categoryId,
    remainingCents: c.remainingCents,
  }));

  await prisma.$transaction(async (tx) => {
    for (const line of status.carryovers) {
      await tx.budget.upsert({
        where: {
          householdId_categoryId_period: {
            householdId: opts.householdId,
            categoryId: line.categoryId,
            period: status.toPeriod,
          },
        },
        create: {
          householdId: opts.householdId,
          categoryId: line.categoryId,
          amountCents: 0,
          emergencyCents: line.remainingCents,
          period: status.toPeriod,
        },
        update: {
          emergencyCents: { increment: line.remainingCents },
        },
      });
    }

    await tx.budgetPeriodClose.create({
      data: {
        householdId: opts.householdId,
        period: opts.period,
        toPeriod: status.toPeriod,
        carryovers: JSON.stringify(payload),
        closedById: opts.userId,
      },
    });
  });

  await logActivity({
    householdId: opts.householdId,
    userId: opts.userId,
    action: "budget.close",
    entityType: "budget_period",
    entityId: opts.period,
    summary: `Cierre de quincena ${opts.period} → emergencia ${status.toPeriod}`,
  });

  return getCloseStatus(opts.householdId, opts.period, today);
}

export async function undoBudgetPeriodClose(opts: {
  householdId: string;
  period: string;
  userId?: string;
  today?: string;
}): Promise<CloseStatus> {
  const today = opts.today || todayISO();
  const existing = await prisma.budgetPeriodClose.findUnique({
    where: {
      householdId_period: {
        householdId: opts.householdId,
        period: opts.period,
      },
    },
  });
  if (!existing) throw new Error("Esta quincena no está cerrada");

  const lines = parseCarryovers(existing.carryovers);

  await prisma.$transaction(async (tx) => {
    for (const line of lines) {
      const row = await tx.budget.findUnique({
        where: {
          householdId_categoryId_period: {
            householdId: opts.householdId,
            categoryId: line.categoryId,
            period: existing.toPeriod,
          },
        },
      });
      if (!row) continue;
      const nextEmergency = Math.max(0, row.emergencyCents - line.remainingCents);
      await tx.budget.update({
        where: { id: row.id },
        data: { emergencyCents: nextEmergency },
      });
    }
    await tx.budgetPeriodClose.delete({ where: { id: existing.id } });
  });

  await logActivity({
    householdId: opts.householdId,
    userId: opts.userId,
    action: "budget.unclose",
    entityType: "budget_period",
    entityId: opts.period,
    summary: `Se deshizo el cierre de la quincena ${opts.period}`,
  });

  return getCloseStatus(opts.householdId, opts.period, today);
}

