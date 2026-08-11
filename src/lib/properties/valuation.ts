/** Value change for household valuables (appreciation / depreciation). */

export type ValueChange = "none" | "appreciate" | "depreciate";
export type ValueMethod = "compound" | "straight";

export type ValuationInput = {
  originalCents: number;
  acquiredOn: string | null | undefined;
  valueChange: ValueChange;
  annualRatePercent: number;
  method: ValueMethod;
  usefulLifeYears: number | null | undefined;
  salvageCents: number;
  asOf?: Date;
};

export type ValueSource = "estimate" | "market";

export type ValuationResult = {
  originalCents: number;
  currentCents: number;
  /** Formula + improvements, before any market override. */
  estimatedCents: number;
  deltaCents: number;
  deltaPercent: number | null;
  yearsHeld: number;
  investedCents: number;
  improvementImpactCents: number;
  baseCents: number;
  source: ValueSource;
  marketValueCents: number | null;
  marketValueOn: string | null;
};

export type MarketOverride = {
  marketValueCents?: number | null;
  marketValueOn?: string | null;
};

export type ImprovementInput = {
  costCents: number;
  effect: "improve" | "depreciate";
  recoveryPercent: number;
};

export function improvementImpactCents(imp: ImprovementInput): number {
  const cost = Math.max(0, Math.round(imp.costCents));
  const pct = Math.max(0, Math.min(150, imp.recoveryPercent || 0)) / 100;
  const raw = Math.round(cost * pct);
  return imp.effect === "depreciate" ? -raw : raw;
}

export function yearsBetween(fromIso: string, asOf = new Date()): number {
  const from = new Date(`${fromIso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(from.getTime())) return 0;
  const ms = asOf.getTime() - from.getTime();
  if (ms <= 0) return 0;
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

export function valueItem(
  input: ValuationInput,
  improvements: ImprovementInput[] = [],
  override: MarketOverride = {}
): ValuationResult {
  const original = Math.max(0, Math.round(input.originalCents));
  const salvage = Math.max(0, Math.min(original, Math.round(input.salvageCents || 0)));
  const start = input.acquiredOn || null;
  const years = start ? yearsBetween(start, input.asOf) : 0;
  const rate = Math.max(-50, Math.min(50, input.annualRatePercent || 0)) / 100;

  let current = original;
  if (input.valueChange === "appreciate" && years > 0 && rate !== 0) {
    current = Math.round(original * Math.pow(1 + Math.abs(rate), years));
  } else if (input.valueChange === "depreciate" && years > 0) {
    if (input.method === "straight") {
      const life = Math.max(0.25, input.usefulLifeYears || 0);
      const used = Math.min(1, years / life);
      current = Math.round(original - (original - salvage) * used);
    } else if (rate !== 0) {
      current = Math.round(original * Math.pow(1 - Math.min(0.99, Math.abs(rate)), years));
    }
  }

  current = Math.max(salvage, current);
  const investedCents = improvements.reduce(
    (s, i) => s + Math.max(0, Math.round(i.costCents)),
    0
  );
  const improvementImpactCentsTotal = improvements.reduce(
    (s, i) => s + improvementImpactCents(i),
    0
  );
  const baseCents = current;
  current = Math.max(0, current + improvementImpactCentsTotal);
  const estimatedCents = current;
  const marketRaw = override.marketValueCents;
  const hasMarket =
    marketRaw != null && Number.isFinite(marketRaw) && marketRaw >= 0;
  if (hasMarket) {
    current = Math.round(marketRaw as number);
  }
  const delta = current - original;
  return {
    originalCents: original,
    currentCents: current,
    estimatedCents,
    deltaCents: delta,
    deltaPercent: original > 0 ? (delta / original) * 100 : null,
    yearsHeld: years,
    investedCents,
    improvementImpactCents: improvementImpactCentsTotal,
    baseCents,
    source: hasMarket ? "market" : "estimate",
    marketValueCents: hasMarket ? Math.round(marketRaw as number) : null,
    marketValueOn: override.marketValueOn || null,
  };
}

/** Casa − hipoteca. Null when the asset has no linked liability. */
export function propertyEquityCents(
  assetCurrentCents: number,
  liabilityCurrentCents: number | null | undefined
): number | null {
  if (liabilityCurrentCents == null) return null;
  return Math.round(assetCurrentCents) - Math.round(liabilityCurrentCents);
}

/** Sensible defaults when picking a category. */
export function defaultValuePolicy(kind: "asset" | "liability", category: string): {
  valueChange: ValueChange;
  annualRatePercent: number;
  method: ValueMethod;
  usefulLifeYears: number | null;
} {
  if (kind === "liability") {
    return {
      valueChange: "depreciate",
      annualRatePercent: 0,
      method: "straight",
      usefulLifeYears: 15,
    };
  }
  switch (category) {
    case "home":
    case "land":
      return { valueChange: "appreciate", annualRatePercent: 4, method: "compound", usefulLifeYears: null };
    case "jewelry":
      return { valueChange: "appreciate", annualRatePercent: 3, method: "compound", usefulLifeYears: null };
    case "vehicle":
      return { valueChange: "depreciate", annualRatePercent: 15, method: "compound", usefulLifeYears: 8 };
    case "electronics":
      return { valueChange: "depreciate", annualRatePercent: 25, method: "compound", usefulLifeYears: 4 };
    case "furniture":
      return { valueChange: "depreciate", annualRatePercent: 12, method: "straight", usefulLifeYears: 10 };
    default:
      return { valueChange: "none", annualRatePercent: 0, method: "compound", usefulLifeYears: null };
  }
}
