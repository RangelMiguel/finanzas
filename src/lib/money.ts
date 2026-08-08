export type FundingLike = {
  amountCents: number;
  accountId?: string | null;
  creditCardId?: string | null;
};

export type TxnLike = {
  type: string;
  amountCents: number;
  accountId?: string | null;
  toAccountId?: string | null;
  date: string;
  deletedAt?: Date | null;
  /** Split payment sources; when present, expense bank impact uses these. */
  fundings?: FundingLike[] | null;
  creditCardId?: string | null;
};

export function signedAmountForAccount(
  txn: TxnLike,
  accountId: string
): number {
  if (txn.deletedAt) return 0;
  if (txn.type === "income" && txn.accountId === accountId) return txn.amountCents;
  if (txn.type === "expense") {
    if (txn.fundings && txn.fundings.length > 0) {
      return -txn.fundings
        .filter((f) => f.accountId === accountId)
        .reduce((s, f) => s + f.amountCents, 0);
    }
    // Legacy: CC charges should not drain the bank (paid on statement due date)
    if (txn.creditCardId) return 0;
    if (txn.accountId === accountId) return -txn.amountCents;
  }
  if (txn.type === "transfer") {
    if (txn.accountId === accountId) return -txn.amountCents;
    if (txn.toAccountId === accountId) return txn.amountCents;
  }
  // Manual card payment: drains the bank/cash account, never auto-created.
  if (txn.type === "cc_payment" && txn.accountId === accountId) {
    return -txn.amountCents;
  }
  return 0;
}

export function accountBalance(
  initialBalanceCents: number,
  transactions: TxnLike[],
  accountId: string,
  asOfDate?: string
): number {
  let bal = initialBalanceCents;
  for (const t of transactions) {
    if (asOfDate && t.date > asOfDate) continue;
    bal += signedAmountForAccount(t, accountId);
  }
  return bal;
}

export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const last = new Date(y, m, 0).getDate();
  const end = `${month}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

export function sumByType(
  transactions: TxnLike[],
  type: "income" | "expense",
  month?: string
): number {
  const bounds = month ? monthBounds(month) : null;
  return transactions
    .filter(
      (t) =>
        !t.deletedAt &&
        t.type === type &&
        (!bounds || (t.date >= bounds.start && t.date <= bounds.end))
    )
    .reduce((s, t) => s + t.amountCents, 0);
}
