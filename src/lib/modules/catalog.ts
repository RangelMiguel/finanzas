/**
 * App module catalog.
 *
 * Core modules ship with the household. Add-ons are listed in the in-app
 * marketplace and must be installed (HouseholdModule) before they appear
 * in nav or their APIs answer.
 *
 * To add a new add-on:
 * 1. Register it here (kind: "addon")
 * 2. Add a page + API under that href
 * 3. Add i18n under marketplace.modules.<id> and nav.<id>
 * 4. Optionally add the id to MemberVisibility.modules
 */

export type ModuleKind = "core" | "addon";

export type AppModuleId =
  | "dashboard"
  | "accounts"
  | "transactions"
  | "budgets"
  | "creditCards"
  | "recurring"
  | "debts"
  | "goals"
  | "retirement"
  | "allowances"
  | "safeToSpend"
  | "tickets"
  | "statements"
  | "importExport"
  | "family"
  | "settings"
  | "properties"
  | "prices"
  | "investments"
  | "credits";

export type AppModuleDef = {
  id: AppModuleId;
  kind: ModuleKind;
  href: string;
  /** Price in cents. 0 = free. */
  priceCents: number;
};

export const APP_MODULES: AppModuleDef[] = [
  { id: "dashboard", kind: "core", href: "/", priceCents: 0 },
  { id: "accounts", kind: "core", href: "/accounts", priceCents: 0 },
  { id: "transactions", kind: "core", href: "/transactions", priceCents: 0 },
  { id: "budgets", kind: "core", href: "/budgets", priceCents: 0 },
  { id: "creditCards", kind: "core", href: "/credit-cards", priceCents: 0 },
  { id: "recurring", kind: "core", href: "/recurring", priceCents: 0 },
  { id: "debts", kind: "core", href: "/debts", priceCents: 0 },
  { id: "goals", kind: "core", href: "/goals", priceCents: 0 },
  { id: "retirement", kind: "core", href: "/retirement", priceCents: 0 },
  { id: "allowances", kind: "core", href: "/personal", priceCents: 0 },
  { id: "safeToSpend", kind: "core", href: "/safe-to-spend", priceCents: 0 },
  { id: "tickets", kind: "core", href: "/tickets", priceCents: 0 },
  { id: "statements", kind: "core", href: "/import-statement", priceCents: 0 },
  { id: "importExport", kind: "core", href: "/import-export", priceCents: 0 },
  { id: "family", kind: "core", href: "/family", priceCents: 0 },
  { id: "settings", kind: "core", href: "/settings", priceCents: 0 },
  {
    id: "properties",
    kind: "addon",
    href: "/properties",
    priceCents: 0,
  },
  { id: "prices", kind: "addon", href: "/prices", priceCents: 0 },
  { id: "investments", kind: "addon", href: "/investments", priceCents: 0 },
  { id: "credits", kind: "addon", href: "/credits", priceCents: 0 },
];

export const ADDON_MODULES = APP_MODULES.filter((m) => m.kind === "addon");

export function getModule(id: string): AppModuleDef | undefined {
  return APP_MODULES.find((m) => m.id === id);
}

export function isAddonModule(id: string): boolean {
  return getModule(id)?.kind === "addon";
}
