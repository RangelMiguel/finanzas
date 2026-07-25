import { accountBalance, type TxnLike } from "./money";

export type FutureItem = {
  date: string;
  amountCents: number;
  type: "income" | "expense";
  label: string;
};

export type AccountForProjection = {
  id: string;
  initialBalanceCents: number;
};

export type ProjectionInput = {
  /** All household accounts to include in the combined cash position. */
  accounts: AccountForProjection[];
  transactions: TxnLike[];
  futureItems: FutureItem[];
  horizonDays?: number;
  targetDate?: string; // YYYY-MM-DD — project through this date
  targetAmountCents?: number; // find when balance reaches this
};

export type DayPoint = {
  date: string;
  balance: number;
  label?: string;
  delta: number;
};

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenDates(a: string, b: string): number {
  const da = new Date(a + "T12:00:00").getTime();
  const db = new Date(b + "T12:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

/** Combined balance across accounts (internal transfers cancel out). */
export function totalAccountsBalance(
  accounts: AccountForProjection[],
  transactions: TxnLike[],
  asOfDate?: string
): number {
  let total = 0;
  for (const acc of accounts) {
    total += accountBalance(
      acc.initialBalanceCents,
      transactions,
      acc.id,
      asOfDate
    );
  }
  return total;
}

export function projectSafeToSpend(input: ProjectionInput) {
  const today = new Date().toISOString().slice(0, 10);
  const currentBalance = totalAccountsBalance(
    input.accounts,
    input.transactions,
    today
  );

  let endStr: string;
  if (input.targetDate && input.targetDate >= today) {
    endStr = input.targetDate;
  } else {
    const horizon = input.horizonDays ?? 90;
    endStr = addDaysISO(today, horizon);
  }

  // If looking for a goal amount, extend horizon if needed (up to 365 days)
  const maxEnd = addDaysISO(today, 365);
  if (input.targetAmountCents != null && input.targetAmountCents > 0) {
    endStr = maxEnd;
  }

  const events = [...input.futureItems]
    .filter((e) => e.date >= today && e.date <= endStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Build event map by date
  const byDate = new Map<string, FutureItem[]>();
  for (const e of events) {
    const list = byDate.get(e.date) || [];
    list.push(e);
    byDate.set(e.date, list);
  }

  let bal = currentBalance;
  let minBalance = currentBalance;
  let minDate = today;
  let maxBalance = currentBalance;
  let maxDate = today;

  const timeline: DayPoint[] = [
    { date: today, balance: bal, label: "start", delta: 0 },
  ];
  const dailySeries: DayPoint[] = [{ date: today, balance: bal, delta: 0 }];

  // Walk day by day for smooth chart + goal detection
  const totalDays = Math.max(0, daysBetweenDates(today, endStr));
  let goalDate: string | null = null;
  let goalBalance: number | null = null;
  const goal = input.targetAmountCents;

  if (goal != null && goal > 0 && currentBalance >= goal) {
    goalDate = today;
    goalBalance = currentBalance;
  }

  for (let i = 1; i <= totalDays; i++) {
    const date = addDaysISO(today, i);
    const dayEvents = byDate.get(date) || [];
    let dayDelta = 0;
    let lastLabel: string | undefined;
    for (const e of dayEvents) {
      const delta = e.type === "income" ? e.amountCents : -e.amountCents;
      bal += delta;
      dayDelta += delta;
      lastLabel = e.label;
      timeline.push({
        date,
        balance: bal,
        label: e.label,
        delta,
      });
    }
    dailySeries.push({
      date,
      balance: bal,
      label: lastLabel,
      delta: dayDelta,
    });

    if (bal < minBalance) {
      minBalance = bal;
      minDate = date;
    }
    if (bal > maxBalance) {
      maxBalance = bal;
      maxDate = date;
    }
    if (goal != null && goal > 0 && goalDate == null && bal >= goal) {
      goalDate = date;
      goalBalance = bal;
    }
  }

  // Balance on target date (end of that day after events)
  let balanceOnTargetDate: number | null = null;
  if (input.targetDate && input.targetDate >= today) {
    const pt = dailySeries.find((d) => d.date === input.targetDate);
    balanceOnTargetDate = pt ? pt.balance : bal;
  }

  // Safe to spend until end of projection (don't go below 0)
  const safeToSpend = Math.max(
    0,
    Math.min(
      currentBalance,
      minBalance < 0 ? currentBalance + minBalance : minBalance
    )
  );

  // How much can I spend today and still hit goal on targetDate?
  let spendAndStillHitGoal: number | null = null;
  if (input.targetDate && goal != null && balanceOnTargetDate != null) {
    spendAndStillHitGoal = Math.max(
      0,
      Math.min(currentBalance, balanceOnTargetDate - goal)
    );
  }

  return {
    currentBalance,
    minBalance,
    minDate,
    maxBalance,
    maxDate,
    safeToSpend,
    timeline,
    dailySeries,
    endDate: endStr,
    balanceOnTargetDate,
    goalDate,
    goalBalance,
    goalReached: goalDate != null,
    goalAmountCents: goal ?? null,
    spendAndStillHitGoal,
    totalFutureIncome: events
      .filter((e) => e.type === "income")
      .reduce((s, e) => s + e.amountCents, 0),
    totalFutureExpense: events
      .filter((e) => e.type === "expense")
      .reduce((s, e) => s + e.amountCents, 0),
    daysProjected: totalDays,
    accountCount: input.accounts.length,
  };
}
