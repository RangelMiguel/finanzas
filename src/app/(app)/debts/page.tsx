"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { useApp } from "@/components/providers/app-provider";
import { useConfirm } from "@/components/providers/confirm-provider";
import { amountToCents, centsToInput } from "@/lib/utils";
import {
  amortizeDebt,
  DEBT_INTEREST_METHODS,
  paymentPlanSumCents,
  planCoverageFromAmortization,
  parseInterestMethod,
  splitDuration,
  type AmortizationSummary,
  type DebtInterestMethod,
} from "@/lib/debts";
import { DebtAmortizationCharts } from "@/components/debt-amortization-chart";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

/** Full schedule for charts (cap long loans so SVG stays usable). */
const CHART_SCHEDULE_MONTHS = 120;

type Plan = {
  months: number;
  totalInterestCents: number;
  payoffOk: boolean;
  paymentCoversInterest: boolean;
  minPaymentCents: number;
  schedule: {
    month: number;
    interestCents: number;
    capitalCents: number;
    paymentCents: number;
    balanceCents: number;
  }[];
  next: { capitalCents: number; interestCents: number; totalCents: number };
  hasCustomPlan?: boolean;
  method?: DebtInterestMethod;
};

type Debt = {
  id: string;
  name: string;
  principalCents: number;
  annualRatePercent: number;
  monthlyPaymentCents: number;
  paymentPlanCents?: number[] | null;
  interestMethod?: DebtInterestMethod | string;
  paymentDay: number;
  paidCapitalCents: number;
  paidInterestCents?: number | null;
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
  plan?: Plan | null;
};
type Acc = { id: string; name: string };
type PlanMode = "fixed" | "custom";

function methodLabel(
  method: DebtInterestMethod | string | undefined,
  t: {
    debts: {
      methodFrench: string;
      methodGerman: string;
      methodFlat: string;
      methodInterestOnly: string;
      methodSimpleDaily: string;
    };
  }
): string {
  switch (parseInterestMethod(method)) {
    case "german":
      return t.debts.methodGerman;
    case "flat":
      return t.debts.methodFlat;
    case "interest_only":
      return t.debts.methodInterestOnly;
    case "simple_daily":
      return t.debts.methodSimpleDaily;
    default:
      return t.debts.methodFrench;
  }
}

function methodHint(
  method: DebtInterestMethod | string | undefined,
  t: {
    debts: {
      methodFrenchHint: string;
      methodGermanHint: string;
      methodFlatHint: string;
      methodInterestOnlyHint: string;
      methodSimpleDailyHint: string;
    };
  }
): string {
  switch (parseInterestMethod(method)) {
    case "german":
      return t.debts.methodGermanHint;
    case "flat":
      return t.debts.methodFlatHint;
    case "interest_only":
      return t.debts.methodInterestOnlyHint;
    case "simple_daily":
      return t.debts.methodSimpleDailyHint;
    default:
      return t.debts.methodFrenchHint;
  }
}

function formatDuration(
  months: number,
  tr: (tpl: string, vars: Record<string, string | number>) => string,
  t: { debts: { durationMonths: string; durationYears: string; durationYearsMonths: string } }
) {
  const d = splitDuration(months);
  if (d.years <= 0) return tr(t.debts.durationMonths, { n: d.months || months });
  if (d.months <= 0) return tr(t.debts.durationYears, { y: d.years });
  return tr(t.debts.durationYearsMonths, { y: d.years, m: d.months });
}

function emptyForm() {
  return {
    name: "",
    principal: "",
    annualRatePercent: "0",
    monthlyPayment: "",
    paymentDay: "1",
    notes: "",
    planMode: "fixed" as PlanMode,
    planSteps: [""] as string[],
    interestMethod: "french" as DebtInterestMethod,
  };
}

function planStepsFromCents(plan: number[] | null | undefined): string[] {
  if (!plan?.length) return [""];
  return plan.map((c) => centsToInput(c));
}

function seedStepsFromMonthly(
  remainingCents: number,
  monthlyCents: number
): string[] {
  if (monthlyCents <= 0 || remainingCents <= 0) {
    return [monthlyCents > 0 ? centsToInput(monthlyCents) : ""];
  }
  const steps: string[] = [];
  let left = remainingCents;
  while (left > 0 && steps.length < 60) {
    const take = Math.min(monthlyCents, left);
    steps.push(centsToInput(take));
    left -= take;
  }
  return steps.length ? steps : [centsToInput(monthlyCents)];
}

function planCentsEqual(
  a: number[] | null | undefined,
  b: number[] | null | undefined
): boolean {
  const aa = a?.filter((x) => x > 0) ?? [];
  const bb = b?.filter((x) => x > 0) ?? [];
  if (aa.length !== bb.length) return false;
  return aa.every((v, i) => v === bb[i]);
}

export default function DebtsPage() {
  const { money, t, tr } = useApp();
  const { confirm } = useConfirm();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pay, setPay] = useState({
    total: "",
    capital: "",
    interest: "0",
    accountId: "",
  });

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

  const formRemainingCents = useMemo(() => {
    if (mode === "edit" && editId) {
      const d = debts.find((x) => x.id === editId);
      if (d) return d.remainingCents;
    }
    return amountToCents(form.principal || 0);
  }, [mode, editId, debts, form.principal]);

  const formPlanCents = useMemo(() => {
    if (form.planMode !== "custom") return null;
    const steps = form.planSteps
      .map((s) => amountToCents(s || 0))
      .filter((c) => c > 0);
    return steps.length > 0 ? steps : null;
  }, [form.planMode, form.planSteps]);

  const formOriginalPrincipalCents = useMemo(() => {
    return amountToCents(form.principal || 0) || formRemainingCents;
  }, [form.principal, formRemainingCents]);

  const formPlan = useMemo(
    () =>
      amortizeDebt({
        remainingCents: formRemainingCents,
        monthlyPaymentCents: amountToCents(form.monthlyPayment || 0),
        annualRatePercent: parseFloat(form.annualRatePercent) || 0,
        method: form.interestMethod,
        originalPrincipalCents: formOriginalPrincipalCents,
        paymentPlanCents: formPlanCents,
        scheduleMonths: Math.max(
          6,
          formPlanCents?.length ?? 0,
          CHART_SCHEDULE_MONTHS
        ),
      }),
    [
      formRemainingCents,
      form.monthlyPayment,
      form.annualRatePercent,
      form.interestMethod,
      formOriginalPrincipalCents,
      formPlanCents,
    ]
  );

  const formPlanSum = paymentPlanSumCents(formPlanCents);
  // Evaluate custom steps alone (no monthly fallback) so interest shortfall is honest.
  const formPlanOnly = useMemo(
    () =>
      formPlanCents?.length
        ? amortizeDebt({
            remainingCents: formRemainingCents,
            monthlyPaymentCents: 0,
            annualRatePercent: parseFloat(form.annualRatePercent) || 0,
            method: form.interestMethod,
            originalPrincipalCents: formOriginalPrincipalCents,
            paymentPlanCents: formPlanCents,
            scheduleMonths: Math.max(formPlanCents.length, 12),
          })
        : null,
    [
      formPlanCents,
      formRemainingCents,
      form.annualRatePercent,
      form.interestMethod,
      formOriginalPrincipalCents,
    ]
  );
  const formCoverage = useMemo(
    () =>
      formPlanSum > 0 && formPlanOnly
        ? planCoverageFromAmortization({
            remainingCents: formRemainingCents,
            planSumCents: formPlanSum,
            amortization: formPlanOnly,
          })
        : null,
    [formPlanSum, formRemainingCents, formPlanOnly]
  );

  async function save() {
    try {
      const payload = {
        name: form.name,
        principal: form.principal,
        annualRatePercent: parseFloat(form.annualRatePercent) || 0,
        monthlyPayment: form.monthlyPayment || 0,
        paymentDay: parseInt(form.paymentDay, 10),
        notes: form.notes || null,
        interestMethod: form.interestMethod,
        paymentPlan:
          form.planMode === "custom"
            ? form.planSteps.filter((s) => amountToCents(s || 0) > 0)
            : null,
      };
      if (mode === "edit" && editId) {
        await api("/api/debts", {
          method: "PATCH",
          json: { id: editId, ...payload },
        });
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

  function openNew() {
    setEditId(null);
    setForm(emptyForm());
    setMode("new");
  }

  function openEdit(d: Debt) {
    setEditId(d.id);
    const hasPlan = !!(d.paymentPlanCents && d.paymentPlanCents.length > 0);
    setForm({
      name: d.name,
      principal: centsToInput(d.principalCents),
      annualRatePercent: String(d.annualRatePercent),
      monthlyPayment: centsToInput(d.monthlyPaymentCents),
      paymentDay: String(d.paymentDay),
      notes: "",
      planMode: hasPlan ? "custom" : "fixed",
      planSteps: hasPlan
        ? planStepsFromCents(d.paymentPlanCents)
        : [centsToInput(d.monthlyPaymentCents) || ""],
      interestMethod: parseInterestMethod(d.interestMethod),
    });
    setMode("edit");
  }

  function setPlanMode(planMode: PlanMode) {
    if (planMode === "custom" && form.planMode === "fixed") {
      // Seed custom rows from fixed monthly until principal is covered
      const monthly = amountToCents(form.monthlyPayment || 0);
      const remaining = formRemainingCents;
      if (monthly > 0 && remaining > 0) {
        const steps: string[] = [];
        let left = remaining;
        while (left > 0 && steps.length < 60) {
          const take = Math.min(monthly, left);
          steps.push(centsToInput(take));
          left -= take;
        }
        setForm({
          ...form,
          planMode,
          planSteps: steps.length ? steps : [form.monthlyPayment || ""],
        });
        return;
      }
      setForm({
        ...form,
        planMode,
        planSteps: form.planSteps.length ? form.planSteps : [form.monthlyPayment || ""],
      });
      return;
    }
    setForm({ ...form, planMode });
  }

  function openPayMonth(d: Debt) {
    const s = d.suggestedPay || d.plan?.next;
    const interest = s ? s.interestCents : 0;
    const capital = s
      ? s.capitalCents
      : d.monthlyPaymentCents;
    const total = s ? s.totalCents : d.monthlyPaymentCents;
    setPay({
      total: centsToInput(total),
      capital: centsToInput(capital),
      interest: centsToInput(interest),
      accountId: pay.accountId || accounts[0]?.id || "",
    });
    setPayFor(d.id);
  }

  function setPayTotal(total: string) {
    const totalCents = amountToCents(total);
    const interestCents = amountToCents(pay.interest);
    setPay({
      ...pay,
      total,
      capital: centsToInput(Math.max(0, totalCents - interestCents)),
    });
  }

  function setPayInterest(interest: string) {
    const interestCents = amountToCents(interest);
    const totalCents = amountToCents(pay.total);
    setPay({
      ...pay,
      interest,
      capital: centsToInput(Math.max(0, totalCents - interestCents)),
    });
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

  const paying = payFor ? debts.find((d) => d.id === payFor) : null;

  return (
    <div>
      <PageHeader
        kicker={t.nav.debts}
        title={t.debts.title}
        subtitle={t.debts.subtitle}
        actions={<Button onClick={openNew}>{t.debts.new}</Button>}
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
                onChange={(e) =>
                  setForm({ ...form, principal: e.target.value })
                }
              />
            </div>
            <div>
              <Label>{t.debts.annualRate}</Label>
              <Input
                type="number"
                step="0.01"
                className="mt-1"
                value={form.annualRatePercent}
                onChange={(e) =>
                  setForm({ ...form, annualRatePercent: e.target.value })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{t.debts.interestMethod}</Label>
              <p className="mt-0.5 text-xs text-[var(--fg-faint)]">
                {t.debts.interestMethodHint}
              </p>
              <Select
                className="mt-1"
                value={form.interestMethod}
                onChange={(e) =>
                  setForm({
                    ...form,
                    interestMethod: parseInterestMethod(e.target.value),
                  })
                }
              >
                {DEBT_INTEREST_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {methodLabel(m, t)}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">
                {methodHint(form.interestMethod, t)}
              </p>
              {form.interestMethod === "german" && (
                <p className="mt-1 text-xs text-amber-200">
                  {t.debts.germanPaymentIsCapital}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <Label>{t.debts.planMode}</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.planMode === "fixed" ? "default" : "secondary"}
                  onClick={() => setPlanMode("fixed")}
                >
                  {t.debts.planFixed}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.planMode === "custom" ? "default" : "secondary"}
                  onClick={() => setPlanMode("custom")}
                >
                  {t.debts.planCustom}
                </Button>
              </div>
            </div>
            {form.planMode === "fixed" ? (
              <div>
                <Label>
                  {form.interestMethod === "german"
                    ? t.debts.capital
                    : t.debts.monthlyPayment}
                </Label>
                <Input
                  money
                  className="mt-1"
                  value={form.monthlyPayment}
                  onChange={(e) =>
                    setForm({ ...form, monthlyPayment: e.target.value })
                  }
                />
              </div>
            ) : (
              <div className="sm:col-span-2 space-y-2">
                <Label>{t.debts.planCustom}</Label>
                <p className="text-xs text-[var(--fg-faint)]">
                  {t.debts.planCustomHint}
                </p>
                {form.planSteps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-[var(--fg-muted)]">
                      {tr(t.debts.planStep, { n: idx + 1 })}
                    </span>
                    <Input
                      money
                      value={step}
                      onChange={(e) => {
                        const next = [...form.planSteps];
                        next[idx] = e.target.value;
                        setForm({ ...form, planSteps: next });
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t.delete}
                      disabled={form.planSteps.length <= 1}
                      onClick={() =>
                        setForm({
                          ...form,
                          planSteps: form.planSteps.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setForm({
                      ...form,
                      planSteps: [...form.planSteps, form.monthlyPayment || ""],
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t.debts.planAddStep}
                </Button>
                {formCoverage && formRemainingCents > 0 && (
                  <PlanCoverageNote coverage={formCoverage} />
                )}
                <div>
                  <Label>{t.debts.monthlyPayment}</Label>
                  <p className="mb-1 text-[11px] text-[var(--fg-faint)]">
                    {t.debts.planFallback}
                  </p>
                  <Input
                    money
                    className="mt-0.5"
                    value={form.monthlyPayment}
                    onChange={(e) =>
                      setForm({ ...form, monthlyPayment: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
            <div>
              <Label>{t.debts.paymentDay}</Label>
              <Input
                numeric
                className="mt-1"
                value={form.paymentDay}
                onChange={(e) =>
                  setForm({ ...form, paymentDay: e.target.value })
                }
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={save}>{t.save}</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setMode("none");
                  setEditId(null);
                }}
              >
                {t.cancel}
              </Button>
            </div>
            {(form.principal ||
              form.monthlyPayment ||
              (form.planMode === "custom" && formPlanSum > 0)) && (
              <div className="sm:col-span-2 space-y-3">
                <PlanPreview
                  plan={formPlan}
                  rate={parseFloat(form.annualRatePercent) || 0}
                  paymentCents={
                    formPlanCents?.[0] ??
                    amountToCents(form.monthlyPayment || 0)
                  }
                  title={t.debts.formPreview}
                />
                {formPlan.schedule.length > 0 && formRemainingCents > 0 && (
                  <div className="rounded-xl border border-white/10 p-3">
                    <p className="mb-2 text-xs font-medium text-[var(--fg)]">
                      {t.debts.chartTitle}
                    </p>
                    <DebtAmortizationCharts
                      schedule={formPlan.schedule}
                      startingBalanceCents={formRemainingCents}
                      height={140}
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {payFor && paying && (
        <Card className="mb-6" premium>
          <CardHeader>
            <CardTitle>{t.debts.registerPay}</CardTitle>
            <p className="text-xs text-[var(--fg-faint)]">
              {t.debts.payMonthHint}
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3 text-xs text-[var(--fg-muted)]">
              {tr(t.debts.thisPaySplit, {
                interest: money(amountToCents(pay.interest)),
                capital: money(amountToCents(pay.capital)),
              })}
            </div>
            <div>
              <Label>{t.debts.thisPayTotal}</Label>
              <Input
                money
                className="mt-1"
                value={pay.total}
                onChange={(e) => setPayTotal(e.target.value)}
              />
            </div>
            <div>
              <Label>{t.debts.interest}</Label>
              <Input
                money
                className="mt-1"
                value={pay.interest}
                onChange={(e) => setPayInterest(e.target.value)}
              />
            </div>
            <div>
              <Label>{t.debts.capital}</Label>
              <Input
                money
                className="mt-1"
                value={pay.capital}
                onChange={(e) =>
                  setPay({ ...pay, capital: e.target.value })
                }
              />
            </div>
            <div>
              <Label>{t.accounts.from}</Label>
              <Select
                className="mt-1"
                value={pay.accountId}
                onChange={(e) =>
                  setPay({ ...pay, accountId: e.target.value })
                }
              >
                <option value="">{t.none}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2 sm:col-span-2 items-end">
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
          d.principalCents > 0
            ? (d.paidCapitalCents / d.principalCents) * 100
            : 0;
        return (
          <DebtCard
            key={d.id}
            debt={d}
            pct={pct}
            onPayMonth={() => openPayMonth(d)}
            onPayCustom={() => openPayMonth(d)}
            onEdit={() => openEdit(d)}
            onDelete={() => remove(d.id)}
            onPaymentSaved={load}
          />
        );
      })}
    </div>
  );
}

function DebtCard({
  debt: d,
  pct,
  onPayMonth,
  onPayCustom,
  onEdit,
  onDelete,
  onPaymentSaved,
}: {
  debt: Debt;
  pct: number;
  onPayMonth: () => void;
  onPayCustom: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPaymentSaved: () => Promise<void>;
}) {
  const { money, t, tr } = useApp();
  const [simOpen, setSimOpen] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [simMode, setSimMode] = useState<PlanMode>(
    d.paymentPlanCents?.length ? "custom" : "fixed"
  );
  const [simPay, setSimPay] = useState(centsToInput(d.monthlyPaymentCents));
  const [simSteps, setSimSteps] = useState<string[]>(
    d.paymentPlanCents?.length
      ? planStepsFromCents(d.paymentPlanCents)
      : seedStepsFromMonthly(d.remainingCents, d.monthlyPaymentCents)
  );
  const [saving, setSaving] = useState(false);
  const hasCustomPlan = !!(d.paymentPlanCents && d.paymentPlanCents.length > 0);
  const interestMethod = parseInterestMethod(d.interestMethod);

  const base = d.plan;
  const next = d.suggestedPay || base?.next;

  const simPlanCents = useMemo(() => {
    if (simMode !== "custom") return null;
    const steps = simSteps
      .map((s) => amountToCents(s || 0))
      .filter((c) => c > 0);
    return steps.length > 0 ? steps : null;
  }, [simMode, simSteps]);

  /** Full chart schedule for the saved plan (API schedule may be short). */
  const chartPlan = useMemo(
    () =>
      amortizeDebt({
        remainingCents: d.remainingCents,
        monthlyPaymentCents: d.monthlyPaymentCents,
        annualRatePercent: d.annualRatePercent,
        method: interestMethod,
        originalPrincipalCents: d.principalCents,
        paymentPlanCents: d.paymentPlanCents,
        scheduleMonths: Math.max(
          6,
          d.paymentPlanCents?.length ?? 0,
          CHART_SCHEDULE_MONTHS
        ),
      }),
    [
      d.remainingCents,
      d.monthlyPaymentCents,
      d.annualRatePercent,
      d.principalCents,
      d.paymentPlanCents,
      interestMethod,
    ]
  );

  const sim = useMemo(
    () =>
      amortizeDebt({
        remainingCents: d.remainingCents,
        monthlyPaymentCents: amountToCents(simPay || 0),
        annualRatePercent: d.annualRatePercent,
        method: interestMethod,
        originalPrincipalCents: d.principalCents,
        paymentPlanCents: simMode === "custom" ? simPlanCents : null,
        scheduleMonths: Math.max(
          6,
          simPlanCents?.length ?? 0,
          CHART_SCHEDULE_MONTHS
        ),
      }),
    [
      d.remainingCents,
      d.annualRatePercent,
      d.principalCents,
      interestMethod,
      simPay,
      simMode,
      simPlanCents,
    ]
  );

  const simPlanSum = paymentPlanSumCents(simPlanCents);
  const simPlanOnly = useMemo(
    () =>
      simMode === "custom" && simPlanCents?.length
        ? amortizeDebt({
            remainingCents: d.remainingCents,
            monthlyPaymentCents: 0,
            annualRatePercent: d.annualRatePercent,
            method: interestMethod,
            originalPrincipalCents: d.principalCents,
            paymentPlanCents: simPlanCents,
            scheduleMonths: Math.max(simPlanCents.length, 12),
          })
        : null,
    [
      simMode,
      simPlanCents,
      d.remainingCents,
      d.annualRatePercent,
      d.principalCents,
      interestMethod,
    ]
  );
  const simCoverage = useMemo(
    () =>
      simPlanSum > 0 && simPlanOnly
        ? planCoverageFromAmortization({
            remainingCents: d.remainingCents,
            planSumCents: simPlanSum,
            amortization: simPlanOnly,
          })
        : null,
    [simPlanSum, d.remainingCents, simPlanOnly]
  );

  function seedSimFromDebt() {
    const custom = !!(d.paymentPlanCents && d.paymentPlanCents.length > 0);
    setSimMode(custom ? "custom" : "fixed");
    setSimPay(centsToInput(d.monthlyPaymentCents));
    setSimSteps(
      custom
        ? planStepsFromCents(d.paymentPlanCents)
        : seedStepsFromMonthly(d.remainingCents, d.monthlyPaymentCents)
    );
  }

  function setSimPlanMode(mode: PlanMode) {
    if (mode === "custom" && simMode === "fixed") {
      setSimSteps(
        seedStepsFromMonthly(d.remainingCents, amountToCents(simPay || 0))
      );
    }
    if (mode === "fixed" && simMode === "custom" && simPlanCents?.[0]) {
      setSimPay(centsToInput(simPlanCents[0]));
    }
    setSimMode(mode);
  }

  async function saveSimPayment() {
    try {
      setSaving(true);
      if (simMode === "custom") {
        const steps = (simPlanCents ?? []).map((c) => c / 100);
        if (!steps.length) {
          toast.error(t.error);
          return;
        }
        await api("/api/debts", {
          method: "PATCH",
          json: {
            id: d.id,
            monthlyPayment: simPay || 0,
            paymentPlan: steps,
          },
        });
        toast.success(t.debts.planSaved);
      } else {
        await api("/api/debts", {
          method: "PATCH",
          json: {
            id: d.id,
            monthlyPayment: simPay,
            paymentPlan: null,
          },
        });
        toast.success(t.debts.paymentSaved);
      }
      await onPaymentSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setSaving(false);
    }
  }

  const simChanged =
    simMode === "custom"
      ? !planCentsEqual(simPlanCents, d.paymentPlanCents) &&
        (simPlanCents?.length ?? 0) > 0
      : (amountToCents(simPay) !== d.monthlyPaymentCents &&
          amountToCents(simPay) > 0) ||
        hasCustomPlan;

  return (
    <Card className="mb-4" premium>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>{d.name}</CardTitle>
          <p className="text-xs text-[var(--fg-faint)]">
            {hasCustomPlan
              ? tr(t.debts.ratePayDayPlan, {
                  rate: d.annualRatePercent,
                  n: d.paymentPlanCents!.length,
                  day: d.paymentDay,
                })
              : tr(t.debts.ratePayDay, {
                  rate: d.annualRatePercent,
                  payment: money(d.monthlyPaymentCents),
                  day: d.paymentDay,
                })}
          </p>
          <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
            {tr(t.debts.methodLabel, {
              method: methodLabel(interestMethod, t),
            })}
          </p>
          {d.propertyItems && d.propertyItems.length > 0 && (
            <p className="mt-1 text-xs text-[var(--fg-muted)]">
              {d.propertyItems
                .map((p) => tr(t.debts.linkedProperty, { name: p.name }))
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" onClick={onPayMonth}>
            {t.debts.payMonth}
          </Button>
          <Button size="sm" variant="secondary" onClick={onPayCustom}>
            {t.debts.pay}
          </Button>
          <Button size="sm" variant="secondary" onClick={onEdit}>
            {t.edit}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            {t.delete}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
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
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--fg-muted)]">
            <span>
              {t.debts.remaining}: {money(d.remainingCents)}
            </span>
            {d.paidInterestCents != null && d.paidInterestCents > 0 && (
              <span>
                {t.debts.paidInterest}: {money(d.paidInterestCents)}
              </span>
            )}
          </div>
        </div>

        {d.annualRatePercent <= 0 && (
          <p className="text-xs text-amber-200">{t.debts.zeroRate}</p>
        )}

        {next && d.remainingCents > 0 && (
          <div className="rounded-xl border border-white/10 p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-[var(--fg-muted)]">
                {t.debts.nextPayment}
              </p>
              <p className="font-display text-lg">{money(next.totalCents)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[11px] text-[var(--fg-faint)]">
                  {t.debts.nextInterest}
                </div>
                <div className="text-amber-200">{money(next.interestCents)}</div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--fg-faint)]">
                  {t.debts.nextCapital}
                </div>
                <div className="text-emerald-300">
                  {money(next.capitalCents)}
                </div>
              </div>
            </div>
            {base && (
              <p className="mt-2 text-xs text-[var(--fg-muted)]">
                {base.payoffOk
                  ? hasCustomPlan
                    ? `${tr(t.debts.customPlanLabel, {
                        n: d.paymentPlanCents!.length,
                      })} · ${tr(t.debts.payoffIn, {
                        duration: formatDuration(base.months, tr, t),
                      })} · ${tr(t.debts.totalInterestLeft, {
                        amount: money(base.totalInterestCents),
                      })}`
                    : `${tr(t.debts.ifYouKeepPaying, {
                        payment: money(d.monthlyPaymentCents),
                      })} · ${tr(t.debts.payoffIn, {
                        duration: formatDuration(base.months, tr, t),
                      })} · ${tr(t.debts.totalInterestLeft, {
                        amount: money(base.totalInterestCents),
                      })}`
                  : t.debts.wontPayOff}
              </p>
            )}
            {hasCustomPlan && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {d.paymentPlanCents!.map((amt, i) => (
                  <span
                    key={i}
                    className="rounded-lg bg-white/5 px-2 py-0.5 text-[11px] text-[var(--fg-muted)]"
                  >
                    {tr(t.debts.planStep, { n: i + 1 })}: {money(amt)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {d.remainingCents > 0 && chartPlan.schedule.length > 0 && (
          <div className="rounded-xl border border-white/10 p-3">
            <p className="mb-2 text-xs font-medium text-[var(--fg-muted)]">
              {t.debts.chartTitle}
            </p>
            <DebtAmortizationCharts
              schedule={chartPlan.schedule}
              startingBalanceCents={d.remainingCents}
              height={150}
              compareSchedule={
                simOpen && sim.schedule.length > 0 && simChanged
                  ? sim.schedule
                  : null
              }
              compareStartingBalanceCents={d.remainingCents}
            />
          </div>
        )}

        {d.remainingCents > 0 && (
          <div>
            <button
              type="button"
              className="text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
              onClick={() =>
                setSimOpen((o) => {
                  if (!o) seedSimFromDebt();
                  return !o;
                })
              }
            >
              {t.debts.simulate}
            </button>
            {simOpen && (
              <div className="mt-3 space-y-3 rounded-xl border border-white/10 p-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={simMode === "fixed" ? "default" : "secondary"}
                    onClick={() => setSimPlanMode("fixed")}
                  >
                    {t.debts.planFixed}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={simMode === "custom" ? "default" : "secondary"}
                    onClick={() => setSimPlanMode("custom")}
                  >
                    {t.debts.planCustom}
                  </Button>
                </div>

                {interestMethod === "german" && (
                  <p className="text-xs text-amber-200">
                    {t.debts.germanPaymentIsCapital}
                  </p>
                )}

                {simMode === "fixed" ? (
                  <div>
                    <Label>
                      {interestMethod === "german"
                        ? t.debts.capital
                        : t.debts.tryPayment}
                    </Label>
                    <Input
                      money
                      className="mt-1"
                      value={simPay}
                      onChange={(e) => setSimPay(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--fg-faint)]">
                      {t.debts.planCustomHint}
                    </p>
                    {simSteps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs text-[var(--fg-muted)]">
                          {tr(t.debts.planStep, { n: idx + 1 })}
                        </span>
                        <Input
                          money
                          value={step}
                          onChange={(e) => {
                            const nextSteps = [...simSteps];
                            nextSteps[idx] = e.target.value;
                            setSimSteps(nextSteps);
                          }}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={t.delete}
                          disabled={simSteps.length <= 1}
                          onClick={() =>
                            setSimSteps(simSteps.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setSimSteps([
                          ...simSteps,
                          simPay || centsToInput(d.monthlyPaymentCents) || "",
                        ])
                      }
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      {t.debts.planAddStep}
                    </Button>
                    {simCoverage && d.remainingCents > 0 && (
                      <PlanCoverageNote coverage={simCoverage} />
                    )}
                    <div>
                      <Label>{t.debts.monthlyPayment}</Label>
                      <p className="mb-1 text-[11px] text-[var(--fg-faint)]">
                        {t.debts.planFallback}
                      </p>
                      <Input
                        money
                        value={simPay}
                        onChange={(e) => setSimPay(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <SimResult
                  base={base}
                  sim={sim}
                  simChanged={simChanged}
                  onSave={saveSimPayment}
                  saving={saving}
                  saveLabel={
                    simMode === "custom"
                      ? t.debts.savePlan
                      : t.debts.savePayment
                  }
                />
              </div>
            )}
          </div>
        )}

        {next && (base?.schedule.length || 0) > 0 && (
          <div>
            <button
              type="button"
              className="text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
              onClick={() => setSchedOpen((o) => !o)}
            >
              {t.debts.schedule}
            </button>
            {schedOpen && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[var(--fg-faint)]">
                    <tr>
                      <th className="py-1 pr-3 font-medium">
                        {t.debts.scheduleMonth}
                      </th>
                      <th className="py-1 pr-3 font-medium">
                        {t.debts.thisPayTotal}
                      </th>
                      <th className="py-1 pr-3 font-medium">
                        {t.debts.interest}
                      </th>
                      <th className="py-1 pr-3 font-medium">
                        {t.debts.capital}
                      </th>
                      <th className="py-1 font-medium">{t.debts.remaining}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(base?.schedule || []).map((row) => (
                      <tr key={row.month} className="border-t border-white/5">
                        <td className="py-1 pr-3">{row.month}</td>
                        <td className="py-1 pr-3">{money(row.paymentCents)}</td>
                        <td className="py-1 pr-3 text-amber-200">
                          {money(row.interestCents)}
                        </td>
                        <td className="py-1 pr-3 text-emerald-300">
                          {money(row.capitalCents)}
                        </td>
                        <td className="py-1">{money(row.balanceCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {d.payments.length > 0 && (
          <div className="space-y-1 border-t border-white/5 pt-3">
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
}

function PlanCoverageNote({
  coverage,
}: {
  coverage: ReturnType<typeof planCoverageFromAmortization>;
}) {
  const { money, t, tr } = useApp();
  return (
    <div className="space-y-0.5 text-xs text-[var(--fg-muted)]">
      <p>
        {tr(t.debts.planSum, { amount: money(coverage.planSumCents) })}
        {" · "}
        {tr(t.debts.planVsRemaining, {
          remaining: money(coverage.principalCents),
        })}
      </p>
      {coverage.payoffOk ? (
        <p className="text-emerald-300">
          {tr(t.debts.planPaysOff, {
            interest: money(coverage.totalInterestCents),
          })}
        </p>
      ) : coverage.interestShortfall ? (
        <p className="text-amber-200">
          {tr(t.debts.planInterestShort, {
            amount: money(coverage.remainingAfterCents),
          })}
        </p>
      ) : (
        <p className="text-amber-200">
          {tr(t.debts.planLeavesBalance, {
            amount: money(coverage.remainingAfterCents),
          })}
        </p>
      )}
      {coverage.cashBelowPrincipal && !coverage.payoffOk && (
        <p className="text-[var(--fg-faint)]">
          {tr(t.debts.planShort, {
            amount: money(coverage.principalCents - coverage.planSumCents),
          })}
        </p>
      )}
      {!coverage.cashBelowPrincipal &&
        coverage.planSumCents > coverage.principalCents &&
        !coverage.payoffOk && (
          <p className="text-[var(--fg-faint)]">
            {tr(t.debts.planLong, {
              amount: money(coverage.planSumCents - coverage.principalCents),
            })}
          </p>
        )}
    </div>
  );
}

function PlanPreview({
  plan,
  rate,
  paymentCents,
  title,
  className,
}: {
  plan: AmortizationSummary;
  rate: number;
  paymentCents: number;
  title: string;
  className?: string;
}) {
  const { money, t, tr } = useApp();
  const leftAfter =
    plan.payoffOk || plan.schedule.length === 0
      ? 0
      : plan.schedule[plan.schedule.length - 1].balanceCents;
  return (
    <div
      className={`rounded-xl border border-white/10 p-3 text-xs text-[var(--fg-muted)] ${className || ""}`}
    >
      <p className="mb-1 font-medium text-[var(--fg)]">{title}</p>
      {rate <= 0 && <p className="text-amber-200">{t.debts.zeroRate}</p>}
      <p>
        {t.debts.nextInterest}: {money(plan.next.interestCents)} ·{" "}
        {t.debts.nextCapital}: {money(plan.next.capitalCents)}
      </p>
      {plan.payoffOk && (paymentCents > 0 || plan.hasCustomPlan) ? (
        <p>
          {tr(t.debts.payoffIn, {
            duration: formatDuration(plan.months, tr, t),
          })}{" "}
          ·{" "}
          {tr(t.debts.totalInterestLeft, {
            amount: money(plan.totalInterestCents),
          })}
        </p>
      ) : paymentCents > 0 || plan.hasCustomPlan ? (
        <p className="text-amber-200">
          {leftAfter > 0
            ? tr(t.debts.planLeavesBalance, { amount: money(leftAfter) })
            : t.debts.wontPayOff}{" "}
          {!plan.paymentCoversInterest &&
            tr(t.debts.minToReduce, { amount: money(plan.minPaymentCents) })}
        </p>
      ) : null}
    </div>
  );
}

function SimResult({
  base,
  sim,
  simChanged,
  onSave,
  saving,
  saveLabel,
}: {
  base?: Plan | null;
  sim: AmortizationSummary;
  simChanged: boolean;
  onSave: () => void;
  saving: boolean;
  saveLabel?: string;
}) {
  const { money, t, tr } = useApp();

  if (!sim.payoffOk) {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-amber-200">{t.debts.wontPayOff}</p>
        <p>
          {tr(t.debts.minToReduce, { amount: money(sim.minPaymentCents) })}
        </p>
        {simChanged && (
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saveLabel || t.debts.savePayment}
          </Button>
        )}
      </div>
    );
  }

  const deltaInterest = (base?.totalInterestCents ?? 0) - sim.totalInterestCents;
  const deltaMonths = (base?.months ?? 0) - sim.months;
  const same =
    !simChanged || (deltaInterest === 0 && deltaMonths === 0) || !base?.payoffOk;

  return (
    <div className="space-y-2 text-xs">
      <p>
        {sim.hasCustomPlan
          ? `${tr(t.debts.customPlanLabel, { n: sim.months })} · `
          : ""}
        {tr(t.debts.payoffIn, {
          duration: formatDuration(sim.months, tr, t),
        })}{" "}
        ·{" "}
        {tr(t.debts.totalInterestLeft, {
          amount: money(sim.totalInterestCents),
        })}
      </p>
      <p>
        {t.debts.nextInterest}: {money(sim.next.interestCents)} ·{" "}
        {t.debts.nextCapital}: {money(sim.next.capitalCents)}
      </p>
      {sim.schedule.length > 0 && sim.hasCustomPlan && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {sim.schedule.map((row) => (
            <span
              key={row.month}
              className="rounded-lg bg-white/5 px-2 py-0.5 text-[11px] text-[var(--fg-muted)]"
            >
              {tr(t.debts.planStep, { n: row.month })}:{" "}
              {money(row.paymentCents)}
            </span>
          ))}
        </div>
      )}
      {!same && base?.payoffOk && (
        <p className={deltaInterest >= 0 ? "text-emerald-300" : "text-amber-200"}>
          {deltaInterest > 0
            ? tr(t.debts.interestSaved, { amount: money(deltaInterest) })
            : deltaInterest < 0
              ? tr(t.debts.interestExtra, { amount: money(-deltaInterest) })
              : t.debts.samePlan}
          {deltaMonths !== 0
            ? ` · ${
                deltaMonths > 0
                  ? tr(t.debts.fasterBy, {
                      duration: formatDuration(deltaMonths, tr, t),
                    })
                  : tr(t.debts.slowerBy, {
                      duration: formatDuration(-deltaMonths, tr, t),
                    })
              }`
            : ""}
        </p>
      )}
      {simChanged && (
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saveLabel || t.debts.savePayment}
        </Button>
      )}
    </div>
  );
}
