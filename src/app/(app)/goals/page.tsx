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

type Reserve = {
  id: string;
  amountCents: number;
  period: string;
  date: string;
  notes: string | null;
  accountId: string | null;
  source?: string;
  account: { id: string; name: string; icon: string } | null;
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
  const { money, t, tr, locale } = useApp();
  const { confirm } = useConfirm();
  const initial = parseBudgetPeriod(budgetPeriodKey());
  const [month, setMonth] = useState(initial.monthKey);
  const [half, setHalf] = useState<BudgetHalf>(initial.half);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
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
    accountId: "",
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
          reserve: {
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
    const fromClose = row?.source === "budget_close" || !row?.accountId;
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

      <Card premium>
        <CardContent className="grid gap-4 py-5 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="flex flex-col justify-end rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[11px] text-[var(--fg-faint)]">
              {tr(t.goals.reservedThisPeriod, { period: halfLabel })}
            </div>
            <div className="font-display text-xl text-[var(--accent)]">
              {money(periodTotal)}
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-[var(--fg-muted)]">{t.goals.quincenaHint}</p>

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
        <Card premium>
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
            <div className="sm:col-span-2">
              <Label>{t.notes}</Label>
              <Input
                className="mt-1"
                value={reserve.notes}
                onChange={(e) =>
                  setReserve({ ...reserve, notes: e.target.value })
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
              <Card key={g.id} premium>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span>{g.icon}</span>
                      {g.name}
                    </CardTitle>
                    <div className="mt-1 text-xs text-[var(--fg-faint)]">
                      {g.status === "completed"
                        ? t.goals.statusCompleted
                        : g.status === "cancelled"
                          ? t.goals.statusCancelled
                          : t.goals.statusActive}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-medium text-[var(--accent)]">
                      {money(g.reservedCents)}
                    </div>
                    <div className="text-[11px] text-[var(--fg-faint)]">
                      / {money(g.targetAmountCents)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-[var(--fg-faint)]">
                      <span>{g.progress}%</span>
                      <span>
                        {tr(t.goals.remaining, {
                          amount: money(g.remainingCents),
                        })}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all"
                        style={{ width: `${g.progress}%` }}
                      />
                    </div>
                  </div>

                  {g.notes && (
                    <p className="text-xs text-[var(--fg-muted)]">{g.notes}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {g.status === "active" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setReserveFor(g.id);
                          setReserve((r) => ({
                            ...r,
                            accountId: r.accountId || accounts[0]?.id || "",
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
                        variant="secondary"
                        onClick={() => setStatus(g.id, "completed")}
                      >
                        {t.goals.markComplete}
                      </Button>
                    )}
                    {g.status !== "active" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setStatus(g.id, "active")}
                      >
                        {t.goals.reopen}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => deleteGoal(g.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t.delete}
                    </Button>
                  </div>

                  {periodReserves.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 text-xs font-medium text-[var(--fg-muted)]">
                        {t.goals.reservesThisPeriod}
                      </div>
                      <ul className="space-y-1.5">
                        {periodReserves.map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span>
                              {r.account
                                ? `${r.account.icon} ${r.account.name}`
                                : t.goals.fromBudgetClose}{" "}
                              · {r.date}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="font-medium">
                                {money(r.amountCents)}
                              </span>
                              <button
                                type="button"
                                className="text-[11px] text-rose-300 hover:underline"
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

                  {g.reserves.length > 0 && (
                    <details className="text-xs text-[var(--fg-faint)]">
                      <summary className="cursor-pointer">
                        {tr(t.goals.allReserves, { n: g.reserves.length })}
                      </summary>
                      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                        {g.reserves.map((r) => (
                          <li key={r.id} className="flex justify-between gap-2">
                            <span>
                              {r.period} ·{" "}
                              {r.account
                                ? r.account.name
                                : t.goals.fromBudgetClose}
                            </span>
                            <span>{money(r.amountCents)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
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
