/** Informal credits: remaining balance and overdue flag. */

export type CreditDirection = "lent" | "borrowed";
export type CreditKind =
  | "person"
  | "family"
  | "business"
  | "employee"
  | "store"
  | "other";

export function creditRemainingCents(
  principalCents: number,
  paidCents: number
): number {
  return Math.max(0, Math.round(principalCents) - Math.max(0, Math.round(paidCents)));
}

export function creditIsOverdue(
  remainingCents: number,
  dueOn: string | null | undefined,
  asOf = new Date()
): boolean {
  if (remainingCents <= 0 || !dueOn) return false;
  const due = dueOn.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  const y = asOf.getFullYear();
  const m = String(asOf.getMonth() + 1).padStart(2, "0");
  const d = String(asOf.getDate()).padStart(2, "0");
  return due < `${y}-${m}-${d}`;
}

export function clampPaymentCents(amountCents: number, remainingCents: number): number {
  return Math.min(Math.max(0, Math.round(amountCents)), Math.max(0, remainingCents));
}

/** Ledger type when cash moves: collecting a loan is income; paying one back is expense. */
export function creditLedgerType(
  direction: CreditDirection,
  event: "open" | "repay"
): "income" | "expense" {
  if (event === "open") {
    return direction === "lent" ? "expense" : "income";
  }
  return direction === "lent" ? "income" : "expense";
}
