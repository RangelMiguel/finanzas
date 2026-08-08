"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { centsToInput } from "@/lib/utils";
import { toast } from "sonner";
import { useConfirm } from "@/components/providers/confirm-provider";
import {
  CreditCardPayDialog,
  type PayTarget,
} from "@/components/credit-card-pay-dialog";
import { Banknote } from "lucide-react";
import { todayISO } from "@/lib/utils";

type PaymentLine = {
  date: string;
  amountCents: number;
  label: string;
  kind: "purchase" | "msi";
  paymentDue: string;
  planId?: string;
  transactionId?: string;
};

type Payment = {
  start: string;
  end: string;
  paymentDue: string;
  amountCents: number;
  chargedCents?: number;
  paidCents?: number;
  remainingCents?: number;
  lines: PaymentLine[];
};

type RecordedPay = {
  id: string;
  amountCents: number;
  date: string;
  description?: string | null;
  ccCycleDue?: string | null;
  accountName?: string | null;
};

type MsiPending = {
  id: string;
  description: string;
  monthlyAmountCents: number;
  months: number;
  monthsLeft: number;
  remainingCents: number;
  startDate: string;
  nextChargeDate: string | null;
  totalAmountCents?: number;
};

type Detail = {
  creditCard: {
    id: string;
    name: string;
    lastFour: string;
    cutoffDay: number;
    graceDays: number;
  };
  payments: Payment[];
  msiPending: MsiPending[];
  msiPlans?: MsiPending[];
  totalPendingCents: number;
  totalMsiRemainingCents: number;
  recordedPayments?: RecordedPay[];
};

type MsiEditForm = {
  id: string;
  description: string;
  totalAmount: string;
  months: string;
  startDate: string;
};

type PurchaseEditForm = {
  id: string;
  description: string;
  amount: string;
  date: string;
};

export default function CreditCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { money, t, tr, locale } = useApp();
  const { confirm, confirmChoice } = useConfirm();
  const dateLocale = locale === "en" ? enUS : esLocale;
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [msiEdit, setMsiEdit] = useState<MsiEditForm | null>(null);
  const [purchaseEdit, setPurchaseEdit] = useState<PurchaseEditForm | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);

  function fmtDate(iso: string) {
    try {
      return format(parseISO(iso), "d MMM yyyy", { locale: dateLocale });
    } catch {
      return iso;
    }
  }

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api<Detail>(`/api/credit-cards/${id}`);
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }, [id, t.error]);

  useEffect(() => {
    load();
  }, [load]);

  const msiList = data?.msiPending?.length
    ? data.msiPending
    : data?.msiPlans?.filter((p) => (p.monthsLeft ?? 0) > 0) || [];

  async function deleteMsiPlan(planId: string) {
    const ok = await confirm({
      title: t.cards.confirmDeleteTitle,
      description: t.cards.confirmDeleteMsi,
      confirmLabel: t.cards.deleteMsiAll,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/installments?id=${planId}`, { method: "DELETE" });
      toast.success(t.cards.deletedAllMsi || t.success);
      setMsiEdit(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  /** Line-level MSI delete: ask one payment vs whole plan */
  async function deleteMsiLine(planId: string, chargeDate: string) {
    const choice = await confirmChoice({
      title: t.cards.confirmDeleteMsiTitle,
      description: t.cards.confirmDeleteMsiDesc,
      cancelLabel: t.cancel,
      actions: [
        { id: "one", label: t.cards.deleteMsiOne, variant: "secondary" },
        { id: "all", label: t.cards.deleteMsiAll, variant: "danger" },
      ],
    });
    if (!choice) return;
    try {
      if (choice === "all") {
        await api(`/api/installments?id=${planId}`, { method: "DELETE" });
        toast.success(t.cards.deletedAllMsi || t.success);
      } else {
        await api("/api/installments", {
          method: "PATCH",
          json: { id: planId, removeChargeDate: chargeDate },
        });
        toast.success(t.cards.deletedOneMsi || t.success);
      }
      setMsiEdit(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function saveMsi() {
    if (!msiEdit) return;
    setSaving(true);
    try {
      await api("/api/installments", {
        method: "PATCH",
        json: {
          id: msiEdit.id,
          description: msiEdit.description,
          totalAmount: msiEdit.totalAmount,
          months: parseInt(msiEdit.months, 10),
          startDate: msiEdit.startDate,
        },
      });
      toast.success(t.success);
      setMsiEdit(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setSaving(false);
    }
  }

  async function deletePurchase(txnId: string) {
    const ok = await confirm({
      title: t.cards.confirmDeletePurchaseTitle,
      description: t.cards.confirmDeletePurchase,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/transactions?id=${txnId}`, { method: "DELETE" });
      toast.success(t.success);
      setPurchaseEdit(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function savePurchase() {
    if (!purchaseEdit) return;
    setSaving(true);
    try {
      await api("/api/transactions", {
        method: "PATCH",
        json: {
          id: purchaseEdit.id,
          description: purchaseEdit.description,
          amount: purchaseEdit.amount,
          date: purchaseEdit.date,
        },
      });
      toast.success(t.success);
      setPurchaseEdit(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setSaving(false);
    }
  }

  function openMsiEdit(p: MsiPending) {
    setPurchaseEdit(null);
    setMsiEdit({
      id: p.id,
      description: p.description,
      totalAmount: centsToInput(
        p.totalAmountCents ?? p.monthlyAmountCents * p.months
      ),
      months: String(p.months),
      startDate: p.startDate,
    });
  }

  function openPurchaseEdit(line: PaymentLine) {
    if (!line.transactionId) return;
    setMsiEdit(null);
    setPurchaseEdit({
      id: line.transactionId,
      description: line.label,
      amount: centsToInput(line.amountCents),
      date: line.date,
    });
  }

  const card = data?.creditCard;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.creditCards}
        title={
          card
            ? `${card.name}${card.lastFour ? ` •••• ${card.lastFour}` : ""}`
            : t.cards.pendingTitle
        }
        subtitle={
          card
            ? tr(t.cards.cutoffGrace, {
                cutoff: card.cutoffDay,
                grace: card.graceDays,
              })
            : t.cards.pendingSubtitle
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {data && data.totalPendingCents > 0 && (
              <Button
                onClick={() => {
                  const first = data.payments.find(
                    (p) => (p.remainingCents ?? p.amountCents) > 0
                  );
                  if (!first || !card) return;
                  setPayTarget({
                    cardId: card.id,
                    cardName: card.name,
                    cycleDue: first.paymentDue,
                    remainingCents: first.remainingCents ?? first.amountCents,
                  });
                }}
              >
                <Banknote className="h-4 w-4" aria-hidden />
                {t.cards.pay}
              </Button>
            )}
            <Button variant="secondary" onClick={() => router.push("/credit-cards")}>
              {t.back}
            </Button>
          </div>
        }
      />

      {loading && (
        <p className="text-sm text-[var(--fg-faint)]">{t.loading}</p>
      )}

      {data && !loading && (
        <>
          <CreditCardPayDialog
            target={payTarget}
            onClose={() => setPayTarget(null)}
            onPaid={() => load()}
          />
          <p className="text-xs text-amber-200/80">{t.cards.payHint}</p>
          <p className="text-xs text-[var(--fg-faint)]">{t.cards.orphanHint}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card premium>
              <CardContent className="pt-5">
                <p className="text-xs uppercase tracking-wide text-[var(--fg-faint)]">
                  {t.cards.totalPending}
                </p>
                <p className="mt-1 font-display text-3xl text-[var(--fg)]">
                  {money(data.totalPendingCents)}
                </p>
                <p className="mt-1 text-xs text-[var(--fg-faint)]">
                  {tr(t.cards.paymentsCount, { n: data.payments.length })}
                </p>
              </CardContent>
            </Card>
            <Card premium>
              <CardContent className="pt-5">
                <p className="text-xs uppercase tracking-wide text-[var(--fg-faint)]">
                  {t.cards.msiRemaining}
                </p>
                <p className="mt-1 font-display text-3xl text-[var(--fg)]">
                  {money(data.totalMsiRemainingCents)}
                </p>
                <p className="mt-1 text-xs text-[var(--fg-faint)]">
                  {tr(t.cards.msiPlansCount, { n: msiList.length })}
                </p>
              </CardContent>
            </Card>
          </div>

          {msiEdit && (
            <Card premium>
              <CardHeader>
                <CardTitle>{t.cards.editMsi}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>{t.description}</Label>
                  <Input
                    className="mt-1"
                    value={msiEdit.description}
                    onChange={(e) =>
                      setMsiEdit({ ...msiEdit, description: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>{t.cards.msiTotal}</Label>
                  <Input
                    money
                    className="mt-1"
                    value={msiEdit.totalAmount}
                    onChange={(e) =>
                      setMsiEdit({ ...msiEdit, totalAmount: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>{t.cards.msiMonths}</Label>
                  <Input
                    numeric
                    className="mt-1"
                    value={msiEdit.months}
                    onChange={(e) =>
                      setMsiEdit({ ...msiEdit, months: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>{t.cards.msiStart}</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={msiEdit.startDate}
                    onChange={(e) =>
                      setMsiEdit({ ...msiEdit, startDate: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button onClick={saveMsi} disabled={saving}>
                    {t.save}
                  </Button>
                  <Button variant="ghost" onClick={() => setMsiEdit(null)}>
                    {t.cancel}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => deleteMsiPlan(msiEdit.id)}
                  >
                    {t.cards.deleteMsi}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {purchaseEdit && (
            <Card premium>
              <CardHeader>
                <CardTitle>{t.cards.editPurchase}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>{t.description}</Label>
                  <Input
                    className="mt-1"
                    value={purchaseEdit.description}
                    onChange={(e) =>
                      setPurchaseEdit({
                        ...purchaseEdit,
                        description: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>{t.amount}</Label>
                  <Input
                    money
                    className="mt-1"
                    value={purchaseEdit.amount}
                    onChange={(e) =>
                      setPurchaseEdit({
                        ...purchaseEdit,
                        amount: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>{t.date}</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={purchaseEdit.date}
                    onChange={(e) =>
                      setPurchaseEdit({
                        ...purchaseEdit,
                        date: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button onClick={savePurchase} disabled={saving}>
                    {t.save}
                  </Button>
                  <Button variant="ghost" onClick={() => setPurchaseEdit(null)}>
                    {t.cancel}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => deletePurchase(purchaseEdit.id)}
                  >
                    {t.cards.deletePurchase}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {msiList.length > 0 && (
            <Card premium>
              <CardHeader>
                <CardTitle>{t.cards.msiPendingTitle}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-white/5 p-0">
                {msiList.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--fg)]">
                        {p.description}
                      </p>
                      <p className="text-xs text-[var(--fg-faint)]">
                        {tr(t.cards.msiLeftLine, {
                          left: p.monthsLeft,
                          total: p.months,
                          monthly: money(p.monthlyAmountCents),
                        })}
                        {p.nextChargeDate
                          ? ` · ${tr(t.cards.nextCharge, {
                              date: fmtDate(p.nextChargeDate),
                            })}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-display text-lg text-[var(--fg)]">
                        {money(p.remainingCents)}
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openMsiEdit(p)}
                      >
                        {t.edit}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMsiPlan(p.id)}
                      >
                        {t.delete}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            <h2 className="font-display text-lg text-[var(--fg)]">
              {t.cards.pendingPayments}
            </h2>
            {data.payments.length === 0 && (
              <p className="text-sm text-[var(--fg-faint)]">
                {t.cards.noPending}
              </p>
            )}
            {data.payments.map((pay) => {
              const remaining = pay.remainingCents ?? pay.amountCents;
              const paid = pay.paidCents ?? 0;
              const charged = pay.chargedCents ?? pay.amountCents;
              const overdue = pay.paymentDue < todayISO();
              return (
              <Card key={pay.paymentDue} premium>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {tr(t.cards.payOn, { date: fmtDate(pay.paymentDue) })}
                      {overdue && remaining > 0 && (
                        <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-rose-300">
                          {t.cards.overdue}
                        </span>
                      )}
                      {remaining <= 0 && (
                        <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-teal-300">
                          {t.cards.paidInFull}
                        </span>
                      )}
                    </CardTitle>
                    <p className="mt-1 text-xs text-[var(--fg-faint)]">
                      {tr(t.cards.cycleRange, {
                        start: fmtDate(pay.start),
                        end: fmtDate(pay.end),
                      })}
                      {" · "}
                      {tr(t.cards.charged, { amount: money(charged) })}
                      {paid > 0
                        ? ` · ${tr(t.cards.paidSoFar, { amount: money(paid) })}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className={`font-display text-2xl ${remaining > 0 && overdue ? "money-expense" : "text-[var(--fg)]"}`}>
                      {money(remaining)}
                    </p>
                    {remaining > 0 && card && (
                      <Button
                        size="sm"
                        onClick={() =>
                          setPayTarget({
                            cardId: card.id,
                            cardName: card.name,
                            cycleDue: pay.paymentDue,
                            remainingCents: remaining,
                          })
                        }
                      >
                        <Banknote className="h-3.5 w-3.5" aria-hidden />
                        {t.cards.pay}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="divide-y divide-white/5 border-t border-white/5 p-0">
                  {pay.lines.map((line, i) => (
                    <div
                      key={`${line.date}-${line.label}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[var(--fg)]">{line.label}</p>
                        <p className="text-xs text-[var(--fg-faint)]">
                          {fmtDate(line.date)}
                          {line.kind === "msi" ? " · MSI" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 money-expense">
                          {money(line.amountCents)}
                        </span>
                        {line.kind === "msi" && line.planId && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                const plan =
                                  msiList.find((x) => x.id === line.planId) ||
                                  data.msiPending.find(
                                    (x) => x.id === line.planId
                                  );
                                if (plan) openMsiEdit(plan);
                                else
                                  openMsiEdit({
                                    id: line.planId!,
                                    description: line.label.replace(
                                      /^MSI:\s*/,
                                      ""
                                    ),
                                    monthlyAmountCents: line.amountCents,
                                    months: 1,
                                    monthsLeft: 1,
                                    remainingCents: line.amountCents,
                                    startDate: line.date,
                                    nextChargeDate: line.date,
                                  });
                              }}
                            >
                              {t.edit}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteMsiLine(line.planId!, line.date)}
                            >
                              {t.delete}
                            </Button>
                          </>
                        )}
                        {line.kind === "purchase" && line.transactionId && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openPurchaseEdit(line)}
                            >
                              {t.edit}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                deletePurchase(line.transactionId!)
                              }
                            >
                              {t.delete}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
            })}
          </div>

          {(data.recordedPayments || []).length > 0 && (
            <Card premium>
              <CardHeader>
                <CardTitle>{t.cards.payRecorded}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-white/5 p-0">
                {(data.recordedPayments || []).map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{p.description || t.cards.ccPaymentType}</p>
                      <p className="text-xs text-[var(--fg-faint)]">
                        {fmtDate(p.date)}
                        {p.accountName ? ` · ${p.accountName}` : ""}
                        {p.ccCycleDue ? ` · ${p.ccCycleDue}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>{money(p.amountCents)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const ok = await confirm({
                            title: t.delete,
                            description: t.cards.confirmDeletePay,
                            confirmLabel: t.delete,
                            cancelLabel: t.cancel,
                            danger: true,
                          });
                          if (!ok) return;
                          try {
                            await api(`/api/transactions?id=${p.id}`, {
                              method: "DELETE",
                            });
                            toast.success(t.success);
                            await load();
                          } catch (e) {
                            toast.error(
                              e instanceof Error ? e.message : t.error
                            );
                          }
                        }}
                      >
                        {t.delete}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
