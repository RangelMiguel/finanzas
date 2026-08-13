import {
  amortizeDebt,
  consumePaymentPlanStep,
  parsePaymentPlan,
  paymentPlanSumCents,
  projectedDebtPaymentAmounts,
  suggestMonthlyDebtPay,
} from "../src/lib/debts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// $5000 debt, $1000/mo, 0% interest → exactly 5 payments, then stop
const five = projectedDebtPaymentAmounts({
  remainingCents: 500_000,
  monthlyPaymentCents: 100_000,
  annualRatePercent: 0,
  maxPayments: 24,
});
assert(five.length === 5, `expected 5 payments, got ${five.length}`);
assert(
  five.every((a) => a === 100_000),
  "each payment should be 1000"
);
assert(
  five.reduce((s, a) => s + a, 0) === 500_000,
  "total paid should equal principal"
);

// Last payment smaller when remainder < monthly
const partial = projectedDebtPaymentAmounts({
  remainingCents: 250_000,
  monthlyPaymentCents: 100_000,
  annualRatePercent: 0,
  maxPayments: 12,
});
assert(partial.length === 3, `expected 3 payments, got ${partial.length}`);
assert(partial[0] === 100_000 && partial[1] === 100_000, "first two full");
assert(partial[2] === 50_000, "last payment is remainder");

// Already paid off → no future payments
assert(
  projectedDebtPaymentAmounts({
    remainingCents: 0,
    monthlyPaymentCents: 100_000,
    annualRatePercent: 0,
    maxPayments: 12,
  }).length === 0,
  "zero remaining"
);

// Caps at maxPayments even if debt lasts longer
const capped = projectedDebtPaymentAmounts({
  remainingCents: 1_000_000,
  monthlyPaymentCents: 100_000,
  annualRatePercent: 0,
  maxPayments: 3,
});
assert(capped.length === 3, "respect maxPayments");

// Underpayment with interest: still reserves monthly within the window
const under = projectedDebtPaymentAmounts({
  remainingCents: 100_000,
  monthlyPaymentCents: 50,
  annualRatePercent: 120, // 10%/mo interest on 1000 = 100
  maxPayments: 4,
});
assert(under.length === 4, "underpayment still projects for window");
assert(
  under.every((a) => a === 50),
  "underpayment uses the monthly budget"
);

// Amortization agrees on month count for 5000/1000
const plan = amortizeDebt({
  remainingCents: 500_000,
  monthlyPaymentCents: 100_000,
  annualRatePercent: 0,
});
assert(plan.months === 5 && plan.payoffOk, "amortize 5 months");
assert(!plan.hasCustomPlan, "no custom plan");

const next = suggestMonthlyDebtPay({
  remainingCents: 50_000,
  monthlyPaymentCents: 100_000,
  annualRatePercent: 0,
});
assert(next.totalCents === 50_000 && next.capitalCents === 50_000, "last pay");

// Custom plan: 3×1000 + 1×2000 on $5000
const custom = [100_000, 100_000, 100_000, 200_000];
assert(paymentPlanSumCents(custom) === 500_000, "custom plan sum");
const customProj = projectedDebtPaymentAmounts({
  remainingCents: 500_000,
  monthlyPaymentCents: 0,
  annualRatePercent: 0,
  paymentPlanCents: custom,
  maxPayments: 24,
});
assert(customProj.length === 4, `custom proj length ${customProj.length}`);
assert(
  JSON.stringify(customProj) === JSON.stringify(custom),
  "custom proj amounts"
);

const customAm = amortizeDebt({
  remainingCents: 500_000,
  monthlyPaymentCents: 0,
  annualRatePercent: 0,
  paymentPlanCents: custom,
  scheduleMonths: 12,
});
assert(customAm.payoffOk && customAm.months === 4, "custom amortize 4 mo");
assert(customAm.hasCustomPlan, "has custom plan flag");
assert(customAm.schedule.length === 4, "full custom schedule");
assert(customAm.schedule[3].paymentCents === 200_000, "last step 2000");
assert(customAm.next.totalCents === 100_000, "next is first plan step");

// After first payment, remaining plan advances
const afterOne = consumePaymentPlanStep(custom);
assert(
  JSON.stringify(afterOne) === JSON.stringify([100_000, 100_000, 200_000]),
  "consume first step"
);
assert(consumePaymentPlanStep([50_000]) === null, "last step clears plan");
assert(parsePaymentPlan(null) === null, "null plan");
assert(
  JSON.stringify(parsePaymentPlan([100, 200])) === JSON.stringify([100, 200]),
  "parse plan"
);

// Custom plan then fixed monthly fallback
const withFallback = projectedDebtPaymentAmounts({
  remainingCents: 350_000,
  monthlyPaymentCents: 50_000,
  annualRatePercent: 0,
  paymentPlanCents: [100_000, 100_000],
  maxPayments: 12,
});
assert(withFallback.length === 5, `fallback length ${withFallback.length}`);
assert(withFallback[0] === 100_000 && withFallback[1] === 100_000, "plan first");
assert(
  withFallback[2] === 50_000 && withFallback[4] === 50_000,
  "then monthly"
);

console.log("verify-debts: ok");
