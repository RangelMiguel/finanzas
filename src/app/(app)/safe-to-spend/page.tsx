"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { BalanceChart } from "@/components/balance-chart";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { toast } from "sonner";
import { todayISO } from "@/lib/utils";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { Target, CalendarRange, Sparkles, Trash2, Plus } from "lucide-react";

type WhatIf = {
  id: string;
  date: string;
  amount: string;
  type: "income" | "expense";
  label: string;
};
type Result = {
  empty?: boolean;
  currentBalance: number;
  minBalance: number;
  minDate: string;
  maxBalance: number;
  maxDate: string;
  safeToSpend: number;
  totalFutureIncome: number;
  totalFutureExpense: number;
  timeline: { date: string; balance: number; label?: string; delta: number }[];
  dailySeries: { date: string; balance: number; delta: number }[];
  balanceOnTargetDate: number | null;
  goalDate: string | null;
  goalBalance: number | null;
  goalReached: boolean;
  spendAndStillHitGoal: number | null;
  daysProjected: number;
  endDate: string;
  accountCount?: number;
  accounts?: { id: string; name: string }[];
  futureItems?: { date: string; amountCents: number; type: string; label: string }[];
};

type Mode = "overview" | "date" | "goal";

export default function SafeToSpendPage() {
  const { money, t, tr, locale } = useApp();
  const dateLocale = locale === "en" ? enUS : es;
  const [includeIncome, setIncludeIncome] = useState(true);
  const [reserveBudgets, setReserveBudgets] = useState(false);
  const [horizon, setHorizon] = useState("120");
  const [mode, setMode] = useState<Mode>("overview");
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [goalAmount, setGoalAmount] = useState("5000");
  const [whatIfs, setWhatIfs] = useState<WhatIf[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  const calculate = useCallback(async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        // No accountId → all household accounts combined
        includeIncome,
        reserveBudgets,
        horizon: parseInt(horizon, 10) || 90,
        whatIf: whatIfs
          .filter((w) => w.amount && w.date)
          .map((w) => ({
            date: w.date,
            amount: w.amount,
            type: w.type,
            label: w.label || undefined,
          })),
      };
      if (mode === "date") body.targetDate = targetDate;
      if (mode === "goal") {
        body.targetAmount = goalAmount;
        body.horizon = 730;
      }
      const res = await api<Result>("/api/safe-to-spend", {
        method: "POST",
        json: body,
      });
      setResult(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }, [
    includeIncome,
    reserveBudgets,
    horizon,
    whatIfs,
    mode,
    targetDate,
    goalAmount,
    t.error,
  ]);

  useEffect(() => {
    calculate();
  }, [calculate]);

  const series = useMemo(
    () => result?.dailySeries || [],
    [result]
  );

  function addWhatIf() {
    setWhatIfs((w) => [
      ...w,
      {
        id: crypto.randomUUID(),
        date: todayISO(),
        amount: "",
        type: "expense",
        label: "",
      },
    ]);
  }

  function formatNice(date: string) {
    try {
      return format(parseISO(date), "d MMM yyyy", { locale: dateLocale });
    } catch {
      return date;
    }
  }

  const modes: { id: Mode; label: string; icon: typeof Sparkles }[] = [
    { id: "overview", label: t.safe.modeOverview, icon: Sparkles },
    { id: "date", label: t.safe.modeDate, icon: CalendarRange },
    { id: "goal", label: t.safe.modeGoal, icon: Target },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.safeToSpend}
        title={t.safe.title}
        subtitle={t.safe.subtitle}
      />

      <p className="text-sm text-teal-200/70">{t.safe.interactiveHint}</p>

      {/* Mode switcher */}
      <div
        className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/30 p-1.5"
        role="tablist"
        aria-label={t.safe.title}
      >
        {modes.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(m.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all min-w-[140px] ${
                active
                  ? "bg-gradient-to-r from-teal-500/30 via-violet-500/25 to-rose-500/20 text-white shadow-[0_0_24px_rgba(45,212,191,0.15)]"
                  : "text-[var(--fg-muted)] hover:bg-white/5"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card premium className="lg:col-span-4 noise-panel">
          <CardHeader>
            <CardTitle className="text-base">{t.safe.account}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
              <p className="font-medium text-[var(--fg)]">{t.safe.allAccounts}</p>
              <p className="mt-0.5 text-xs text-[var(--fg-faint)]">
                {t.safe.allAccountsHint}
                {result?.accountCount
                  ? ` · ${result.accountCount}`
                  : result?.accounts
                    ? ` · ${result.accounts.length}`
                    : ""}
              </p>
            </div>

            {mode === "date" && (
              <div>
                <Label htmlFor="target-date">{t.safe.targetDate}</Label>
                <Input
                  id="target-date"
                  type="date"
                  className="mt-1"
                  min={todayISO()}
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>
            )}

            {mode === "goal" && (
              <div>
                <Label htmlFor="goal-amt">{t.safe.askGoal}</Label>
                <Input
                  money
                  id="goal-amt"
                  className="mt-1"
                  placeholder="5000"
                  value={goalAmount}
                  onChange={(e) => setGoalAmount(e.target.value)}
                />
              </div>
            )}

            {mode === "overview" && (
              <div>
                <Label htmlFor="horizon">{t.safe.horizon}</Label>
                <Input
                  id="horizon"
                  type="number"
                  min={14}
                  max={730}
                  placeholder="730"
                  className="mt-1"
                  value={horizon}
                  onChange={(e) => setHorizon(e.target.value)}
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
              <input
                type="checkbox"
                checked={includeIncome}
                onChange={(e) => setIncludeIncome(e.target.checked)}
              />
              {t.safe.includeIncome}
            </label>
            <label className="flex flex-col gap-1 text-sm text-[var(--fg-muted)]">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={reserveBudgets}
                  onChange={(e) => setReserveBudgets(e.target.checked)}
                />
                {t.safe.reserveBudgets}
              </span>
              <span className="pl-6 text-xs text-[var(--fg-faint)]">
                {t.safe.reserveBudgetsHint}
              </span>
            </label>

            <Button
              className="w-full"
              onClick={calculate}
              disabled={loading}
            >
              {loading ? t.loading : t.safe.simulate}
            </Button>
          </CardContent>
        </Card>

        {/* Hero result */}
        <Card premium className="lg:col-span-8 overflow-hidden relative">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-teal-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
          <CardContent className="relative space-y-5 pt-6">
            {result && !result.empty ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric
                    label={t.safe.balanceToday}
                    value={money(result.currentBalance)}
                  />
                  <Metric
                    label={t.safe.safeToSpend}
                    value={money(result.safeToSpend)}
                    accent
                  />
                  <Metric
                    label={t.safe.minProjected}
                    value={money(result.minBalance)}
                    danger={result.minBalance < 0}
                    sub={formatNice(result.minDate)}
                  />
                  <Metric
                    label={t.safe.maxBalance}
                    value={money(result.maxBalance)}
                    sub={formatNice(result.maxDate)}
                  />
                </div>

                {mode === "date" && result.balanceOnTargetDate != null && (
                  <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4">
                    <p className="text-xs uppercase tracking-wider text-violet-200/80">
                      {t.safe.balanceOnDate}
                    </p>
                    <p className="mt-1 font-display text-3xl text-violet-50">
                      {money(result.balanceOnTargetDate)}
                    </p>
                    <p className="mt-1 text-sm text-violet-100/70">
                      {formatNice(targetDate)}
                      {" · "}
                      {tr(t.safe.daysAway, {
                        n: Math.max(
                          0,
                          differenceInCalendarDays(
                            parseISO(targetDate),
                            new Date()
                          )
                        ),
                      })}
                    </p>
                  </div>
                )}

                {mode === "goal" && (
                  <div
                    className={`rounded-2xl border p-4 ${
                      result.goalReached
                        ? "border-teal-400/35 bg-teal-500/10"
                        : "border-rose-400/30 bg-rose-500/10"
                    }`}
                  >
                    {result.goalReached &&
                    result.goalDate === todayISO() ? (
                      <p className="font-display text-xl text-teal-50">
                        {t.safe.goalAlready}
                      </p>
                    ) : result.goalReached && result.goalDate ? (
                      <>
                        <p className="font-display text-xl text-teal-50">
                          {tr(t.safe.goalReachedOn, {
                            date: formatNice(result.goalDate),
                          })}
                        </p>
                        <p className="mt-1 text-sm text-teal-100/70">
                          {tr(t.safe.goalBalance, {
                            amount: money(result.goalBalance || 0),
                          })}
                          {" · "}
                          {tr(t.safe.daysAway, {
                            n: Math.max(
                              0,
                              differenceInCalendarDays(
                                parseISO(result.goalDate),
                                new Date()
                              )
                            ),
                          })}
                        </p>
                      </>
                    ) : (
                      <p className="font-display text-xl text-rose-100">
                        {t.safe.goalNever}
                      </p>
                    )}
                  </div>
                )}

                {result.minBalance < 0 && (
                  <p className="text-sm money-expense" role="alert">
                    {t.safe.negativeWarn}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[var(--fg-muted)]">{t.loading}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {result && series.length > 1 && (
        <Card premium className="noise-panel">
          <CardHeader>
            <CardTitle>{t.safe.chartTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <BalanceChart
              series={series}
              goalCents={
                mode === "goal" ? Math.round(parseFloat(goalAmount || "0") * 100) : null
              }
              targetDate={mode === "date" ? targetDate : result.goalDate}
              minDate={result.minDate}
              height={260}
            />
          </CardContent>
        </Card>
      )}

      {/* What-if + events */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card premium>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t.safe.whatIf}</CardTitle>
              <p className="mt-1 text-xs text-[var(--fg-faint)]">
                {t.safe.whatIfHint}
              </p>
            </div>
            <div className="flex gap-2">
              {whatIfs.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWhatIfs([])}
                  aria-label={t.safe.clearScenarios}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={addWhatIf}>
                <Plus className="h-4 w-4" />
                {t.safe.addWhatIf}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {whatIfs.length === 0 && (
              <p className="text-sm text-[var(--fg-faint)]">{t.safe.noEvents}</p>
            )}
            {whatIfs.map((w) => (
              <div
                key={w.id}
                className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-4"
              >
                <Select
                  value={w.type}
                  onChange={(e) =>
                    setWhatIfs((list) =>
                      list.map((x) =>
                        x.id === w.id
                          ? {
                              ...x,
                              type: e.target.value as "income" | "expense",
                            }
                          : x
                      )
                    )
                  }
                >
                  <option value="expense">{t.safe.whatIfExpense}</option>
                  <option value="income">{t.safe.whatIfIncome}</option>
                </Select>
                <Input
                  type="date"
                  value={w.date}
                  onChange={(e) =>
                    setWhatIfs((list) =>
                      list.map((x) =>
                        x.id === w.id ? { ...x, date: e.target.value } : x
                      )
                    )
                  }
                />
                <Input
                  money
                  placeholder={t.amount}
                  value={w.amount}
                  onChange={(e) =>
                    setWhatIfs((list) =>
                      list.map((x) =>
                        x.id === w.id ? { ...x, amount: e.target.value } : x
                      )
                    )
                  }
                />
                <div className="flex gap-1">
                  <Input
                    placeholder={t.description}
                    value={w.label}
                    onChange={(e) =>
                      setWhatIfs((list) =>
                        list.map((x) =>
                          x.id === w.id ? { ...x, label: e.target.value } : x
                        )
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setWhatIfs((list) => list.filter((x) => x.id !== w.id))
                    }
                    aria-label={t.delete}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card premium>
          <CardHeader>
            <CardTitle>{t.safe.events}</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 space-y-2 overflow-y-auto">
            {(!result?.timeline || result.timeline.length <= 1) && (
              <p className="text-sm text-[var(--fg-faint)]">{t.safe.noEvents}</p>
            )}
            {result?.timeline
              .filter((row) => row.label && row.label !== "start")
              .slice(0, 40)
              .map((row, i) => (
                <div
                  key={`${row.date}-${i}`}
                  className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{row.label}</div>
                    <div className="text-xs text-[var(--fg-faint)]">
                      {formatNice(row.date)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={
                        row.delta >= 0 ? "money-income" : "money-expense"
                      }
                    >
                      {row.delta >= 0 ? "+" : ""}
                      {money(Math.abs(row.delta))}
                    </div>
                    <div className="text-xs text-[var(--fg-faint)]">
                      → {money(row.balance)}
                    </div>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
  danger,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <p className="text-[11px] uppercase tracking-wider text-[var(--fg-faint)]">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-xl ${
          danger
            ? "money-expense"
            : accent
              ? "text-teal-200"
              : "text-[var(--fg)]"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-[var(--fg-faint)]">{sub}</p>}
    </div>
  );
}
