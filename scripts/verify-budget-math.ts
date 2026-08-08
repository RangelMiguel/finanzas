import {
  budgetAvailableCents,
  budgetRemainingCents,
  buildCloseAllocations,
  effectiveAllocations,
  isOverBudget,
  isUsingEmergency,
  parseCarryovers,
  spentAgainstEmergency,
  spentByCategoryInRange,
  summarizeCloseAllocations,
} from "../src/lib/budget-math";
import {
  isBudgetPeriodCloseable,
  isStaleBudgetClose,
  nextBudgetPeriod,
  prevBudgetPeriod,
  todayISO,
} from "../src/lib/utils";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(budgetAvailableCents(10000, 3000) === 13000, "available");
assert(budgetRemainingCents(10000, 3000, 7000) === 6000, "remaining under plan");
assert(budgetRemainingCents(10000, 3000, 11000) === 2000, "remaining in emergency");
assert(budgetRemainingCents(10000, 3000, 14000) === 0, "remaining over");
assert(budgetRemainingCents(10000, 3000, 4000, 2000) === 7000, "goal alloc reduces remaining");
assert(budgetRemainingCents(10000, 3000, 9000, 4000) === 0, "goal alloc + spend can empty envelope");
assert(spentAgainstEmergency(10000, 3000, 11000) === 1000, "em used");
assert(isUsingEmergency(10000, 3000, 11000), "using em");
assert(!isUsingEmergency(10000, 3000, 9000), "not using em");
assert(isOverBudget(10000, 3000, 14000), "over all");
assert(!isOverBudget(10000, 3000, 13000), "at ceiling");

const spent = spentByCategoryInRange(
  [
    { categoryId: "food", amountCents: 500, type: "expense", date: "2026-08-02" },
    { categoryId: "food", amountCents: 200, type: "transfer", date: "2026-08-03" },
    { categoryId: "food", amountCents: 50, type: "income", date: "2026-08-04" },
    { categoryId: "food", amountCents: 10, type: "expense", date: "2026-07-30" },
  ],
  "2026-08-01",
  "2026-08-15"
);
assert(spent.food === 700, "spend includes categorized transfers, not income/out of range");

assert(nextBudgetPeriod("2026-08-1") === "2026-08-2", "next half");
assert(nextBudgetPeriod("2026-08-2") === "2026-09-1", "next month");
assert(nextBudgetPeriod("2026-12-2") === "2027-01-1", "year wrap");
assert(prevBudgetPeriod("2026-08-1") === "2026-07-2", "prev month");
assert(prevBudgetPeriod("2026-01-1") === "2025-12-2", "prev year");

assert(isBudgetPeriodCloseable("2026-08-1", "2026-08-15"), "close on day 15");
assert(!isBudgetPeriodCloseable("2026-08-1", "2026-08-14"), "not before day 15");
assert(isBudgetPeriodCloseable("2026-08-2", "2026-08-31"), "close on month end");
assert(!isBudgetPeriodCloseable("2026-08-2", "2026-08-30"), "Aug 30 is not month end");

const local = todayISO();
assert(/^\d{4}-\d{2}-\d{2}$/.test(local), "todayISO format");
assert(local === todayISO(new Date()), "todayISO stable");

const parsed = parseCarryovers(
  JSON.stringify([{ categoryId: "a", remainingCents: 12.4 }, { categoryId: "", remainingCents: 3 }])
);
assert(parsed.length === 1 && parsed[0].remainingCents === 12, "carryovers");

assert(isStaleBudgetClose("2026-07-1", "2026-08-08"), "july-1 is stale in august");
assert(!isStaleBudgetClose("2026-07-2", "2026-08-08"), "july-2 next is current aug-1");
assert(!isStaleBudgetClose("2026-08-1", "2026-08-15"), "aug-1 next still open on day 15");
assert(
  !isStaleBudgetClose("2026-08-1", "2026-08-31"),
  "aug-1 next is still current on last day of aug-2"
);
assert(isStaleBudgetClose("2026-08-1", "2026-09-01"), "aug-1 stale in september");

const leftover = [
  { categoryId: "food", remainingCents: 10000 },
  { categoryId: "fun", remainingCents: 2500 },
];
const spentPlan = buildCloseAllocations({
  leftover,
  defaultKind: "spent",
});
assert(spentPlan.length === 2, "spent plan rows");
assert(spentPlan[0].allocations?.[0].kind === "spent", "default spent");
assert(summarizeCloseAllocations(spentPlan).spentCents === 12500, "all spent");
assert(summarizeCloseAllocations(spentPlan).movedCents === 0, "spent does not move");

const emPlan = buildCloseAllocations({ leftover, defaultKind: "emergency" });
assert(emPlan[0].allocations?.[0].categoryId === "food", "same-cat emergency");
assert(summarizeCloseAllocations(emPlan).emergencyCents === 12500, "all emergency");

const custom = buildCloseAllocations({
  leftover,
  defaultKind: "spent",
  lines: [
    {
      categoryId: "food",
      allocations: [
        { kind: "emergency", amountCents: 4000, categoryId: "fun" },
        { kind: "goal", amountCents: 3500, goalId: "g1" },
        { kind: "spent", amountCents: 2500 },
      ],
    },
  ],
});
assert(custom[0].allocations?.length === 3, "split food");
assert(custom[1].allocations?.[0].kind === "spent", "fun uses default");
const customSum = summarizeCloseAllocations(custom);
assert(customSum.emergencyCents === 4000, "custom em");
assert(customSum.goalCents === 3500, "custom goal");
assert(customSum.spentCents === 5000, "custom spent + default fun");

let threw = false;
try {
  buildCloseAllocations({
    leftover,
    defaultKind: "spent",
    lines: [
      {
        categoryId: "food",
        allocations: [{ kind: "spent", amountCents: 1 }],
      },
    ],
  });
} catch {
  threw = true;
}
assert(threw, "partial custom must still sum to leftover");

const legacy = parseCarryovers(
  JSON.stringify([{ categoryId: "a", remainingCents: 80 }])
);
assert(effectiveAllocations(legacy[0])[0].kind === "emergency", "legacy = emergency");
assert(effectiveAllocations(legacy[0])[0].amountCents === 80, "legacy amount");

const withAlloc = parseCarryovers(
  JSON.stringify([
    {
      categoryId: "a",
      remainingCents: 80,
      allocations: [
        { kind: "goal", amountCents: 50, goalId: "g", reserveId: "r" },
        { kind: "spent", amountCents: 30 },
      ],
    },
  ])
);
assert(withAlloc[0].allocations?.[0].reserveId === "r", "keep reserveId");
assert(summarizeCloseAllocations(withAlloc).goalCents === 50, "parsed goal");

console.log("budget math ok");
