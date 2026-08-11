"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { centsToInput } from "@/lib/utils";
import { toast } from "sonner";
import type { CreditDirection, CreditKind } from "@/lib/credits";

type Payment = { id: string; date: string; amountCents: number };
type Credit = {
  id: string;
  direction: CreditDirection;
  kind: CreditKind;
  counterpartyName: string;
  counterpartyUserId: string | null;
  principalCents: number;
  paidCents: number;
  remainingCents: number;
  overdue: boolean;
  dueOn: string | null;
  openedOn: string;
  notes: string | null;
  payments: Payment[];
};
type Acc = { id: string; name: string };

const KINDS: CreditKind[] = [
  "person",
  "family",
  "business",
  "employee",
  "store",
  "other",
];

function emptyForm() {
  return {
    direction: "lent" as CreditDirection,
    kind: "person" as CreditKind,
    counterpartyName: "",
    counterpartyUserId: "",
    principal: "",
    openedOn: "",
    dueOn: "",
    notes: "",
    accountId: "",
  };
}

export default function CreditsPage() {
  const { money, t, members } = useApp();
  const { confirm } = useConfirm();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [totals, setTotals] = useState({
    receivableCents: 0,
    payableCents: 0,
    netCents: 0,
    overdueCount: 0,
  });
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [pay, setPay] = useState({ amount: "", accountId: "" });

  async function load() {
    const [c, a] = await Promise.all([
      api<{ credits: Credit[]; totals: typeof totals }>("/api/credits"),
      api<{ accounts: Acc[] }>("/api/accounts"),
    ]);
    setCredits(c.credits);
    setTotals(c.totals);
    setAccounts(a.accounts);
    if (a.accounts[0]) {
      setPay((p) => ({ ...p, accountId: p.accountId || a.accounts[0].id }));
    }
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  function openNew() {
    setEditId(null);
    setForm(emptyForm());
    setMode("new");
  }

  function openEdit(c: Credit) {
    setEditId(c.id);
    setForm({
      direction: c.direction,
      kind: c.kind,
      counterpartyName: c.counterpartyName,
      counterpartyUserId: c.counterpartyUserId || "",
      principal: centsToInput(c.principalCents),
      openedOn: c.openedOn || "",
      dueOn: c.dueOn || "",
      notes: c.notes || "",
      accountId: "",
    });
    setMode("edit");
  }

  async function save() {
    try {
      const payload = {
        direction: form.direction,
        kind: form.kind,
        counterpartyName: form.counterpartyName,
        counterpartyUserId: form.counterpartyUserId || null,
        principal: form.principal,
        openedOn: form.openedOn || null,
        dueOn: form.dueOn || null,
        notes: form.notes || null,
        accountId: mode === "new" ? form.accountId || null : undefined,
      };
      if (mode === "edit" && editId) {
        await api("/api/credits", {
          method: "PATCH",
          json: { id: editId, ...payload },
        });
        toast.success(t.credits.updated);
      } else {
        await api("/api/credits", { method: "POST", json: payload });
        toast.success(t.credits.created);
      }
      setMode("none");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: t.delete,
      description: t.credits.confirmDelete,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    await api(`/api/credits?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function submitPay() {
    if (!payFor) return;
    try {
      await api("/api/credit-payments", {
        method: "POST",
        json: {
          creditId: payFor,
          amount: pay.amount,
          accountId: pay.accountId || null,
        },
      });
      toast.success(t.credits.paid);
      setPayFor(null);
      setPay((p) => ({ ...p, amount: "" }));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  const paying = payFor ? credits.find((c) => c.id === payFor) : null;
  const kinds = t.credits.kinds;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.credits}
        title={t.credits.title}
        subtitle={t.credits.subtitle}
        actions={<Button onClick={openNew}>{t.credits.new}</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.credits.receivable}
          </div>
          <div className="mt-1 font-display text-2xl text-emerald-300">
            {money(totals.receivableCents)}
          </div>
        </div>
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.credits.payable}
          </div>
          <div className="mt-1 font-display text-2xl text-amber-200">
            {money(totals.payableCents)}
          </div>
        </div>
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">{t.credits.net}</div>
          <div
            className={`mt-1 font-display text-2xl ${
              totals.netCents >= 0 ? "text-[var(--accent)]" : "text-rose-300"
            }`}
          >
            {money(totals.netCents)}
          </div>
        </div>
      </div>

      {mode !== "none" && (
        <Card premium>
          <CardHeader>
            <CardTitle>{mode === "edit" ? t.edit : t.credits.new}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.credits.direction}</Label>
              <Select
                className="mt-1"
                value={form.direction}
                onChange={(e) =>
                  setForm({
                    ...form,
                    direction: e.target.value as CreditDirection,
                  })
                }
              >
                <option value="lent">{t.credits.lent}</option>
                <option value="borrowed">{t.credits.borrowed}</option>
              </Select>
            </div>
            <div>
              <Label>{t.credits.kind}</Label>
              <Select
                className="mt-1"
                value={form.kind}
                onChange={(e) =>
                  setForm({ ...form, kind: e.target.value as CreditKind })
                }
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kinds[k]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>{t.credits.counterparty}</Label>
              <Input
                className="mt-1"
                placeholder={t.credits.counterpartyPh}
                value={form.counterpartyName}
                onChange={(e) =>
                  setForm({ ...form, counterpartyName: e.target.value })
                }
              />
            </div>
            {members.length > 0 && (
              <div className="sm:col-span-2">
                <Label>{t.credits.householdMember}</Label>
                <Select
                  className="mt-1"
                  value={form.counterpartyUserId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const mem = members.find((x) => x.user.id === id);
                    setForm({
                      ...form,
                      counterpartyUserId: id,
                      counterpartyName:
                        mem && !form.counterpartyName
                          ? mem.user.displayName
                          : form.counterpartyName,
                    });
                  }}
                >
                  <option value="">{t.credits.memberNone}</option>
                  {members.map((mem) => (
                    <option key={mem.user.id} value={mem.user.id}>
                      {mem.user.displayName}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label>{t.credits.principal}</Label>
              <Input
                money
                className="mt-1"
                value={form.principal}
                onChange={(e) =>
                  setForm({ ...form, principal: e.target.value })
                }
              />
            </div>
            <div>
              <Label>{t.credits.openedOn}</Label>
              <Input
                type="date"
                className="mt-1"
                value={form.openedOn}
                onChange={(e) =>
                  setForm({ ...form, openedOn: e.target.value })
                }
              />
            </div>
            <div>
              <Label>{t.credits.dueOn}</Label>
              <Input
                type="date"
                className="mt-1"
                value={form.dueOn}
                onChange={(e) => setForm({ ...form, dueOn: e.target.value })}
              />
            </div>
            {mode === "new" && (
              <div>
                <Label>{t.credits.recordCash}</Label>
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
                <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
                  {form.direction === "lent"
                    ? t.credits.openCashLent
                    : t.credits.openCashBorrowed}{" "}
                  {t.credits.recordCashHint}
                </p>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label>{t.notes}</Label>
              <Textarea
                className="mt-1"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={save}>{t.save}</Button>
              <Button variant="ghost" onClick={() => setMode("none")}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {paying && (
        <Card premium>
          <CardHeader>
            <CardTitle>
              {paying.direction === "lent"
                ? t.credits.collect
                : t.credits.repay}{" "}
              · {paying.counterpartyName}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{t.credits.payAmount}</Label>
              <Input
                money
                className="mt-1"
                value={pay.amount}
                onChange={(e) => setPay({ ...pay, amount: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
                {t.credits.remaining}: {money(paying.remainingCents)}
              </p>
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
            <div className="flex items-end gap-2">
              <Button onClick={submitPay}>{t.save}</Button>
              <Button variant="ghost" onClick={() => setPayFor(null)}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {credits.length === 0 && (
        <p className="text-sm text-[var(--fg-faint)]">{t.credits.empty}</p>
      )}
      {credits.map((c) => {
        const pct =
          c.principalCents > 0 ? (c.paidCents / c.principalCents) * 100 : 0;
        return (
          <Card key={c.id} premium>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle>{c.counterpartyName}</CardTitle>
                <p className="text-xs text-[var(--fg-faint)]">
                  {c.direction === "lent" ? t.credits.lent : t.credits.borrowed}
                  {" · "}
                  {kinds[c.kind]}
                  {c.dueOn ? ` · ${c.dueOn}` : ""}
                  {c.overdue ? ` · ${t.credits.overdue}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  onClick={() => {
                    setPay({
                      amount: centsToInput(c.remainingCents),
                      accountId: pay.accountId || accounts[0]?.id || "",
                    });
                    setPayFor(c.id);
                  }}
                  disabled={c.remainingCents <= 0}
                >
                  {c.direction === "lent" ? t.credits.collect : t.credits.repay}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openEdit(c)}>
                  {t.edit}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
                  {t.delete}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-[var(--fg-muted)]">{t.credits.remaining}</span>
                <span>
                  {money(c.remainingCents)} / {money(c.principalCents)}
                </span>
              </div>
              <div className="progress-track mb-2">
                <div
                  className="progress-fill bg-[var(--income)]"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              {c.notes && (
                <p className="text-xs text-[var(--fg-faint)]">{c.notes}</p>
              )}
              {c.payments.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
                  <p className="text-xs font-medium text-[var(--fg-muted)]">
                    {t.credits.history}
                  </p>
                  {c.payments.slice(0, 6).map((p) => (
                    <div
                      key={p.id}
                      className="flex justify-between text-xs text-[var(--fg-faint)]"
                    >
                      <span>{p.date}</span>
                      <span>{money(p.amountCents)}</span>
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
