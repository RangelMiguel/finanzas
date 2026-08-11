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

type Debt = {
  id: string;
  name: string;
  principalCents: number;
  annualRatePercent: number;
  monthlyPaymentCents: number;
  paymentDay: number;
  paidCapitalCents: number;
  remainingCents: number;
  payments: {
    id: string;
    date: string;
    capitalCents: number;
    interestCents: number;
  }[];
  propertyItems?: { id: string; name: string }[];
  suggestedPay?: {
    capitalCents: number;
    interestCents: number;
    totalCents: number;
  } | null;
};
type Acc = { id: string; name: string };

export default function DebtsPage() {
  const { money, t, tr } = useApp();
  const { confirm } = useConfirm();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    principal: "",
    annualRatePercent: "0",
    monthlyPayment: "",
    paymentDay: "1",
    notes: "",
  });
  const [pay, setPay] = useState({ capital: "", interest: "0", accountId: "" });

  async function load() {
    const [d, a] = await Promise.all([
      api<{ debts: Debt[] }>("/api/debts"),
      api<{ accounts: Acc[] }>("/api/accounts"),
    ]);
    setDebts(d.debts);
    setAccounts(a.accounts);
    if (a.accounts[0]) setPay((p) => ({ ...p, accountId: a.accounts[0].id }));
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  async function save() {
    try {
      const payload = {
        name: form.name,
        principal: form.principal,
        annualRatePercent: parseFloat(form.annualRatePercent) || 0,
        monthlyPayment: form.monthlyPayment || 0,
        paymentDay: parseInt(form.paymentDay, 10),
        notes: form.notes || null,
      };
      if (mode === "edit" && editId) {
        await api("/api/debts", { method: "PATCH", json: { id: editId, ...payload } });
        toast.success(t.debts.updated || t.success);
      } else {
        await api("/api/debts", { method: "POST", json: payload });
        toast.success(t.debts.created);
      }
      setMode("none");
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  function openEdit(d: Debt) {
    setEditId(d.id);
    setForm({
      name: d.name,
      principal: centsToInput(d.principalCents),
      annualRatePercent: String(d.annualRatePercent),
      monthlyPayment: centsToInput(d.monthlyPaymentCents),
      paymentDay: String(d.paymentDay),
      notes: "",
    });
    setMode("edit");
  }

  function openPayMonth(d: Debt) {
    const s = d.suggestedPay;
    setPay({
      capital: s ? centsToInput(s.capitalCents) : centsToInput(d.monthlyPaymentCents),
      interest: s ? centsToInput(s.interestCents) : "0",
      accountId: pay.accountId || accounts[0]?.id || "",
    });
    setPayFor(d.id);
  }

  async function payDebt() {
    if (!payFor) return;
    try {
      await api("/api/debt-payments", {
        method: "POST",
        json: {
          debtId: payFor,
          capital: pay.capital,
          interest: pay.interest,
          accountId: pay.accountId || null,
        },
      });
      toast.success(t.debts.paid);
      setPayFor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: t.delete,
      description: t.debts.confirmDelete,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    await api(`/api/debts?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <PageHeader
        kicker={t.nav.debts}
        title={t.debts.title}
        subtitle={t.debts.subtitle}
        actions={<Button onClick={() => { setMode("new"); setEditId(null); }}>{t.debts.new}</Button>}
      />

      {mode !== "none" && (
        <Card className="mb-6" premium>
          <CardHeader>
            <CardTitle>{mode === "edit" ? t.edit : t.debts.new}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.name}</Label>
              <Input
                className="mt-1"
                placeholder={t.debts.namePlaceholder}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.debts.principal}</Label>
              <Input
                money
                className="mt-1"
                value={form.principal}
                onChange={(e) => setForm({ ...form, principal: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.debts.annualRate}</Label>
              <Input
                money
                className="mt-1"
                value={form.annualRatePercent}
                onChange={(e) =>
                  setForm({ ...form, annualRatePercent: e.target.value })
                }
              />
            </div>
            <div>
              <Label>{t.debts.monthlyPayment}</Label>
              <Input
                money
                className="mt-1"
                value={form.monthlyPayment}
                onChange={(e) =>
                  setForm({ ...form, monthlyPayment: e.target.value })
                }
              />
            </div>
            <div>
              <Label>{t.debts.paymentDay}</Label>
              <Input
                numeric
                className="mt-1"
                value={form.paymentDay}
                onChange={(e) => setForm({ ...form, paymentDay: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={save}>{t.save}</Button>
              <Button variant="ghost" onClick={() => { setMode("none"); setEditId(null); }}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {payFor && (
        <Card className="mb-6" premium>
          <CardHeader>
            <CardTitle>{t.debts.registerPay}</CardTitle>
            <p className="text-xs text-[var(--fg-faint)]">{t.debts.payMonthHint}</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{t.debts.capital}</Label>
              <Input
                money
                className="mt-1"
                value={pay.capital}
                onChange={(e) => setPay({ ...pay, capital: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.debts.interest}</Label>
              <Input
                money
                className="mt-1"
                value={pay.interest}
                onChange={(e) => setPay({ ...pay, interest: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.accounts.from}</Label>
              <Select
                className="mt-1"
                value={pay.accountId}
                onChange={(e) => setPay({ ...pay, accountId: e.target.value })}
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
              <Button onClick={payDebt}>{t.debts.registerPay}</Button>
              <Button variant="ghost" onClick={() => setPayFor(null)}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {debts.length === 0 && (
        <p className="text-sm text-[var(--fg-faint)]">{t.debts.empty}</p>
      )}
      {debts.map((d) => {
        const pct =
          d.principalCents > 0 ? (d.paidCapitalCents / d.principalCents) * 100 : 0;
        return (
          <Card key={d.id} className="mb-4" premium>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>{d.name}</CardTitle>
                <p className="text-xs text-[var(--fg-faint)]">
                  {tr(t.debts.ratePayDay, {
                    rate: d.annualRatePercent,
                    payment: money(d.monthlyPaymentCents),
                    day: d.paymentDay,
                  })}
                </p>
                {d.propertyItems && d.propertyItems.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    {d.propertyItems
                      .map((p) =>
                        tr(t.debts.linkedProperty, { name: p.name })
                      )
                      .join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" onClick={() => openPayMonth(d)}>
                  {t.debts.payMonth}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPayFor(d.id)}>
                  {t.debts.pay}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openEdit(d)}>
                  {t.edit}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(d.id)}>
                  {t.delete}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-[var(--fg-muted)]">{t.debts.progress}</span>
                <span>
                  {money(d.paidCapitalCents)} / {money(d.principalCents)}
                </span>
              </div>
              <div className="progress-track mb-2">
                <div
                  className="progress-fill bg-[var(--income)]"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className="text-sm text-[var(--fg-muted)]">
                {t.debts.remaining}: {money(d.remainingCents)}
              </p>
              {d.payments.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
                  <p className="text-xs font-medium text-[var(--fg-muted)]">
                    {t.debts.history} ({d.payments.length})
                  </p>
                  {d.payments.slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      className="flex justify-between text-xs text-[var(--fg-faint)]"
                    >
                      <span>{p.date}</span>
                      <span>
                        {tr(t.debts.capitalLine, {
                          capital: money(p.capitalCents),
                        })}
                        {p.interestCents
                          ? tr(t.debts.interestLine, {
                              interest: money(p.interestCents),
                            })
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
