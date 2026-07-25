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
import { useConfirm } from "@/components/providers/confirm-provider";
import { centsToInput } from "@/lib/utils";
import { toast } from "sonner";

type Rec = {
  id: string;
  description: string;
  amountCents: number;
  dayOfMonth: number;
  active: boolean;
  category?: { name: string; icon: string } | null;
  account?: { name: string } | null;
};
type Plan = {
  id: string;
  description: string;
  totalAmountCents: number;
  months: number;
  monthlyAmountCents: number;
  startDate: string;
  creditCard?: { name: string } | null;
};
type Cat = { id: string; name: string; type: string };
type Acc = { id: string; name: string };

export default function RecurringPage() {
  const { money, t, tr } = useApp();
  const { confirm } = useConfirm();
  const [items, setItems] = useState<Rec[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    dayOfMonth: "1",
    categoryId: "",
    accountId: "",
  });

  async function load() {
    const [r, p, c, a] = await Promise.all([
      api<{ recurringIncomes: Rec[] }>("/api/recurring"),
      api<{ installmentPlans: Plan[] }>("/api/installments"),
      api<{ categories: Cat[] }>("/api/categories"),
      api<{ accounts: Acc[] }>("/api/accounts"),
    ]);
    setItems(r.recurringIncomes);
    setPlans(p.installmentPlans);
    setCategories(c.categories.filter((x) => x.type === "income"));
    setAccounts(a.accounts);
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  async function save() {
    try {
      const payload = {
        description: form.description,
        amount: form.amount,
        dayOfMonth: parseInt(form.dayOfMonth, 10),
        categoryId: form.categoryId || null,
        accountId: form.accountId || null,
      };
      if (mode === "edit" && editId) {
        await api("/api/recurring", { method: "PATCH", json: { id: editId, ...payload } });
        toast.success(t.recurring.updated || t.success);
      } else {
        await api("/api/recurring", { method: "POST", json: payload });
        toast.success(t.recurring.created);
      }
      setMode("none");
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  function openEdit(i: Rec) {
    setEditId(i.id);
    setForm({
      description: i.description,
      amount: centsToInput(i.amountCents),
      dayOfMonth: String(i.dayOfMonth),
      categoryId: "",
      accountId: "",
    });
    setMode("edit");
  }

  async function removeRec(id: string) {
    await api(`/api/recurring?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function removePlan(id: string) {
    const ok = await confirm({
      title: t.delete,
      description: t.recurring.confirmDeleteMsi,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    await api(`/api/installments?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker={t.nav.recurring}
        title={t.recurring.title}
        subtitle={t.recurring.subtitle}
        actions={
          <Button onClick={() => { setMode("new"); setEditId(null); }}>{t.recurring.newIncome}</Button>
        }
      />

      {mode !== "none" && (
        <Card premium>
          <CardHeader>
            <CardTitle>{mode === "edit" ? t.edit : t.recurring.newIncome}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t.description}</Label>
              <Input
                className="mt-1"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
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
              <Label>{t.recurring.dayOfMonth}</Label>
              <Input
                className="mt-1"
                value={form.dayOfMonth}
                onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.category}</Label>
              <Select
                className="mt-1"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">{t.none}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t.account}</Label>
              <Select
                className="mt-1"
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              >
                <option value="">{t.none}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={save}>{t.save}</Button>
              <Button variant="ghost" onClick={() => { setMode("none"); setEditId(null); }}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3" aria-labelledby="rec-incomes">
        <h2 id="rec-incomes" className="font-display text-xl">
          {t.recurring.incomes}
        </h2>
        <p className="text-xs text-[var(--fg-faint)]">{t.recurring.incomesHint}</p>
        {items.length === 0 && (
          <p className="text-sm text-[var(--fg-faint)]">{t.recurring.noIncomes}</p>
        )}
        {items.map((i) => (
          <Card key={i.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <div className="font-medium">{i.description}</div>
                <div className="text-xs text-[var(--fg-faint)]">
                  {t.recurring.dayOfMonth} {i.dayOfMonth}
                  {i.category ? ` · ${i.category.icon} ${i.category.name}` : ""}
                  {i.account ? ` · ${i.account.name}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="money-income font-display text-lg">
                  {money(i.amountCents)}
                </span>
                <Button variant="secondary" size="sm" onClick={() => openEdit(i)}>
                  {t.edit}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => removeRec(i.id)}>
                  {t.delete}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3" aria-labelledby="rec-msi">
        <h2 id="rec-msi" className="font-display text-xl">
          {t.recurring.msi}
        </h2>
        <p className="text-xs text-[var(--fg-faint)]">{t.recurring.msiHint}</p>
        {plans.length === 0 && (
          <p className="text-sm text-[var(--fg-faint)]">{t.recurring.noMsi}</p>
        )}
        {plans.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <div className="font-medium">{p.description}</div>
                <div className="text-xs text-[var(--fg-faint)]">
                  {tr(t.recurring.months, { n: p.months })} ·{" "}
                  {money(p.monthlyAmountCents)}
                  {t.recurring.perMonth}
                  {p.creditCard ? ` · ${p.creditCard.name}` : ""} ·{" "}
                  {tr(t.recurring.fromDate, { date: p.startDate })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display">{money(p.totalAmountCents)}</span>
                <Button variant="ghost" size="sm" onClick={() => removePlan(p.id)}>
                  {t.delete}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
