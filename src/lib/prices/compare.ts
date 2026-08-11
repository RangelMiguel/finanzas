/** Compare a paid unit price against other stores' latest quotes. */

export type StoreQuote = {
  storeId: string;
  storeName: string;
  unitCents: number;
  observedOn: string;
};

export type PurchaseCompare = {
  paidUnitCents: number;
  paidTotalCents: number;
  quantity: number;
  cheapest: StoreQuote | null;
  averageUnitCents: number | null;
  /** Positive = overpaid vs cheapest (could have saved). Negative = beat cheapest. */
  vsCheapestTotalCents: number | null;
  vsAverageTotalCents: number | null;
  /** max(0, vs cheapest) — money left on the table */
  couldHaveSavedCents: number;
  /** max(0, -vs cheapest) — you beat the cheapest known quote */
  savedCents: number;
};

export function paidUnitCents(paidTotalCents: number, quantity: number): number {
  const qty = quantity > 0 ? quantity : 0;
  if (qty <= 0) return 0;
  return Math.round(Math.max(0, paidTotalCents) / qty);
}

/** Latest quote per store with observedOn <= asOf (if given). */
export function latestQuotesByStore(
  quotes: StoreQuote[],
  asOf?: string | null
): StoreQuote[] {
  const best = new Map<string, StoreQuote>();
  for (const q of quotes) {
    if (asOf && q.observedOn > asOf) continue;
    const prev = best.get(q.storeId);
    if (
      !prev ||
      q.observedOn > prev.observedOn ||
      (q.observedOn === prev.observedOn && q.unitCents < prev.unitCents)
    ) {
      best.set(q.storeId, q);
    }
  }
  return [...best.values()];
}

export function comparePurchase(opts: {
  paidTotalCents: number;
  quantity: number;
  alternatives: StoreQuote[];
}): PurchaseCompare {
  const quantity = opts.quantity > 0 ? opts.quantity : 0;
  const paidTotal = Math.max(0, Math.round(opts.paidTotalCents));
  const unit = paidUnitCents(paidTotal, quantity);
  const alts = opts.alternatives.filter((a) => a.unitCents >= 0);
  if (!alts.length || quantity <= 0) {
    return {
      paidUnitCents: unit,
      paidTotalCents: paidTotal,
      quantity,
      cheapest: null,
      averageUnitCents: null,
      vsCheapestTotalCents: null,
      vsAverageTotalCents: null,
      couldHaveSavedCents: 0,
      savedCents: 0,
    };
  }
  const cheapest = alts.reduce((a, b) => (a.unitCents <= b.unitCents ? a : b));
  const averageUnitCents = Math.round(
    alts.reduce((s, a) => s + a.unitCents, 0) / alts.length
  );
  const vsCheapestTotalCents = Math.round((unit - cheapest.unitCents) * quantity);
  const vsAverageTotalCents = Math.round((unit - averageUnitCents) * quantity);
  return {
    paidUnitCents: unit,
    paidTotalCents: paidTotal,
    quantity,
    cheapest,
    averageUnitCents,
    vsCheapestTotalCents,
    vsAverageTotalCents,
    couldHaveSavedCents: Math.max(0, vsCheapestTotalCents),
    savedCents: Math.max(0, -vsCheapestTotalCents),
  };
}

export function summarizePurchases(rows: PurchaseCompare[]): {
  spentCents: number;
  couldHaveSavedCents: number;
  savedCents: number;
} {
  return rows.reduce(
    (acc, r) => ({
      spentCents: acc.spentCents + r.paidTotalCents,
      couldHaveSavedCents: acc.couldHaveSavedCents + r.couldHaveSavedCents,
      savedCents: acc.savedCents + r.savedCents,
    }),
    { spentCents: 0, couldHaveSavedCents: 0, savedCents: 0 }
  );
}
