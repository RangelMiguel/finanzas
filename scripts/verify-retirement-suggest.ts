/**
 * Pure checks for how surplus and desired income are derived.
 * DB path is covered by the API; this guards the arithmetic contract.
 */
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function derive(opts: {
  monthlyIncomeCents: number;
  monthlyBudgetCents: number;
  replacementPercent: number;
}) {
  const monthlySurplusCents = Math.max(
    0,
    opts.monthlyIncomeCents - opts.monthlyBudgetCents
  );
  const currentAnnualIncomeCents = opts.monthlyIncomeCents * 12;
  const desiredAnnualIncomeCents = Math.round(
    (currentAnnualIncomeCents * opts.replacementPercent) / 100
  );
  return {
    monthlySurplusCents,
    currentAnnualIncomeCents,
    desiredAnnualIncomeCents,
    monthlyContributionCents: monthlySurplusCents,
  };
}

const a = derive({
  monthlyIncomeCents: 50_000_00,
  monthlyBudgetCents: 30_000_00,
  replacementPercent: 70,
});
assert(a.monthlyContributionCents === 20_000_00, "surplus 20k");
assert(a.currentAnnualIncomeCents === 600_000_00, "annual income");
assert(a.desiredAnnualIncomeCents === 420_000_00, "70% replacement");

const tight = derive({
  monthlyIncomeCents: 10_000_00,
  monthlyBudgetCents: 12_000_00,
  replacementPercent: 70,
});
assert(tight.monthlyContributionCents === 0, "no negative contrib");

console.log("verify-retirement-suggest: ok");
