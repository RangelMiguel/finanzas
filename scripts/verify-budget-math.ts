import {
  budgetAvailableCents,
  budgetRemainingCents,
  isOverBudget,
  isUsingEmergency,
  parseCarryovers,
  spentAgainstEmergency,
  spentByCategoryInRange,
} from "../src/lib/budget-math";
import {
  isBudgetPeriodCloseable,
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

console.log("budget math ok");
