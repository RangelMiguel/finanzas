import {
  comparePurchase,
  latestQuotesByStore,
  paidUnitCents,
  summarizePurchases,
} from "../src/lib/prices/compare";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(paidUnitCents(10000, 2) === 5000, "unit = total / qty");
assert(paidUnitCents(10000, 0) === 0, "qty 0");
assert(paidUnitCents(333, 3) === 111, "rounds unit");

const quotes = [
  { storeId: "w", storeName: "Walmart", unitCents: 2800, observedOn: "2026-07-01" },
  { storeId: "w", storeName: "Walmart", unitCents: 2500, observedOn: "2026-08-01" },
  { storeId: "s", storeName: "Soriana", unitCents: 2700, observedOn: "2026-08-10" },
  { storeId: "c", storeName: "Chedraui", unitCents: 3100, observedOn: "2026-08-05" },
  { storeId: "c", storeName: "Chedraui", unitCents: 3000, observedOn: "2026-09-01" },
];

const asOf = latestQuotesByStore(quotes, "2026-08-15");
assert(asOf.length === 3, "three stores as of mid-Aug");
assert(asOf.find((q) => q.storeId === "w")?.unitCents === 2500, "walmart latest before asOf");
assert(asOf.find((q) => q.storeId === "c")?.unitCents === 3100, "chedraui Sep ignored");
const all = latestQuotesByStore(quotes);
assert(all.find((q) => q.storeId === "c")?.unitCents === 3000, "chedraui latest overall");

const beat = comparePurchase({
  paidTotalCents: 4800,
  quantity: 2,
  alternatives: [
    { storeId: "s", storeName: "Soriana", unitCents: 2700, observedOn: "2026-08-10" },
    { storeId: "c", storeName: "Chedraui", unitCents: 3100, observedOn: "2026-08-05" },
  ],
});
assert(beat.paidUnitCents === 2400, "paid 24 each");
assert(beat.cheapest?.storeId === "s", "soriana cheapest alt");
assert(beat.vsCheapestTotalCents === -600, "2 * (24-27) = -6 pesos");
assert(beat.savedCents === 600, "saved 6 pesos vs cheapest other");
assert(beat.couldHaveSavedCents === 0, "did not overpay");

const over = comparePurchase({
  paidTotalCents: 6200,
  quantity: 2,
  alternatives: [
    { storeId: "s", storeName: "Soriana", unitCents: 2700, observedOn: "2026-08-10" },
    { storeId: "c", storeName: "Chedraui", unitCents: 3100, observedOn: "2026-08-05" },
  ],
});
assert(over.paidUnitCents === 3100, "paid 31");
assert(over.couldHaveSavedCents === 800, "2 * (31-27) = 8 pesos left on table");
assert(over.savedCents === 0, "no save");
assert(over.averageUnitCents === 2900, "avg 27+31");
assert(over.vsAverageTotalCents === 400, "2 * (31-29)");

const none = comparePurchase({
  paidTotalCents: 1000,
  quantity: 1,
  alternatives: [],
});
assert(none.couldHaveSavedCents === 0 && none.vsCheapestTotalCents === null, "no alts");

const sum = summarizePurchases([beat, over]);
assert(sum.spentCents === 4800 + 6200, "spent");
assert(sum.savedCents === 600, "saved only from first");
assert(sum.couldHaveSavedCents === 800, "could-save only from second");

console.log("verify-prices: ok");
