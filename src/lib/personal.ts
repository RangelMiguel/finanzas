import { prisma } from "./db";

/**
 * Personal pool for one half-month period (YYYY-MM-1 | YYYY-MM-2).
 * Admin allocation amount applies fully to each quincena.
 */
export async function personalPool(opts: {
  householdId: string;
  userId: string;
  period: string;
}) {
  const allocations = await prisma.personalAllocation.findMany({
    where: {
      householdId: opts.householdId,
      userId: opts.userId,
      active: true,
    },
  });
  const allocationCents = allocations.reduce((s, a) => s + a.amountCents, 0);

  const incomes = await prisma.personalIncome.findMany({
    where: {
      householdId: opts.householdId,
      userId: opts.userId,
      period: opts.period,
    },
  });
  const incomeCents = incomes.reduce((s, i) => s + i.amountCents, 0);

  const expenses = await prisma.personalExpense.findMany({
    where: {
      householdId: opts.householdId,
      userId: opts.userId,
      period: opts.period,
    },
  });
  const expenseCents = expenses.reduce((s, e) => s + e.amountCents, 0);

  const availableCents = allocationCents + incomeCents - expenseCents;

  return {
    allocationCents,
    incomeCents,
    expenseCents,
    availableCents,
    totalPoolCents: allocationCents + incomeCents,
  };
}
