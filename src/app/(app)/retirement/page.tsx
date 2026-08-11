"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { centsToInput } from "@/lib/utils";
import { toast } from "sonner";
import {
  Palmtree,
  Save,
  Calculator,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import type { RetirementResult } from "@/lib/retirement";
import { RetirementRatesCard } from "@/components/retirement-rates-card";
import { formatRatePercent } from "@/lib/market-instruments";

type Plan = {
  id: string;
  name: string;
  currentAge: number;
  retirementAge: number;
  lifeExpectancyAge: number;
  desiredAnnualIncomeCents: number;
  currentAnnualIncomeCents: number;
  replacementPercent: number;
  currentSavingsCents: number | null;
  includeAccountBalances: boolean;
  includeGoalReserves: boolean;
  includePropertyEquity?: boolean;
  monthlyContributionCents: number;
  contributionGrowthPercent: number;
  returnPrePercent: number;
  returnPostPercent: number;
  inflationPercent: number;
  withdrawalRatePercent: number;
  pensionAnnualCents: number;
  otherIncomeAnnualCents: number;
  taxDragPercent: number;
  notes: string | null;
};

type FormState = {
  name: string;
  currentAge: string;
  retirementAge: string;
  lifeExpectancyAge: string;
  desiredAnnualIncome: string;
  currentAnnualIncome: string;
  replacementPercent: string;
  useAutoSavings: boolean;
  currentSavings: string;
  includeAccountBalances: boolean;
  includeGoalReserves: boolean;
  includePropertyEquity: boolean;
  monthlyContribution: string;
  contributionGrowthPercent: string;
  returnPrePercent: string;
  returnPostPercent: string;
  inflationPercent: string;
  withdrawalRatePercent: string;
  pensionAnnual: string;
  otherIncomeAnnual: string;
  taxDragPercent: string;
  notes: string;
};

function planToForm(p: Plan): FormState {
  return {
    name: p.name,
    currentAge: String(p.currentAge),
    retirementAge: String(p.retirementAge),
    lifeExpectancyAge: String(p.lifeExpectancyAge),
    desiredAnnualIncome: centsToInput(p.desiredAnnualIncomeCents),
    currentAnnualIncome: centsToInput(p.currentAnnualIncomeCents),
    replacementPercent: String(p.replacementPercent),
    useAutoSavings: p.currentSavingsCents == null,
    currentSavings:
      p.currentSavingsCents != null ? centsToInput(p.currentSavingsCents) : "",
    includeAccountBalances: p.includeAccountBalances,
    includeGoalReserves: p.includeGoalReserves,
    includePropertyEquity: Boolean(p.includePropertyEquity),
    monthlyContribution: centsToInput(p.monthlyContributionCents),
    contributionGrowthPercent: String(p.contributionGrowthPercent),
    returnPrePercent: String(p.returnPrePercent),
    returnPostPercent: String(p.returnPostPercent),
    inflationPercent: String(p.inflationPercent),
    withdrawalRatePercent: String(p.withdrawalRatePercent),
    pensionAnnual: centsToInput(p.pensionAnnualCents),
    otherIncomeAnnual: centsToInput(p.otherIncomeAnnualCents),
    taxDragPercent: String(p.taxDragPercent),
    notes: p.notes || "",
  };
}

function formToPayload(f: FormState, preview: boolean) {
  return {
    preview,
    name: f.name,
    currentAge: parseInt(f.currentAge, 10) || 35,
    retirementAge: parseInt(f.retirementAge, 10) || 65,
    lifeExpectancyAge: parseInt(f.lifeExpectancyAge, 10) || 90,
    desiredAnnualIncome: f.desiredAnnualIncome,
    currentAnnualIncome: f.currentAnnualIncome,
    replacementPercent: parseFloat(f.replacementPercent) || 70,
    useAutoSavings: f.useAutoSavings,
    currentSavings: f.useAutoSavings ? null : f.currentSavings,
    includeAccountBalances: f.includeAccountBalances,
    includeGoalReserves: f.includeGoalReserves,
    includePropertyEquity: f.includePropertyEquity,
    monthlyContribution: f.monthlyContribution,
    contributionGrowthPercent: parseFloat(f.contributionGrowthPercent) || 0,
    returnPrePercent: parseFloat(f.returnPrePercent) || 0,
    returnPostPercent: parseFloat(f.returnPostPercent) || 0,
    inflationPercent: parseFloat(f.inflationPercent) || 0,
    withdrawalRatePercent: parseFloat(f.withdrawalRatePercent) || 4,
    pensionAnnual: f.pensionAnnual,
    otherIncomeAnnual: f.otherIncomeAnnual,
    taxDragPercent: parseFloat(f.taxDragPercent) || 0,
    notes: f.notes || null,
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && (
        <p className="mt-1 text-[11px] leading-snug text-[var(--fg-faint)]">
          {hint}
        </p>
      )}
    </div>
  );
}

export default function RetirementPage() {
  const { money, t, tr, ready } = useApp();
  const [form, setForm] = useState<FormState | null>(null);
  const [result, setResult] = useState<RetirementResult | null>(null);
  const [autoNestEgg, setAutoNestEgg] = useState(0);
  const [effectiveSavings, setEffectiveSavings] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [propertiesAvailable, setPropertiesAvailable] = useState(false);

  const applyResponse = useCallback(
    (data: {
      plan: Plan;
      result: RetirementResult;
      autoNestEggCents: number;
      effectiveSavingsCents: number;
      propertiesAvailable?: boolean;
    }) => {
      setForm(planToForm(data.plan));
      setResult(data.result);
      setAutoNestEgg(data.autoNestEggCents);
      setEffectiveSavings(data.effectiveSavingsCents);
      if (data.propertiesAvailable != null) {
        setPropertiesAvailable(data.propertiesAvailable);
      }
    },
    []
  );

  useEffect(() => {
    if (!ready) return;
    api<{
      plan: Plan;
      result: RetirementResult;
      autoNestEggCents: number;
      effectiveSavingsCents: number;
    }>("/api/retirement")
      .then(applyResponse)
      .catch((e) => toast.error(e.message));
  }, [ready, applyResponse]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function recalculate() {
    if (!form) return;
    try {
      const data = await api<{
        plan: Plan;
        result: RetirementResult;
        autoNestEggCents: number;
        effectiveSavingsCents: number;
      }>("/api/retirement", {
        method: "PUT",
        json: formToPayload(form, true),
      });
      setResult(data.result);
      setAutoNestEgg(data.autoNestEggCents);
      setEffectiveSavings(data.effectiveSavingsCents);
      // keep form as user typed; merge server plan only for null savings display
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const data = await api<{
        plan: Plan;
        result: RetirementResult;
        autoNestEggCents: number;
        effectiveSavingsCents: number;
      }>("/api/retirement", {
        method: "PUT",
        json: formToPayload(form, false),
      });
      applyResponse(data);
      toast.success(t.retirement.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setSaving(false);
    }
  }

  function applyReplacement() {
    if (!form) return;
    const income = parseFloat(form.currentAnnualIncome.replace(/,/g, "")) || 0;
    const pct = parseFloat(form.replacementPercent) || 70;
    const suggested = ((income * pct) / 100).toFixed(2);
    set("desiredAnnualIncome", suggested);
  }

  const chartMax = useMemo(() => {
    if (!result) return 1;
    return Math.max(
      1,
      ...result.yearByYear.map((y) => y.portfolioCents),
      result.nestEggNeededCents
    );
  }, [result]);

  if (!form || !result) {
    return (
      <div className="p-6 text-sm text-[var(--fg-muted)]">{t.loading}</div>
    );
  }

  const r = result;
  const monthlyDesired = Math.round(r.portfolioIncomeNeededTodayCents / 12);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.retirement}
        title={t.retirement.title}
        subtitle={t.retirement.subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={recalculate}>
              <Calculator className="h-4 w-4" />
              {t.retirement.recalculate}
            </Button>
            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? t.loading : t.save}
            </Button>
          </div>
        }
      />

      {/* Status banner */}
      <Card premium>
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {r.onTrack ? (
              <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="mt-0.5 h-7 w-7 shrink-0 text-amber-300" />
            )}
            <div>
              <div className="font-display text-xl">
                {r.onTrack ? t.retirement.onTrack : t.retirement.offTrack}
              </div>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                {r.onTrack
                  ? tr(t.retirement.onTrackHint, {
                      pct: r.fundedPercent,
                      age: form.retirementAge,
                    })
                  : tr(t.retirement.offTrackHint, {
                      gap: money(Math.max(0, r.gapCents)),
                      monthly: money(r.requiredMonthlyContributionCents),
                    })}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-[var(--fg-faint)]">
              {t.retirement.funded}
            </div>
            <div
              className={`font-display text-3xl ${
                r.onTrack ? "text-emerald-300" : "text-amber-200"
              }`}
            >
              {r.fundedPercent}%
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.retirement.kpiNestEgg}
          </div>
          <div className="mt-1 font-display text-2xl text-[var(--accent)]">
            {money(r.nestEggNeededCents)}
          </div>
          <div className="mt-1 text-[11px] text-[var(--fg-muted)]">
            {tr(t.retirement.atAge, { age: form.retirementAge })}
          </div>
        </div>
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.retirement.kpiProjected}
          </div>
          <div className="mt-1 font-display text-2xl">
            {money(r.projectedAtRetirementCents)}
          </div>
          <div className="mt-1 text-[11px] text-[var(--fg-muted)]">
            {tr(t.retirement.inTodayMoney, {
              amount: money(r.projectedAtRetirementTodayCents),
            })}
          </div>
        </div>
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.retirement.kpiGap}
          </div>
          <div
            className={`mt-1 font-display text-2xl ${
              r.gapCents > 0 ? "text-rose-300" : "text-emerald-300"
            }`}
          >
            {r.gapCents > 0 ? money(r.gapCents) : money(0)}
          </div>
          <div className="mt-1 text-[11px] text-[var(--fg-muted)]">
            {r.gapCents > 0
              ? t.retirement.shortfall
              : t.retirement.surplusOrOk}
          </div>
        </div>
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.retirement.kpiMonthlyNeed}
          </div>
          <div className="mt-1 font-display text-2xl">
            {money(r.requiredMonthlyContributionCents)}
          </div>
          <div className="mt-1 text-[11px] text-[var(--fg-muted)]">
            {t.retirement.toHitTarget}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ages */}
        <Card premium>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palmtree className="h-4 w-4" />
              {t.retirement.sectionAges}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Field label={t.retirement.currentAge}>
              <Input
                type="number"
                min={18}
                max={100}
                value={form.currentAge}
                onChange={(e) => set("currentAge", e.target.value)}
              />
            </Field>
            <Field label={t.retirement.retirementAge}>
              <Input
                type="number"
                min={18}
                max={100}
                value={form.retirementAge}
                onChange={(e) => set("retirementAge", e.target.value)}
              />
            </Field>
            <Field
              label={t.retirement.lifeExpectancy}
              hint={t.retirement.lifeExpectancyHint}
            >
              <Input
                type="number"
                min={40}
                max={120}
                value={form.lifeExpectancyAge}
                onChange={(e) => set("lifeExpectancyAge", e.target.value)}
              />
            </Field>
            <p className="sm:col-span-3 text-xs text-[var(--fg-muted)]">
              {tr(t.retirement.yearsSummary, {
                work: r.yearsToRetirement,
                retire: r.yearsInRetirement,
              })}
            </p>
          </CardContent>
        </Card>

        {/* Lifestyle */}
        <Card premium>
          <CardHeader>
            <CardTitle>{t.retirement.sectionLifestyle}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t.retirement.desiredAnnual}
              hint={t.retirement.desiredAnnualHint}
            >
              <Input
                money
                value={form.desiredAnnualIncome}
                onChange={(e) => set("desiredAnnualIncome", e.target.value)}
              />
            </Field>
            <Field label={t.retirement.currentIncome}>
              <Input
                money
                value={form.currentAnnualIncome}
                onChange={(e) => set("currentAnnualIncome", e.target.value)}
              />
            </Field>
            <Field
              label={t.retirement.replacement}
              hint={t.retirement.replacementHint}
            >
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  max={200}
                  value={form.replacementPercent}
                  onChange={(e) => set("replacementPercent", e.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={applyReplacement}
                >
                  {t.retirement.applyReplacement}
                </Button>
              </div>
            </Field>
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-[var(--fg-muted)]">
              <div>
                {tr(t.retirement.monthlyDraw, {
                  amount: money(monthlyDesired),
                })}
              </div>
              <div className="mt-1">
                {tr(t.retirement.atRetirementIncome, {
                  amount: money(r.desiredIncomeAtRetirementCents),
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Capital */}
        <Card premium>
          <CardHeader>
            <CardTitle>{t.retirement.sectionCapital}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.useAutoSavings}
                  onChange={(e) => set("useAutoSavings", e.target.checked)}
                />
                {t.retirement.useAccounts}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includeAccountBalances}
                  disabled={!form.useAutoSavings}
                  onChange={(e) =>
                    set("includeAccountBalances", e.target.checked)
                  }
                />
                {t.retirement.includeAccounts}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includeGoalReserves}
                  disabled={!form.useAutoSavings}
                  onChange={(e) => set("includeGoalReserves", e.target.checked)}
                />
                {t.retirement.includeGoals}
              </label>
              {propertiesAvailable && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.includePropertyEquity}
                    disabled={!form.useAutoSavings}
                    onChange={(e) =>
                      set("includePropertyEquity", e.target.checked)
                    }
                  />
                  {t.retirement.includeProperties}
                </label>
              )}
            </div>
            {propertiesAvailable && form.useAutoSavings && (
              <p className="sm:col-span-2 text-[11px] text-[var(--fg-faint)]">
                {t.retirement.includePropertiesHint}
              </p>
            )}
            {form.useAutoSavings ? (
              <div className="sm:col-span-2 rounded-xl border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-sm">
                {tr(t.retirement.autoSavingsValue, {
                  amount: money(autoNestEgg),
                })}
              </div>
            ) : (
              <Field label={t.retirement.manualSavings}>
                <Input
                  money
                  value={form.currentSavings}
                  onChange={(e) => set("currentSavings", e.target.value)}
                />
              </Field>
            )}
            <Field
              label={t.retirement.monthlyContribution}
              hint={t.retirement.monthlyContributionHint}
            >
              <Input
                money
                value={form.monthlyContribution}
                onChange={(e) => set("monthlyContribution", e.target.value)}
              />
            </Field>
            <Field
              label={t.retirement.contributionGrowth}
              hint={t.retirement.contributionGrowthHint}
            >
              <Input
                type="number"
                step="0.1"
                value={form.contributionGrowthPercent}
                onChange={(e) =>
                  set("contributionGrowthPercent", e.target.value)
                }
              />
            </Field>
            <p className="sm:col-span-2 text-xs text-[var(--fg-faint)]">
              {tr(t.retirement.effectiveSavings, {
                amount: money(effectiveSavings),
              })}
            </p>
          </CardContent>
        </Card>

        {/* Markets & income */}
        <Card premium>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {t.retirement.sectionAssumptions}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t.retirement.returnPre}
              hint={t.retirement.returnPreHint}
            >
              <Input
                type="number"
                step="0.1"
                value={form.returnPrePercent}
                onChange={(e) => set("returnPrePercent", e.target.value)}
              />
            </Field>
            <Field
              label={t.retirement.returnPost}
              hint={t.retirement.returnPostHint}
            >
              <Input
                type="number"
                step="0.1"
                value={form.returnPostPercent}
                onChange={(e) => set("returnPostPercent", e.target.value)}
              />
            </Field>
            <Field
              label={t.retirement.inflation}
              hint={t.retirement.inflationHint}
            >
              <Input
                type="number"
                step="0.1"
                value={form.inflationPercent}
                onChange={(e) => set("inflationPercent", e.target.value)}
              />
            </Field>
            <Field
              label={t.retirement.swr}
              hint={t.retirement.swrHint}
            >
              <Input
                type="number"
                step="0.1"
                value={form.withdrawalRatePercent}
                onChange={(e) => set("withdrawalRatePercent", e.target.value)}
              />
            </Field>
            <Field
              label={t.retirement.pension}
              hint={t.retirement.pensionHint}
            >
              <Input
                money
                value={form.pensionAnnual}
                onChange={(e) => set("pensionAnnual", e.target.value)}
              />
            </Field>
            <Field label={t.retirement.otherIncome}>
              <Input
                money
                value={form.otherIncomeAnnual}
                onChange={(e) => set("otherIncomeAnnual", e.target.value)}
              />
            </Field>
            <Field
              label={t.retirement.taxDrag}
              hint={t.retirement.taxDragHint}
            >
              <Input
                type="number"
                step="0.1"
                value={form.taxDragPercent}
                onChange={(e) => set("taxDragPercent", e.target.value)}
              />
            </Field>
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-[var(--fg-muted)]">
              <div>
                {tr(t.retirement.realReturnPre, {
                  pct: (r.realReturnPre * 100).toFixed(2),
                })}
              </div>
              <div>
                {tr(t.retirement.realReturnPost, {
                  pct: (r.realReturnPost * 100).toFixed(2),
                })}
              </div>
              <div className="mt-1">
                {tr(t.retirement.methodUsed, {
                  method:
                    r.method === "annuity"
                      ? t.retirement.methodAnnuity
                      : t.retirement.methodSwr,
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <RetirementRatesCard
        inflationPercent={parseFloat(form.inflationPercent) || 0}
        onApplyPre={(pct) => set("returnPrePercent", formatRatePercent(pct))}
        onApplyPost={(pct) => set("returnPostPercent", formatRatePercent(pct))}
        onApplyInflation={(pct) =>
          set("inflationPercent", formatRatePercent(pct))
        }
      />

      {/* Detail cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card premium>
          <CardHeader>
            <CardTitle className="text-base">
              {t.retirement.detailNeed}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label={t.retirement.nestEggAnnuity}
              value={money(r.nestEggNeededAnnuityCents)}
            />
            <Row
              label={t.retirement.nestEggSwr}
              value={money(r.nestEggNeededSwrCents)}
            />
            <Row
              label={t.retirement.nestEggUsed}
              value={money(r.nestEggNeededCents)}
              strong
            />
            <Row
              label={t.retirement.portfolioIncomeNeed}
              value={money(r.portfolioIncomeNeededTodayCents)}
            />
          </CardContent>
        </Card>
        <Card premium>
          <CardHeader>
            <CardTitle className="text-base">
              {t.retirement.detailPath}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label={t.retirement.currentSavings}
              value={money(effectiveSavings)}
            />
            <Row
              label={t.retirement.monthlyContribution}
              value={money(
                Math.round(
                  (parseFloat(String(form.monthlyContribution).replace(/,/g, "")) ||
                    0) * 100
                )
              )}
            />
            <Row
              label={t.retirement.requiredMonthly}
              value={money(r.requiredMonthlyContributionCents)}
              strong
            />
            <Row
              label={t.retirement.ageFunded}
              value={
                r.ageFullyFunded
                  ? String(r.ageFullyFunded)
                  : t.retirement.ageFundedNever
              }
            />
          </CardContent>
        </Card>
        <Card premium>
          <CardHeader>
            <CardTitle className="text-base">
              {t.retirement.detailWithdraw}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label={t.retirement.sustainableAtRet}
              value={money(r.sustainableWithdrawalAtRetCents)}
            />
            <Row
              label={t.retirement.sustainableToday}
              value={money(r.sustainableWithdrawalTodayCents)}
              strong
            />
            <p className="pt-2 text-[11px] text-[var(--fg-faint)]">
              {t.retirement.disclaimer}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Simple bar chart */}
      <Card premium>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t.retirement.projectionChart}</CardTitle>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable ? t.retirement.hideTable : t.retirement.showTable}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-px overflow-x-auto pb-2">
            {r.yearByYear
              .filter((_, i) => i % Math.max(1, Math.floor(r.yearByYear.length / 40)) === 0 || i === r.yearByYear.length - 1)
              .map((y) => {
                const h = Math.max(2, (y.portfolioCents / chartMax) * 100);
                return (
                  <div
                    key={`${y.phase}-${y.age}`}
                    className="group relative flex min-w-[6px] flex-1 flex-col justify-end"
                    title={`${t.retirement.age} ${y.age}: ${money(y.portfolioCents)}`}
                  >
                    <div
                      className={`w-full rounded-t-sm ${
                        y.phase === "accumulation"
                          ? "bg-teal-400/80"
                          : "bg-violet-400/70"
                      }`}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                );
              })}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[var(--fg-faint)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-teal-400/80" />
              {t.retirement.phaseWork}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-violet-400/70" />
              {t.retirement.phaseRetire}
            </span>
            <span>
              {tr(t.retirement.targetLine, {
                amount: money(r.nestEggNeededCents),
              })}
            </span>
          </div>

          {showTable && (
            <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#12182b]">
                  <tr className="text-[var(--fg-faint)]">
                    <th className="px-3 py-2">{t.retirement.age}</th>
                    <th className="px-3 py-2">{t.retirement.phase}</th>
                    <th className="px-3 py-2">{t.retirement.portfolio}</th>
                    <th className="px-3 py-2">{t.retirement.todayMoney}</th>
                    <th className="px-3 py-2">{t.retirement.contrib}</th>
                    <th className="px-3 py-2">{t.retirement.withdraw}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.yearByYear.map((y) => (
                    <tr
                      key={`${y.phase}-${y.yearIndex}`}
                      className="border-t border-white/5"
                    >
                      <td className="px-3 py-1.5">{y.age}</td>
                      <td className="px-3 py-1.5">
                        {y.phase === "accumulation"
                          ? t.retirement.phaseWork
                          : t.retirement.phaseRetire}
                      </td>
                      <td className="px-3 py-1.5">{money(y.portfolioCents)}</td>
                      <td className="px-3 py-1.5">
                        {money(y.portfolioTodayCents)}
                      </td>
                      <td className="px-3 py-1.5">
                        {money(y.contributionsThisYearCents)}
                      </td>
                      <td className="px-3 py-1.5">
                        {money(y.withdrawalThisYearCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-[var(--fg-muted)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        <p>{t.retirement.disclaimerLong}</p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--fg-muted)]">{label}</span>
      <span className={strong ? "font-semibold text-white" : ""}>{value}</span>
    </div>
  );
}
