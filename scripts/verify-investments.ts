import { INVESTMENT_OPTIONS } from "../src/lib/investments/catalog";
import {
  afterTaxReturnPercent,
  clampTaxPercent,
  horizonFit,
  preTaxReturn,
  recommendInvestments,
  riskFit,
} from "../src/lib/investments/recommend";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(clampTaxPercent(-4) === 0, "tax floor");
assert(clampTaxPercent(40) === 35, "tax cap");
assert(clampTaxPercent(30) === 30, "tax mid");

const cetes = INVESTMENT_OPTIONS.find((o) => o.id === "mx-cetes-28")!;
const etf = INVESTMENT_OPTIONS.find((o) => o.id === "mx-ipc-etf")!;
const afore = INVESTMENT_OPTIONS.find((o) => o.id === "mx-afore-vol")!;
const fibra = INVESTMENT_OPTIONS.find((o) => o.id === "mx-fibra")!;

const live = preTaxReturn(cetes, { "mx-cetes-28": 8.25 });
assert(live === 8.25, "live rate overlay");
assert(preTaxReturn(cetes, {}) === cetes.expectedReturnPercent, "fallback seed");

const bank = INVESTMENT_OPTIONS.find((o) => o.id === "mx-pagare")!;
assert(
  Math.abs(preTaxReturn(bank, { "mx-banxico-target": 7.5 }) - 7.1) < 1e-9,
  "pagaré under policy rate"
);

const intTax = afterTaxReturnPercent(cetes, 10, 30);
assert(Math.abs(intTax.afterTax - 7) < 1e-9, "interest 10% * 0.7");
assert(Math.abs(intTax.taxDrag - 3) < 1e-9, "interest drag 3");

const gainTax = afterTaxReturnPercent(etf, 10, 30);
assert(Math.abs(gainTax.afterTax - 9) < 1e-9, "listed 10% ISR not marginal");
assert(Math.abs(gainTax.taxDrag - 1) < 1e-9, "10% of 10 is 1");

const def = afterTaxReturnPercent(afore, 8, 30);
assert(def.afterTax === 8 && def.taxDrag === 0, "deferred has no current tax");

const fi = afterTaxReturnPercent(fibra, 10, 30);
// 10 * (1 - 0.7 * 0.30) = 10 * 0.79 = 7.9
assert(Math.abs(fi.afterTax - 7.9) < 1e-9, "fibra taxable share");

assert(riskFit("low", "low") === 1, "same risk");
assert(riskFit("high", "low") === 0.35, "two steps");
assert(riskFit("medium", "low") === 0.72, "one step");

assert(horizonFit(etf, 0.5) < 0.5, "high risk short horizon");
assert(horizonFit(cetes, 0.5) === 1, "cetes ok short");
assert(horizonFit(afore, 2) < 1, "afore wants 5y");
assert(horizonFit(etf, 8) === 1, "long equity ok");

const conservative = recommendInvestments({
  risk: "low",
  horizonYears: 1,
  amountCents: 100_000_00,
  marginalTaxPercent: 30,
});
assert(conservative[0].risk === "low", `low risk wins, got ${conservative[0].id}`);
assert(
  conservative.find((r) => r.id === "mx-cetes-28")!.score >
    conservative.find((r) => r.id === "mx-ipc-etf")!.score,
  "cetes beats IPC for cautious 1y"
);

const aggressive = recommendInvestments({
  risk: "high",
  horizonYears: 10,
  amountCents: 100_000_00,
  marginalTaxPercent: 30,
});
assert(
  aggressive[0].risk === "high",
  `long aggressive prefers equity, got ${aggressive[0].id}`
);
assert(
  aggressive.find((r) => r.id === "mx-ipc-etf")!.afterTaxPercent >
    aggressive.find((r) => r.id === "mx-cetes-28")!.afterTaxPercent,
  "equity after-tax > cetes when horizon allows"
);

const rich = recommendInvestments({
  risk: "low",
  horizonYears: 2,
  amountCents: 50_000_00,
  marginalTaxPercent: 35,
});
const poor = recommendInvestments({
  risk: "low",
  horizonYears: 2,
  amountCents: 50_000_00,
  marginalTaxPercent: 0,
});
assert(
  rich.find((r) => r.id === "mx-cetes-28")!.afterTaxPercent <
    poor.find((r) => r.id === "mx-cetes-28")!.afterTaxPercent,
  "higher bracket hurts interest products"
);
assert(
  Math.abs(
    rich.find((r) => r.id === "mx-ipc-etf")!.afterTaxPercent -
      poor.find((r) => r.id === "mx-ipc-etf")!.afterTaxPercent
  ) < 1e-9,
  "listed equity tax is flat 10%, not marginal"
);

const ranked = recommendInvestments({
  risk: "medium",
  horizonYears: 5,
  amountCents: 10_000_00,
  marginalTaxPercent: 30,
  liveRates: { "mx-cetes-28": 20 },
});
assert(
  ranked.find((r) => r.id === "mx-cetes-28")!.preTaxPercent === 20,
  "live cetes 20%"
);

const gain = conservative.find((r) => r.id === "mx-cetes-28")!;
assert(gain.estimatedGainCents > 0, "gain on 100k");
assert(gain.estimatedTaxCents > 0, "tax on interest");

assert(INVESTMENT_OPTIONS.length >= 8, "enough options");
assert(
  new Set(INVESTMENT_OPTIONS.map((o) => o.id)).size === INVESTMENT_OPTIONS.length,
  "unique ids"
);

console.log("verify-investments: ok");
