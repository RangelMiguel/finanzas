/** Suggested split for one monthly debt payment. No ledger movement until the user pays. */

export function monthlyInterestCents(
  remainingCents: number,
  annualRatePercent: number
): number {
  const remaining = Math.max(0, Math.round(remainingCents));
  const rate = Math.max(0, annualRatePercent || 0);
  return Math.round((remaining * rate) / 100 / 12);
}

export function suggestMonthlyDebtPay(opts: {
  remainingCents: number;
  monthlyPaymentCents: number;
  annualRatePercent: number;
}): { capitalCents: number; interestCents: number; totalCents: number } {
  const remaining = Math.max(0, Math.round(opts.remainingCents));
  const monthly = Math.max(0, Math.round(opts.monthlyPaymentCents));
  if (remaining <= 0) {
    return { capitalCents: 0, interestCents: 0, totalCents: 0 };
  }
  const interest = monthlyInterestCents(remaining, opts.annualRatePercent);
  const budget = monthly > 0 ? monthly : remaining + interest;
  const interestCents = Math.min(interest, budget);
  const capitalCents = Math.min(remaining, Math.max(0, budget - interestCents));
  return {
    capitalCents,
    interestCents,
    totalCents: capitalCents + interestCents,
  };
}

export type AmortizationRow = {
  month: number;
  interestCents: number;
  capitalCents: number;
  paymentCents: number;
  balanceCents: number;
};

export type AmortizationSummary = {
  next: { capitalCents: number; interestCents: number; totalCents: number };
  months: number;
  totalInterestCents: number;
  totalPaidCents: number;
  payoffOk: boolean;
  paymentCoversInterest: boolean;
  minPaymentCents: number;
  schedule: AmortizationRow[];
  /** True when a custom payment plan drives (part of) the schedule. */
  hasCustomPlan: boolean;
};

const DEFAULT_MAX_MONTHS = 600;
const DEFAULT_SCHEDULE = 6;

/** Normalize stored JSON into a list of positive payment amounts (cents). */
export function parsePaymentPlan(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const amounts: number[] = [];
  for (const item of raw) {
    const n =
      typeof item === "number"
        ? item
        : typeof item === "string" && item.trim() !== ""
          ? Number(item)
          : NaN;
    const cents = Number.isFinite(n) ? Math.round(n) : NaN;
    if (!Number.isFinite(cents) || cents <= 0) continue;
    amounts.push(cents);
  }
  return amounts.length > 0 ? amounts : null;
}

/** Coerce an array of cent amounts; drop non-positive. Empty → null. */
export function normalizePaymentPlanCents(
  amounts: number[] | null | undefined
): number[] | null {
  if (!amounts?.length) return null;
  const out = amounts
    .map((a) => Math.round(a))
    .filter((a) => Number.isFinite(a) && a > 0);
  return out.length > 0 ? out : null;
}

export function paymentPlanSumCents(plan: number[] | null | undefined): number {
  if (!plan?.length) return 0;
  return plan.reduce((s, a) => s + Math.max(0, Math.round(a)), 0);
}

/** Budget for installment index (0-based): custom plan first, then fixed monthly. */
export function paymentBudgetForStep(
  stepIndex: number,
  paymentPlanCents: number[] | null | undefined,
  monthlyPaymentCents: number
): number {
  const plan = normalizePaymentPlanCents(paymentPlanCents);
  if (plan && stepIndex < plan.length) return plan[stepIndex];
  return Math.max(0, Math.round(monthlyPaymentCents || 0));
}

/**
 * Drop the first remaining plan installment after a payment is recorded.
 * Leaves null when the plan is exhausted.
 */
export function consumePaymentPlanStep(
  paymentPlanCents: unknown
): number[] | null {
  const plan = parsePaymentPlan(paymentPlanCents);
  if (!plan?.length) return null;
  const rest = plan.slice(1);
  return rest.length > 0 ? rest : null;
}

export type DebtAmortizeOpts = {
  remainingCents: number;
  monthlyPaymentCents: number;
  annualRatePercent: number;
  /** Remaining planned cash amounts (cents), in order. */
  paymentPlanCents?: number[] | null;
  maxMonths?: number;
  scheduleMonths?: number;
};

/** Project remaining interest and months with fixed monthly and/or a custom plan. */
export function amortizeDebt(opts: DebtAmortizeOpts): AmortizationSummary {
  const remaining = Math.max(0, Math.round(opts.remainingCents));
  const monthly = Math.max(0, Math.round(opts.monthlyPaymentCents));
  const plan = normalizePaymentPlanCents(opts.paymentPlanCents);
  const hasCustomPlan = !!(plan && plan.length > 0);
  const maxMonths = opts.maxMonths ?? DEFAULT_MAX_MONTHS;
  const scheduleLimit = opts.scheduleMonths ?? DEFAULT_SCHEDULE;
  const firstBudget = paymentBudgetForStep(0, plan, monthly);
  const next = suggestMonthlyDebtPay({
    remainingCents: remaining,
    monthlyPaymentCents: firstBudget,
    annualRatePercent: opts.annualRatePercent,
  });
  const firstInterest = monthlyInterestCents(remaining, opts.annualRatePercent);
  const minPaymentCents = firstInterest + 1;

  if (remaining <= 0) {
    return {
      next,
      months: 0,
      totalInterestCents: 0,
      totalPaidCents: 0,
      payoffOk: true,
      paymentCoversInterest: true,
      minPaymentCents: 0,
      schedule: [],
      hasCustomPlan,
    };
  }

  const schedule: AmortizationRow[] = [];
  if (firstBudget <= firstInterest && firstInterest > 0) {
    schedule.push({
      month: 1,
      interestCents: firstInterest,
      capitalCents: next.capitalCents,
      paymentCents: next.totalCents,
      balanceCents: remaining - next.capitalCents,
    });
    return {
      next,
      months: maxMonths,
      totalInterestCents: 0,
      totalPaidCents: 0,
      payoffOk: false,
      paymentCoversInterest: false,
      minPaymentCents,
      schedule,
      hasCustomPlan,
    };
  }

  let balance = remaining;
  let months = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  while (balance > 0 && months < maxMonths) {
    const budget = paymentBudgetForStep(months, plan, monthly);
    if (budget <= 0) {
      // Plan exhausted and no fixed monthly — cannot finish.
      return {
        next,
        months,
        totalInterestCents: totalInterest,
        totalPaidCents: totalPaid,
        payoffOk: false,
        paymentCoversInterest: true,
        minPaymentCents,
        schedule,
        hasCustomPlan,
      };
    }
    const interest = monthlyInterestCents(balance, opts.annualRatePercent);
    const capital = Math.min(balance, Math.max(0, budget - interest));
    if (capital <= 0) {
      return {
        next,
        months: maxMonths,
        totalInterestCents: totalInterest,
        totalPaidCents: totalPaid,
        payoffOk: false,
        paymentCoversInterest: false,
        minPaymentCents: interest + 1,
        schedule,
        hasCustomPlan,
      };
    }
    const actual = capital + interest;
    balance -= capital;
    totalInterest += interest;
    totalPaid += actual;
    months += 1;
    if (schedule.length < scheduleLimit) {
      schedule.push({
        month: months,
        interestCents: interest,
        capitalCents: capital,
        paymentCents: actual,
        balanceCents: balance,
      });
    }
  }

  return {
    next,
    months,
    totalInterestCents: totalInterest,
    totalPaidCents: totalPaid,
    payoffOk: balance <= 0,
    paymentCoversInterest: true,
    minPaymentCents,
    schedule,
    hasCustomPlan,
  };
}

export function splitDuration(totalMonths: number): {
  years: number;
  months: number;
  totalMonths: number;
} {
  const t = Math.max(0, Math.round(totalMonths));
  return { years: Math.floor(t / 12), months: t % 12, totalMonths: t };
}

/**
 * Project cash amounts for future debt payments until principal is paid off
 * (or maxPayments is reached). Uses custom plan installments first, then
 * fixed monthly. Last payment may be smaller than the budget.
 */
export function projectedDebtPaymentAmounts(opts: {
  remainingCents: number;
  monthlyPaymentCents: number;
  annualRatePercent: number;
  maxPayments: number;
  paymentPlanCents?: number[] | null;
}): number[] {
  let remaining = Math.max(0, Math.round(opts.remainingCents));
  const monthly = Math.max(0, Math.round(opts.monthlyPaymentCents));
  const plan = normalizePaymentPlanCents(opts.paymentPlanCents);
  const maxPayments = Math.max(0, Math.round(opts.maxPayments));
  if (remaining <= 0 || maxPayments <= 0) return [];
  if (!plan?.length && monthly <= 0) return [];

  const amounts: number[] = [];
  let step = 0;
  while (remaining > 0 && amounts.length < maxPayments) {
    const budget = paymentBudgetForStep(step, plan, monthly);
    if (budget <= 0) break;
    const pay = suggestMonthlyDebtPay({
      remainingCents: remaining,
      monthlyPaymentCents: budget,
      annualRatePercent: opts.annualRatePercent,
    });
    if (pay.totalCents <= 0) break;
    amounts.push(pay.totalCents);
    if (pay.capitalCents <= 0) {
      // Interest-only / underpayment: keep reserving this budget for the window.
      while (amounts.length < maxPayments) amounts.push(pay.totalCents);
      break;
    }
    remaining -= pay.capitalCents;
    step += 1;
  }
  return amounts;
}
