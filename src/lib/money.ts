export type TxnLike = {
  type: string;
  amountCents: number;
  accountId?: string | null;
  toAccountId?: string | null;
  date: string;
  deletedAt?: Date | null;
};

export function signedAmountForAccount(
  txn: TxnLike,
  accountId: string
): number {
  if (txn.deletedAt) return 0;
  if (txn.type === "income" && txn.accountId === accountId) return txn.amountCents;
  if (txn.type === "expense" && txn.accountId === accountId) return -txn.amountCents;
  if (txn.type === "transfer") {
    if (txn.accountId === accountId) return -txn.amountCents;
    if (txn.toAccountId === accountId) return txn.amountCents;
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
  let bounds = month ? monthBounds(month) : null;
  return transactions
    .filter(
      (t) =>
        !t.deletedAt &&
        t.type === type &&
        (!bounds || (t.date >= bounds.start && t.date <= bounds.end))
    )
    .reduce((s, t) => s + t.amountCents, 0);
}
