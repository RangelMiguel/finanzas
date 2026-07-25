/**
 * Credit-card billing cycles (Mexican-style cut-off + grace days).
 *
 * A purchase on date D is billed on the next cut-off on or after D.
 * Payment due = that cut-off date + graceDays.
 *
 * Example (cut-off day 20, grace 20):
 * - buy on the 19th → cut 20th of same month → pay 20 days later
 * - buy on the 21st → cut 20th of next month → pay 20 days after that
 */

export type BillingCycle = {
  /** Inclusive start of the statement period (day after previous cut). */
  start: string;
  /** Inclusive end = cut-off date (YYYY-MM-DD). */
  end: string;
  /** Payment due date (YYYY-MM-DD). */
  paymentDue: string;
};

export type ChargeLike = {
  id?: string;
  date: string;
  amountCents: number;
  creditCardId?: string | null;
  installmentPlanId?: string | null;
  type?: string;
  description?: string | null;
  deletedAt?: Date | string | null;
  /** Split payment rows; card portions count toward this card. */
  fundings?: {
    amountCents: number;
    creditCardId?: string | null;
    accountId?: string | null;
  }[] | null;
};

export type InstallmentLike = {
  id?: string;
  creditCardId?: string | null;
  monthlyAmountCents: number;
  months: number;
  startDate: string;
  description?: string | null;
  totalAmountCents?: number;
};

export type LabeledCharge = {
  date: string;
  amountCents: number;
  label: string;
  kind: "purchase" | "msi";
  planId?: string;
  /** Source transaction id for non-MSI purchases (for edit/delete). */
  transactionId?: string;
};

export type CardPaymentSummary = {
  nextPayment: BillingCycle & { amountCents: number };
  followingPayment: BillingCycle & { amountCents: number };
  /** Calendar-month spend (kept for reference). */
  monthSpendCents: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseISODate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Clamp cut-off day to a real calendar day (e.g. 31 → 28/29/30). */
export function clampDay(y: number, m: number, day: number): number {
  return Math.min(Math.max(1, day), daysInMonth(y, m));
}

export function addDaysISO(iso: string, days: number): string {
  const { y, m, d } = parseISODate(iso);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toISO(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

export function addMonthsISO(iso: string, months: number): string {
  const { y, m, d } = parseISODate(iso);
  const dt = new Date(y, m - 1 + months, 1);
  const ny = dt.getFullYear();
  const nm = dt.getMonth() + 1;
  const nd = clampDay(ny, nm, d);
  return toISO(ny, nm, nd);
}

export function cutoffOn(y: number, m: number, cutoffDay: number): string {
  return toISO(y, m, clampDay(y, m, cutoffDay));
}

/** Last cut-off date on or before `asOf` (YYYY-MM-DD). */
export function lastCutoffOnOrBefore(asOf: string, cutoffDay: number): string {
  const { y, m, d } = parseISODate(asOf);
  const thisMonth = cutoffOn(y, m, cutoffDay);
  if (thisMonth <= asOf) return thisMonth;
  // previous month
  const dt = new Date(y, m - 2, 1); // month is 1-indexed; m-2 = previous
  return cutoffOn(dt.getFullYear(), dt.getMonth() + 1, cutoffDay);
}

/** First cut-off date strictly after `asOf`. */
export function nextCutoffAfter(asOf: string, cutoffDay: number): string {
  const { y, m } = parseISODate(asOf);
  const thisMonth = cutoffOn(y, m, cutoffDay);
  if (thisMonth > asOf) return thisMonth;
  const dt = new Date(y, m, 1); // next month
  return cutoffOn(dt.getFullYear(), dt.getMonth() + 1, cutoffDay);
}

/** Next cut-off on or after purchase date (purchase on cut day bills that cycle). */
export function cutoffForPurchase(purchaseDate: string, cutoffDay: number): string {
  const { y, m } = parseISODate(purchaseDate);
  const thisMonth = cutoffOn(y, m, cutoffDay);
  if (purchaseDate <= thisMonth) return thisMonth;
  const dt = new Date(y, m, 1);
  return cutoffOn(dt.getFullYear(), dt.getMonth() + 1, cutoffDay);
}

export function paymentDueForCutoff(cutoffDate: string, graceDays: number): string {
  return addDaysISO(cutoffDate, graceDays);
}

/** Inclusive cycle window that ends on `cutoffDate`. */
export function cycleWindow(cutoffDate: string, cutoffDay: number): {
  start: string;
  end: string;
} {
  const prev = lastCutoffOnOrBefore(addDaysISO(cutoffDate, -1), cutoffDay);
  return { start: addDaysISO(prev, 1), end: cutoffDate };
}

/**
 * The first upcoming payment cycle relative to `asOf`.
 * If the payment for the last closed cut-off is already past, advance one cycle.
 */
export function firstUpcomingBillingCycle(
  asOf: string,
  cutoffDay: number,
  graceDays: number
): BillingCycle {
  let c1 = lastCutoffOnOrBefore(asOf, cutoffDay);
  let p1 = paymentDueForCutoff(c1, graceDays);

  if (p1 < asOf) {
    c1 = nextCutoffAfter(c1, cutoffDay);
    p1 = paymentDueForCutoff(c1, graceDays);
  }

  const w1 = cycleWindow(c1, cutoffDay);
  return { start: w1.start, end: w1.end, paymentDue: p1 };
}

/**
 * The two upcoming payment cycles relative to `asOf`.
 * If the payment for the last closed cut-off is already past, advance one cycle.
 */
export function upcomingBillingCycles(
  asOf: string,
  cutoffDay: number,
  graceDays: number
): [BillingCycle, BillingCycle] {
  const first = firstUpcomingBillingCycle(asOf, cutoffDay, graceDays);
  const c2 = nextCutoffAfter(first.end, cutoffDay);
  const p2 = paymentDueForCutoff(c2, graceDays);
  const w2 = cycleWindow(c2, cutoffDay);

  return [
    first,
    { start: w2.start, end: w2.end, paymentDue: p2 },
  ];
}

/**
 * All billing cycles whose payment due date falls in `[asOf, untilDate]` (inclusive).
 */
export function billingCyclesThrough(
  asOf: string,
  untilDate: string,
  cutoffDay: number,
  graceDays: number
): BillingCycle[] {
  const cycles: BillingCycle[] = [];
  let cycle = firstUpcomingBillingCycle(asOf, cutoffDay, graceDays);
  // Safety cap (~5 years of monthly cuts)
  for (let i = 0; i < 60; i++) {
    if (cycle.paymentDue > untilDate) break;
    if (cycle.paymentDue >= asOf) {
      cycles.push(cycle);
    }
    const nextEnd = nextCutoffAfter(cycle.end, cutoffDay);
    const w = cycleWindow(nextEnd, cutoffDay);
    cycle = {
      start: w.start,
      end: w.end,
      paymentDue: paymentDueForCutoff(nextEnd, graceDays),
    };
  }
  return cycles;
}

/**
 * Expand installment plans into monthly charge dates.
 * The full purchase transaction is ignored when linked to a plan; only monthly
 * installments count toward each payment cycle.
 */
export function expandInstallmentCharges(
  plans: InstallmentLike[],
  creditCardId: string
): LabeledCharge[] {
  const out: LabeledCharge[] = [];
  for (const p of plans) {
    if (p.creditCardId !== creditCardId) continue;
    if (p.monthlyAmountCents <= 0 || p.months <= 0) continue;
    for (let i = 0; i < p.months; i++) {
      out.push({
        date: addMonthsISO(p.startDate, i),
        amountCents: p.monthlyAmountCents,
        label: p.description
          ? `MSI: ${p.description} (${i + 1}/${p.months})`
          : `MSI (${i + 1}/${p.months})`,
        kind: "msi",
        planId: p.id,
      });
    }
  }
  return out;
}

function sumInCycle(
  charges: { date: string; amountCents: number }[],
  cycle: BillingCycle
): number {
  let sum = 0;
  for (const c of charges) {
    if (c.date >= cycle.start && c.date <= cycle.end) {
      sum += c.amountCents;
    }
  }
  return sum;
}

/** Charges that hit a card statement: non-MSI purchases + MSI monthly installments. */
export function collectCardCharges(
  creditCardId: string,
  transactions: ChargeLike[],
  installments: InstallmentLike[]
): LabeledCharge[] {
  const charges: LabeledCharge[] = [];
  for (const t of transactions) {
    if (t.deletedAt) continue;
    if (t.type && t.type !== "expense") continue;
    // MSI principal is replaced by monthly installments
    if (t.installmentPlanId) continue;

    const label = t.description?.trim() || "Purchase";

    if (t.fundings && t.fundings.length > 0) {
      for (const f of t.fundings) {
        if (f.creditCardId === creditCardId && f.amountCents > 0) {
          charges.push({
            date: t.date,
            amountCents: f.amountCents,
            label,
            kind: "purchase",
            transactionId: t.id,
          });
        }
      }
      continue;
    }

    if (t.creditCardId !== creditCardId) continue;
    charges.push({
      date: t.date,
      amountCents: t.amountCents,
      label,
      kind: "purchase",
      transactionId: t.id,
    });
  }
  charges.push(...expandInstallmentCharges(installments, creditCardId));
  return charges;
}

/** Last charge date among plans for a card (for schedule horizon). */
export function lastInstallmentChargeDate(
  plans: InstallmentLike[],
  creditCardId: string
): string | null {
  let last: string | null = null;
  for (const p of plans) {
    if (p.creditCardId !== creditCardId || p.months <= 0) continue;
    const end = addMonthsISO(p.startDate, p.months - 1);
    if (!last || end > last) last = end;
  }
  return last;
}

export type PendingMsiSummary = {
  id: string;
  description: string;
  monthlyAmountCents: number;
  months: number;
  monthsLeft: number;
  remainingCents: number;
  startDate: string;
  nextChargeDate: string | null;
};

/** MSI installments still owed (charge date on/after asOf). */
export function pendingMsiForCard(
  plans: InstallmentLike[],
  creditCardId: string,
  asOf: string
): PendingMsiSummary[] {
  const out: PendingMsiSummary[] = [];
  for (const p of plans) {
    if (p.creditCardId !== creditCardId) continue;
    if (!p.id || p.months <= 0 || p.monthlyAmountCents <= 0) continue;
    let monthsLeft = 0;
    let nextChargeDate: string | null = null;
    for (let i = 0; i < p.months; i++) {
      const d = addMonthsISO(p.startDate, i);
      if (d >= asOf) {
        monthsLeft++;
        if (!nextChargeDate) nextChargeDate = d;
      }
    }
    if (monthsLeft <= 0) continue;
    out.push({
      id: p.id,
      description: p.description || "MSI",
      monthlyAmountCents: p.monthlyAmountCents,
      months: p.months,
      monthsLeft,
      remainingCents: monthsLeft * p.monthlyAmountCents,
      startDate: p.startDate,
      nextChargeDate,
    });
  }
  return out.sort((a, b) =>
    (a.nextChargeDate || "").localeCompare(b.nextChargeDate || "")
  );
}

export type PaymentLine = LabeledCharge & {
  /** Statement payment due that this charge lands on. */
  paymentDue: string;
};

export type DetailedCardPayment = BillingCycle & {
  amountCents: number;
  lines: PaymentLine[];
};

/**
 * Full pending payment schedule with line items (purchases + remaining MSI).
 * Horizon extends through the last MSI charge when needed.
 */
export function detailedCardPaymentSchedule(opts: {
  creditCardId: string;
  cutoffDay: number;
  graceDays: number;
  asOf: string;
  untilDate?: string;
  transactions: ChargeLike[];
  installments: InstallmentLike[];
}): {
  payments: DetailedCardPayment[];
  msiPending: PendingMsiSummary[];
  totalPendingCents: number;
} {
  const lastMsi = lastInstallmentChargeDate(
    opts.installments,
    opts.creditCardId
  );
  let until = opts.untilDate || addDaysISO(opts.asOf, 400);
  if (lastMsi) {
    const lastPay = paymentDueForCutoff(
      cutoffForPurchase(lastMsi, opts.cutoffDay),
      opts.graceDays
    );
    if (lastPay > until) until = lastPay;
  }

  const charges = collectCardCharges(
    opts.creditCardId,
    opts.transactions,
    opts.installments
  );
  const cycles = billingCyclesThrough(
    opts.asOf,
    until,
    opts.cutoffDay,
    opts.graceDays
  );

  const payments: DetailedCardPayment[] = [];
  for (const cycle of cycles) {
    const lines: PaymentLine[] = charges
      .filter((c) => c.date >= cycle.start && c.date <= cycle.end)
      .map((c) => ({ ...c, paymentDue: cycle.paymentDue }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const amountCents = lines.reduce((s, l) => s + l.amountCents, 0);
    if (amountCents <= 0) continue;
    payments.push({ ...cycle, amountCents, lines });
  }

  const msiPending = pendingMsiForCard(
    opts.installments,
    opts.creditCardId,
    opts.asOf
  );

  return {
    payments,
    msiPending,
    totalPendingCents: payments.reduce((s, p) => s + p.amountCents, 0),
  };
}

export type ScheduledCardPayment = BillingCycle & {
  amountCents: number;
  creditCardId: string;
  creditCardName: string;
};

/**
 * Schedule every non-zero payment due through `untilDate` for one card.
 * Recalculates from live purchases + MSI — no stored payment rows needed.
 */
export function listCardPayments(opts: {
  creditCardId: string;
  creditCardName: string;
  cutoffDay: number;
  graceDays: number;
  asOf: string;
  untilDate: string;
  transactions: ChargeLike[];
  installments: InstallmentLike[];
}): ScheduledCardPayment[] {
  const charges = collectCardCharges(
    opts.creditCardId,
    opts.transactions,
    opts.installments
  );
  const cycles = billingCyclesThrough(
    opts.asOf,
    opts.untilDate,
    opts.cutoffDay,
    opts.graceDays
  );
  return cycles
    .map((cycle) => ({
      ...cycle,
      amountCents: sumInCycle(charges, cycle),
      creditCardId: opts.creditCardId,
      creditCardName: opts.creditCardName,
    }))
    .filter((p) => p.amountCents > 0);
}

/**
 * Build payment summary for one card (next + following cycle).
 * - Non-MSI expenses: full amount on purchase date
 * - MSI: monthly installments only (linked full purchase is skipped)
 */
export function summarizeCardPayments(opts: {
  creditCardId: string;
  cutoffDay: number;
  graceDays: number;
  asOf: string;
  monthStart: string;
  monthEnd: string;
  transactions: ChargeLike[];
  installments: InstallmentLike[];
}): CardPaymentSummary {
  const {
    creditCardId,
    cutoffDay,
    graceDays,
    asOf,
    monthStart,
    monthEnd,
    transactions,
    installments,
  } = opts;

  const [next, following] = upcomingBillingCycles(asOf, cutoffDay, graceDays);
  const charges = collectCardCharges(creditCardId, transactions, installments);

  let monthSpendCents = 0;
  for (const t of transactions) {
    if (t.deletedAt) continue;
    if (t.type && t.type !== "expense") continue;
    if (t.date < monthStart || t.date > monthEnd) continue;
    if (t.fundings && t.fundings.length > 0) {
      for (const f of t.fundings) {
        if (f.creditCardId === creditCardId) monthSpendCents += f.amountCents;
      }
    } else if (t.creditCardId === creditCardId) {
      monthSpendCents += t.amountCents;
    }
  }

  return {
    nextPayment: {
      ...next,
      amountCents: sumInCycle(charges, next),
    },
    followingPayment: {
      ...following,
      amountCents: sumInCycle(charges, following),
    },
    monthSpendCents,
  };
}
