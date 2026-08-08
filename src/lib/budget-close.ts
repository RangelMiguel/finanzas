import { prisma } from "./db";
import { logActivity } from "./household";
import {
  budgetPeriodBounds,
  budgetPeriodKey,
  isBudgetPeriodCloseable,
  isStaleBudgetClose,
  nextBudgetPeriod,
  prevBudgetPeriod,
  todayISO,
} from "./utils";
import {
  budgetRemainingCents,
  buildCloseAllocations,
  effectiveAllocations,
  parseCarryovers,
  spentByCategoryInRange,
  summarizeCloseAllocations,
  type CarryoverJson,
  type CloseLineInput,
} from "./budget-math";
import { allocationsForPeriod, loadGoalAllocations } from "./goal-budget";

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
  /** Next period has already ended — leftover should not hit current budgets. */
  isStale: boolean;
  defaultKind: "emergency" | "spent";
  carryovers: CloseLine[];
  totalRemainingCents: number;
  applied: CarryoverJson[] | null;
  appliedSummary: {
    emergencyCents: number;
    goalCents: number;
    spentCents: number;
    movedCents: number;
  } | null;
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
  const [spendRows, goalAllocRows] = await Promise.all([
    loadPeriodSpend(householdId, start, end),
    loadGoalAllocations({ householdId, period }),
  ]);
  const spentByCat = spentByCategoryInRange(spendRows, start, end);
  const goalByCat = allocationsForPeriod(goalAllocRows, period);

  const carryovers: CloseLine[] = budgets
    .map((b) => {
      const spentCents = spentByCat[b.categoryId] || 0;
      const goalAllocatedCents = goalByCat[b.categoryId] || 0;
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
          spentCents,
          goalAllocatedCents
        ),
      };
    })
    .filter((row) => row.remainingCents > 0)
    .sort((a, b) => b.remainingCents - a.remainingCents);

  const tooEarly = !isBudgetPeriodCloseable(period, today);
  const closed = !!existing;
  const isStale = isStaleBudgetClose(period, today);
  const defaultKind: "emergency" | "spent" = isStale ? "spent" : "emergency";
  const applied = existing ? parseCarryovers(existing.carryovers) : null;

  return {
    period,
    toPeriod,
    bounds: { start, end },
    closed,
    closedAt: existing ? existing.createdAt.toISOString() : null,
    canClose: !closed && !tooEarly,
    canUndo: closed,
    tooEarly,
    isStale,
    defaultKind,
    carryovers,
    totalRemainingCents: carryovers.reduce((s, r) => s + r.remainingCents, 0),
    applied,
    appliedSummary: applied ? summarizeCloseAllocations(applied) : null,
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
  defaultKind?: "emergency" | "spent";
  lines?: CloseLineInput[];
}): Promise<CloseStatus> {
  const today = opts.today || todayISO();
  const status = await getCloseStatus(opts.householdId, opts.period, today);
  if (status.closed) throw new Error("Esta quincena ya está cerrada");
  if (status.tooEarly) {
    throw new Error(
      `Aún no puedes cerrar esta quincena. El último día es ${status.bounds.end}.`
    );
  }

  const defaultKind = opts.defaultKind || status.defaultKind;
  const payload = buildCloseAllocations({
    leftover: status.carryovers.map((c) => ({
      categoryId: c.categoryId,
      remainingCents: c.remainingCents,
    })),
    lines: opts.lines,
    defaultKind,
  });

  const emergencyByCat = new Map<string, number>();
  const goalAllocs: { categoryId: string; goalId: string; amountCents: number; index: [number, number] }[] =
    [];
  payload.forEach((row, rowIdx) => {
    (row.allocations || []).forEach((a, allocIdx) => {
      if (a.kind === "emergency") {
        const dest = a.categoryId || row.categoryId;
        emergencyByCat.set(dest, (emergencyByCat.get(dest) || 0) + a.amountCents);
      } else if (a.kind === "goal" && a.goalId) {
        goalAllocs.push({
          categoryId: row.categoryId,
          goalId: a.goalId,
          amountCents: a.amountCents,
          index: [rowIdx, allocIdx],
        });
      }
    });
  });

  if (goalAllocs.length) {
    const goalIds = [...new Set(goalAllocs.map((g) => g.goalId))];
    const goals = await prisma.goal.findMany({
      where: { id: { in: goalIds }, householdId: opts.householdId },
      select: { id: true, status: true },
    });
    const found = new Set(goals.map((g) => g.id));
    for (const id of goalIds) {
      if (!found.has(id)) throw new Error("Meta no encontrada");
    }
    if (goals.some((g) => g.status === "cancelled")) {
      throw new Error("No puedes enviar sobrante a una meta cancelada");
    }
  }

  if (emergencyByCat.size) {
    const destIds = [...emergencyByCat.keys()];
    const cats = await prisma.category.findMany({
      where: {
        id: { in: destIds },
        householdId: opts.householdId,
        type: "expense",
      },
      select: { id: true },
    });
    if (cats.length !== destIds.length) {
      throw new Error("Categoría destino inválida");
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [categoryId, amount] of emergencyByCat) {
      await tx.budget.upsert({
        where: {
          householdId_categoryId_period: {
            householdId: opts.householdId,
            categoryId,
            period: status.toPeriod,
          },
        },
        create: {
          householdId: opts.householdId,
          categoryId,
          amountCents: 0,
          emergencyCents: amount,
          period: status.toPeriod,
        },
        update: {
          emergencyCents: { increment: amount },
        },
      });
    }

    for (const g of goalAllocs) {
      const goal = await tx.goal.findFirst({
        where: { id: g.goalId, householdId: opts.householdId },
        include: { reserves: { select: { amountCents: true } } },
      });
      if (!goal) throw new Error("Meta no encontrada");
      const reserve = await tx.goalReserve.create({
        data: {
          householdId: opts.householdId,
          goalId: g.goalId,
          source: "budget_close",
          amountCents: g.amountCents,
          period: opts.period,
          date: status.bounds.end,
          notes: `Sobrante de presupuesto (${opts.period})`,
          createdById: opts.userId || null,
          transactionId: null,
        },
      });
      const [rowIdx, allocIdx] = g.index;
      const alloc = payload[rowIdx].allocations![allocIdx];
      alloc.reserveId = reserve.id;

      const totalReserved =
        goal.reserves.reduce((s, r) => s + r.amountCents, 0) + g.amountCents;
      if (goal.status === "active" && totalReserved >= goal.targetAmountCents) {
        await tx.goal.update({
          where: { id: goal.id },
          data: { status: "completed" },
        });
      }
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

  const summary = summarizeCloseAllocations(payload);
  const parts: string[] = [];
  if (summary.emergencyCents > 0) {
    parts.push(`emergencia ${status.toPeriod} ${(summary.emergencyCents / 100).toFixed(2)}`);
  }
  if (summary.goalCents > 0) {
    parts.push(`metas ${(summary.goalCents / 100).toFixed(2)}`);
  }
  if (summary.spentCents > 0 || parts.length === 0) {
    parts.push(`marcado gastado ${(summary.spentCents / 100).toFixed(2)}`);
  }

  await logActivity({
    householdId: opts.householdId,
    userId: opts.userId,
    action: "budget.close",
    entityType: "budget_period",
    entityId: opts.period,
    summary: `Cierre de quincena ${opts.period}: ${parts.join(" · ")}`,
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
  const emergencyByCat = new Map<string, number>();
  const reserveIds: string[] = [];
  for (const line of lines) {
    for (const a of effectiveAllocations(line)) {
      if (a.kind === "emergency") {
        const dest = a.categoryId || line.categoryId;
        emergencyByCat.set(dest, (emergencyByCat.get(dest) || 0) + a.amountCents);
      } else if (a.kind === "goal" && a.reserveId) {
        reserveIds.push(a.reserveId);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [categoryId, amount] of emergencyByCat) {
      const row = await tx.budget.findUnique({
        where: {
          householdId_categoryId_period: {
            householdId: opts.householdId,
            categoryId,
            period: existing.toPeriod,
          },
        },
      });
      if (!row) continue;
      const nextEmergency = Math.max(0, row.emergencyCents - amount);
      await tx.budget.update({
        where: { id: row.id },
        data: { emergencyCents: nextEmergency },
      });
    }

    if (reserveIds.length) {
      const reserves = await tx.goalReserve.findMany({
        where: {
          id: { in: reserveIds },
          householdId: opts.householdId,
          source: "budget_close",
        },
        include: { goal: true },
      });
      await tx.goalReserve.deleteMany({
        where: { id: { in: reserves.map((r) => r.id) } },
      });
      const touchedGoals = new Map(
        reserves.map((r) => [r.goalId, r.goal])
      );
      for (const [goalId, goal] of touchedGoals) {
        if (goal.status !== "completed") continue;
        const remaining = await tx.goalReserve.aggregate({
          where: { goalId },
          _sum: { amountCents: true },
        });
        const total = remaining._sum.amountCents || 0;
        if (total < goal.targetAmountCents) {
          await tx.goal.update({
            where: { id: goalId },
            data: { status: "active" },
          });
        }
      }
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

