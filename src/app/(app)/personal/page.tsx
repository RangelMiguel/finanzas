"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { toast } from "sonner";
import {
  todayISO,
  centsToInput,
  budgetPeriodKey,
  parseBudgetPeriod,
  type BudgetHalf,
} from "@/lib/utils";

type Pool = {
  allocationCents: number;
  incomeCents: number;
  expenseCents: number;
  availableCents: number;
  totalPoolCents: number;
  personalAccount?: {
    id: string;
    name: string;
    balanceCents: number;
  };
};
type TransferIn = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  account?: { name: string } | null;
};
type Income = {
  id: string;
  description: string;
  amountCents: number;
  date: string;
};
type Budget = {
  id: string;
  name: string;
  amountCents: number;
  spentCents: number;
  remainingCents: number;
  notes?: string | null;
  period: string;
};
type Expense = {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  personalBudgetId?: string | null;
  personalBudget?: { name: string } | null;
};
type Member = {
  user: { id: string; displayName: string };
};
type Scope = "this_period" | "both_periods";

export default function PersonalPage() {
  const { money, t, role } = useApp();
  const isAdmin = role === "owner" || role === "admin";
  const initial = parseBudgetPeriod(budgetPeriodKey());
  const [month, setMonth] = useState(initial.monthKey);
  const [half, setHalf] = useState<BudgetHalf>(initial.half);
  const [bounds, setBounds] = useState<{ start: string; end: string } | null>(
    null
  );
  const [viewUserId, setViewUserId] = useState("");
  const [pool, setPool] = useState<Pool | null>(null);
  const [transfersIn, setTransfersIn] = useState<TransferIn[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [incomeForm, setIncomeForm] = useState({
    description: "",
    amount: "",
    date: todayISO(),
  });
  const [budgetForm, setBudgetForm] = useState({
    name: "",
    amount: "",
    scope: "this_period" as Scope,
  });
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    amount: "",
    date: todayISO(),
    personalBudgetId: "",
  });
  const [editBudgetId, setEditBudgetId] = useState<string | null>(null);

  const period = `${month}-${half}`;
  const halfLabel =
    half === 1
      ? t.budgets?.half1 || "1–15"
      : t.budgets?.half2 || "16–end";

  async function load() {
    const qs = new URLSearchParams({ period });
    if (viewUserId) qs.set("userId", viewUserId);
    const res = await api<{
      pool: Pool;
      transfersIn?: TransferIn[];
      incomes: Income[];
      budgets: Budget[];
      expenses: Expense[];
      members: Member[];
      userId: string;
      isAdmin: boolean;
      bounds: { start: string; end: string };
      period: string;
      half: number;
      personalAccount?: Pool["personalAccount"];
    }>(`/api/personal/summary?${qs}`);
    setPool(res.pool);
    setTransfersIn(res.transfersIn || []);
    setIncomes(res.incomes);
    setBudgets(res.budgets);
    setExpenses(res.expenses);
    setMembers(res.members || []);
    setBounds(res.bounds);
    if (!viewUserId) setViewUserId(res.userId);
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, viewUserId]);

  async function addIncome() {
    try {
      await api("/api/personal/incomes", {
        method: "POST",
        json: {
          ...incomeForm,
          userId: isAdmin && viewUserId ? viewUserId : undefined,
        },
      });
      toast.success(t.personal?.incomeCreated || t.success);
      setIncomeForm({ description: "", amount: "", date: todayISO() });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function saveBudget() {
    try {
      if (editBudgetId) {
        await api("/api/personal/budgets", {
          method: "PATCH",
          json: {
            id: editBudgetId,
            name: budgetForm.name,
            amount: budgetForm.amount,
          },
        });
      } else {
        await api("/api/personal/budgets", {
          method: "POST",
          json: {
            name: budgetForm.name,
            amount: budgetForm.amount,
            period,
            scope: budgetForm.scope,
          },
        });
      }
      toast.success(t.personal?.budgetSaved || t.success);
      setBudgetForm({ name: "", amount: "", scope: "this_period" });
      setEditBudgetId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function addExpense() {
    try {
      await api("/api/personal/expenses", {
        method: "POST",
        json: {
          ...expenseForm,
          personalBudgetId: expenseForm.personalBudgetId || null,
        },
      });
      toast.success(t.personal?.expenseCreated || t.success);
      setExpenseForm({
        description: "",
        amount: "",
        date: todayISO(),
        personalBudgetId: "",
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.personal || t.nav.allowances}
        title={t.personal?.title || "Personal budgets"}
        subtitle={
          t.personal?.subtitleFunded ||
          t.personal?.subtitle ||
          "Funded by transfers to your private personal account + side income"
        }
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-auto"
            />
            <div className="flex rounded-xl border border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setHalf(1)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  half === 1
                    ? "bg-teal-400/20 text-teal-100"
                    : "text-[var(--fg-faint)]"
                }`}
              >
                {t.budgets?.half1Short || "1–15"}
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
                {t.budgets?.half2Short || "16–end"}
              </button>
            </div>
            {isAdmin && members.length > 0 && (
              <Select
                value={viewUserId}
                onChange={(e) => setViewUserId(e.target.value)}
                className="w-auto"
              >
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.displayName}
                  </option>
                ))}
              </Select>
            )}
          </div>
        }
      />

      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-[var(--fg-muted)]">
        <span className="stat-pill">{halfLabel}</span>
        {bounds && (
          <span className="stat-pill">
            {bounds.start} → {bounds.end}
          </span>
        )}
      </div>

      {pool && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat
            label={t.personal?.receivedTransfers || "Received (transfers)"}
            value={money(pool.allocationCents)}
          />
          <Stat
            label={t.personal?.sideIncome || "Side income"}
            value={money(pool.incomeCents)}
            positive
          />
          <Stat
            label={t.personal?.personalSpent || "Personal spent"}
            value={money(pool.expenseCents)}
            negative
          />
          <Stat
            label={t.personal?.available || "Available"}
            value={money(pool.availableCents)}
            accent
          />
          {pool.personalAccount && (
            <Stat
              label={t.personal?.accountBalance || "Personal account"}
              value={money(pool.personalAccount.balanceCents)}
            />
          )}
        </div>
      )}

      {pool?.personalAccount && (
        <p className="text-xs text-[var(--fg-faint)]">
          {t.personal?.fundingHint ||
            "To fund this pool, transfer money from a household account to"}{" "}
          <span className="font-medium text-[var(--fg-muted)]">
            {pool.personalAccount.name}
          </span>
          {" · "}
          {t.personal?.fundingHint2 ||
            "Admins: use Accounts → Transfer. That amount appears here for the quincena."}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card premium>
          <CardHeader>
            <CardTitle>
              {t.personal?.transfersIn || "Transfers received this period"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {transfersIn.length === 0 ? (
              <p className="text-sm text-[var(--fg-faint)]">
                {t.personal?.noTransfers || "No transfers into the personal account this period."}
              </p>
            ) : (
              transfersIn.map((tr) => (
                <div
                  key={tr.id}
                  className="flex justify-between text-sm border-b border-white/5 py-1"
                >
                  <span>
                    {tr.date}
                    {tr.account?.name ? ` · ${tr.account.name}` : ""}
                    {" · "}
                    {tr.description}
                  </span>
                  <span className="money-income">{money(tr.amountCents)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card premium>
          <CardHeader>
            <CardTitle>
              {t.personal?.addSideIncome || "Add side income"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t.description}</Label>
              <Input
                className="mt-1"
                value={incomeForm.description}
                onChange={(e) =>
                  setIncomeForm({ ...incomeForm, description: e.target.value })
                }
                placeholder={t.personal?.sideIncomePh || "Freelance, gig…"}
              />
            </div>
            <div>
              <Label>{t.amount}</Label>
              <Input
                className="mt-1"
                value={incomeForm.amount}
                onChange={(e) =>
                  setIncomeForm({ ...incomeForm, amount: e.target.value })
                }
              />
            </div>
            <div>
              <Label>{t.date}</Label>
              <Input
                type="date"
                className="mt-1"
                value={incomeForm.date}
                onChange={(e) =>
                  setIncomeForm({ ...incomeForm, date: e.target.value })
                }
              />
            </div>
            <Button onClick={addIncome}>{t.add}</Button>
            <div className="sm:col-span-2 space-y-1">
              {incomes.map((i) => (
                <div
                  key={i.id}
                  className="flex justify-between text-sm border-b border-white/5 py-1"
                >
                  <span>
                    {i.description} · {i.date}
                  </span>
                  <span className="money-income">{money(i.amountCents)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card premium>
          <CardHeader>
            <CardTitle>
              {editBudgetId
                ? t.edit
                : t.personal?.newBudget || "New personal budget"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.name}</Label>
              <Input
                className="mt-1"
                value={budgetForm.name}
                onChange={(e) =>
                  setBudgetForm({ ...budgetForm, name: e.target.value })
                }
                placeholder={t.personal?.budgetPh || "Coffee, hobbies…"}
              />
            </div>
            <div>
              <Label>{t.amount}</Label>
              <Input
                className="mt-1"
                value={budgetForm.amount}
                onChange={(e) =>
                  setBudgetForm({ ...budgetForm, amount: e.target.value })
                }
              />
            </div>
            {!editBudgetId && (
              <div className="sm:col-span-2">
                <Label>{t.budgets?.periodHalf || "Scope"}</Label>
                <Select
                  className="mt-1"
                  value={budgetForm.scope}
                  onChange={(e) =>
                    setBudgetForm({
                      ...budgetForm,
                      scope: e.target.value as Scope,
                    })
                  }
                >
                  <option value="this_period">
                    {t.budgets?.scopeThisPeriod || "This half-month only"}
                  </option>
                  <option value="both_periods">
                    {t.budgets?.scopeBothPeriods ||
                      "Both halves of this month"}
                  </option>
                </Select>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={saveBudget}>{t.save}</Button>
              {editBudgetId && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditBudgetId(null);
                    setBudgetForm({
                      name: "",
                      amount: "",
                      scope: "this_period",
                    });
                  }}
                >
                  {t.cancel}
                </Button>
              )}
            </div>
            <div className="sm:col-span-2 space-y-3">
              {budgets.map((b) => {
                const pct =
                  b.amountCents > 0 ? (b.spentCents / b.amountCents) * 100 : 0;
                return (
                  <div key={b.id} className="rounded-xl border border-white/10 p-3">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{b.name}</span>
                      <div className="flex gap-2">
                        <span>
                          {money(b.spentCents)} / {money(b.amountCents)}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditBudgetId(b.id);
                            setBudgetForm({
                              name: b.name,
                              amount: centsToInput(b.amountCents),
                              scope: "this_period",
                            });
                          }}
                        >
                          {t.edit}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await api(`/api/personal/budgets?id=${b.id}`, {
                              method: "DELETE",
                            });
                            await load();
                          }}
                        >
                          {t.delete}
                        </Button>
                      </div>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card premium>
          <CardHeader>
            <CardTitle>
              {t.personal?.logExpense || "Log personal expense"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t.description}</Label>
              <Input
                className="mt-1"
                value={expenseForm.description}
                onChange={(e) =>
                  setExpenseForm({
                    ...expenseForm,
                    description: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label>{t.amount}</Label>
              <Input
                className="mt-1"
                value={expenseForm.amount}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, amount: e.target.value })
                }
              />
            </div>
            <div>
              <Label>{t.date}</Label>
              <Input
                type="date"
                className="mt-1"
                value={expenseForm.date}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, date: e.target.value })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{t.personal?.againstBudget || "Against budget"}</Label>
              <Select
                className="mt-1"
                value={expenseForm.personalBudgetId}
                onChange={(e) =>
                  setExpenseForm({
                    ...expenseForm,
                    personalBudgetId: e.target.value,
                  })
                }
              >
                <option value="">{t.none}</option>
                {budgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={addExpense}>{t.add}</Button>
            <div className="sm:col-span-2 space-y-1">
              {expenses.map((e) => (
                <div
                  key={e.id}
                  className="flex justify-between text-sm border-b border-white/5 py-1"
                >
                  <span>
                    {e.description}
                    {e.personalBudget
                      ? ` · ${e.personalBudget.name}`
                      : ""}{" "}
                    · {e.date}
                  </span>
                  <span className="money-expense">{money(e.amountCents)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  positive,
  negative,
  accent,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="bento-stat">
      <p className="text-[11px] uppercase tracking-wider text-[var(--fg-faint)]">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-2xl ${
          positive
            ? "money-income"
            : negative
              ? "money-expense"
              : accent
                ? "text-teal-100"
                : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
