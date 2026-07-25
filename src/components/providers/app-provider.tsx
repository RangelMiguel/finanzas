"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { dictionaries, interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import { formatMoney as formatMoneyBase } from "@/lib/utils";
import type { AppLocale } from "@/lib/currencies";
import { api } from "@/lib/api-client";
import type { MemberVisibility } from "@/lib/visibility";
import { FULL_VISIBILITY } from "@/lib/visibility";
import {
  applyTheme,
  DEFAULT_THEME,
  normalizeThemeId,
  THEME_KEY,
  type ThemeId,
} from "@/lib/themes";

type Member = {
  id: string;
  role: string;
  user: { id: string; email: string; displayName: string };
};

export type FontScale = "sm" | "md" | "lg" | "xl";

export type A11yPrefs = {
  fontScale: FontScale;
  reducedMotion: boolean;
  highContrast: boolean;
  underlineLinks: boolean;
};

type AppContextValue = {
  locale: AppLocale;
  currency: string;
  role: string | null;
  householdName: string | null;
  displayName: string | null;
  userId: string | null;
  members: Member[];
  visibility: MemberVisibility;
  ready: boolean;
  a11y: A11yPrefs;
  theme: ThemeId;
  t: Dictionary;
  tr: (template: string, vars: Record<string, string | number>) => string;
  money: (cents: number) => string;
  setLocale: (locale: AppLocale) => Promise<void>;
  setCurrency: (currency: string) => Promise<void>;
  setA11y: (patch: Partial<A11yPrefs>) => void;
  setTheme: (theme: ThemeId) => Promise<void>;
  refresh: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

const LOCALE_KEY = "mf_locale";
const A11Y_KEY = "mf_a11y";

const defaultA11y: A11yPrefs = {
  fontScale: "md",
  reducedMotion: false,
  highContrast: false,
  underlineLinks: false,
};

function applyA11y(prefs: A11yPrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.font = prefs.fontScale;
  root.dataset.reducedMotion = String(prefs.reducedMotion);
  root.dataset.contrast = prefs.highContrast ? "high" : "normal";
  root.dataset.underlineLinks = String(prefs.underlineLinks);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("es");
  const [currency, setCurrencyState] = useState("MXN");
  const [role, setRole] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [ready, setReady] = useState(false);
  const [a11y, setA11yState] = useState<A11yPrefs>(defaultA11y);
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
  const [visibility, setVisibility] = useState<MemberVisibility>(FULL_VISIBILITY);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(A11Y_KEY);
      if (raw) {
        const parsed = { ...defaultA11y, ...JSON.parse(raw) } as A11yPrefs;
        setA11yState(parsed);
        applyA11y(parsed);
      } else if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const parsed = { ...defaultA11y, reducedMotion: true };
        setA11yState(parsed);
        applyA11y(parsed);
      } else {
        applyA11y(defaultA11y);
      }
      const stored = localStorage.getItem(LOCALE_KEY) as AppLocale | null;
      if (stored === "en" || stored === "es") setLocaleState(stored);
      const storedTheme = normalizeThemeId(localStorage.getItem(THEME_KEY));
      setThemeState(storedTheme);
      applyTheme(storedTheme);
    } catch {
      applyA11y(defaultA11y);
      applyTheme(DEFAULT_THEME);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{
        user: { userId?: string; displayName: string; locale?: string };
        household: { name: string; currency: string } | null;
        currency?: string;
        role: string | null;
        members: Member[];
        visibility?: MemberVisibility | null;
        theme?: string | null;
      }>("/api/auth/me");
      const loc = (data.user.locale === "en" ? "en" : "es") as AppLocale;
      setLocaleState(loc);
      setCurrencyState(data.currency || data.household?.currency || "MXN");
      setRole(data.role);
      setHouseholdName(data.household?.name ?? null);
      setDisplayName(data.user.displayName);
      setUserId(data.user.userId ?? null);
      setMembers(data.members || []);
      if (data.visibility) setVisibility(data.visibility);
      else setVisibility(FULL_VISIBILITY);
      if (data.theme != null) {
        const nextTheme = normalizeThemeId(data.theme);
        setThemeState(nextTheme);
        applyTheme(nextTheme);
      }
      if (typeof document !== "undefined") {
        document.documentElement.lang = loc;
        localStorage.setItem(LOCALE_KEY, loc);
      }
    } catch {
      const stored =
        typeof window !== "undefined"
          ? (localStorage.getItem(LOCALE_KEY) as AppLocale | null)
          : null;
      if (stored === "en" || stored === "es") setLocaleState(stored);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setLocale = useCallback(async (next: AppLocale) => {
    setLocaleState(next);
    localStorage.setItem(LOCALE_KEY, next);
    document.documentElement.lang = next;
    try {
      await api("/api/preferences", { method: "PATCH", json: { locale: next } });
    } catch {
      /* auth pages */
    }
  }, []);

  const setCurrency = useCallback(async (next: string) => {
    setCurrencyState(next);
    await api("/api/households", { method: "PATCH", json: { currency: next } });
  }, []);

  const setA11y = useCallback((patch: Partial<A11yPrefs>) => {
    setA11yState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(A11Y_KEY, JSON.stringify(next));
      applyA11y(next);
      return next;
    });
  }, []);

  const setTheme = useCallback(async (next: ThemeId) => {
    const id = normalizeThemeId(next);
    setThemeState(id);
    applyTheme(id);
    try {
      await api("/api/preferences", { method: "PATCH", json: { theme: id } });
    } catch {
      /* auth pages / offline */
    }
  }, []);

  const t = dictionaries[locale] || dictionaries.es;

  const value = useMemo<AppContextValue>(
    () => ({
      locale,
      currency,
      role,
      householdName,
      displayName,
      userId,
      members,
      visibility,
      ready,
      a11y,
      theme,
      t,
      tr: (template, vars) => interpolate(template, vars),
      money: (cents) => formatMoneyBase(cents, currency, locale),
      setLocale,
      setCurrency,
      setA11y,
      setTheme,
      refresh,
    }),
    [
      locale,
      currency,
      role,
      householdName,
      displayName,
      userId,
      members,
      visibility,
      ready,
      a11y,
      theme,
      t,
      setLocale,
      setCurrency,
      setA11y,
      setTheme,
      refresh,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
