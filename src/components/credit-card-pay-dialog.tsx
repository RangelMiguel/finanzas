"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { centsToInput, todayISO } from "@/lib/utils";
import { useApp } from "@/components/providers/app-provider";
import { toast } from "sonner";
import { Banknote } from "lucide-react";

type Acc = { id: string; name: string; icon?: string };

export type PayTarget = {
  cardId: string;
  cardName: string;
  cycleDue: string;
  remainingCents: number;
};

export function CreditCardPayDialog({
  target,
  onClose,
  onPaid,
}: {
  target: PayTarget | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { t, money } = useApp();
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setAmount(centsToInput(target.remainingCents));
    setDate(todayISO());
    setDescription(`${t.cards.ccPaymentType} ${target.cardName}`);
    api<{ accounts: Acc[] }>("/api/accounts")
      .then((res) => {
        const list = res.accounts || [];
        setAccounts(list);
        setAccountId((prev) => prev || list[0]?.id || "");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : t.error));
  }, [target, t.cards.ccPaymentType, t.error]);

  if (!target) return null;

  async function submit() {
    if (!target) return;
    if (!accountId) {
      toast.error(t.cards.noAccountsToPay);
      return;
    }
    setSaving(true);
    try {
      await api(`/api/credit-cards/${target.cardId}/pay`, {
        method: "POST",
        json: {
          accountId,
          amount,
          date,
          cycleDue: target.cycleDue,
          description,
        },
      });
      toast.success(t.cards.paySuccess);
      onPaid();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card premium className="mb-6 border-amber-400/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-amber-200" aria-hidden />
          {t.cards.payTitle} · {target.cardName}
        </CardTitle>
        <p className="mt-1 text-xs text-[var(--fg-faint)]">{t.cards.payHint}</p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm">
          <span className="text-[var(--fg-muted)]">{t.cards.payCycle}: </span>
          <span className="font-medium">{target.cycleDue}</span>
          <span className="mx-2 text-[var(--fg-faint)]">·</span>
          <span className="text-amber-100">
            {trSafe(t.cards.remainingDue, money(target.remainingCents))}
          </span>
        </div>
        <div>
          <Label>{t.cards.payFromAccount}</Label>
          <Select
            className="mt-1"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">{t.select}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon ? `${a.icon} ` : ""}
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t.cards.payAmount}</Label>
          <Input
            money
            className="mt-1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <Label>{t.date}</Label>
          <Input
            type="date"
            className="mt-1"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label>{t.description}</Label>
          <Input
            className="mt-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2">
          <Button onClick={submit} disabled={saving || !accountId}>
            {t.cards.pay}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function trSafe(template: string, amount: string) {
  return template.replace("{amount}", amount);
}
