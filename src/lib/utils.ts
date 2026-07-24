import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { localeToBcp47 } from "./currencies";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(
  cents: number,
  currency = "MXN",
  locale = "es"
): string {
  try {
    return new Intl.NumberFormat(localeToBcp47(locale), {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Parse user amount input to integer cents */
export function amountToCents(amount: number | string): number {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

/** @deprecated use amountToCents */
export const pesosToCents = amountToCents;

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function monthKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO week key YYYY-Www */
export function weekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function periodBounds(
  period: "monthly" | "weekly",
  ref = new Date()
): { start: string; end: string; key: string } {
  if (period === "weekly") {
    const d = new Date(ref);
    const day = d.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const start = new Date(d);
    start.setDate(d.getDate() + diffToMon);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    return { start: iso(start), end: iso(end), key: weekKey(ref) };
  }
  const key = monthKey(ref);
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    start: `${key}-01`,
    end: `${key}-${String(last).padStart(2, "0")}`,
    key,
  };
}


/** Half-month budget period: 1 = days 1–15, 2 = days 16–end */
export type BudgetHalf = 1 | 2;

/** Current or given date → period key YYYY-MM-1 | YYYY-MM-2 */
export function budgetPeriodKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = date.getDate();
  const half: BudgetHalf = day <= 15 ? 1 : 2;
  return `${y}-${m}-${half}`;
}

export function parseBudgetPeriod(period: string): {
  year: number;
  month: number;
  half: BudgetHalf;
  monthKey: string;
} {
  const parts = period.split("-");
  if (parts.length === 3 && (parts[2] === "1" || parts[2] === "2")) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const half = parseInt(parts[2], 10) as BudgetHalf;
    return {
      year,
      month,
      half,
      monthKey: `${parts[0]}-${parts[1]}`,
    };
  }
  // legacy YYYY-MM → treat as half 1
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  return {
    year,
    month,
    half: 1,
    monthKey: `${parts[0]}-${parts[1]}`,
  };
}

export function makeBudgetPeriod(
  year: number,
  month: number,
  half: BudgetHalf
): string {
  return `${year}-${String(month).padStart(2, "0")}-${half}`;
}

/** Date range for a budget period (quincena) */
export function budgetPeriodBounds(period: string): {
  start: string;
  end: string;
} {
  const { year, month, half, monthKey } = parseBudgetPeriod(period);
  const last = new Date(year, month, 0).getDate();
  if (half === 1) {
    return {
      start: `${monthKey}-01`,
      end: `${monthKey}-15`,
    };
  }
  return {
    start: `${monthKey}-16`,
    end: `${monthKey}-${String(last).padStart(2, "0")}`,
  };
}

/** All period keys for a calendar month */
export function monthBudgetPeriods(monthKeyStr: string): [string, string] {
  return [`${monthKeyStr}-1`, `${monthKeyStr}-2`];
}
