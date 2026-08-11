import {
  clampPaymentCents,
  creditIsOverdue,
  creditLedgerType,
  creditRemainingCents,
} from "../src/lib/credits";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(creditRemainingCents(10_000_00, 0) === 10_000_00, "full remaining");
assert(creditRemainingCents(10_000_00, 4_000_00) === 6_000_00, "partial");
assert(creditRemainingCents(10_000_00, 12_000_00) === 0, "cannot go negative");
assert(creditRemainingCents(100, -5) === 100, "ignore negative paid");

assert(clampPaymentCents(500, 300) === 300, "clamp to remaining");
assert(clampPaymentCents(-10, 300) === 0, "clamp negative");
assert(clampPaymentCents(100, 300) === 100, "under remaining");

assert(
  creditIsOverdue(100, "2020-01-01", new Date("2026-08-11T12:00:00")) === true,
  "overdue"
);
assert(
  creditIsOverdue(100, "2099-01-01", new Date("2026-08-11T12:00:00")) === false,
  "not due yet"
);
assert(creditIsOverdue(0, "2020-01-01", new Date("2026-08-11")) === false, "paid off");
assert(creditIsOverdue(100, null) === false, "no due date");

assert(creditLedgerType("lent", "open") === "expense", "giving money out");
assert(creditLedgerType("lent", "repay") === "income", "collecting");
assert(creditLedgerType("borrowed", "open") === "income", "receiving a loan");
assert(creditLedgerType("borrowed", "repay") === "expense", "paying them back");

console.log("verify-credits: ok");
