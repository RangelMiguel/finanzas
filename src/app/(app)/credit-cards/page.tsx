"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { toast } from "sonner";

type PaymentBucket = {
  start: string;
  end: string;
  paymentDue: string;
  amountCents: number;
};

type CC = {
  id: string;
  name: string;
  lastFour: string;
  cutoffDay: number;
  graceDays: number;
  monthSpendCents: number;
  nextPayment: PaymentBucket;
  followingPayment: PaymentBucket;
};

export default function CreditCardsPage() {
  const { money, t, tr, locale } = useApp();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [cards, setCards] = useState<CC[]>([]);
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    lastFour: "",
    cutoffDay: "15",
    graceDays: "20",
  });

  const dateLocale = locale === "en" ? enUS : esLocale;

  function fmtDate(iso: string) {
    try {
      return format(parseISO(iso), "d MMM yyyy", { locale: dateLocale });
    } catch {
      return iso;
    }
  }

  async function load() {
    const res = await api<{ creditCards: CC[] }>("/api/credit-cards");
    setCards(res.creditCards);
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  function openEdit(c: CC) {
    setEditId(c.id);
    setForm({
      name: c.name,
      lastFour: c.lastFour,
      cutoffDay: String(c.cutoffDay),
      graceDays: String(c.graceDays),
    });
    setMode("edit");
  }

  async function save() {
    try {
      const payload = {
        name: form.name,
        lastFour: form.lastFour,
        cutoffDay: parseInt(form.cutoffDay, 10),
        graceDays: parseInt(form.graceDays, 10),
      };
      if (mode === "edit" && editId) {
        await api("/api/credit-cards", {
          method: "PATCH",
          json: { id: editId, ...payload },
        });
        toast.success(t.cards.updated || t.success);
      } else {
        await api("/api/credit-cards", { method: "POST", json: payload });
        toast.success(t.cards.created);
      }
      setMode("none");
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: t.delete,
      description: t.cards.confirmDelete,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    await api(`/api/credit-cards?id=${id}`, { method: "DELETE" });
    await load();
  }

  function PaymentBlock({
    label,
    amountLabel,
    bucket,
    emphasize,
    inProgress,
  }: {
    label: string;
    amountLabel: string;
    bucket: PaymentBucket;
    emphasize?: boolean;
    inProgress?: boolean;
  }) {
    return (
      <div
        className={
          emphasize
            ? "rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
            : "rounded-xl border border-dashed border-[var(--border)] p-3"
        }
      >
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--fg-faint)]">
          {label}
        </p>
        <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
          {tr(t.cards.payOn, { date: fmtDate(bucket.paymentDue) })}
        </p>
        <p
          className={
            emphasize
              ? "mt-1 font-display text-2xl text-[var(--fg)]"
              : "mt-1 font-display text-xl text-[var(--fg)]"
          }
        >
          {money(bucket.amountCents)}
        </p>
        <p className="mt-1 text-xs text-[var(--fg-faint)]">
          {amountLabel}
          {" · "}
          {tr(t.cards.cycleRange, {
            start: fmtDate(bucket.start),
            end: fmtDate(bucket.end),
          })}
          {inProgress ? ` (${t.cards.inProgress})` : ""}
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        kicker={t.nav.creditCards}
        title={t.cards.title}
        subtitle={t.cards.subtitle}
        actions={
          <Button
            onClick={() => {
              setMode("new");
              setEditId(null);
              setForm({ name: "", lastFour: "", cutoffDay: "15", graceDays: "20" });
            }}
          >
            {t.cards.new}
          </Button>
        }
      />

      {mode !== "none" && (
        <Card className="mb-6" premium>
          <CardHeader>
            <CardTitle>{mode === "edit" ? t.edit : t.cards.new}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.name}</Label>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.cards.lastFour}</Label>
              <Input
                className="mt-1"
                maxLength={4}
                value={form.lastFour}
                onChange={(e) => setForm({ ...form, lastFour: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.cards.cutoffDay}</Label>
              <Input
                className="mt-1"
                value={form.cutoffDay}
                onChange={(e) => setForm({ ...form, cutoffDay: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.cards.graceDays}</Label>
              <Input
                className="mt-1"
                value={form.graceDays}
                onChange={(e) => setForm({ ...form, graceDays: e.target.value })}
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

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.length === 0 && (
          <p className="text-sm text-[var(--fg-faint)]">{t.cards.empty}</p>
        )}
        {cards.map((c) => (
          <Card
            key={c.id}
            premium
            className="cursor-pointer transition hover:border-teal-400/40"
            onClick={() => router.push(`/credit-cards/${c.id}`)}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(`/credit-cards/${c.id}`);
              }
            }}
          >
            <CardHeader className="flex flex-row justify-between gap-2">
              <CardTitle>
                {c.name} {c.lastFour ? `•••• ${c.lastFour}` : ""}
              </CardTitle>
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button variant="secondary" size="sm" onClick={() => openEdit(c)}>
                  {t.edit}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(c.id)}>
                  {t.delete}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[var(--fg-muted)]">
              <p>
                {tr(t.cards.cutoffGrace, {
                  cutoff: c.cutoffDay,
                  grace: c.graceDays,
                })}
              </p>

              {c.nextPayment && c.followingPayment ? (
                <div className="grid gap-2">
                  <PaymentBlock
                    label={t.cards.nextPayment}
                    amountLabel={t.cards.dueAmount}
                    bucket={c.nextPayment}
                    emphasize
                  />
                  <PaymentBlock
                    label={t.cards.followingPayment}
                    amountLabel={t.cards.accumulated}
                    bucket={c.followingPayment}
                    inProgress
                  />
                </div>
              ) : null}

              <p className="text-xs text-[var(--fg-faint)]">
                {t.cards.monthSpend}: {money(c.monthSpendCents)}
              </p>
              <p className="text-xs font-medium text-teal-300/90">
                {t.cards.tapForPending} →
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
