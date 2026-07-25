"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { toast } from "sonner";

type PaymentLine = {
  date: string;
  amountCents: number;
  label: string;
  kind: "purchase" | "msi";
  paymentDue: string;
};

type Payment = {
  start: string;
  end: string;
  paymentDue: string;
  amountCents: number;
  lines: PaymentLine[];
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
  totalPendingCents: number;
  totalMsiRemainingCents: number;
};

export default function CreditCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { money, t, tr, locale } = useApp();
  const dateLocale = locale === "en" ? enUS : esLocale;
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  function fmtDate(iso: string) {
    try {
      return format(parseISO(iso), "d MMM yyyy", { locale: dateLocale });
    } catch {
      return iso;
    }
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<Detail>(`/api/credit-cards/${id}`)
      .then(setData)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

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
          <Button variant="secondary" onClick={() => router.push("/credit-cards")}>
            {t.back}
          </Button>
        }
      />

      {loading && (
        <p className="text-sm text-[var(--fg-faint)]">{t.loading}</p>
      )}

      {data && !loading && (
        <>
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
                  {tr(t.cards.msiPlansCount, { n: data.msiPending.length })}
                </p>
              </CardContent>
            </Card>
          </div>

          {data.msiPending.length > 0 && (
            <Card premium>
              <CardHeader>
                <CardTitle>{t.cards.msiPendingTitle}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-white/5 p-0">
                {data.msiPending.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-[var(--fg)]">{p.description}</p>
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
                    <p className="font-display text-lg text-[var(--fg)]">
                      {money(p.remainingCents)}
                    </p>
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
              <p className="text-sm text-[var(--fg-faint)]">{t.cards.noPending}</p>
            )}
            {data.payments.map((pay) => (
              <Card key={pay.paymentDue} premium>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {tr(t.cards.payOn, { date: fmtDate(pay.paymentDue) })}
                    </CardTitle>
                    <p className="mt-1 text-xs text-[var(--fg-faint)]">
                      {tr(t.cards.cycleRange, {
                        start: fmtDate(pay.start),
                        end: fmtDate(pay.end),
                      })}
                    </p>
                  </div>
                  <p className="font-display text-2xl text-[var(--fg)]">
                    {money(pay.amountCents)}
                  </p>
                </CardHeader>
                <CardContent className="divide-y divide-white/5 border-t border-white/5 p-0">
                  {pay.lines.map((line, i) => (
                    <div
                      key={`${line.date}-${line.label}-${i}`}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[var(--fg)]">{line.label}</p>
                        <p className="text-xs text-[var(--fg-faint)]">
                          {fmtDate(line.date)}
                          {line.kind === "msi" ? ` · MSI` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 money-expense">
                        {money(line.amountCents)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
