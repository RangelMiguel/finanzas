import {
  amortizeDebt,
  consumePaymentPlanStep,
  parsePaymentPlan,
  paymentPlanSumCents,
  periodInterestCents,
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
assert(plan.method === "french", "default french");

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

// —— Interest methods ——
// French: interest on remaining $1000 @ 12% = $10
assert(
  periodInterestCents({
    method: "french",
    remainingCents: 100_000,
    originalPrincipalCents: 500_000,
    annualRatePercent: 12,
  }) === 1_000,
  "french interest on remaining"
);

// Flat: interest on original $5000 @ 12% = $50 even if remaining is $1000
assert(
  periodInterestCents({
    method: "flat",
    remainingCents: 100_000,
    originalPrincipalCents: 500_000,
    annualRatePercent: 12,
  }) === 5_000,
  "flat interest on original"
);

// French split: $100 payment, $10 interest → $90 capital
const frenchPay = suggestMonthlyDebtPay({
  remainingCents: 100_000,
  monthlyPaymentCents: 10_000,
  annualRatePercent: 12,
  method: "french",
  originalPrincipalCents: 100_000,
});
assert(frenchPay.interestCents === 1_000, "french interest split");
assert(frenchPay.capitalCents === 9_000, "french capital split");
assert(frenchPay.totalCents === 10_000, "french total");

// German: monthly amount is capital; total = capital + interest
const germanPay = suggestMonthlyDebtPay({
  remainingCents: 100_000,
  monthlyPaymentCents: 10_000, // capital
  annualRatePercent: 12,
  method: "german",
});
assert(germanPay.capitalCents === 10_000, "german capital fixed");
assert(germanPay.interestCents === 1_000, "german interest on remaining");
assert(germanPay.totalCents === 11_000, "german total = capital + interest");

// German amortization: $5000, $1000 capital/mo, 0% → 5 equal total payments of 1000
const germanAm = amortizeDebt({
  remainingCents: 500_000,
  monthlyPaymentCents: 100_000,
  annualRatePercent: 0,
  method: "german",
});
assert(germanAm.months === 5 && germanAm.payoffOk, "german payoff");
assert(germanAm.method === "german", "german method flag");

// Flat amortization costs more interest than french for same cash budget
const frenchCost = amortizeDebt({
  remainingCents: 100_000,
  monthlyPaymentCents: 20_000,
  annualRatePercent: 24,
  method: "french",
  originalPrincipalCents: 100_000,
  scheduleMonths: 12,
});
const flatCost = amortizeDebt({
  remainingCents: 100_000,
  monthlyPaymentCents: 20_000,
  annualRatePercent: 24,
  method: "flat",
  originalPrincipalCents: 100_000,
  scheduleMonths: 12,
});
assert(flatCost.payoffOk && frenchCost.payoffOk, "both pay off");
assert(
  flatCost.totalInterestCents > frenchCost.totalInterestCents,
  `flat (${flatCost.totalInterestCents}) should cost more than french (${frenchCost.totalInterestCents})`
);

// Interest-only: payment equal to interest → no principal reduction
const io = suggestMonthlyDebtPay({
  remainingCents: 100_000,
  monthlyPaymentCents: 1_000, // exactly interest at 12%
  annualRatePercent: 12,
  method: "interest_only",
});
assert(io.interestCents === 1_000 && io.capitalCents === 0, "interest only");

// German projection: cash amounts include interest
const germanProj = projectedDebtPaymentAmounts({
  remainingCents: 100_000,
  monthlyPaymentCents: 50_000,
  annualRatePercent: 12,
  method: "german",
  maxPayments: 3,
});
assert(germanProj.length === 2, "german two capital steps of 500");
assert(germanProj[0] === 50_000 + 1_000, "first german payment capital+int");
assert(germanProj[1] === 50_000 + 500, "second after balance drop");

console.log("verify-debts: ok");
