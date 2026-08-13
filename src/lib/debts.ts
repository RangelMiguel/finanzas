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
};

const DEFAULT_MAX_MONTHS = 600;
const DEFAULT_SCHEDULE = 6;

/** Project remaining interest and months if the monthly payment stays constant. */
export function amortizeDebt(opts: {
  remainingCents: number;
  monthlyPaymentCents: number;
  annualRatePercent: number;
  maxMonths?: number;
  scheduleMonths?: number;
}): AmortizationSummary {
  const remaining = Math.max(0, Math.round(opts.remainingCents));
  const payment = Math.max(0, Math.round(opts.monthlyPaymentCents));
  const maxMonths = opts.maxMonths ?? DEFAULT_MAX_MONTHS;
  const scheduleLimit = opts.scheduleMonths ?? DEFAULT_SCHEDULE;
  const next = suggestMonthlyDebtPay(opts);
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
    };
  }

  const schedule: AmortizationRow[] = [];
  if (payment <= firstInterest && firstInterest > 0) {
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
    };
  }

  let balance = remaining;
  let months = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  while (balance > 0 && months < maxMonths) {
    const interest = monthlyInterestCents(balance, opts.annualRatePercent);
    const capital = Math.min(balance, Math.max(0, payment - interest));
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
 * (or maxPayments is reached). Last payment may be smaller than monthly.
 * If the payment never reduces principal, fills remaining slots at the same amount.
 */
export function projectedDebtPaymentAmounts(opts: {
  remainingCents: number;
  monthlyPaymentCents: number;
  annualRatePercent: number;
  maxPayments: number;
}): number[] {
  let remaining = Math.max(0, Math.round(opts.remainingCents));
  const monthly = Math.max(0, Math.round(opts.monthlyPaymentCents));
  const maxPayments = Math.max(0, Math.round(opts.maxPayments));
  if (remaining <= 0 || monthly <= 0 || maxPayments <= 0) return [];

  const amounts: number[] = [];
  while (remaining > 0 && amounts.length < maxPayments) {
    const pay = suggestMonthlyDebtPay({
      remainingCents: remaining,
      monthlyPaymentCents: monthly,
      annualRatePercent: opts.annualRatePercent,
    });
    if (pay.totalCents <= 0) break;
    amounts.push(pay.totalCents);
    if (pay.capitalCents <= 0) {
      // Interest-only / underpayment: debt never clears; keep reserving the payment.
      while (amounts.length < maxPayments) amounts.push(pay.totalCents);
      break;
    }
    remaining -= pay.capitalCents;
  }
  return amounts;
}
