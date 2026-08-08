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
  centsToInput,
  budgetPeriodKey,
  parseBudgetPeriod,
  type BudgetHalf,
} from "@/lib/utils";
import { useApp } from "@/components/providers/app-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import {
  BudgetCloseDialog,
  type CloseStatus,
} from "@/components/budget-close-dialog";
import { BudgetToGoalDialog } from "@/components/budget-to-goal-dialog";
import { toast } from "sonner";
import { addMonths, format, parse, subMonths } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  ShieldAlert,
  Sparkles,
  Undo2,
} from "lucide-react";
import type { CloseLineInput } from "@/lib/budget-math";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type Budget = {
  id: string;
  amountCents: number;
  emergencyCents: number;
  spentCents: number;
  remainingCents: number;
  availableCents: number;
  goalAllocatedCents?: number;
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
  const { money, t, tr } = useApp();
  const { confirm } = useConfirm();
  const initial = parseBudgetPeriod(budgetPeriodKey());
  const [month, setMonth] = useState(initial.monthKey);
  const [half, setHalf] = useState<BudgetHalf>(initial.half);
  const [bounds, setBounds] = useState<{ start: string; end: string } | null>(
    null
  );
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [defaults, setDefaults] = useState<DefaultRow[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [close, setClose] = useState<CloseStatus | null>(null);
  const [pendingClose, setPendingClose] = useState<CloseStatus | null>(null);
  const [form, setForm] = useState({
    categoryId: "",
    amount: "",
    scope: "this_period" as Scope,
  });
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [showDefaults, setShowDefaults] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [toGoalFor, setToGoalFor] = useState<Budget | null>(null);
  const [toGoalBusy, setToGoalBusy] = useState(false);

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
        close: CloseStatus | null;
        pendingClose: CloseStatus | null;
      }>(`/api/budgets?period=${period}`),
      api<{ categories: Cat[] }>("/api/categories"),
    ]);
    setBudgets(b.budgets);
    setDefaults(b.defaults || []);
    setBounds(b.bounds);
    setClose(b.close || null);
    setPendingClose(b.pendingClose || null);
    setCategories(c.categories.filter((x) => x.type === "expense"));
    if (b.appliedDefaults && b.appliedDefaults > 0) {
      toast.message(tr(t.budgets.appliedDefaults, { n: b.appliedDefaults }));
    }
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function shiftHalf(delta: number) {
    if (delta > 0) {
      if (half === 1) {
        setHalf(2);
        return;
      }
      const d = parse(month + "-01", "yyyy-MM-dd", new Date());
      setMonth(format(addMonths(d, 1), "yyyy-MM"));
      setHalf(1);
      return;
    }
    if (half === 2) {
      setHalf(1);
      return;
    }
    const d = parse(month + "-01", "yyyy-MM-dd", new Date());
    setMonth(format(subMonths(d, 1), "yyyy-MM"));
    setHalf(2);
  }

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
    const ok = await confirm({
      title: t.budgets.confirmDelete,
      danger: true,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
    });
    if (!ok) return;
    await api(`/api/budgets?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function removeDefault(id: string) {
    const ok = await confirm({
      title: t.budgets.confirmDelete,
      danger: true,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
    });
    if (!ok) return;
    await api(`/api/budgets/defaults?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function doClose(body: {
    defaultKind?: "emergency" | "spent";
    lines?: CloseLineInput[];
  }) {
    if (!close) return;
    setClosing(true);
    try {
      const res = await api<{ close: CloseStatus }>("/api/budgets/close", {
        method: "POST",
        json: { period, ...body },
      });
      setCloseDialogOpen(false);
      const next = res.close;
      const summary = next.appliedSummary;
      if (!summary || close.totalRemainingCents === 0) {
        toast.success(t.budgets.closePeriodDone);
      } else if (summary.movedCents === 0) {
        toast.success(
          tr(t.budgets.closeSuccessSpent, {
            amount: money(summary.spentCents),
          })
        );
      } else if (summary.goalCents === 0 && summary.spentCents === 0) {
        toast.success(
          tr(t.budgets.closeSuccess, {
            amount: money(summary.emergencyCents),
          })
        );
      } else {
        const parts = [
          summary.emergencyCents > 0
            ? tr(t.budgets.allocSummaryEmergency, {
                amount: money(summary.emergencyCents),
              })
            : null,
          summary.goalCents > 0
            ? tr(t.budgets.allocSummaryGoal, {
                amount: money(summary.goalCents),
              })
            : null,
          summary.spentCents > 0
            ? tr(t.budgets.allocSummarySpent, {
                amount: money(summary.spentCents),
              })
            : null,
        ].filter(Boolean);
        toast.success(
          tr(t.budgets.closeSuccessMixed, { summary: parts.join(" · ") })
        );
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setClosing(false);
    }
  }

  async function sendToGoal(body: {
    goalId: string;
    amount: string;
    notes?: string;
  }) {
    if (!toGoalFor) return;
    setToGoalBusy(true);
    try {
      await api("/api/goals", {
        method: "PATCH",
        json: {
          id: body.goalId,
          reserve: {
            source: "budget",
            categoryId: toGoalFor.categoryId || toGoalFor.category.id,
            amount: body.amount,
            period,
            notes: body.notes || null,
          },
        },
      });
      toast.success(t.budgets.toGoalSuccess);
      setToGoalFor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setToGoalBusy(false);
    }
  }

  async function doUndoClose() {
    const nothingMoved = (close?.appliedSummary?.movedCents || 0) === 0;
    const ok = await confirm({
      title: t.budgets.undoClose,
      description: nothingMoved
        ? t.budgets.undoCloseConfirmSpent
        : t.budgets.undoCloseConfirm,
      danger: true,
      confirmLabel: t.budgets.undoClose,
      cancelLabel: t.cancel,
    });
    if (!ok) return;
    setClosing(true);
    try {
      await api(`/api/budgets/close?period=${period}`, { method: "DELETE" });
      toast.success(t.budgets.undoCloseSuccess);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setClosing(false);
    }
  }

  const totalBudget = budgets.reduce((s, b) => s + b.amountCents, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spentCents, 0);
  const totalEmergency = budgets.reduce((s, b) => s + (b.emergencyCents || 0), 0);
  const totalRemaining = budgets.reduce(
    (s, b) =>
      s +
      (b.remainingCents ??
        Math.max(
          0,
          b.amountCents +
            (b.emergencyCents || 0) -
            b.spentCents -
            (b.goalAllocatedCents || 0)
        )),
    0
  );
  const showOtherPending =
    pendingClose &&
    pendingClose.canClose &&
    pendingClose.period !== period;

  return (
    <div>
      <PageHeader
        kicker={t.nav.budgets}
        title={t.budgets.title}
        subtitle={t.budgets.twoPerMonthHint || t.budgets.subtitle}
      />

      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.back}
            onClick={() => shiftHalf(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-auto"
            aria-label={t.period}
          />
          <div
            className="flex rounded-xl border border-[var(--line-strong)] bg-black/40 p-0.5"
            role="group"
            aria-label={t.budgets.periodHalf || "Half of month"}
          >
            <button
              type="button"
              onClick={() => setHalf(1)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                half === 1
                  ? "bg-[var(--accent)] text-[#081018]"
                  : "text-[var(--fg-muted)]"
              }`}
            >
              {t.budgets.half1Short || "1–15"}
            </button>
            <button
              type="button"
              onClick={() => setHalf(2)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                half === 2
                  ? "bg-[var(--accent)] text-[#081018]"
                  : "text-[var(--fg-muted)]"
              }`}
            >
              {t.budgets.half2Short || "16–end"}
            </button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.next}
            onClick={() => shiftHalf(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {bounds && (
            <span className="stat-pill">
              {bounds.start} → {bounds.end}
            </span>
          )}
          {close?.closed && (
            <span className="stat-pill border-amber-400/40 bg-amber-400/15 text-amber-50">
              <Lock className="h-3 w-3" aria-hidden />
              {t.budgets.closedBadge}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>

      {showOtherPending && (
        <button
          type="button"
          onClick={() => {
            const meta = parseBudgetPeriod(pendingClose.period);
            setMonth(meta.monthKey);
            setHalf(meta.half);
          }}
          className="close-banner mb-4 flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left"
        >
          <span className="text-sm text-amber-50">
            {tr(t.budgets.pendingCloseBanner, { period: pendingClose.period })}
          </span>
          <span className="text-xs font-semibold text-amber-100">
            {t.budgets.pendingCloseCta} →
          </span>
        </button>
      )}

      {close && (close.canClose || close.closed) && (
        <div className="close-banner mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-50">
              {close.closed ? (
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>
                {close.closed
                  ? closeDoneCopy(close, t, tr, money)
                  : t.budgets.closePeriodTitle}
              </span>
            </p>
            {!close.closed && (
              <p className="mt-0.5 text-sm text-amber-50/90">
                {money(close.totalRemainingCents)} {t.budgets.remaining}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {close.canClose && (
              <Button
                onClick={() => setCloseDialogOpen(true)}
                disabled={closing}
              >
                {t.budgets.closePeriod}
              </Button>
            )}
            {close.canUndo && (
              <Button
                variant="secondary"
                onClick={doUndoClose}
                disabled={closing}
              >
                <Undo2 className="h-4 w-4" />
                {t.budgets.undoClose}
              </Button>
            )}
          </div>
        </div>
      )}

      {close && (
        <BudgetCloseDialog
          open={closeDialogOpen}
          close={close}
          categories={categories}
          loading={closing}
          onCancel={() => setCloseDialogOpen(false)}
          onConfirm={(body) => void doClose(body)}
        />
      )}

      <BudgetToGoalDialog
        open={!!toGoalFor}
        categoryName={
          toGoalFor
            ? `${toGoalFor.category.icon} ${toGoalFor.category.name}`
            : ""
        }
        remainingCents={toGoalFor?.remainingCents || 0}
        loading={toGoalBusy}
        onCancel={() => setToGoalFor(null)}
        onConfirm={(body) => void sendToGoal(body)}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat
          label={t.budgets.summaryPlanned}
          value={money(totalBudget)}
        />
        <SummaryStat
          label={t.budgets.summarySpent}
          value={money(totalSpent)}
          danger={totalSpent > totalBudget + totalEmergency}
        />
        <SummaryStat
          label={t.budgets.summaryRemaining}
          value={money(totalRemaining)}
        />
        <SummaryStat
          label={t.budgets.summaryEmergency}
          value={money(totalEmergency)}
          gold
        />
      </div>

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
                money
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
          const emergency = b.emergencyCents || 0;
          const available = b.availableCents ?? b.amountCents + emergency;
          const goalAlloc = b.goalAllocatedCents || 0;
          const remaining =
            b.remainingCents ??
            Math.max(0, available - b.spentCents - goalAlloc);
          const committed = b.spentCents + goalAlloc;
          const over = committed > available;
          const usingEm =
            emergency > 0 && committed > b.amountCents && !over;
          const usedPct =
            available > 0
              ? (Math.min(committed, available) / available) * 100
              : 0;
          return (
            <Card key={b.id}>
              <CardContent className="py-4">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--fg)]">
                      {b.category.icon} {b.category.name}
                    </p>
                    <p
                      className={`mt-0.5 font-display text-xl tabular-nums ${
                        over
                          ? "money-expense"
                          : usingEm
                            ? "text-amber-100"
                            : "text-[var(--fg)]"
                      }`}
                    >
                      {money(remaining)}
                      <span className="ml-1.5 font-sans text-sm font-normal text-[var(--fg-muted)]">
                        {t.budgets.remaining}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-[var(--fg-muted)]">
                      {money(b.spentCents)}
                      {goalAlloc > 0
                        ? ` · ${money(goalAlloc)} ${t.budgets.toGoalsShort}`
                        : ""}{" "}
                      / {money(available)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {remaining > 0 && !close?.closed && (
                      <Button size="sm" onClick={() => setToGoalFor(b)}>
                        {t.budgets.toGoal}
                      </Button>
                    )}
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
                <div className="progress-track h-2.5">
                  <div
                    className={`progress-fill h-full ${over ? "bg-[var(--expense)]" : usingEm ? "progress-fill-emergency" : ""}`}
                    style={{ width: `${Math.min(usedPct, 100)}%` }}
                  />
                </div>
                {over && (
                  <p className="mt-2 flex items-center gap-1 text-sm money-expense">
                    <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                    {tr(t.budgets.overBy, {
                      amount: money(committed - available),
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

function closeDoneCopy(
  close: CloseStatus,
  t: Dictionary,
  tr: (template: string, vars: Record<string, string | number>) => string,
  money: (cents: number) => string
) {
  const s = close.appliedSummary;
  if (!s || close.totalRemainingCents === 0) return t.budgets.closePeriodDone;
  if (s.movedCents === 0) return t.budgets.closePeriodDoneSpent;
  if (s.goalCents === 0 && s.spentCents === 0) {
    return tr(t.budgets.closePeriodDoneEmergency, { next: close.toPeriod });
  }
  return tr(t.budgets.closePeriodDoneMixed, {
    emergency: money(s.emergencyCents),
    goals: money(s.goalCents),
    spent: money(s.spentCents),
  });
}

function SummaryStat({
  label,
  value,
  danger,
  gold,
}: {
  label: string;
  value: string;
  danger?: boolean;
  gold?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-4 py-3">
      <p className="text-xs font-medium text-[var(--fg-muted)]">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-xl ${
          danger
            ? "money-expense"
            : gold
              ? "text-amber-200"
              : "text-[var(--fg)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
