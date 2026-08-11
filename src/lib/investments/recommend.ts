import {
  INVESTMENT_OPTIONS,
  RISK_ORDER,
  type InvestmentOption,
  type RiskLevel,
} from "./catalog";

export type RecommendInput = {
  risk: RiskLevel;
  horizonYears: number;
  amountCents: number;
  marginalTaxPercent: number;
  /** Overlay live nominal rates by option.marketInstrumentId */
  liveRates?: Record<string, number>;
  inflationPercent?: number;
};

export type RankedInvestment = {
  id: string;
  name: { es: string; en: string };
  summary: { es: string; en: string };
  risk: RiskLevel;
  liquidityDays: number;
  minHorizonYears: number;
  preTaxPercent: number;
  afterTaxPercent: number;
  taxDragPercent: number;
  taxNote: { es: string; en: string };
  score: number;
  riskFit: number;
  horizonFit: number;
  reasons: { es: string; en: string }[];
  estimatedGainCents: number;
  estimatedTaxCents: number;
};

export function clampTaxPercent(n: number): number {
  if (!Number.isFinite(n)) return 30;
  return Math.max(0, Math.min(35, n));
}

export function preTaxReturn(
  opt: InvestmentOption,
  liveRates?: Record<string, number>
): number {
  if (opt.marketInstrumentId && liveRates?.[opt.marketInstrumentId] != null) {
    const live = liveRates[opt.marketInstrumentId];
    if (Number.isFinite(live)) {
      // Bank notes typically sit a bit under the policy rate.
      if (opt.id === "mx-pagare") return Math.max(0, live - 0.4);
      return live;
    }
  }
  return opt.expectedReturnPercent;
}

export function afterTaxReturnPercent(
  opt: InvestmentOption,
  preTax: number,
  marginalTaxPercent: number
): { afterTax: number; taxDrag: number } {
  const m = clampTaxPercent(marginalTaxPercent) / 100;
  const r = preTax;
  if (opt.tax.kind === "capital_gains") {
    const g = (opt.tax.gainsRatePercent ?? 10) / 100;
    const after = r * (1 - g);
    return { afterTax: after, taxDrag: r - after };
  }
  if (opt.tax.kind === "deferred") {
    return { afterTax: r, taxDrag: 0 };
  }
  if (opt.tax.kind === "fibra") {
    const share = opt.tax.taxableShare ?? 0.7;
    const dist = (opt.tax.distributionRatePercent ?? 30) / 100;
    const after = r * (1 - share * dist);
    return { afterTax: after, taxDrag: r - after };
  }
  // interest: economic tax ≈ marginal on coupon; withholding is provisional
  const after = r * (1 - m);
  return { afterTax: after, taxDrag: r - after };
}

export function riskFit(optionRisk: RiskLevel, userRisk: RiskLevel): number {
  const d = Math.abs(RISK_ORDER[optionRisk] - RISK_ORDER[userRisk]);
  if (d === 0) return 1;
  if (d === 1) return 0.72;
  return 0.35;
}

export function horizonFit(opt: InvestmentOption, horizonYears: number): number {
  const h = Math.max(0, horizonYears);
  if (h + 0.01 < opt.minHorizonYears) {
    const gap = opt.minHorizonYears - h;
    return Math.max(0.25, 1 - gap * 0.18);
  }
  if (h < 1 && opt.risk === "high") return 0.4;
  if (h < 3 && opt.risk === "high") return 0.7;
  if (h >= 8 && opt.risk === "low") return 0.82;
  return 1;
}

function reasonsFor(
  opt: InvestmentOption,
  input: RecommendInput,
  rf: number,
  hf: number,
  afterTax: number
): { es: string; en: string }[] {
  const out: { es: string; en: string }[] = [];
  if (rf === 1) {
    out.push({
      es: "Encaja con tu nivel de riesgo.",
      en: "Matches your risk level.",
    });
  } else if (RISK_ORDER[opt.risk] > RISK_ORDER[input.risk]) {
    out.push({
      es: "Más riesgo del que elegiste.",
      en: "Riskier than you selected.",
    });
  } else {
    out.push({
      es: "Más conservador que tu perfil; rinde menos a largo plazo.",
      en: "More conservative than your profile; lower long-run return.",
    });
  }
  if (hf < 0.85) {
    out.push({
      es: `Mejor con horizonte de ${opt.minHorizonYears}+ años.`,
      en: `Better with a ${opt.minHorizonYears}+ year horizon.`,
    });
  }
  if (opt.tax.kind === "deferred") {
    out.push({
      es: "El diferimiento fiscal pesa más si no necesitas el dinero pronto.",
      en: "Tax deferral matters more if you do not need the money soon.",
    });
  }
  if (opt.tax.kind === "capital_gains") {
    out.push({
      es: `ISR 10% sobre ganancia (después de impuesto ≈ ${afterTax.toFixed(1)}%).`,
      en: `10% ISR on the gain (after tax ≈ ${afterTax.toFixed(1)}%).`,
    });
  }
  if (opt.tax.kind === "interest") {
    out.push({
      es: `Los intereses se gravan a tu tasa (${input.marginalTaxPercent}%).`,
      en: `Interest is taxed at your rate (${input.marginalTaxPercent}%).`,
    });
  }
  return out;
}

export function recommendInvestments(input: RecommendInput): RankedInvestment[] {
  const horizon = Math.max(0, Math.min(50, input.horizonYears || 0));
  const amount = Math.max(0, Math.round(input.amountCents || 0));
  const tax = clampTaxPercent(input.marginalTaxPercent);
  const risk: RiskLevel = input.risk in RISK_ORDER ? input.risk : "medium";

  return INVESTMENT_OPTIONS.map((opt) => {
    const pre = preTaxReturn(opt, input.liveRates);
    const { afterTax, taxDrag } = afterTaxReturnPercent(opt, pre, tax);
    const rf = riskFit(opt.risk, risk);
    const hf = horizonFit(opt, horizon);
    const score = afterTax * rf * hf;
    const estimatedGainCents = Math.round((amount * afterTax) / 100);
    const estimatedTaxCents = Math.round((amount * taxDrag) / 100);
    return {
      id: opt.id,
      name: opt.name,
      summary: opt.summary,
      risk: opt.risk,
      liquidityDays: opt.liquidityDays,
      minHorizonYears: opt.minHorizonYears,
      preTaxPercent: pre,
      afterTaxPercent: afterTax,
      taxDragPercent: taxDrag,
      taxNote: opt.taxNote,
      score,
      riskFit: rf,
      horizonFit: hf,
      reasons: reasonsFor(opt, { ...input, risk, horizonYears: horizon, marginalTaxPercent: tax }, rf, hf, afterTax),
      estimatedGainCents,
      estimatedTaxCents,
    };
  }).sort((a, b) => b.score - a.score);
}
