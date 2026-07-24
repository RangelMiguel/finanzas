export type CurrencyCode =
  | "MXN"
  | "USD"
  | "EUR"
  | "GBP"
  | "CAD"
  | "COP"
  | "ARS"
  | "CLP"
  | "PEN"
  | "BRL"
  | "JPY";

export const CURRENCIES: {
  code: CurrencyCode;
  label: string;
  symbol: string;
}[] = [
  { code: "MXN", label: "Mexican Peso", symbol: "$" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "CAD", label: "Canadian Dollar", symbol: "$" },
  { code: "COP", label: "Colombian Peso", symbol: "$" },
  { code: "ARS", label: "Argentine Peso", symbol: "$" },
  { code: "CLP", label: "Chilean Peso", symbol: "$" },
  { code: "PEN", label: "Peruvian Sol", symbol: "S/" },
  { code: "BRL", label: "Brazilian Real", symbol: "R$" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
];

export const LOCALES = [
  { code: "es", label: "Español", dateLocale: "es-MX" },
  { code: "en", label: "English", dateLocale: "en-US" },
] as const;

export type AppLocale = (typeof LOCALES)[number]["code"];

export function localeToBcp47(locale: string): string {
  if (locale === "en") return "en-US";
  return "es-MX";
}
