import {
  applyRecordedPaymentsToCycles,
  listCardPayments,
} from "../src/lib/credit-card-cycles";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const cycles = [
  { paymentDue: "2026-08-10", amountCents: 5000, start: "a", end: "b" },
  { paymentDue: "2026-09-10", amountCents: 3000, start: "c", end: "d" },
];

const full = applyRecordedPaymentsToCycles(cycles, [
  { id: "1", amountCents: 5000, date: "2026-08-08", ccCycleDue: "2026-08-10" },
]);
assert(full[0].remainingCents === 0 && full[0].paidCents === 5000, "first cycle paid");
assert(full[1].remainingCents === 3000, "second untouched");

const partial = applyRecordedPaymentsToCycles(cycles, [
  { id: "1", amountCents: 2000, date: "2026-08-08", ccCycleDue: "2026-08-10" },
]);
assert(partial[0].remainingCents === 3000, "partial first");

const overflow = applyRecordedPaymentsToCycles(cycles, [
  { id: "1", amountCents: 7000, date: "2026-08-08", ccCycleDue: "2026-08-10" },
]);
assert(overflow[0].remainingCents === 0, "overflow cleared first");
assert(overflow[1].remainingCents === 1000, "overflow hits next");

const fifo = applyRecordedPaymentsToCycles(cycles, [
  { id: "1", amountCents: 6000, date: "2026-08-01" },
]);
assert(fifo[0].remainingCents === 0 && fifo[1].remainingCents === 2000, "fifo no cycle hint");

const scheduled = listCardPayments({
  creditCardId: "card1",
  creditCardName: "Banamex",
  cutoffDay: 15,
  graceDays: 20,
  asOf: "2026-08-08",
  untilDate: "2026-12-31",
  transactions: [
    {
      date: "2026-08-01",
      amountCents: 4000,
      creditCardId: "card1",
      type: "expense",
    },
  ],
  installments: [],
  recordedPayments: [
    {
      id: "p1",
      amountCents: 1500,
      date: "2026-08-07",
      ccCycleDue: undefined,
    },
  ],
});
assert(scheduled.length >= 1, "has remaining due");
assert(
  scheduled[0].amountCents === 2500,
  `remaining after pay expected 2500 got ${scheduled[0].amountCents}`
);
assert(
  scheduled.every((s) => s.amountCents > 0),
  "no zero leftover rows"
);

console.log("cc payments ok");
