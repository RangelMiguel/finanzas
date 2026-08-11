/** Suggested split for one monthly debt payment. No ledger movement until the user pays. */

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
  const interest = Math.round(
    remaining * (Math.max(0, opts.annualRatePercent) / 100) / 12
  );
  const budget = monthly > 0 ? monthly : remaining + interest;
  const interestCents = Math.min(interest, budget);
  const capitalCents = Math.min(remaining, Math.max(0, budget - interestCents));
  return {
    capitalCents,
    interestCents,
    totalCents: capitalCents + interestCents,
  };
}
