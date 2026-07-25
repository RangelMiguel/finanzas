"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { monthKey } from "@/lib/utils";
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
  spentCents: number;
  category: { name: string; icon: string };
};

function DashboardInner() {
  const params = useSearchParams();
  const { t, money, locale } = useApp();
  const moneyOrHidden = (cents: number | null | undefined) =>
    cents == null ? "—" : money(cents);
  const [month, setMonth] = useState(monthKey());
  const [data, setData] = useState<Dash | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [catchup, setCatchup] = useState(false);
  const dateLocale = locale === "en" ? enUS : es;

  useEffect(() => {
    if (params.get("catchup") === "1") setCatchup(true);
  }, [params]);

  useEffect(() => {
    Promise.all([
      api<Dash>(`/api/dashboard?month=${month}`),
      api<{ budgets: Budget[] }>(`/api/budgets?month=${month}`),
    ])
      .then(([d, b]) => {
        setData(d);
        setBudgets(b.budgets);
      })
      .catch(console.error);
  }, [month]);

  function shift(delta: number) {
    const d = parse(month + "-01", "yyyy-MM-dd", new Date());
    const n = delta > 0 ? addMonths(d, 1) : subMonths(d, 1);
    setMonth(format(n, "yyyy-MM"));
  }

  const title = format(parse(month + "-01", "yyyy-MM-dd", new Date()), "MMMM yyyy", {
    locale: dateLocale,
  });

  if (!data) {
    return <div className="text-[var(--fg-muted)]">{t.loading}</div>;
  }

  const alerts = budgets
    .map((b) => ({
      ...b,
      ratio: b.amountCents > 0 ? b.spentCents / b.amountCents : 0,
    }))
    .filter((b) => b.ratio >= 0.8)
    .sort((a, b) => b.ratio - a.ratio);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="page-kicker">{t.nav.dashboard}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label={t.back}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h1 className="page-title capitalize">{title}</h1>
            <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label={t.next}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="page-subtitle">
            {t.dashboard.title} — {data.household.name}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setCatchup(true)}>
          {t.nav.catchUp}
        </Button>
      </div>

      {/* Install app + enable notifications — outside the alerts tray */}
      <PwaSetup variant="banner" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bento-stat">
          <p className="text-[11px] uppercase tracking-[0.18em] text-teal-200/70">
            {t.dashboard.incomes}
          </p>
          <p className="mt-2 font-display text-3xl money-income">
            {moneyOrHidden(data.summary.incomeCents)}
          </p>
        </div>
        <div className="bento-stat">
          <p className="text-[11px] uppercase tracking-[0.18em] text-rose-200/70">
            {t.dashboard.expenses}
          </p>
          <p className="mt-2 font-display text-3xl money-expense">
            {moneyOrHidden(data.summary.expenseCents)}
          </p>
        </div>
        <div className="bento-stat">
          <p className="text-[11px] uppercase tracking-[0.18em] text-violet-200/70">
            {t.dashboard.balance}
          </p>
          <p
            className={`mt-2 font-display text-3xl ${
              (data.summary.balanceCents == null || data.summary.balanceCents >= 0) ? "text-teal-100" : "money-expense"
            }`}
          >
            {moneyOrHidden(data.summary.balanceCents)}
          </p>
        </div>
      </div>

      {alerts.length > 0 && (
        <Card premium className="border-[var(--accent)]/30">
          <CardHeader>
            <CardTitle>{t.dashboard.budgetAlerts}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((b) => (
              <div
                key={b.id}
                className="flex justify-between text-sm"
              >
                <span>
                  {b.category.icon} {b.category.name}{" "}
                  <span
                    className={
                      b.ratio > 1 ? "money-expense" : "text-[var(--accent)]"
                    }
                  >
                    ({b.ratio > 1 ? t.dashboard.budgetOver : t.dashboard.budgetNear})
                  </span>
                </span>
                <span>
                  {money(b.spentCents)} / {money(b.amountCents)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.accounts.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex items-center justify-between py-4">
              <span className="text-sm text-[var(--fg-muted)]">
                {a.icon} {a.name}
              </span>
              <span className="font-semibold">{moneyOrHidden(a.balanceCents)}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card premium>
          <CardHeader>
            <CardTitle>{t.dashboard.topCategories}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topCategories.length === 0 && (
              <p className="text-sm text-[var(--fg-faint)]">{t.dashboard.noExpenses}</p>
            )}
            {data.topCategories.map((row) => (
              <div
                key={row.category.id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {row.category.icon} {row.category.name}
                </span>
                <span className="money-expense">{money(row.amountCents)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card premium>
          <CardHeader>
            <CardTitle>{t.dashboard.creditCards}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.creditCards.length === 0 && (
              <p className="text-sm text-[var(--fg-faint)]">{t.dashboard.noCards}</p>
            )}
            {data.creditCards.map((c) => (
              <div key={c.id} className="text-sm text-[var(--fg-muted)]">
                {c.name} {c.lastFour ? `•••• ${c.lastFour}` : ""}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card premium>
        <CardHeader>
          <CardTitle>{t.dashboard.recent}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.recentTransactions.length === 0 && (
            <p className="text-sm text-[var(--fg-faint)]">{t.dashboard.noTxns}</p>
          )}
          {data.recentTransactions.map((txn) => (
            <div
              key={txn.id}
              className="flex items-center justify-between border-b border-white/5 py-2 text-sm last:border-0"
            >
              <div>
                <div>
                  {txn.category?.icon || "•"} {txn.description}
                </div>
                <div className="text-xs text-[var(--fg-faint)]">
                  {txn.date}
                  {txn.createdBy ? ` · ${txn.createdBy.displayName}` : ""}
                </div>
              </div>
              <span
                className={
                  txn.type === "income"
                    ? "money-income"
                    : txn.type === "transfer"
                      ? "text-[var(--fg-muted)]"
                      : "money-expense"
                }
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
