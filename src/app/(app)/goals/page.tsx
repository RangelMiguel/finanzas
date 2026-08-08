"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import {
  budgetPeriodKey,
  centsToInput,
  parseBudgetPeriod,
  type BudgetHalf,
} from "@/lib/utils";
import { toast } from "sonner";
import { Target, Plus, Banknote, Trash2 } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type Reserve = {
  id: string;
  amountCents: number;
  period: string;
  date: string;
  notes: string | null;
  accountId: string | null;
  source?: string;
  account: { id: string; name: string; icon: string } | null;
  category?: { id: string; name: string; icon: string } | null;
};

type BudgetOpt = {
  id: string;
  categoryId: string;
  remainingCents: number;
  category: { id: string; name: string; icon: string };
};

type Goal = {
  id: string;
  name: string;
  targetAmountCents: number;
  icon: string;
  notes: string | null;
  status: string;
  reservedCents: number;
  remainingCents: number;
  progress: number;
  reserves: Reserve[];
};

type Acc = {
  id: string;
  name: string;
  icon: string;
  balanceCents: number;
};

export default function GoalsPage() {
  const { money, t, tr } = useApp();
  const { confirm } = useConfirm();
  const initial = parseBudgetPeriod(budgetPeriodKey());
  const [month, setMonth] = useState(initial.monthKey);
  const [half, setHalf] = useState<BudgetHalf>(initial.half);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [budgetCats, setBudgetCats] = useState<BudgetOpt[]>([]);
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [reserveFor, setReserveFor] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    target: "",
    icon: "🎯",
    notes: "",
  });
  const [reserve, setReserve] = useState({
    source: "account" as "account" | "budget",
    accountId: "",
    categoryId: "",
    amount: "",
    notes: "",
  });
  const [filter, setFilter] = useState<"active" | "all">("active");

  const period = `${month}-${half}`;

  async function load() {
    const res = await api<{
      goals: Goal[];
      accounts: Acc[];
      currentPeriod: string;
    }>(`/api/goals?status=${filter === "all" ? "all" : "active"}&period=${period}`);
    setGoals(res.goals);
    setAccounts(res.accounts);
    if (res.accounts[0] && !reserve.accountId) {
      setReserve((r) => ({ ...r, accountId: res.accounts[0].id }));
    }
    try {
      const b = await api<{ budgets: BudgetOpt[] }>(
        `/api/budgets?period=${period}`
      );
      const leftover = (b.budgets || []).filter((row) => row.remainingCents > 0);
      setBudgetCats(leftover);
      setReserve((r) => ({
        ...r,
        categoryId: r.categoryId || leftover[0]?.categoryId || "",
      }));
    } catch {
      setBudgetCats([]);
    }
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, period]);

  const periodTotal = useMemo(
    () =>
      goals.reduce(
        (s, g) =>
          s +
          g.reserves
            .filter((r) => r.period === period)
            .reduce((a, r) => a + r.amountCents, 0),
        0
      ),
    [goals, period]
  );

  function openNew() {
    setEditId(null);
    setForm({ name: "", target: "", icon: "🎯", notes: "" });
    setMode("new");
  }

  function openEdit(g: Goal) {
    setEditId(g.id);
    setForm({
      name: g.name,
      target: centsToInput(g.targetAmountCents),
      icon: g.icon || "🎯",
      notes: g.notes || "",
    });
    setMode("edit");
  }

  async function saveGoal() {
    try {
      if (mode === "edit" && editId) {
        await api("/api/goals", {
          method: "PATCH",
          json: {
            id: editId,
            name: form.name,
            targetAmount: form.target,
            icon: form.icon,
            notes: form.notes || null,
          },
        });
        toast.success(t.goals.updated);
      } else {
        await api("/api/goals", {
          method: "POST",
          json: {
            name: form.name,
            targetAmount: form.target,
            icon: form.icon,
            notes: form.notes || null,
          },
        });
        toast.success(t.goals.created);
      }
      setMode("none");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function doReserve() {
    if (!reserveFor) return;
    try {
      await api("/api/goals", {
        method: "PATCH",
        json: {
          id: reserveFor,
          reserve:
            reserve.source === "budget"
              ? {
                  source: "budget",
                  categoryId: reserve.categoryId,
                  amount: reserve.amount,
                  period,
                  notes: reserve.notes || null,
                }
              : {
                  source: "account",
                  accountId: reserve.accountId,
                  amount: reserve.amount,
                  period,
                  notes: reserve.notes || null,
                },
        },
      });
      toast.success(t.goals.reserved);
      setReserveFor(null);
      setReserve((r) => ({ ...r, amount: "", notes: "" }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function undoReserve(reserveId: string) {
    const row = goals.flatMap((g) => g.reserves).find((r) => r.id === reserveId);
    const fromClose =
      row?.source === "budget_close" ||
      row?.source === "budget" ||
      !row?.accountId;
    const ok = await confirm({
      title: t.goals.confirmUndoReserve,
      description: fromClose
        ? t.goals.confirmUndoBudgetCloseReserve
        : t.goals.confirmUndoReserve,
      confirmLabel: t.confirm,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    try {
      await api("/api/goals", {
        method: "DELETE",
        json: { reserveId },
      });
      toast.success(t.goals.reserveUndone);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function deleteGoal(id: string) {
    const okDel = await confirm({
      title: t.delete,
      description: t.goals.confirmDelete,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!okDel) return;
    try {
      await api("/api/goals", { method: "DELETE", json: { id } });
      toast.success(t.goals.deleted);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function setStatus(id: string, status: "active" | "completed" | "cancelled") {
    try {
      await api("/api/goals", {
        method: "PATCH",
        json: { id, status },
      });
      toast.success(t.success);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  const halfLabel =
    half === 1 ? t.budgets.half1 : t.budgets.half2;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.goals}
        title={t.goals.title}
        subtitle={t.goals.subtitle}
        actions={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            {t.goals.newGoal}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] p-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>{t.period}</Label>
            <Input
              type="month"
              className="mt-1"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <div>
            <Label>{t.budgets.periodHalf}</Label>
            <Select
              className="mt-1"
              value={String(half)}
              onChange={(e) => setHalf(Number(e.target.value) as BudgetHalf)}
            >
              <option value="1">{t.budgets.half1}</option>
              <option value="2">{t.budgets.half2}</option>
            </Select>
          </div>
          <div>
            <Label>{t.goals.filter}</Label>
            <Select
              className="mt-1"
              value={filter}
              onChange={(e) => setFilter(e.target.value as "active" | "all")}
            >
              <option value="active">{t.goals.filterActive}</option>
              <option value="all">{t.goals.filterAll}</option>
            </Select>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--line)] px-3 py-2">
          <div className="text-xs text-[var(--fg-muted)]">
            {tr(t.goals.reservedThisPeriod, { period: halfLabel })}
          </div>
          <div className="font-display text-xl text-[var(--fg)]">
            {money(periodTotal)}
          </div>
        </div>
      </div>

      {mode !== "none" && (
        <Card premium>
          <CardHeader>
            <CardTitle>
              {mode === "edit" ? t.goals.editGoal : t.goals.newGoal}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.name}</Label>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t.goals.namePlaceholder}
              />
            </div>
            <div>
              <Label>{t.goals.target}</Label>
              <Input
                money
                className="mt-1"
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.goals.icon}</Label>
              <Input
                className="mt-1"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                maxLength={4}
              />
            </div>
            <div>
              <Label>{t.notes}</Label>
              <Input
                className="mt-1"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={saveGoal}>{t.save}</Button>
              <Button variant="secondary" onClick={() => setMode("none")}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {reserveFor && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              {t.goals.reserveTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-sm text-[var(--fg-muted)]">
              {tr(t.goals.reserveForPeriod, {
                period: `${month} · ${halfLabel}`,
              })}
            </p>
            <div className="sm:col-span-2">
              <Label>{t.goals.reserveSource}</Label>
              <div
                className="mt-1 flex rounded-xl border border-[var(--line-strong)] bg-black/40 p-0.5"
                role="group"
              >
                <button
                  type="button"
                  onClick={() =>
                    setReserve({ ...reserve, source: "account" })
                  }
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                    reserve.source === "account"
                      ? "bg-[var(--accent)] text-[#081018]"
                      : "text-[var(--fg-muted)]"
                  }`}
                >
                  {t.goals.reserveFromAccount}
                </button>
                <button
                  type="button"
                  onClick={() => setReserve({ ...reserve, source: "budget" })}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                    reserve.source === "budget"
                      ? "bg-[var(--accent)] text-[#081018]"
                      : "text-[var(--fg-muted)]"
                  }`}
                >
                  {t.goals.reserveFromBudget}
                </button>
              </div>
            </div>
            {reserve.source === "account" ? (
              <div>
                <Label>{t.account}</Label>
                <Select
                  className="mt-1"
                  value={reserve.accountId}
                  onChange={(e) =>
                    setReserve({ ...reserve, accountId: e.target.value })
                  }
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name} ({money(a.balanceCents)})
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div>
                <Label>{t.category}</Label>
                <Select
                  className="mt-1"
                  value={reserve.categoryId}
                  onChange={(e) =>
                    setReserve({ ...reserve, categoryId: e.target.value })
                  }
                >
                  <option value="">{t.select}</option>
                  {budgetCats.map((b) => (
                    <option key={b.id} value={b.categoryId}>
                      {b.category.icon} {b.category.name} (
                      {money(b.remainingCents)})
                    </option>
                  ))}
                </Select>
                {budgetCats.length === 0 && (
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    {t.goals.noBudgetRemaining}
                  </p>
                )}
              </div>
            )}
            <div>
              <Label>{t.amount}</Label>
              <Input
                money
                className="mt-1"
                value={reserve.amount}
                onChange={(e) =>
                  setReserve({ ...reserve, amount: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={doReserve}>{t.goals.reserve}</Button>
              <Button variant="secondary" onClick={() => setReserveFor(null)}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {goals.length === 0 ? (
        <Card premium>
          <CardContent className="py-10 text-center text-sm text-[var(--fg-muted)]">
            <Target className="mx-auto mb-2 h-8 w-8 opacity-50" />
            {t.goals.empty}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {goals.map((g) => {
            const periodReserves = g.reserves.filter((r) => r.period === period);
            return (
              <Card key={g.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span>{g.icon}</span>
                      {g.name}
                    </CardTitle>
                    <div className="mt-1 text-sm text-[var(--fg-muted)]">
                      {g.status === "completed"
                        ? t.goals.statusCompleted
                        : g.status === "cancelled"
                          ? t.goals.statusCancelled
                          : t.goals.statusActive}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-xl text-[var(--fg)]">
                      {money(g.reservedCents)}
                    </div>
                    <div className="text-sm text-[var(--fg-muted)]">
                      / {money(g.targetAmountCents)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-sm text-[var(--fg-muted)]">
                      <span>{g.progress}%</span>
                      <span>
                        {tr(t.goals.remaining, {
                          amount: money(g.remainingCents),
                        })}
                      </span>
                    </div>
                    <div className="progress-track h-2.5">
                      <div
                        className="progress-fill"
                        style={{ width: `${g.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {g.status === "active" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setReserveFor(g.id);
                          setReserve((r) => ({
                            ...r,
                            accountId: r.accountId || accounts[0]?.id || "",
                            categoryId:
                              r.categoryId || budgetCats[0]?.categoryId || "",
                          }));
                        }}
                      >
                        <Banknote className="h-3.5 w-3.5" />
                        {t.goals.reserve}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEdit(g)}
                    >
                      {t.edit}
                    </Button>
                    {g.status === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setStatus(g.id, "completed")}
                      >
                        {t.goals.markComplete}
                      </Button>
                    )}
                    {g.status !== "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setStatus(g.id, "active")}
                      >
                        {t.goals.reopen}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteGoal(g.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t.delete}
                    </Button>
                  </div>

                  {periodReserves.length > 0 && (
                    <div className="rounded-xl border border-[var(--line)] bg-black/25 p-3">
                      <div className="mb-2 text-sm font-medium text-[var(--fg-muted)]">
                        {t.goals.reservesThisPeriod}
                      </div>
                      <ul className="space-y-1.5">
                        {periodReserves.map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="text-[var(--fg)]">
                              {reserveLabel(r, t, tr)}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="font-medium tabular-nums">
                                {money(r.amountCents)}
                              </span>
                              <button
                                type="button"
                                className="text-sm text-rose-200 hover:underline"
                                onClick={() => undoReserve(r.id)}
                              >
                                {t.goals.undo}
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function reserveLabel(
  r: Reserve,
  t: Dictionary,
  tr: (template: string, vars: Record<string, string | number>) => string
) {
  if (r.account) return `${r.account.icon} ${r.account.name}`;
  if (r.source === "budget" && r.category) {
    return tr(t.goals.fromBudgetCategory, {
      category: `${r.category.icon} ${r.category.name}`,
    });
  }
  return t.goals.fromBudgetClose;
}
