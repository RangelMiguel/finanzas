import { ensureRecurringIncomesPosted } from "@/lib/recurring-income";
import { ensureRecurringExpensesPosted } from "@/lib/recurring-expense";

/** Post due recurring income and expense occurrences into the ledger. */
export async function ensureRecurringPosted(
  householdId: string,
  opts?: { monthsBack?: number; userId?: string | null }
) {
  const [income, expense] = await Promise.all([
    ensureRecurringIncomesPosted(householdId, opts),
    ensureRecurringExpensesPosted(householdId, opts),
  ]);
  return { created: income.created + expense.created };
}
