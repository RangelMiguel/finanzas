/**
 * Mexico-first investment options for the Advanced Investments add-on.
 * Tax rules are simplified planning assumptions (not legal advice).
 *
 * ISR notes (resident individual, 2025–2026):
 * - Interest (CETES, pagarés, debt funds): taxed at marginal rate.
 *   LIF provisional withholding on financial-system interest ≈ 0.50% of capital.
 * - Listed shares / ETFs on BMV-SIC: 10% ISR on real capital gain (LISR 129).
 * - Afore voluntary: tax-deferred; complementary savings may be deductible.
 * - Fibras: most of the distribution is taxable; we model ~30% on 70% of return.
 */

export type RiskLevel = "low" | "medium" | "high";
export type TaxKind = "interest" | "capital_gains" | "deferred" | "fibra";

export type Localized = { es: string; en: string };

export type InvestmentOption = {
  id: string;
  name: Localized;
  summary: Localized;
  risk: RiskLevel;
  /** Typical time to get money out without a large penalty. */
  liquidityDays: number;
  /** Suggested minimum horizon in years. */
  minHorizonYears: number;
  /** Seed / fallback nominal expected return % */
  expectedReturnPercent: number;
  /** Optional id from market-instruments.ts to overlay live rates */
  marketInstrumentId?: string;
  tax: {
    kind: TaxKind;
    /** LIF withholding on capital for interest products (percent of principal / year). */
    withholdingCapitalPercent?: number;
    /** Flat rate on gains when kind is capital_gains. */
    gainsRatePercent?: number;
    /** Share of return treated as taxable distribution (fibras). */
    taxableShare?: number;
    distributionRatePercent?: number;
  };
  taxNote: Localized;
};

/** LIF 2025/2026 typical withholding on financial interest (of capital). */
export const MX_INTEREST_WITHHOLDING_CAPITAL = 0.5;

export const INVESTMENT_OPTIONS: InvestmentOption[] = [
  {
    id: "mx-cetes-28",
    name: { es: "CETES 28 días", en: "28-day CETES" },
    summary: {
      es: "Deuda del gobierno, muy líquida. Ideal para reserva y plazos cortos.",
      en: "Government bills, very liquid. Best for cash reserve and short horizons.",
    },
    risk: "low",
    liquidityDays: 28,
    minHorizonYears: 0,
    expectedReturnPercent: 7.0,
    marketInstrumentId: "mx-cetes-28",
    tax: {
      kind: "interest",
      withholdingCapitalPercent: MX_INTEREST_WITHHOLDING_CAPITAL,
    },
    taxNote: {
      es: "Intereses a tu tasa marginal. Retención provisional ~0.50% del capital (LIF).",
      en: "Interest at your marginal rate. Provisional withholding ~0.50% of capital (LIF).",
    },
  },
  {
    id: "mx-cetes-364",
    name: { es: "CETES 364 días", en: "364-day CETES" },
    summary: {
      es: "Misma seguridad que CETES cortos, un poco más de tasa si no necesitas el dinero este mes.",
      en: "Same safety as short CETES, a bit more yield if you can lock a year.",
    },
    risk: "low",
    liquidityDays: 364,
    minHorizonYears: 1,
    expectedReturnPercent: 7.4,
    marketInstrumentId: "mx-cetes-1y",
    tax: {
      kind: "interest",
      withholdingCapitalPercent: MX_INTEREST_WITHHOLDING_CAPITAL,
    },
    taxNote: {
      es: "Intereses a tasa marginal. Retención provisional sobre el capital.",
      en: "Interest at marginal rate. Provisional withholding on capital.",
    },
  },
  {
    id: "mx-udibonos",
    name: { es: "UDIBONOS", en: "UDIBONOS" },
    summary: {
      es: "Deuda gubernamental indexada a inflación (UDI). Protege poder de compra.",
      en: "Inflation-linked government bonds (UDI). Protects purchasing power.",
    },
    risk: "low",
    liquidityDays: 90,
    minHorizonYears: 2,
    expectedReturnPercent: 4.7,
    marketInstrumentId: "mx-udibonos-10y",
    tax: {
      kind: "interest",
      withholdingCapitalPercent: MX_INTEREST_WITHHOLDING_CAPITAL,
    },
    taxNote: {
      es: "El rendimiento real + inflación se trata como interés. ISR marginal.",
      en: "Real yield plus inflation is treated as interest. Marginal ISR.",
    },
  },
  {
    id: "mx-pagare",
    name: { es: "Pagaré / caja bancaria", en: "Bank note / time deposit" },
    summary: {
      es: "Depósito a plazo en banco o SOFIPO. Revisa el seguro de depósito.",
      en: "Bank or SOFIPO time deposit. Check deposit insurance.",
    },
    risk: "low",
    liquidityDays: 90,
    minHorizonYears: 0,
    expectedReturnPercent: 6.2,
    marketInstrumentId: "mx-banxico-target",
    tax: {
      kind: "interest",
      withholdingCapitalPercent: MX_INTEREST_WITHHOLDING_CAPITAL,
    },
    taxNote: {
      es: "Intereses gravados. El banco retiene ISR provisional.",
      en: "Interest is taxable. The bank withholds provisional ISR.",
    },
  },
  {
    id: "mx-debt-fund",
    name: { es: "Fondo de deuda", en: "Bond / debt fund" },
    summary: {
      es: "Cartera de papel gubernamental y corporativo. Un poco más de riesgo que CETES.",
      en: "Mix of government and corporate paper. A bit more risk than CETES.",
    },
    risk: "medium",
    liquidityDays: 3,
    minHorizonYears: 1,
    expectedReturnPercent: 7.8,
    tax: {
      kind: "interest",
      withholdingCapitalPercent: MX_INTEREST_WITHHOLDING_CAPITAL,
    },
    taxNote: {
      es: "La operadora retiene ISR sobre intereses del fondo.",
      en: "The fund withholds ISR on interest.",
    },
  },
  {
    id: "mx-afore-vol",
    name: { es: "Afore (ahorro voluntario)", en: "Afore (voluntary savings)" },
    summary: {
      es: "Largo plazo, diferido de impuestos. Complementario puede ser deducible.",
      en: "Long-term, tax-deferred. Complementary contributions may be deductible.",
    },
    risk: "medium",
    liquidityDays: 365,
    minHorizonYears: 5,
    expectedReturnPercent: 6.5,
    marketInstrumentId: "mx-afore-inicial",
    tax: { kind: "deferred" },
    taxNote: {
      es: "No pagas ISR mientras está invertido. Al retirar puede gravarse como ingreso.",
      en: "No ISR while invested. Withdrawals may be taxed as income.",
    },
  },
  {
    id: "mx-ipc-etf",
    name: { es: "ETF del IPC (NAFTRAC)", en: "IPC ETF (NAFTRAC)" },
    summary: {
      es: "Acciones mexicanas cotizadas. Alta volatilidad, 10% sobre ganancia real.",
      en: "Listed Mexican equities. High volatility, 10% on real capital gain.",
    },
    risk: "high",
    liquidityDays: 2,
    minHorizonYears: 5,
    expectedReturnPercent: 10.5,
    tax: { kind: "capital_gains", gainsRatePercent: 10 },
    taxNote: {
      es: "Acciones listadas en BMV: 10% ISR sobre la ganancia real (LISR 129).",
      en: "BMV-listed shares: 10% ISR on the real gain (LISR 129).",
    },
  },
  {
    id: "mx-global-etf",
    name: { es: "ETF global (SIC)", en: "Global ETF (SIC)" },
    summary: {
      es: "Exposición mundial vía SIC. Misma regla de 10% si cotiza en México.",
      en: "World exposure via SIC. Same 10% rule if listed in Mexico.",
    },
    risk: "high",
    liquidityDays: 2,
    minHorizonYears: 5,
    expectedReturnPercent: 9.5,
    tax: { kind: "capital_gains", gainsRatePercent: 10 },
    taxNote: {
      es: "Si el ETF cotiza en el SIC, la ganancia de capital suele ir al 10%.",
      en: "If the ETF is listed on the SIC, capital gains are typically 10%.",
    },
  },
  {
    id: "mx-fibra",
    name: { es: "FIBRA inmobiliaria", en: "REIT (FIBRA)" },
    summary: {
      es: "Inmuebles que pagan rentas. Mezcla de rendimiento y algo de ISR en la distribución.",
      en: "Property vehicles that pay rent. Mix of yield and tax on distributions.",
    },
    risk: "medium",
    liquidityDays: 2,
    minHorizonYears: 4,
    expectedReturnPercent: 8.5,
    tax: {
      kind: "fibra",
      taxableShare: 0.7,
      distributionRatePercent: 30,
    },
    taxNote: {
      es: "Gran parte de la distribución es ingreso gravable (~30% sobre la porción taxable).",
      en: "Most of the distribution is taxable income (~30% on the taxable share).",
    },
  },
];

export const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};
