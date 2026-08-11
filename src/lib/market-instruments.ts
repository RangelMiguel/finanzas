/**
 * Reference rates for common savings / investment instruments.
 * Grouped by country so more markets can be added later.
 *
 * Seed figures are fallbacks. Live quotes are fetched monthly
 * (see `market-rates-refresh.ts`) from Banxico, CETES Directo, and CONSAR.
 */

export const MARKET_COUNTRY_IDS = ["MX"] as const;
export type MarketCountryId = (typeof MARKET_COUNTRY_IDS)[number];

export type MarketCategory =
  | "policy"
  | "money"
  | "bills"
  | "bonds"
  | "udibonos"
  | "afore"
  | "inflation";

export type RateKind = "nominal" | "real";
export type RateAppliesTo = "return" | "inflation";

export type LocalizedText = { es: string; en: string };

export type MarketInstrument = {
  id: string;
  countryId: MarketCountryId;
  category: MarketCategory;
  name: LocalizedText;
  annualRatePercent: number;
  rateKind: RateKind;
  appliesTo: RateAppliesTo;
  /** ISO date of the snapshot */
  asOf: string;
  source: LocalizedText;
};

export type InstrumentFetch =
  | { kind: "cetes-ticker"; match: string }
  | { kind: "banxico-series"; seriesId: string }
  | { kind: "banxico-inflation" }
  | { kind: "afore-consar" }
  | { kind: "static" };

export type MarketInstrumentDef = MarketInstrument & {
  fetch: InstrumentFetch;
};

export type MarketRateQuote = {
  id: string;
  annualRatePercent: number;
  asOf: string;
};

export const MARKET_COUNTRIES: {
  id: MarketCountryId;
  name: LocalizedText;
}[] = [{ id: "MX", name: { es: "México", en: "Mexico" } }];

export const MARKET_CATEGORY_ORDER: MarketCategory[] = [
  "policy",
  "money",
  "bills",
  "bonds",
  "udibonos",
  "afore",
  "inflation",
];

export const MARKET_INSTRUMENT_DEFS: MarketInstrumentDef[] = [
  {
    id: "mx-banxico-target",
    countryId: "MX",
    category: "policy",
    name: { es: "Tasa objetivo Banxico", en: "Banxico target rate" },
    annualRatePercent: 6.5,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-11",
    source: { es: "Banco de México", en: "Banco de México" },
    fetch: { kind: "banxico-series", seriesId: "SF61745" },
  },
  {
    id: "mx-tiie-fondeo",
    countryId: "MX",
    category: "money",
    name: { es: "TIIE de fondeo", en: "TIIE funding rate" },
    annualRatePercent: 6.49,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "Banco de México", en: "Banco de México" },
    fetch: { kind: "banxico-series", seriesId: "SF331451" },
  },
  {
    id: "mx-tiie-28",
    countryId: "MX",
    category: "money",
    name: { es: "TIIE 28 días", en: "TIIE 28-day" },
    annualRatePercent: 6.75,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-11",
    source: { es: "Banco de México", en: "Banco de México" },
    fetch: { kind: "banxico-series", seriesId: "SF60648" },
  },
  {
    id: "mx-tiie-91",
    countryId: "MX",
    category: "money",
    name: { es: "TIIE 91 días", en: "TIIE 91-day" },
    annualRatePercent: 6.78,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-11",
    source: { es: "Banco de México", en: "Banco de México" },
    fetch: { kind: "banxico-series", seriesId: "SF60649" },
  },
  {
    id: "mx-tiie-182",
    countryId: "MX",
    category: "money",
    name: { es: "TIIE 182 días", en: "TIIE 182-day" },
    annualRatePercent: 6.84,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-11",
    source: { es: "Banco de México", en: "Banco de México" },
    fetch: { kind: "banxico-series", seriesId: "SF118281" },
  },
  {
    id: "mx-cetes-28",
    countryId: "MX",
    category: "bills",
    name: { es: "CETES 28 días", en: "CETES 28-day" },
    annualRatePercent: 6.17,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "cetes 1 mes" },
  },
  {
    id: "mx-cetes-91",
    countryId: "MX",
    category: "bills",
    name: { es: "CETES 91 días", en: "CETES 91-day" },
    annualRatePercent: 6.4,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "cetes 3 meses" },
  },
  {
    id: "mx-cetes-182",
    countryId: "MX",
    category: "bills",
    name: { es: "CETES 182 días", en: "CETES 182-day" },
    annualRatePercent: 6.75,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "cetes 6 meses" },
  },
  {
    id: "mx-cetes-1y",
    countryId: "MX",
    category: "bills",
    name: { es: "CETES 1 año", en: "CETES 1-year" },
    annualRatePercent: 7.01,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "cetes 1 ano" },
  },
  {
    id: "mx-bonos-3y",
    countryId: "MX",
    category: "bonds",
    name: { es: "Bonos M 3 años", en: "M-Bonds 3-year" },
    annualRatePercent: 8.18,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "bonos 3 anos" },
  },
  {
    id: "mx-bonos-5y",
    countryId: "MX",
    category: "bonds",
    name: { es: "Bonos M 5 años", en: "M-Bonds 5-year" },
    annualRatePercent: 8.62,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "bonos 5 anos" },
  },
  {
    id: "mx-bonos-10y",
    countryId: "MX",
    category: "bonds",
    name: { es: "Bonos M 10 años", en: "M-Bonds 10-year" },
    annualRatePercent: 9.02,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "bonos 10 anos" },
  },
  {
    id: "mx-bonos-20y",
    countryId: "MX",
    category: "bonds",
    name: { es: "Bonos M 20 años", en: "M-Bonds 20-year" },
    annualRatePercent: 9.59,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "bonos 20 anos" },
  },
  {
    id: "mx-bonos-30y",
    countryId: "MX",
    category: "bonds",
    name: { es: "Bonos M 30 años", en: "M-Bonds 30-year" },
    annualRatePercent: 9.68,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "bonos 30 anos" },
  },
  {
    id: "mx-udibonos-3y",
    countryId: "MX",
    category: "udibonos",
    name: { es: "Udibonos 3 años", en: "Udibonos 3-year" },
    annualRatePercent: 4.08,
    rateKind: "real",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "udibonos 3 anos" },
  },
  {
    id: "mx-udibonos-10y",
    countryId: "MX",
    category: "udibonos",
    name: { es: "Udibonos 10 años", en: "Udibonos 10-year" },
    annualRatePercent: 4.71,
    rateKind: "real",
    appliesTo: "return",
    asOf: "2026-08-10",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "udibonos 10 anos" },
  },
  {
    id: "mx-udibonos-30y",
    countryId: "MX",
    category: "udibonos",
    name: { es: "Udibonos 30 años", en: "Udibonos 30-year" },
    annualRatePercent: 4.5,
    rateKind: "real",
    appliesTo: "return",
    asOf: "2026-08-04",
    source: { es: "CETES Directo / Banxico", en: "CETES Directo / Banxico" },
    fetch: { kind: "cetes-ticker", match: "udibonos 30 anos" },
  },
  {
    id: "mx-afore-inicial",
    countryId: "MX",
    category: "afore",
    name: {
      es: "AFORE SIEFORE Inicial (prom. pond.)",
      en: "AFORE Initial SIEFORE (weighted avg.)",
    },
    annualRatePercent: 8.32,
    rateKind: "nominal",
    appliesTo: "return",
    asOf: "2026-06-30",
    source: { es: "CONSAR (IRN)", en: "CONSAR (net return index)" },
    fetch: { kind: "afore-consar" },
  },
  {
    id: "mx-inpc-annual",
    countryId: "MX",
    category: "inflation",
    name: { es: "Inflación INPC anual", en: "INPC annual inflation" },
    annualRatePercent: 3.12,
    rateKind: "nominal",
    appliesTo: "inflation",
    asOf: "2026-07-31",
    source: { es: "INEGI / Banxico", en: "INEGI / Banxico" },
    fetch: { kind: "banxico-inflation" },
  },
  {
    id: "mx-banxico-inflation-target",
    countryId: "MX",
    category: "inflation",
    name: { es: "Meta de inflación Banxico", en: "Banxico inflation target" },
    annualRatePercent: 3,
    rateKind: "nominal",
    appliesTo: "inflation",
    asOf: "2026-08-11",
    source: { es: "Banco de México", en: "Banco de México" },
    fetch: { kind: "static" },
  },
];

/** Bundled fallback used offline or if the monthly fetch has not run yet. */
export const MARKET_INSTRUMENTS: MarketInstrument[] = MARKET_INSTRUMENT_DEFS.map(
  ({ fetch: _fetch, ...inst }) => inst
);

export function loc(text: LocalizedText, locale: "es" | "en"): string {
  return text[locale] || text.es;
}

export function instrumentsForCountry(
  countryId: MarketCountryId,
  list: MarketInstrument[] = MARKET_INSTRUMENTS
) {
  return list.filter((i) => i.countryId === countryId);
}

export function applyQuotes(
  quotes: MarketRateQuote[],
  list: MarketInstrument[] = MARKET_INSTRUMENTS
): MarketInstrument[] {
  const byId = new Map(quotes.map((q) => [q.id, q]));
  return list.map((inst) => {
    const q = byId.get(inst.id);
    if (!q) return inst;
    return {
      ...inst,
      annualRatePercent: q.annualRatePercent,
      asOf: q.asOf,
    };
  });
}

export function mexicoDateParts(d = new Date()) {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return { date: iso, monthKey: iso.slice(0, 7) };
}

export function nextMonthKey(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function groupInstrumentsByCategory(list: MarketInstrument[]) {
  const groups: { category: MarketCategory; items: MarketInstrument[] }[] = [];
  for (const category of MARKET_CATEGORY_ORDER) {
    const items = list.filter((i) => i.category === category);
    if (items.length) groups.push({ category, items });
  }
  return groups;
}

/** Convert a real (inflation-linked) rate to a nominal rate. */
export function realToNominal(realPercent: number, inflationPercent: number) {
  const real = realPercent / 100;
  const inf = Math.max(0, inflationPercent) / 100;
  return ((1 + real) * (1 + inf) - 1) * 100;
}

export function formatRatePercent(n: number) {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}
