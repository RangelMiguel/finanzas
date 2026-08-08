import { prisma } from "./db";
import {
  budgetPeriodBounds,
  budgetPeriodKey,
  budgetPeriodsThrough,
  makeBudgetPeriod,
  monthBudgetPeriods,
  parseBudgetPeriod,
  prevBudgetPeriod,
} from "./utils";
import type { FutureItem } from "./safe-to-spend";
import {
  budgetRemainingCents,
  spentByCategoryInRange,
} from "./budget-math";
import { loadGoalAllocations } from "./goal-budget";

type PeriodRow = {
  categoryId: string;
  amountCents: number;
  emergencyCents: number;
};

/**
 * Build future expenses that ring-fence budget money across the projection.
 *
 * - Current open period: reserves unutilized planned + emergency (as if spent).
 * - Future periods: full planned amount + any stored emergency on period start.
 * - Past unclosed periods: leftover is treated as emergency on the next period
 *   so cash isn't freed just because the close button wasn't pressed yet.
 * - Falls back to budget defaults when a period has no explicit rows.
 */
export async function buildBudgetReserveItems(opts: {
  householdId: string;
  asOf: string;
  untilDate: string;
}): Promise<FutureItem[]> {
  const { householdId, asOf, untilDate } = opts;
  const currentPeriod = budgetPeriodKey(new Date(asOf + "T12:00:00"));
  let lookback = currentPeriod;
  for (let i = 0; i < 6; i++) lookback = prevBudgetPeriod(lookback);
  const periods = budgetPeriodsThrough(
    budgetPeriodBounds(lookback).start,
    untilDate
  );
  if (periods.length === 0) return [];

  const [defaults, allBudgets, expenses, closes, goalAllocs] = await Promise.all([
    prisma.budgetDefault.findMany({
      where: { householdId },
      select: { categoryId: true, amountCents: true },
    }),
    prisma.budget.findMany({
      where: { householdId, period: { in: periods } },
      select: {
        period: true,
        categoryId: true,
        amountCents: true,
        emergencyCents: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        householdId,
        deletedAt: null,
        date: {
          gte: budgetPeriodBounds(periods[0]).start,
          lte: asOf,
        },
        OR: [
          { type: "expense" },
          { type: "transfer", categoryId: { not: null } },
        ],
      },
      select: {
        categoryId: true,
        amountCents: true,
        date: true,
        type: true,
      },
    }),
    prisma.budgetPeriodClose.findMany({
      where: { householdId, period: { in: periods } },
      select: { period: true },
    }),
    loadGoalAllocations({ householdId, period: periods }),
  ]);
  const allocByPeriodCat = new Map<string, number>();
  for (const row of goalAllocs) {
    const key = `${row.period}:${row.categoryId}`;
    allocByPeriodCat.set(
      key,
      (allocByPeriodCat.get(key) || 0) + row.amountCents
    );
  }

  const closed = new Set(closes.map((c) => c.period));
  const budgetsByPeriod = new Map<string, PeriodRow[]>();
  for (const b of allBudgets) {
    const list = budgetsByPeriod.get(b.period) || [];
    list.push({
      categoryId: b.categoryId,
      amountCents: b.amountCents,
      emergencyCents: b.emergencyCents || 0,
    });
    budgetsByPeriod.set(b.period, list);
  }

  const defaultRows: PeriodRow[] = defaults.map((d) => ({
    categoryId: d.categoryId,
    amountCents: d.amountCents,
    emergencyCents: 0,
  }));

  const pendingLeftover = new Map<string, number>();
  const items: FutureItem[] = [];

  for (const period of periods) {
    const { start, end } = budgetPeriodBounds(period);
    if (start > untilDate) continue;

    const isPast = end < asOf;
    const isCurrent = start <= asOf && end >= asOf;

    let rows = budgetsByPeriod.get(period) || [];
    // Defaults only fill current/future empty periods — never invent history.
    if (rows.length === 0 && defaultRows.length > 0 && !isPast) {
      rows = defaultRows.map((d) => ({ ...d }));
    }

    const merged = new Map<string, PeriodRow>();
    for (const r of rows) {
      merged.set(r.categoryId, {
        categoryId: r.categoryId,
        amountCents: r.amountCents,
        emergencyCents: r.emergencyCents + (pendingLeftover.get(r.categoryId) || 0),
      });
    }
    for (const [catId, extra] of pendingLeftover) {
      if (merged.has(catId)) continue;
      merged.set(catId, {
        categoryId: catId,
        amountCents: 0,
        emergencyCents: extra,
      });
    }
    pendingLeftover.clear();
    rows = [...merged.values()];
    if (rows.length === 0) continue;

    if (isPast) {
      const spentByCat = spentByCategoryInRange(expenses, start, end);
      if (!closed.has(period)) {
        for (const r of rows) {
          const leftover = budgetRemainingCents(
            r.amountCents,
            r.emergencyCents,
            spentByCat[r.categoryId] || 0,
            allocByPeriodCat.get(`${period}:${r.categoryId}`) || 0
          );
          if (leftover > 0) {
            pendingLeftover.set(
              r.categoryId,
              (pendingLeftover.get(r.categoryId) || 0) + leftover
            );
          }
        }
      }
      continue;
    }

    if (isCurrent) {
      const spentByCat = spentByCategoryInRange(expenses, start, asOf);
      let plannedLeft = 0;
      let emergencyLeft = 0;
      for (const r of rows) {
        const spent = spentByCat[r.categoryId] || 0;
        const goalAlloc =
          allocByPeriodCat.get(`${period}:${r.categoryId}`) || 0;
        const rem = budgetRemainingCents(
          r.amountCents,
          r.emergencyCents,
          spent,
          goalAlloc
        );
        const afterPlan = Math.max(0, r.amountCents - spent - goalAlloc);
        plannedLeft += afterPlan;
        emergencyLeft += Math.max(0, rem - afterPlan);
      }
      if (plannedLeft > 0) {
        items.push({
          date: asOf,
          amountCents: plannedLeft,
          type: "expense",
          label: `Budget reserve (${period})`,
        });
      }
      if (emergencyLeft > 0) {
        items.push({
          date: asOf,
          amountCents: emergencyLeft,
          type: "expense",
          label: `Emergency fund (${period})`,
        });
      }
      continue;
    }

    // Future quincena: full planned + emergency (incl. pending unclosed leftover)
    let planned = 0;
    let emergency = 0;
    for (const r of rows) {
      planned += Math.max(0, r.amountCents);
      emergency += Math.max(0, r.emergencyCents);
    }
    if (planned > 0 && start >= asOf && start <= untilDate) {
      items.push({
        date: start,
        amountCents: planned,
        type: "expense",
        label: `Budget reserve (${period})`,
      });
    }
    if (emergency > 0 && start >= asOf && start <= untilDate) {
      items.push({
        date: start,
        amountCents: emergency,
        type: "expense",
        label: `Emergency fund (${period})`,
      });
    }
  }

  return items;
}

/** Ensure a half-month period has budget rows from defaults when empty */
export async function ensurePeriodBudgets(
  householdId: string,
  period: string
): Promise<number> {
  const existing = await prisma.budget.count({
    where: { householdId, period },
  });
  if (existing > 0) return 0;

  const defaults = await prisma.budgetDefault.findMany({
    where: { householdId },
  });
  if (!defaults.length) return 0;

  let n = 0;
  for (const d of defaults) {
    await prisma.budget.upsert({
      where: {
        householdId_categoryId_period: {
          householdId,
          categoryId: d.categoryId,
          period,
        },
      },
      create: {
        householdId,
        categoryId: d.categoryId,
        amountCents: d.amountCents,
        period,
      },
      update: {},
    });
    n++;
  }
  return n;
}

/** @deprecated use ensurePeriodBudgets */
export const ensureMonthBudgets = ensurePeriodBudgets;

/**
 * Upsert default + write period(s).
 * scope:
 *  - this_period: only the selected half-month
 *  - both_periods: both halves of the same calendar month
 *  - default: this period + save as default template
 *  - next_year: default + all 24 half-months of next calendar year
 */
export async function saveBudgetWithScope(opts: {
  householdId: string;
  categoryId: string;
  amountCents: number;
  period: string;
  scope: "this_period" | "both_periods" | "default" | "next_year";
}) {
  const { householdId, categoryId, amountCents, period, scope } = opts;
  const { year, monthKey } = parseBudgetPeriod(period);

  if (scope === "default" || scope === "next_year") {
    await prisma.budgetDefault.upsert({
      where: {
        householdId_categoryId: { householdId, categoryId },
      },
      create: { householdId, categoryId, amountCents },
      update: { amountCents },
    });
  }

  const writePeriod = async (p: string) => {
    await prisma.budget.upsert({
      where: {
        householdId_categoryId_period: { householdId, categoryId, period: p },
      },
      create: { householdId, categoryId, amountCents, period: p },
      update: { amountCents },
    });
  };

  if (scope === "this_period" || scope === "default") {
    await writePeriod(period);
  }

  if (scope === "both_periods") {
    const [p1, p2] = monthBudgetPeriods(monthKey);
    await writePeriod(p1);
    await writePeriod(p2);
  }

  if (scope === "next_year") {
    const nextYear = year + 1;
    for (let m = 1; m <= 12; m++) {
      await writePeriod(makeBudgetPeriod(nextYear, m, 1));
      await writePeriod(makeBudgetPeriod(nextYear, m, 2));
    }
    // also current period
    await writePeriod(period);
  }
}

export function allPeriodsForMonth(monthKey: string): string[] {
  return [...monthBudgetPeriods(monthKey)];
}
