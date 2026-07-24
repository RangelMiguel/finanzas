"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { monthKey, todayISO, centsToInput } from "@/lib/utils";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";

type Txn = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  type: string;
  categoryId?: string | null;
  accountId?: string | null;
  creditCardId?: string | null;
  spentById?: string | null;
  category?: { name: string; icon: string } | null;
  account?: { name: string } | null;
  creditCard?: { name: string } | null;
  createdBy?: { displayName: string } | null;
  spentBy?: { displayName: string } | null;
};
type Cat = { id: string; name: string; type: string; icon: string };
type Acc = { id: string; name: string };
type CardT = { id: string; name: string };
type Member = { user: { id: string; displayName: string } };

const emptyForm = {
  date: todayISO(),
  description: "",
  amount: "",
  type: "expense",
  categoryId: "",
  accountId: "",
  creditCardId: "",
  msiMonths: "",
  spentById: "",
};

export default function TransactionsPage() {
  const { t, money, members } = useApp();
  const [month, setMonth] = useState(monthKey());
  const [txns, setTxns] = useState<Txn[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [cards, setCards] = useState<CardT[]>([]);
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const [txnRes, c, a, cc] = await Promise.all([
      api<{ transactions: Txn[] }>(`/api/transactions?month=${month}`),
      api<{ categories: Cat[] }>("/api/categories"),
      api<{ accounts: Acc[] }>("/api/accounts"),
      api<{ creditCards: CardT[] }>("/api/credit-cards"),
    ]);
    setTxns(txnRes.transactions);
    setCategories(c.categories);
    setAccounts(a.accounts);
    setCards(cc.creditCards);
    if (a.accounts[0] && !form.accountId) {
      setForm((f) => ({ ...f, accountId: a.accounts[0].id }));
    }
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function openEdit(txn: Txn) {
    setEditId(txn.id);
    setForm({
      date: txn.date,
      description: txn.description,
      amount: centsToInput(txn.amountCents),
      type: txn.type === "transfer" ? "expense" : txn.type,
      categoryId: txn.categoryId || "",
      accountId: txn.accountId || "",
      creditCardId: txn.creditCardId || "",
      msiMonths: "",
      spentById: txn.spentById || "",
    });
    setMode("edit");
  }

  async function save() {
    try {
      if (mode === "edit" && editId) {
        await api("/api/transactions", {
          method: "PATCH",
          json: {
            id: editId,
            date: form.date,
            description: form.description,
            amount: form.amount,
            type: form.type as "income" | "expense",
            categoryId: form.categoryId || null,
            accountId: form.accountId || null,
            creditCardId: form.creditCardId || null,
            spentById: form.spentById || null,
          },
        });
        toast.success(t.transactions.updated || t.success);
      } else {
        await api("/api/transactions", {
          method: "POST",
          json: {
            ...form,
            categoryId: form.categoryId || null,
            accountId: form.accountId || null,
            creditCardId: form.creditCardId || null,
            spentById: form.spentById || null,
            msiMonths: form.msiMonths ? parseInt(form.msiMonths, 10) : undefined,
            autoCategory: !form.categoryId,
          },
        });
        toast.success(t.transactions.created);
      }
      setMode("none");
      setEditId(null);
      setForm((f) => ({ ...emptyForm, accountId: f.accountId }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function remove(id: string) {
    if (!confirm(t.transactions.confirmDelete)) return;
    try {
      await api(`/api/transactions?id=${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  const filteredCats = categories.filter((c) => c.type === form.type);
  const memberList: Member[] = members.length > 0 ? members : [];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.transactions}
        title={t.transactions.title}
        subtitle={t.transactions.subtitle}
        actions={
          <>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-auto"
              aria-label={t.period}
            />
            <Button
              onClick={() => {
                setMode("new");
                setEditId(null);
                setForm((f) => ({
                  ...emptyForm,
                  accountId: f.accountId || accounts[0]?.id || "",
                  date: todayISO(),
                }));
              }}
            >
              {t.transactions.new}
            </Button>
          </>
        }
      />

      {mode !== "none" && (
        <Card premium>
          <CardHeader>
            <CardTitle>
              {mode === "edit" ? t.edit : t.transactions.newTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.type}</Label>
              <Select
                className="mt-1"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value, categoryId: "" })
                }
              >
                <option value="expense">{t.expense}</option>
                <option value="income">{t.income}</option>
              </Select>
            </div>
            <div>
              <Label>{t.date}</Label>
              <Input
                type="date"
                className="mt-1"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{t.description}</Label>
              <Input
                className="mt-1"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div>
              <Label>{t.amount}</Label>
              <Input
                className="mt-1"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.category}</Label>
              <Select
                className="mt-1"
                value={form.categoryId}
                onChange={(e) =>
                  setForm({ ...form, categoryId: e.target.value })
                }
              >
                <option value="">{t.transactions.autoCategory}</option>
                {filteredCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t.account}</Label>
              <Select
                className="mt-1"
                value={form.accountId}
                onChange={(e) =>
                  setForm({ ...form, accountId: e.target.value })
                }
              >
                <option value="">{t.none}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            {form.type === "expense" && (
              <>
                <div>
                  <Label>{t.transactions.spentBy}</Label>
                  <Select
                    className="mt-1"
                    value={form.spentById}
                    onChange={(e) =>
                      setForm({ ...form, spentById: e.target.value })
                    }
                  >
                    <option value="">{t.none}</option>
                    {memberList.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.displayName}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>{t.transactions.creditCard}</Label>
                  <Select
                    className="mt-1"
                    value={form.creditCardId}
                    onChange={(e) =>
                      setForm({ ...form, creditCardId: e.target.value })
                    }
                  >
                    <option value="">{t.transactions.cashDebit}</option>
                    {cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {mode === "new" && form.creditCardId && (
                  <div>
                    <Label>{t.transactions.msi}</Label>
                    <Input
                      className="mt-1"
                      value={form.msiMonths}
                      onChange={(e) =>
                        setForm({ ...form, msiMonths: e.target.value })
                      }
                    />
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={save}>{t.save}</Button>
              <Button variant="ghost" onClick={() => setMode("none")}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="divide-y divide-white/5 p-0">
          {txns.length === 0 && (
            <p className="p-5 text-sm text-[var(--fg-faint)]">
              {t.transactions.empty}
            </p>
          )}
          {txns.map((txn) => (
            <div
              key={txn.id}
              className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {txn.category?.icon || "•"} {txn.description}
                </div>
                <div className="text-xs text-[var(--fg-faint)]">
                  {txn.date}
                  {txn.account ? ` · ${txn.account.name}` : ""}
                  {txn.spentBy ? ` · ${txn.spentBy.displayName}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={
                    txn.type === "income"
                      ? "money-income"
                      : txn.type === "transfer"
                        ? "text-[var(--fg-muted)]"
                        : "money-expense"
                  }
                >
                  {money(txn.amountCents)}
                </span>
                {txn.type !== "transfer" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEdit(txn)}
                  >
                    {t.edit}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(txn.id)}
                >
                  {t.delete}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
