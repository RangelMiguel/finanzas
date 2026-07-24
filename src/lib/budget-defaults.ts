import { prisma } from "./db";
import {
  makeBudgetPeriod,
  monthBudgetPeriods,
  parseBudgetPeriod,
  type BudgetHalf,
} from "./utils";

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
