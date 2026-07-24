"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import {
  monthKey,
  centsToInput,
  budgetPeriodKey,
  parseBudgetPeriod,
  type BudgetHalf,
} from "@/lib/utils";
import { useApp } from "@/components/providers/app-provider";
import { toast } from "sonner";
import { format, parse, subMonths, addMonths } from "date-fns";

type Budget = {
  id: string;
  amountCents: number;
  spentCents: number;
  categoryId: string;
  period: string;
  category: { id: string; name: string; icon: string };
  isFromDefault?: boolean;
};
type DefaultRow = {
  id: string;
  categoryId: string;
  amountCents: number;
  category: { id: string; name: string; icon: string };
};
type Cat = { id: string; name: string; type: string; icon: string };
type Scope = "this_period" | "both_periods" | "default" | "next_year";

export default function BudgetsPage() {
  const { money, t, tr, locale } = useApp();
  const initial = parseBudgetPeriod(budgetPeriodKey());
  const [month, setMonth] = useState(initial.monthKey);
  const [half, setHalf] = useState<BudgetHalf>(initial.half);
  const [bounds, setBounds] = useState<{ start: string; end: string } | null>(
    null
  );
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [defaults, setDefaults] = useState<DefaultRow[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [form, setForm] = useState({
    categoryId: "",
    amount: "",
    scope: "this_period" as Scope,
  });
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [showDefaults, setShowDefaults] = useState(false);

  const period = `${month}-${half}`;

  async function load() {
    const [b, c] = await Promise.all([
      api<{
        budgets: Budget[];
        defaults: DefaultRow[];
        appliedDefaults?: number;
        bounds: { start: string; end: string };
        period: string;
        half: number;
      }>(`/api/budgets?period=${period}`),
      api<{ categories: Cat[] }>("/api/categories"),
    ]);
    setBudgets(b.budgets);
    setDefaults(b.defaults || []);
    setBounds(b.bounds);
    setCategories(c.categories.filter((x) => x.type === "expense"));
    if (b.appliedDefaults && b.appliedDefaults > 0) {
      toast.message(
        tr(t.budgets.appliedDefaults, { n: b.appliedDefaults })
      );
    }
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function openEdit(b: Budget) {
    setEditId(b.id);
    setForm({
      categoryId: b.categoryId || b.category.id,
      amount: centsToInput(b.amountCents),
      scope: "this_period",
    });
    setMode("edit");
  }

  async function save() {
    try {
      if (mode === "edit" && editId) {
        await api("/api/budgets", {
          method: "PATCH",
          json: {
            id: editId,
            amount: form.amount,
            categoryId: form.categoryId,
            period,
            scope: form.scope,
          },
        });
        toast.success(t.budgets.updated || t.success);
      } else {
        await api("/api/budgets", {
          method: "POST",
          json: { ...form, period },
        });
        toast.success(t.budgets.saved);
      }
      setMode("none");
      setEditId(null);
      setForm({ categoryId: "", amount: "", scope: "this_period" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function copyPrev() {
    // previous half-period
    let fromPeriod: string;
    if (half === 2) {
      fromPeriod = `${month}-1`;
    } else {
      const d = parse(month + "-01", "yyyy-MM-dd", new Date());
      const prev = format(subMonths(d, 1), "yyyy-MM");
      fromPeriod = `${prev}-2`;
    }
    try {
      const res = await api<{ copied: number }>("/api/budgets/copy", {
        method: "POST",
        json: { fromPeriod, toPeriod: period },
      });
      toast.success(tr(t.budgets.copied, { n: res.copied }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function remove(id: string) {
    await api(`/api/budgets?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function removeDefault(id: string) {
    await api(`/api/budgets/defaults?id=${id}`, { method: "DELETE" });
    await load();
  }

  const totalBudget = budgets.reduce((s, b) => s + b.amountCents, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spentCents, 0);
  const halfLabel =
    half === 1
      ? t.budgets.half1 || "1st half (1–15)"
      : t.budgets.half2 || "2nd half (16–end)";

  return (
    <div>
      <PageHeader
        kicker={t.nav.budgets}
        title={t.budgets.title}
        subtitle={t.budgets.twoPerMonthHint || t.budgets.subtitle}
        actions={
          <>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-auto"
              aria-label={t.period}
            />
            <div
              className="flex rounded-xl border border-white/10 bg-black/30 p-0.5"
              role="group"
              aria-label={t.budgets.periodHalf || "Half of month"}
            >
              <button
                type="button"
                onClick={() => setHalf(1)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  half === 1
                    ? "bg-teal-400/20 text-teal-100"
                    : "text-[var(--fg-faint)]"
                }`}
              >
                {t.budgets.half1Short || "1–15"}
              </button>
              <button
                type="button"
                onClick={() => setHalf(2)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  half === 2
                    ? "bg-teal-400/20 text-teal-100"
                    : "text-[var(--fg-faint)]"
                }`}
              >
                {t.budgets.half2Short || "16–end"}
              </button>
            </div>
            <Button variant="secondary" onClick={copyPrev}>
              {t.budgets.copyPrevPeriod || t.budgets.copyPrev}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowDefaults((v) => !v)}
            >
              {t.budgets.manageDefaults}
            </Button>
            <Button
              onClick={() => {
                setMode("new");
                setEditId(null);
                setForm({
                  categoryId: "",
                  amount: "",
                  scope: "this_period",
                });
              }}
            >
              {t.budgets.new}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-[var(--fg-muted)]">
        <span className="stat-pill">{halfLabel}</span>
        {bounds && (
          <span className="stat-pill">
            {bounds.start} → {bounds.end}
          </span>
        )}
      </div>

      <Card premium className="mb-4">
        <CardContent className="flex justify-between py-5 text-sm">
          <span className="text-[var(--fg-muted)]">{t.total}</span>
          <span className="font-display text-lg">
            {money(totalSpent)} / {money(totalBudget)}
          </span>
        </CardContent>
      </Card>

      {showDefaults && (
        <Card premium className="mb-4">
          <CardHeader>
            <CardTitle>{t.budgets.defaultTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-[var(--fg-faint)]">
              {t.budgets.defaultHintTwo || t.budgets.defaultHint}
            </p>
            {defaults.length === 0 && (
              <p className="text-sm text-[var(--fg-faint)]">
                {t.budgets.noDefaults}
              </p>
            )}
            {defaults.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between text-sm border-b border-white/5 py-2"
              >
                <span>
                  {d.category.icon} {d.category.name}
                </span>
                <div className="flex items-center gap-2">
                  <span>{money(d.amountCents)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeDefault(d.id)}
                  >
                    {t.delete}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {mode !== "none" && (
        <Card className="mb-4" premium>
          <CardHeader>
            <CardTitle>{mode === "edit" ? t.edit : t.budgets.new}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.category}</Label>
              <Select
                className="mt-1"
                value={form.categoryId}
                onChange={(e) =>
                  setForm({ ...form, categoryId: e.target.value })
                }
              >
                <option value="">{t.select}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t.amount}</Label>
              <Input
                className="mt-1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{t.budgets.applyScope}</Label>
              <Select
                className="mt-1"
                value={form.scope}
                onChange={(e) =>
                  setForm({ ...form, scope: e.target.value as Scope })
                }
              >
                <option value="this_period">
                  {t.budgets.scopeThisPeriod || "This half-month only"}
                </option>
                <option value="both_periods">
                  {t.budgets.scopeBothPeriods ||
                    "Both halves of this calendar month"}
                </option>
                <option value="default">
                  {t.budgets.scopeDefaultPeriod ||
                    "This period + save as default"}
                </option>
                <option value="next_year">
                  {t.budgets.scopeNextYearAll ||
                    "Default + all half-months next year (24 periods)"}
                </option>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={save}>{t.save}</Button>
              <Button variant="ghost" onClick={() => setMode("none")}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {budgets.length === 0 && (
          <p className="text-sm text-[var(--fg-faint)]">{t.budgets.empty}</p>
        )}
        {budgets.map((b) => {
          const pct =
            b.amountCents > 0 ? (b.spentCents / b.amountCents) * 100 : 0;
          const over = b.spentCents > b.amountCents;
          return (
            <Card key={b.id}>
              <CardContent className="py-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>
                    {b.category.icon} {b.category.name}
                    {b.isFromDefault && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-teal-300/80">
                        default
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={over ? "money-expense" : ""}>
                      {money(b.spentCents)} / {money(b.amountCents)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEdit(b)}
                    >
                      {t.edit}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(b.id)}
                    >
                      {t.delete}
                    </Button>
                  </div>
                </div>
                <div className="progress-track">
                  <div
                    className={`progress-fill ${over ? "bg-[var(--expense)]" : ""}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                {over && (
                  <p className="mt-1 text-xs money-expense">
                    {tr(t.budgets.overBy, {
                      amount: money(b.spentCents - b.amountCents),
                    })}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
