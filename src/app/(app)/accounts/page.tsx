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
import { centsToInput } from "@/lib/utils";

type Account = {
  id: string;
  name: string;
  type: string;
  icon: string;
  balanceCents: number | null;
  initialBalanceCents: number | null;
  balancesHidden?: boolean;
};

const emptyForm = {
  name: "",
  type: "checking",
  icon: "🏦",
  initialBalance: "0",
};

export default function AccountsPage() {
  const { money, t } = useApp();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [mode, setMode] = useState<"none" | "new" | "edit" | "transfer">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [transfer, setTransfer] = useState({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    description: "",
  });

  async function load() {
    const res = await api<{ accounts: Account[] }>("/api/accounts");
    setAccounts(res.accounts);
    if (res.accounts[0]) {
      setTransfer((prev) => ({
        ...prev,
        fromAccountId: prev.fromAccountId || res.accounts[0].id,
        toAccountId:
          prev.toAccountId || res.accounts[1]?.id || res.accounts[0].id,
      }));
    }
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  function openEdit(a: Account) {
    setEditId(a.id);
    setForm({
      name: a.name,
      type: a.type,
      icon: a.icon,
      initialBalance: centsToInput(a.initialBalanceCents ?? 0),
    });
    setMode("edit");
  }

  async function save() {
    try {
      if (mode === "edit" && editId) {
        await api("/api/accounts", {
          method: "PATCH",
          json: { id: editId, ...form },
        });
        toast.success(t.accounts.updated || t.success);
      } else {
        await api("/api/accounts", { method: "POST", json: form });
        toast.success(t.accounts.created);
      }
      setMode("none");
      setForm(emptyForm);
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function doTransfer() {
    try {
      await api("/api/accounts/transfer", { method: "POST", json: transfer });
      toast.success(t.accounts.transferred);
      setMode("none");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function remove(id: string) {
    if (!confirm(t.accounts.confirmDelete)) return;
    try {
      await api(`/api/accounts?id=${id}`, { method: "DELETE" });
      toast.success(t.accounts.deleted);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  function typeLabel(type: string) {
    return t.accountTypes[type as keyof typeof t.accountTypes] || type;
  }

  return (
    <div>
      <PageHeader
        kicker={t.nav.accounts}
        title={t.accounts.title}
        subtitle={t.accounts.subtitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => setMode("transfer")}>
              {t.accounts.transfer}
            </Button>
            <Button
              onClick={() => {
                setForm(emptyForm);
                setEditId(null);
                setMode("new");
              }}
            >
              {t.accounts.new}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id} premium>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <CardTitle className="text-base">
                <span aria-hidden>{a.icon}</span> {a.name}
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="secondary" size="sm" onClick={() => openEdit(a)}>
                  {t.edit}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(a.id)}>
                  {t.delete}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-display text-3xl font-medium">
                {a.balanceCents == null ? "—" : money(a.balanceCents)}
              </p>
              <p className="mt-1 text-xs text-[var(--fg-faint)]">
                {typeLabel(a.type)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(mode === "new" || mode === "edit") && (
        <Card className="mt-6" premium>
          <CardHeader>
            <CardTitle>
              {mode === "edit" ? t.edit : t.accounts.new}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.name}</Label>
              <Input
                className="mt-1"
                placeholder={t.accounts.namePlaceholder}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.type}</Label>
              <Select
                className="mt-1"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="cash">{t.accountTypes.cash}</option>
                <option value="checking">{t.accountTypes.checking}</option>
                <option value="debit">{t.accountTypes.debit}</option>
                <option value="savings">{t.accountTypes.savings}</option>
                <option value="other">{t.accountTypes.other}</option>
              </Select>
            </div>
            <div>
              <Label>{t.accounts.initialBalance}</Label>
              <Input
                className="mt-1"
                value={form.initialBalance}
                onChange={(e) =>
                  setForm({ ...form, initialBalance: e.target.value })
                }
              />
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

      {mode === "transfer" && (
        <Card className="mt-6" premium>
          <CardHeader>
            <CardTitle>{t.accounts.transferTitle}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.accounts.from}</Label>
              <Select
                className="mt-1"
                value={transfer.fromAccountId}
                onChange={(e) =>
                  setTransfer({ ...transfer, fromAccountId: e.target.value })
                }
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t.accounts.to}</Label>
              <Select
                className="mt-1"
                value={transfer.toAccountId}
                onChange={(e) =>
                  setTransfer({ ...transfer, toAccountId: e.target.value })
                }
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t.amount}</Label>
              <Input
                className="mt-1"
                value={transfer.amount}
                onChange={(e) =>
                  setTransfer({ ...transfer, amount: e.target.value })
                }
              />
            </div>
            <div>
              <Label>{t.descriptionOptional}</Label>
              <Input
                className="mt-1"
                value={transfer.description}
                onChange={(e) =>
                  setTransfer({ ...transfer, description: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={doTransfer}>{t.accounts.transfer}</Button>
              <Button variant="ghost" onClick={() => setMode("none")}>
                {t.cancel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
