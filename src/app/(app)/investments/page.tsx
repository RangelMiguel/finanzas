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
import { centsToInput } from "@/lib/utils";
import { toast } from "sonner";
import type { RankedInvestment } from "@/lib/investments/recommend";
import type { RiskLevel } from "@/lib/investments/catalog";

type Profile = {
  risk: RiskLevel;
  horizonYears: number;
  amountCents: number;
  marginalTaxPercent: number;
};

export default function InvestmentsPage() {
  const { money, t, tr, locale } = useApp();
  const [form, setForm] = useState({
    risk: "medium" as RiskLevel,
    horizonYears: "3",
    amount: "",
    marginalTaxPercent: "30",
  });
  const [ranked, setRanked] = useState<RankedInvestment[]>([]);
  const [saving, setSaving] = useState(false);

  function loc(v: { es: string; en: string }) {
    return locale === "en" ? v.en : v.es;
  }

  function apply(data: { profile: Profile; ranked: RankedInvestment[] }) {
    setForm({
      risk: data.profile.risk,
      horizonYears: String(data.profile.horizonYears),
      amount: data.profile.amountCents
        ? centsToInput(data.profile.amountCents)
        : "",
      marginalTaxPercent: String(data.profile.marginalTaxPercent),
    });
    setRanked(data.ranked);
  }

  useEffect(() => {
    api<{ profile: Profile; ranked: RankedInvestment[] }>("/api/investments")
      .then(apply)
      .catch((e) => toast.error(e.message));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const data = await api<{
        profile: Profile;
        ranked: RankedInvestment[];
      }>("/api/investments", {
        method: "PUT",
        json: {
          risk: form.risk,
          horizonYears: parseFloat(form.horizonYears) || 0,
          amount: form.amount || 0,
          marginalTaxPercent: parseFloat(form.marginalTaxPercent) || 0,
        },
      });
      apply(data);
      toast.success(t.investments.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setSaving(false);
    }
  }

  const best = ranked[0];
  const riskLabel = (r: RiskLevel) =>
    r === "low"
      ? t.investments.riskLow
      : r === "high"
        ? t.investments.riskHigh
        : t.investments.riskMedium;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.investments}
        title={t.investments.title}
        subtitle={t.investments.subtitle}
      />

      <Card premium>
        <CardContent className="grid gap-3 py-5 sm:grid-cols-2">
          <div>
            <Label>{t.investments.risk}</Label>
            <Select
              className="mt-1"
              value={form.risk}
              onChange={(e) =>
                setForm({ ...form, risk: e.target.value as RiskLevel })
              }
            >
              <option value="low">{t.investments.riskLow}</option>
              <option value="medium">{t.investments.riskMedium}</option>
              <option value="high">{t.investments.riskHigh}</option>
            </Select>
          </div>
          <div>
            <Label>{t.investments.horizon}</Label>
            <Input
              type="number"
              step="0.5"
              className="mt-1"
              value={form.horizonYears}
              onChange={(e) =>
                setForm({ ...form, horizonYears: e.target.value })
              }
            />
          </div>
          <div>
            <Label>{t.investments.amount}</Label>
            <Input
              money
              className="mt-1"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div>
            <Label>{t.investments.tax}</Label>
            <Input
              type="number"
              step="1"
              className="mt-1"
              value={form.marginalTaxPercent}
              onChange={(e) =>
                setForm({ ...form, marginalTaxPercent: e.target.value })
              }
            />
            <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
              {t.investments.taxHint}
            </p>
          </div>
          <div>
            <Button onClick={save} disabled={saving}>
              {t.save}
            </Button>
          </div>
        </CardContent>
      </Card>

      {best && (
        <Card premium>
          <CardHeader>
            <CardTitle>
              {t.investments.best}: {loc(best.name)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-[var(--fg-muted)]">{loc(best.summary)}</p>
            <p className="font-display text-2xl text-emerald-300">
              {tr(t.investments.afterTax, {
                pct: best.afterTaxPercent.toFixed(2),
              })}
            </p>
            <p className="text-xs text-[var(--fg-faint)]">
              {tr(t.investments.preTax, { pct: best.preTaxPercent.toFixed(2) })}{" "}
              · {tr(t.investments.taxDrag, { pct: best.taxDragPercent.toFixed(2) })}{" "}
              · {riskLabel(best.risk)} ·{" "}
              {tr(t.investments.liquidity, { n: best.liquidityDays })}
            </p>
            {best.estimatedGainCents > 0 && (
              <p className="text-sm">
                {tr(t.investments.yearGain, {
                  amount: money(best.estimatedGainCents),
                })}
                {best.estimatedTaxCents > 0
                  ? ` · ${tr(t.investments.yearTax, {
                      amount: money(best.estimatedTaxCents),
                    })}`
                  : ""}
              </p>
            )}
            <ul className="list-disc pl-5 text-xs text-[var(--fg-muted)]">
              {best.reasons.map((r, i) => (
                <li key={i}>{loc(r)}</li>
              ))}
            </ul>
            <p className="text-[11px] text-[var(--fg-faint)]">{loc(best.taxNote)}</p>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl">{t.investments.rank}</h2>
        {ranked.map((opt, i) => (
          <Card key={opt.id}>
            <CardContent className="space-y-1 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-medium">
                  {i + 1}. {loc(opt.name)}
                </div>
                <div className="text-emerald-300">
                  {tr(t.investments.afterTax, {
                    pct: opt.afterTaxPercent.toFixed(2),
                  })}
                </div>
              </div>
              <p className="text-xs text-[var(--fg-muted)]">{loc(opt.summary)}</p>
              <p className="text-[11px] text-[var(--fg-faint)]">
                {tr(t.investments.preTax, { pct: opt.preTaxPercent.toFixed(2) })}{" "}
                · {riskLabel(opt.risk)} ·{" "}
                {tr(t.investments.liquidity, { n: opt.liquidityDays })}
              </p>
              <p className="text-[11px] text-[var(--fg-faint)]">{loc(opt.taxNote)}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <p className="text-[11px] leading-relaxed text-[var(--fg-faint)]">
        {t.investments.disclaimer}
      </p>
    </div>
  );
}
