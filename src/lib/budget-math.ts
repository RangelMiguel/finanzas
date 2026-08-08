import { isBudgetableSpend } from "./visibility";

export type BudgetableSpendRow = {
  categoryId?: string | null;
  amountCents: number;
  type: string;
  date: string;
};

/** Planned envelope + emergency cushion. Emergency never inflates `amountCents`. */
export function budgetAvailableCents(
  amountCents: number,
  emergencyCents: number
): number {
  return Math.max(0, amountCents) + Math.max(0, emergencyCents);
}

/** Leftover after spend: first consumes the planned amount, then emergency. */
export function budgetRemainingCents(
  amountCents: number,
  emergencyCents: number,
  spentCents: number
): number {
  return Math.max(
    0,
    budgetAvailableCents(amountCents, emergencyCents) - Math.max(0, spentCents)
  );
}

export function spentAgainstBudget(
  amountCents: number,
  spentCents: number
): number {
  return Math.min(Math.max(0, spentCents), Math.max(0, amountCents));
}

export function spentAgainstEmergency(
  amountCents: number,
  emergencyCents: number,
  spentCents: number
): number {
  const overPlan = Math.max(0, spentCents - Math.max(0, amountCents));
  return Math.min(overPlan, Math.max(0, emergencyCents));
}

export function isOverBudget(
  amountCents: number,
  emergencyCents: number,
  spentCents: number
): boolean {
  return spentCents > budgetAvailableCents(amountCents, emergencyCents);
}

export function isUsingEmergency(
  amountCents: number,
  emergencyCents: number,
  spentCents: number
): boolean {
  return (
    emergencyCents > 0 &&
    spentCents > amountCents &&
    !isOverBudget(amountCents, emergencyCents, spentCents)
  );
}

export function spentByCategoryInRange(
  rows: BudgetableSpendRow[],
  start: string,
  end: string
): Record<string, number> {
  const spent: Record<string, number> = {};
  for (const e of rows) {
    if (!e.categoryId || !isBudgetableSpend(e)) continue;
    if (e.date < start || e.date > end) continue;
    spent[e.categoryId] = (spent[e.categoryId] || 0) + e.amountCents;
  }
  return spent;
}

export type CarryoverJson = {
  categoryId: string;
  remainingCents: number;
};

export function parseCarryovers(raw: string): CarryoverJson[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        categoryId: String((row as CarryoverJson).categoryId || ""),
        remainingCents: Math.max(
          0,
          Math.round(Number((row as CarryoverJson).remainingCents) || 0)
        ),
      }))
      .filter((row) => row.categoryId && row.remainingCents > 0);
  } catch {
    return [];
  }
}
