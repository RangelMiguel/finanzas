"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  PiggyBank,
  CreditCard,
  RefreshCw,
  Landmark,
  Gauge,
  FileText,
  Upload,
  Settings,
  Users,
  LogOut,
  CalendarClock,
  Gift,
  Receipt,
  Shield,
  Target,
  Palmtree,
  CircleHelp,
  Store,
  Home,
  ShoppingBasket,
  TrendingUp,
  HandCoins,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import type { MemberVisibility } from "@/lib/visibility";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { warmOfflineRoutes } from "@/lib/offline/warm-routes";

export function Sidebar({
  householdName,
  userName,
  role,
  onNavigate,
}: {
  householdName?: string;
  userName?: string;
  role?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    t,
    locale,
    setLocale,
    currency,
    visibility,
    installedModules,
    ready,
    role: realRole,
  } = useApp();
  // Admin chrome (Security) uses the real signed-in role, not the simulated one
  const isAdmin = realRole === "owner" || realRole === "admin";
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Prefetch RSC + cache full HTML for offline menu navigation
  useEffect(() => {
    if (!ready || offline) return;
    void warmOfflineRoutes((href) => {
      try {
        router.prefetch(href);
      } catch {
        /* ignore */
      }
    });
  }, [ready, offline, router]);

  /**
   * Offline: force full document navigation so the service worker can serve
   * the cached HTML for that path. Soft Next.js navigations need RSC flights
   * that often fail offline and bounce users back to home.
   */
  const handleNavClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, href: string) => {
      onNavigate?.();
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        e.preventDefault();
        const path = href.split("?")[0];
        if (window.location.pathname !== path || href.includes("?")) {
          window.location.assign(href);
        }
      }
    },
    [onNavigate]
  );

  const NAV: {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    module?: keyof MemberVisibility["modules"];
    adminOnly?: boolean;
    addon?: boolean;
  }[] = [
    { href: "/", label: t.nav.dashboard, icon: LayoutDashboard, module: "dashboard" },
    { href: "/accounts", label: t.nav.accounts, icon: Wallet, module: "accounts" },
    {
      href: "/transactions",
      label: t.nav.transactions,
      icon: ArrowLeftRight,
      module: "transactions",
    },
    { href: "/budgets", label: t.nav.budgets, icon: PiggyBank, module: "budgets" },
    {
      href: "/credit-cards",
      label: t.nav.creditCards,
      icon: CreditCard,
      module: "creditCards",
    },
    { href: "/recurring", label: t.nav.recurring, icon: RefreshCw, module: "recurring" },
    { href: "/debts", label: t.nav.debts, icon: Landmark, module: "debts" },
    { href: "/goals", label: t.nav.goals, icon: Target, module: "goals" },
    {
      href: "/retirement",
      label: t.nav.retirement,
      icon: Palmtree,
      module: "retirement",
    },
    { href: "/personal", label: t.nav.personal || t.nav.allowances, icon: Gift, module: "allowances" },
    {
      href: "/safe-to-spend",
      label: t.nav.safeToSpend,
      icon: Gauge,
      module: "safeToSpend",
    },
    { href: "/tickets", label: t.nav.tickets, icon: Receipt, module: "tickets" },
    {
      href: "/import-statement",
      label: t.nav.importStatement,
      icon: FileText,
      module: "statements",
    },
    {
      href: "/import-export",
      label: t.nav.importExport,
      icon: Upload,
      module: "importExport",
    },
    { href: "/family", label: t.nav.family, icon: Users, module: "family" },
    {
      href: "/properties",
      label: t.nav.properties,
      icon: Home,
      module: "properties",
      addon: true,
    },
    {
      href: "/prices",
      label: t.nav.prices,
      icon: ShoppingBasket,
      module: "prices",
      addon: true,
    },
    {
      href: "/investments",
      label: t.nav.investments,
      icon: TrendingUp,
      module: "investments",
      addon: true,
    },
    {
      href: "/credits",
      label: t.nav.credits,
      icon: HandCoins,
      module: "credits",
      addon: true,
    },
    {
      href: "/marketplace",
      label: t.nav.marketplace,
      icon: Store,
    },
    {
      href: "/security",
      label: t.nav.security,
      icon: Shield,
      adminOnly: true,
    },
    { href: "/settings", label: t.nav.settings, icon: Settings, module: "settings" },
    { href: "/ai", label: t.nav.ai, icon: Sparkles },
    // Always visible — no module gate
    { href: "/help", label: t.nav.help, icon: CircleHelp },
  ];

  const visibleNav = NAV.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.addon && !installedModules.includes(item.module || "")) {
      return false;
    }
    if (!item.module) return true;
    return !!visibility.modules[item.module];
  });

  async function logout() {
    try {
      const { clearAllOfflineData } = await import("@/lib/offline/db");
      await clearAllOfflineData();
    } catch {
      /* ignore */
    }
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* offline logout: local session cookie may remain until online */
    }
    toast.success(t.sessionClosed);
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className="sidebar-shell flex h-full w-[17rem] shrink-0 flex-col"
      aria-label={t.mainNav}
    >
      <div className="flex items-center gap-3 px-4 py-6">
        <div className="brand-mark" aria-hidden>
          <span>✦</span>
        </div>
        <div className="min-w-0">
          <div className="font-display truncate text-lg text-white">
            {t.appName}
          </div>
          <div className="truncate text-[11px] text-[var(--fg-muted)]">
            {householdName || t.appTagline} · {currency}
          </div>
        </div>
      </div>

      <nav
        className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4"
        aria-label={t.mainNav}
      >
        {visibleNav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={!offline}
              onClick={(e) => handleNavClick(e, item.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "nav-item flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm",
                active
                  ? "nav-item-active"
                  : "text-[var(--fg-muted)] hover:bg-white/[0.05] hover:text-[var(--fg)]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-white/10 p-3">
        <div
          className="flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1"
          role="group"
          aria-label={t.language}
        >
          <button
            type="button"
            onClick={() => setLocale("es")}
            aria-pressed={locale === "es"}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors",
              locale === "es"
                ? "bg-[var(--accent)] text-[#081018]"
                : "text-[var(--fg-muted)] hover:bg-white/5"
            )}
          >
            ES
          </button>
          <button
            type="button"
            onClick={() => setLocale("en")}
            aria-pressed={locale === "en"}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors",
              locale === "en"
                ? "bg-[var(--accent)] text-[#081018]"
                : "text-[var(--fg-muted)] hover:bg-white/5"
            )}
          >
            EN
          </button>
        </div>
        {visibility.modules.dashboard && (
          <Link
            href="/?catchup=1"
            prefetch={!offline}
            onClick={(e) => handleNavClick(e, "/?catchup=1")}
            className="flex w-full items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/15 px-3 py-2 text-xs font-medium text-[var(--fg)] hover:bg-[var(--accent)]/20"
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {t.nav.catchUp}
          </Link>
        )}
        <div className="px-1 text-xs text-[var(--fg-muted)]">
          {userName}
          {role ? ` · ${t.roles[role as keyof typeof t.roles] || role}` : ""}
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--fg-muted)] hover:bg-red-500/10 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {t.logout}
        </button>
      </div>
    </aside>
  );
}
