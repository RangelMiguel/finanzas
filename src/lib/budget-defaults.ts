import { prisma } from "./db";
import {
  budgetPeriodBounds,
  budgetPeriodsThrough,
  makeBudgetPeriod,
  monthBudgetPeriods,
  parseBudgetPeriod,
  type BudgetHalf,
} from "./utils";
import type { FutureItem } from "./safe-to-spend";

/**
 * Build future expenses that ring-fence budget money across the projection.
 *
 * - Current open period: reserves the **unutilized** amount (budget − spent).
 *   Unspent budget still blocks cash even if you haven't used it yet.
 * - Future periods: reserves the full planned amount on each period start.
 * - Falls back to budget defaults when a period has no explicit rows.
 */
export async function buildBudgetReserveItems(opts: {
  householdId: string;
  asOf: string;
  untilDate: string;
}): Promise<FutureItem[]> {
  const { householdId, asOf, untilDate } = opts;
  const periods = budgetPeriodsThrough(asOf, untilDate);
  if (periods.length === 0) return [];

  const [defaults, allBudgets, expenses] = await Promise.all([
    prisma.budgetDefault.findMany({
      where: { householdId },
      select: { categoryId: true, amountCents: true },
    }),
    prisma.budget.findMany({
      where: { householdId, period: { in: periods } },
      select: { period: true, categoryId: true, amountCents: true },
    }),
    prisma.transaction.findMany({
      where: {
        householdId,
        type: "expense",
        deletedAt: null,
        date: {
          gte: budgetPeriodBounds(periods[0]).start,
          lte: asOf,
        },
      },
      select: { categoryId: true, amountCents: true, date: true },
    }),
  ]);

  const budgetsByPeriod = new Map<
    string,
    { categoryId: string; amountCents: number }[]
  >();
  for (const b of allBudgets) {
    const list = budgetsByPeriod.get(b.period) || [];
    list.push({ categoryId: b.categoryId, amountCents: b.amountCents });
    budgetsByPeriod.set(b.period, list);
  }

  const items: FutureItem[] = [];

  for (const period of periods) {
    const { start, end } = budgetPeriodBounds(period);
    if (end < asOf) continue; // fully past
    if (start > untilDate) continue;

    let rows = budgetsByPeriod.get(period) || [];
    if (rows.length === 0 && defaults.length > 0) {
      rows = defaults.map((d) => ({
        categoryId: d.categoryId,
        amountCents: d.amountCents,
      }));
    }
    if (rows.length === 0) continue;

    const isCurrent = start <= asOf && end >= asOf;

    if (isCurrent) {
      // Unutilized = planned − spent so far in this period (floor 0)
      const spentByCat: Record<string, number> = {};
      for (const e of expenses) {
        if (!e.categoryId) continue;
        if (e.date < start || e.date > asOf) continue;
        spentByCat[e.categoryId] =
          (spentByCat[e.categoryId] || 0) + e.amountCents;
      }
      let remaining = 0;
      for (const r of rows) {
        const spent = spentByCat[r.categoryId] || 0;
        remaining += Math.max(0, r.amountCents - spent);
      }
      if (remaining > 0) {
        items.push({
          date: asOf,
          amountCents: remaining,
          type: "expense",
          label: `Budget reserve (${period})`,
        });
      }
    } else {
      // Future quincena: full planned envelope on period start
      const total = rows.reduce((s, r) => s + r.amountCents, 0);
      if (total > 0 && start >= asOf && start <= untilDate) {
        items.push({
          date: start,
          amountCents: total,
          type: "expense",
          label: `Budget reserve (${period})`,
        });
      }
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
  const { year, month, half, monthKey } = parseBudgetPeriod(period);

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
