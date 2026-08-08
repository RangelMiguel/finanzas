"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { budgetPeriodKey, monthKey } from "@/lib/utils";
import { CatchupDialog } from "@/components/catchup-dialog";
import { format, parse, addMonths, subMonths } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PwaSetup } from "@/components/pwa/pwa-setup";

type Dash = {
  month: string;
  summary: {
    incomeCents: number | null;
    expenseCents: number | null;
    balanceCents: number | null;
  };
  accounts: {
    id: string;
    name: string;
    icon: string;
    balanceCents: number | null;
    balancesHidden?: boolean;
  }[];
  topCategories: {
    category: { id: string; name: string; icon: string; color: string };
    amountCents: number;
  }[];
  creditCards: { id: string; name: string; lastFour: string }[];
  recentTransactions: {
    id: string;
    description: string;
    amountCents: number;
    type: string;
    date: string;
    category?: { icon: string; name: string } | null;
    createdBy?: { displayName: string } | null;
  }[];
  household: { name: string };
};

type Budget = {
  id: string;
  amountCents: number;
  emergencyCents?: number;
  spentCents: number;
  remainingCents?: number;
  goalAllocatedCents?: number;
  availableCents?: number;
  category: { name: string; icon: string };
};
type CloseStatus = {
  period: string;
  canClose: boolean;
};

function DashboardInner() {
  const params = useSearchParams();
  const { t, tr, money, locale } = useApp();
  const moneyOrHidden = (cents: number | null | undefined) =>
    cents == null ? "—" : money(cents);
  const [month, setMonth] = useState(monthKey());
  const [data, setData] = useState<Dash | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [periodBudgets, setPeriodBudgets] = useState<Budget[]>([]);
  const [pendingClose, setPendingClose] = useState<CloseStatus | null>(null);
  const [catchup, setCatchup] = useState(false);
  const dateLocale = locale === "en" ? enUS : es;
  const currentPeriod = budgetPeriodKey();

  useEffect(() => {
    if (params.get("catchup") === "1") setCatchup(true);
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api<Dash>(`/api/dashboard?month=${month}`);
        if (!cancelled) setData(d);
      } catch (e) {
        console.error(e);
        return;
      }
      try {
        const [h1, h2, close] = await Promise.all([
          api<{ budgets: Budget[] }>(`/api/budgets?period=${month}-1`),
          api<{ budgets: Budget[] }>(`/api/budgets?period=${month}-2`),
          api<{ pendingClose: CloseStatus | null }>("/api/budgets/close"),
        ]);
        if (cancelled) return;
        const all = [...(h1.budgets || []), ...(h2.budgets || [])];
        setBudgets(all);
        const live = currentPeriod.startsWith(month + "-")
          ? currentPeriod.endsWith("-2")
            ? h2.budgets || []
            : h1.budgets || []
          : all;
        setPeriodBudgets(live);
        setPendingClose(close.pendingClose);
      } catch {
        if (!cancelled) {
          setBudgets([]);
          setPeriodBudgets([]);
          setPendingClose(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, currentPeriod]);

  function shift(delta: number) {
    const d = parse(month + "-01", "yyyy-MM-dd", new Date());
    const n = delta > 0 ? addMonths(d, 1) : subMonths(d, 1);
    setMonth(format(n, "yyyy-MM"));
  }

  const title = format(parse(month + "-01", "yyyy-MM-dd", new Date()), "MMMM yyyy", {
    locale: dateLocale,
  });

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-28 w-full rounded-[1.5rem]" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="skeleton h-28" />
          <div className="skeleton h-28" />
          <div className="skeleton h-28" />
        </div>
        <div className="skeleton h-52" />
        <p className="text-sm text-[var(--fg-muted)]">{t.loading}</p>
      </div>
    );
  }

  const alerts = budgets
    .map((b) => {
      const emergency = b.emergencyCents || 0;
      const available =
        b.availableCents ?? b.amountCents + emergency;
      const committed = b.spentCents + (b.goalAllocatedCents || 0);
      const ratio = b.amountCents > 0 ? committed / b.amountCents : 0;
      const overAll = committed > available;
      const usingEmergency =
        emergency > 0 && committed > b.amountCents && !overAll;
      return { ...b, ratio, overAll, usingEmergency, available, committed };
    })
    .filter((b) => b.ratio >= 0.8 || b.overAll || b.usingEmergency)
    .sort((a, b) => b.ratio - a.ratio);

  const income = data.summary.incomeCents || 0;
  const expense = data.summary.expenseCents || 0;
  const flowMax = Math.max(income, expense, 1);

  return (
    <div className="space-y-6">
      <div className="dash-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="page-kicker">{t.nav.dashboard}</p>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label={t.back}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h1 className="page-title capitalize">{title}</h1>
              <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label={t.next}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button variant="secondary" onClick={() => setCatchup(true)}>
            {t.nav.catchUp}
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="bento-stat">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--income)]">
              {t.dashboard.incomes}
            </p>
            <p className="mt-2 font-display text-3xl money-income sm:text-4xl">
              {moneyOrHidden(data.summary.incomeCents)}
            </p>
            <div className="bento-meter" aria-hidden>
              <span style={{ width: `${(income / flowMax) * 100}%` }} />
            </div>
          </div>
          <div className="bento-stat">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--expense)]">
              {t.dashboard.expenses}
            </p>
            <p className="mt-2 font-display text-3xl money-expense sm:text-4xl">
              {moneyOrHidden(data.summary.expenseCents)}
            </p>
            <div className="bento-meter" aria-hidden>
              <span
                className="!bg-[linear-gradient(90deg,var(--expense),#fb7185)]"
                style={{ width: `${(expense / flowMax) * 100}%` }}
              />
            </div>
          </div>
          <div className="bento-stat">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-2)]">
              {t.dashboard.balance}
            </p>
            <p
              className={`mt-2 font-display text-3xl sm:text-4xl ${
                data.summary.balanceCents == null || data.summary.balanceCents >= 0
                  ? "text-[var(--title-2)]"
                  : "money-expense"
              }`}
            >
              {moneyOrHidden(data.summary.balanceCents)}
            </p>
            <div className="bento-meter" aria-hidden>
              <span
                style={{
                  width: `${Math.min(
                    100,
                    Math.abs(data.summary.balanceCents || 0) / flowMax * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Install app + enable notifications — outside the alerts tray */}
      <PwaSetup variant="banner" />

      {pendingClose?.canClose && (
        <Link
          href="/budgets"
          className="close-banner flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
        >
          <span className="text-sm text-amber-50">
            {tr(t.dashboard.closeBudgets, { period: pendingClose.period })}
          </span>
          <span className="text-xs font-semibold text-amber-100">
            {t.dashboard.closeBudgetsCta} →
          </span>
        </Link>
      )}

      {periodBudgets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.thisPeriodBudgets}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {periodBudgets.slice(0, 6).map((b) => {
              const available =
                b.availableCents ??
                b.amountCents + (b.emergencyCents || 0);
              const committed = b.spentCents + (b.goalAllocatedCents || 0);
              const remaining =
                b.remainingCents ?? Math.max(0, available - committed);
              const pct =
                available > 0
                  ? Math.min(100, (committed / available) * 100)
                  : 0;
              const over = committed > available;
              const alert = alerts.find((a) => a.id === b.id);
              return (
                <div key={b.id}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="text-[var(--fg)]">
                      {b.category.icon} {b.category.name}
                      {alert && (
                        <span
                          className={`ml-1.5 text-xs ${
                            alert.overAll
                              ? "money-expense"
                              : alert.usingEmergency
                                ? "text-amber-100"
                                : "text-[var(--accent)]"
                          }`}
                        >
                          {alert.overAll
                            ? t.dashboard.budgetOver
                            : alert.usingEmergency
                              ? t.dashboard.budgetEmergency
                              : t.dashboard.budgetNear}
                        </span>
                      )}
                    </span>
                    <span
                      className={`tabular-nums ${over ? "money-expense" : "text-[var(--fg-muted)]"}`}
                    >
                      {money(remaining)}
                    </span>
                  </div>
                  <div className="progress-track h-2">
                    <div
                      className={`progress-fill ${over ? "bg-[var(--expense)]" : ""}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {data.accounts.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            {t.dashboard.accountsStrip}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {data.accounts.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <span className="flex min-w-0 items-center gap-2.5 text-sm text-[var(--fg-muted)]">
                    <span className="icon-bubble text-base">{a.icon}</span>
                    <span className="truncate">{a.name}</span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {moneyOrHidden(a.balanceCents)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.topCategories}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.topCategories.length === 0 && (
              <p className="text-sm text-[var(--fg-faint)]">{t.dashboard.noExpenses}</p>
            )}
            {data.topCategories.map((row) => {
              const catMax = data.topCategories[0]?.amountCents || 1;
              return (
                <div key={row.category.id} className="rounded-xl px-1 py-1.5">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="icon-bubble h-8 w-8 text-sm">
                        {row.category.icon}
                      </span>
                      {row.category.name}
                    </span>
                    <span className="money-expense tabular-nums">
                      {money(row.amountCents)}
                    </span>
                  </div>
                  <div className="bento-meter ml-10" aria-hidden>
                    <span
                      style={{
                        width: `${Math.max(8, (row.amountCents / catMax) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.creditCards}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.creditCards.length === 0 && (
              <p className="text-sm text-[var(--fg-faint)]">{t.dashboard.noCards}</p>
            )}
            {data.creditCards.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 text-sm text-[var(--fg-muted)]"
              >
                <span className="font-medium text-[var(--fg)]">{c.name}</span>
                <span className="font-mono text-xs tracking-[0.18em] text-[var(--fg-faint)]">
                  {c.lastFour ? `•••• ${c.lastFour}` : "••••"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.dashboard.recent}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0.5">
          {data.recentTransactions.length === 0 && (
            <p className="text-sm text-[var(--fg-faint)]">{t.dashboard.noTxns}</p>
          )}
          {data.recentTransactions.map((txn) => (
            <div key={txn.id} className="txn-row text-sm">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="icon-bubble text-sm">
                  {txn.category?.icon || "•"}
                </span>
                <div className="min-w-0">
                  <div className="truncate">{txn.description}</div>
                  <div className="text-xs text-[var(--fg-muted)]">
                    {txn.date}
                    {txn.createdBy ? ` · ${txn.createdBy.displayName}` : ""}
                  </div>
                </div>
              </div>
              <span
                className={`shrink-0 tabular-nums ${
                  txn.type === "income"
                    ? "money-income"
                    : txn.type === "transfer"
                      ? "text-[var(--fg-muted)]"
                      : txn.type === "cc_payment"
                        ? "text-amber-200"
                        : "money-expense"
                }`}
              >
                {txn.type === "expense" ? "−" : txn.type === "income" ? "+" : ""}
                {money(txn.amountCents)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <CatchupDialog open={catchup} onClose={() => setCatchup(false)} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="text-[var(--fg-muted)]">…</div>}>
      <DashboardInner />
    </Suspense>
  );
}
