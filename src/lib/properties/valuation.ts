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

export type ValuationResult = {
  originalCents: number;
  currentCents: number;
  deltaCents: number;
  deltaPercent: number | null;
  yearsHeld: number;
};

export function yearsBetween(fromIso: string, asOf = new Date()): number {
  const from = new Date(`${fromIso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(from.getTime())) return 0;
  const ms = asOf.getTime() - from.getTime();
  if (ms <= 0) return 0;
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

export function valueItem(input: ValuationInput): ValuationResult {
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
  const delta = current - original;
  return {
    originalCents: original,
    currentCents: current,
    deltaCents: delta,
    deltaPercent: original > 0 ? (delta / original) * 100 : null,
    yearsHeld: years,
  };
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
