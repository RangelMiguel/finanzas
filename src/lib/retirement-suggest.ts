import { prisma } from "@/lib/db";
import { ensurePeriodBudgets } from "@/lib/budget-defaults";
import { monthKey } from "@/lib/utils";

export type HouseholdFinanceSnapshot = {
  monthlyIncomeCents: number;
  monthlyBudgetCents: number;
  monthlySurplusCents: number;
  currentAnnualIncomeCents: number;
  desiredAnnualIncomeCents: number;
  monthlyContributionCents: number;
  replacementPercent: number;
  incomeCount: number;
  budgetCategoryCount: number;
};

/**
 * Build retirement plan fields from recurring net pay (recurring income)
 * and this month's budget envelopes (both half-months).
 *
 * monthlyContribution = max(0, income − budgets).
 * desired annual spend = replacement% of annualized income.
 */
export async function suggestRetirementFromHousehold(
  householdId: string,
  opts?: { replacementPercent?: number }
): Promise<HouseholdFinanceSnapshot> {
  const replacementPercent = Math.min(
    200,
    Math.max(0, Math.round(opts?.replacementPercent ?? 70))
  );

  const incomes = await prisma.recurringIncome.findMany({
    where: { householdId, active: true },
    select: { amountCents: true },
  });
  const monthlyIncomeCents = incomes.reduce(
    (s, r) => s + Math.max(0, r.amountCents),
    0
  );

  const mk = monthKey();
  const period1 = `${mk}-1`;
  const period2 = `${mk}-2`;
  await ensurePeriodBudgets(householdId, period1);
  await ensurePeriodBudgets(householdId, period2);

  const budgets = await prisma.budget.findMany({
    where: { householdId, period: { in: [period1, period2] } },
    select: { amountCents: true, categoryId: true },
  });
  const monthlyBudgetCents = budgets.reduce(
    (s, b) => s + Math.max(0, b.amountCents),
    0
  );
  const budgetCategoryCount = new Set(budgets.map((b) => b.categoryId)).size;

  const monthlySurplusCents = Math.max(
    0,
    monthlyIncomeCents - monthlyBudgetCents
  );
  const currentAnnualIncomeCents = monthlyIncomeCents * 12;
  const desiredAnnualIncomeCents = Math.round(
    (currentAnnualIncomeCents * replacementPercent) / 100
  );

  return {
    monthlyIncomeCents,
    monthlyBudgetCents,
    monthlySurplusCents,
    currentAnnualIncomeCents,
    desiredAnnualIncomeCents,
    monthlyContributionCents: monthlySurplusCents,
    replacementPercent,
    incomeCount: incomes.length,
    budgetCategoryCount,
  };
}
