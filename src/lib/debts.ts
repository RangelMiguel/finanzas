/**
 * Debt interest and amortization.
 * Interest methods match common bank loan systems:
 * - french: declining balance (cuota fija / French system) — default
 * - german: fixed principal each period (German system)
 * - flat: interest always on original principal (flat / global rate)
 * - interest_only: interest on remaining; principal only if payment exceeds interest
 * - simple_daily: simple daily interest on remaining (balance × rate × days / 365)
 */

export const DEBT_INTEREST_METHODS = [
  "french",
  "german",
  "flat",
  "interest_only",
  "simple_daily",
] as const;

export type DebtInterestMethod = (typeof DEBT_INTEREST_METHODS)[number];

/** Default accrual window when projecting a monthly installment without calendar dates. */
export const DEFAULT_PERIOD_DAYS = 30;

export function parseInterestMethod(raw: unknown): DebtInterestMethod {
  if (typeof raw === "string" && (DEBT_INTEREST_METHODS as readonly string[]).includes(raw)) {
    return raw as DebtInterestMethod;
  }
  return "french";
}

/** Monthly interest on a base balance: base × annual% / 100 / 12 (nearest cent). */
export function monthlyInterestCents(
  baseCents: number,
  annualRatePercent: number
): number {
  const base = Math.max(0, Math.round(baseCents));
  const rate = Math.max(0, annualRatePercent || 0);
  return Math.round((base * rate) / 100 / 12);
}

/**
 * Simple daily interest (Actual/365): base × annual% / 100 × days / 365.
 * Does not compound within the period.
 */
export function simpleDailyInterestCents(
  baseCents: number,
  annualRatePercent: number,
  days: number
): number {
  const base = Math.max(0, Math.round(baseCents));
  const rate = Math.max(0, annualRatePercent || 0);
  const d = Math.max(0, Math.round(days));
  if (base <= 0 || rate <= 0 || d <= 0) return 0;
  return Math.round((base * rate * d) / 100 / 365);
}

/** Calendar days from `fromISO` to `toISO` (YYYY-MM-DD), never negative. */
export function daysBetweenISO(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T12:00:00").getTime();
  const b = new Date(toISO + "T12:00:00").getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return DEFAULT_PERIOD_DAYS;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * Interest due this period for the chosen bank method.
 * @param remainingCents Current unpaid principal
 * @param originalPrincipalCents Financed amount (used by flat rate)
 * @param daysInPeriod Accrual days (used by simple_daily; default 30)
 */
export function periodInterestCents(opts: {
  method?: DebtInterestMethod | string | null;
  remainingCents: number;
  originalPrincipalCents?: number;
  annualRatePercent: number;
  daysInPeriod?: number;
}): number {
  const method = parseInterestMethod(opts.method);
  const remaining = Math.max(0, Math.round(opts.remainingCents));
  if (remaining <= 0) return 0;
  const original = Math.max(
    remaining,
    Math.round(opts.originalPrincipalCents ?? remaining)
  );
  switch (method) {
    case "flat":
      // Flat / global: interest charged on the original principal every month.
      return monthlyInterestCents(original, opts.annualRatePercent);
    case "simple_daily": {
      const days =
        opts.daysInPeriod != null && opts.daysInPeriod > 0
          ? Math.round(opts.daysInPeriod)
          : DEFAULT_PERIOD_DAYS;
      return simpleDailyInterestCents(remaining, opts.annualRatePercent, days);
    }
    case "french":
    case "german":
    case "interest_only":
    default:
      // Declining balance (saldo insoluto), monthly rate = annual / 12.
      return monthlyInterestCents(remaining, opts.annualRatePercent);
  }
}

export type DebtPaySplit = {
  capitalCents: number;
  interestCents: number;
  totalCents: number;
};

/**
 * Split one payment into interest + capital for the selected method.
 *
 * - french / flat / interest_only / simple_daily: `monthlyPaymentCents` is total cash budget
 * - german: `monthlyPaymentCents` is the fixed principal portion; total = capital + interest
 */
export function suggestMonthlyDebtPay(opts: {
  remainingCents: number;
  monthlyPaymentCents: number;
  annualRatePercent: number;
  method?: DebtInterestMethod | string | null;
  originalPrincipalCents?: number;
  /** Days in this accrual window (simple_daily). Defaults to 30. */
  daysInPeriod?: number;
}): DebtPaySplit {
  const remaining = Math.max(0, Math.round(opts.remainingCents));
  const method = parseInterestMethod(opts.method);
  if (remaining <= 0) {
    return { capitalCents: 0, interestCents: 0, totalCents: 0 };
  }

  const interest = periodInterestCents({
    method,
    remainingCents: remaining,
    originalPrincipalCents: opts.originalPrincipalCents,
    annualRatePercent: opts.annualRatePercent,
    daysInPeriod: opts.daysInPeriod,
  });

  if (method === "german") {
    // Fixed capital amortization; payment grows/shrinks with interest.
    const capitalTarget = Math.max(0, Math.round(opts.monthlyPaymentCents));
    const capitalCents = Math.min(remaining, capitalTarget);
    return {
      capitalCents,
      interestCents: interest,
      totalCents: capitalCents + interest,
    };
  }

  // french / flat / interest_only / simple_daily: budget is total cash out.
  const monthly = Math.max(0, Math.round(opts.monthlyPaymentCents));
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
  next: DebtPaySplit;
  months: number;
  totalInterestCents: number;
  totalPaidCents: number;
  payoffOk: boolean;
  paymentCoversInterest: boolean;
  minPaymentCents: number;
  schedule: AmortizationRow[];
  /** True when a custom payment plan drives (part of) the schedule. */
  hasCustomPlan: boolean;
  method: DebtInterestMethod;
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

/**
 * How a custom plan fares against principal + interest (not just cash sum vs principal).
 * A plan that only sums to the principal can still leave a balance once interest is taken.
 */
export function planCoverageFromAmortization(opts: {
  remainingCents: number;
  planSumCents: number;
  amortization: Pick<
    AmortizationSummary,
    "payoffOk" | "schedule" | "totalInterestCents" | "totalPaidCents"
  >;
}): {
  planSumCents: number;
  principalCents: number;
  remainingAfterCents: number;
  totalInterestCents: number;
  totalPaidCents: number;
  payoffOk: boolean;
  /** Cash sum is less than principal (ignores interest). */
  cashBelowPrincipal: boolean;
  /** Cash sum >= principal but interest still leaves a balance. */
  interestShortfall: boolean;
} {
  const principal = Math.max(0, Math.round(opts.remainingCents));
  const planSum = Math.max(0, Math.round(opts.planSumCents));
  const am = opts.amortization;
  const remainingAfter = am.payoffOk
    ? 0
    : am.schedule.length > 0
      ? Math.max(0, am.schedule[am.schedule.length - 1].balanceCents)
      : principal;
  return {
    planSumCents: planSum,
    principalCents: principal,
    remainingAfterCents: remainingAfter,
    totalInterestCents: am.totalInterestCents,
    totalPaidCents: am.totalPaidCents,
    payoffOk: am.payoffOk && remainingAfter <= 0,
    cashBelowPrincipal: planSum < principal,
    interestShortfall: planSum >= principal && remainingAfter > 0,
  };
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
  method?: DebtInterestMethod | string | null;
  /** Original financed principal (flat rate base). Defaults to remaining. */
  originalPrincipalCents?: number;
  /** Remaining planned cash/capital amounts (cents), in order. */
  paymentPlanCents?: number[] | null;
  /** Days per installment for simple_daily (single value or per-step). Default 30. */
  daysInPeriod?: number | number[];
  maxMonths?: number;
  scheduleMonths?: number;
};

function daysForStep(
  stepIndex: number,
  daysInPeriod?: number | number[]
): number {
  if (Array.isArray(daysInPeriod)) {
    const d = daysInPeriod[stepIndex];
    if (d != null && d > 0) return Math.round(d);
    if (daysInPeriod.length > 0) {
      const last = daysInPeriod[daysInPeriod.length - 1];
      if (last != null && last > 0) return Math.round(last);
    }
    return DEFAULT_PERIOD_DAYS;
  }
  if (daysInPeriod != null && daysInPeriod > 0) return Math.round(daysInPeriod);
  return DEFAULT_PERIOD_DAYS;
}

function emptySummary(
  next: DebtPaySplit,
  extras: Partial<AmortizationSummary> & {
    method: DebtInterestMethod;
    hasCustomPlan: boolean;
  }
): AmortizationSummary {
  return {
    next,
    months: 0,
    totalInterestCents: 0,
    totalPaidCents: 0,
    payoffOk: true,
    paymentCoversInterest: true,
    minPaymentCents: 0,
    schedule: [],
    ...extras,
  };
}

/** Project remaining interest and months with fixed monthly and/or a custom plan. */
export function amortizeDebt(opts: DebtAmortizeOpts): AmortizationSummary {
  const remaining = Math.max(0, Math.round(opts.remainingCents));
  const monthly = Math.max(0, Math.round(opts.monthlyPaymentCents));
  const plan = normalizePaymentPlanCents(opts.paymentPlanCents);
  const hasCustomPlan = !!(plan && plan.length > 0);
  const method = parseInterestMethod(opts.method);
  const originalPrincipalCents = Math.max(
    remaining,
    Math.round(opts.originalPrincipalCents ?? remaining)
  );
  const maxMonths = opts.maxMonths ?? DEFAULT_MAX_MONTHS;
  const scheduleLimit = opts.scheduleMonths ?? DEFAULT_SCHEDULE;
  const firstBudget = paymentBudgetForStep(0, plan, monthly);
  const firstDays = daysForStep(0, opts.daysInPeriod);
  const next = suggestMonthlyDebtPay({
    remainingCents: remaining,
    monthlyPaymentCents: firstBudget,
    annualRatePercent: opts.annualRatePercent,
    method,
    originalPrincipalCents,
    daysInPeriod: firstDays,
  });
  const firstInterest = periodInterestCents({
    method,
    remainingCents: remaining,
    originalPrincipalCents,
    annualRatePercent: opts.annualRatePercent,
    daysInPeriod: firstDays,
  });
  // Minimum cash that reduces principal by at least 1 cent.
  const minPaymentCents =
    method === "german" ? 1 : firstInterest + 1;

  if (remaining <= 0) {
    return emptySummary(next, {
      method,
      hasCustomPlan,
      payoffOk: true,
      paymentCoversInterest: true,
      minPaymentCents: 0,
    });
  }

  const schedule: AmortizationRow[] = [];

  // Underpayment: cash budget never covers interest (non-german total-budget methods).
  if (
    method !== "german" &&
    firstBudget > 0 &&
    firstBudget <= firstInterest &&
    firstInterest > 0 &&
    next.capitalCents <= 0
  ) {
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
      method,
    };
  }

  let balance = remaining;
  let months = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  while (balance > 0 && months < maxMonths) {
    const budget = paymentBudgetForStep(months, plan, monthly);
    if (budget <= 0 && method !== "german") {
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
        method,
      };
    }
    // German with 0 budget and no plan: cannot continue.
    if (method === "german" && budget <= 0) {
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
        method,
      };
    }

    const stepDays = daysForStep(months, opts.daysInPeriod);
    const pay = suggestMonthlyDebtPay({
      remainingCents: balance,
      monthlyPaymentCents: budget,
      annualRatePercent: opts.annualRatePercent,
      method,
      originalPrincipalCents,
      daysInPeriod: stepDays,
    });
    if (pay.capitalCents <= 0) {
      return {
        next,
        months: maxMonths,
        totalInterestCents: totalInterest,
        totalPaidCents: totalPaid,
        payoffOk: false,
        paymentCoversInterest: false,
        minPaymentCents:
          method === "german"
            ? 1
            : periodInterestCents({
                method,
                remainingCents: balance,
                originalPrincipalCents,
                annualRatePercent: opts.annualRatePercent,
                daysInPeriod: stepDays,
              }) + 1,
        schedule,
        hasCustomPlan,
        method,
      };
    }
    balance -= pay.capitalCents;
    totalInterest += pay.interestCents;
    totalPaid += pay.totalCents;
    months += 1;
    if (schedule.length < scheduleLimit) {
      schedule.push({
        month: months,
        interestCents: pay.interestCents,
        capitalCents: pay.capitalCents,
        paymentCents: pay.totalCents,
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
    method,
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
  method?: DebtInterestMethod | string | null;
  originalPrincipalCents?: number;
  /** Days per step for simple_daily (single value or per payment date). */
  daysInPeriod?: number | number[];
}): number[] {
  let remaining = Math.max(0, Math.round(opts.remainingCents));
  const monthly = Math.max(0, Math.round(opts.monthlyPaymentCents));
  const plan = normalizePaymentPlanCents(opts.paymentPlanCents);
  const method = parseInterestMethod(opts.method);
  const originalPrincipalCents = Math.max(
    remaining,
    Math.round(opts.originalPrincipalCents ?? remaining)
  );
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
      method,
      originalPrincipalCents,
      daysInPeriod: daysForStep(step, opts.daysInPeriod),
    });
    if (pay.totalCents <= 0) break;
    amounts.push(pay.totalCents);
    if (pay.capitalCents <= 0) {
      // Interest-only / underpayment: keep reserving this cash for the window.
      while (amounts.length < maxPayments) amounts.push(pay.totalCents);
      break;
    }
    remaining -= pay.capitalCents;
    step += 1;
  }
  return amounts;
}
