"use client";

import { useEffect, useMemo, useState } from "react";
import { Home, Landmark, Scale } from "lucide-react";
import { PropertyValueChart } from "@/components/property-value-chart";
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
import { amountToCents, centsToInput } from "@/lib/utils";
import { toast } from "sonner";
import {
  defaultValuePolicy,
  valueItem,
  valueTimeline,
  type ValueChange,
  type ValueMethod,
} from "@/lib/properties/valuation";

type Kind = "asset" | "liability";

type Valuation = {
  originalCents: number;
  currentCents: number;
  estimatedCents?: number;
  deltaCents: number;
  deltaPercent: number | null;
  yearsHeld: number;
  investedCents: number;
  improvementImpactCents: number;
  baseCents: number;
  source?: "estimate" | "market";
  marketValueCents?: number | null;
  marketValueOn?: string | null;
};

type Improvement = {
  id: string;
  description: string;
  costCents: number;
  effect: "improve" | "depreciate";
  recoveryPercent: number;
  doneOn: string | null;
};

type Item = {
  id: string;
  name: string;
  kind: Kind;
  category: string;
  valueCents: number;
  valueChange: ValueChange;
  annualRatePercent: number;
  method: ValueMethod;
  usefulLifeYears: number | null;
  salvageCents: number;
  notes: string | null;
  acquiredOn: string | null;
  marketValueCents?: number | null;
  marketValueOn?: string | null;
  valuation: Valuation;
  improvements: Improvement[];
  debtId?: string | null;
  financedById?: string | null;
  equityCents?: number | null;
  linkedLiability?: {
    id: string;
    name: string;
    currentCents: number;
    debt: {
      id: string;
      name: string;
      remainingCents: number | null;
    } | null;
  } | null;
  financesAsset?: { id: string; name: string } | null;
  debt?: {
    id: string;
    name: string;
    monthlyPaymentCents: number;
    paymentDay: number;
    annualRatePercent: number;
    remainingCents: number | null;
  } | null;
  owners?: { userId: string; percent: number; name: string }[];
};

type OwnerShare = {
  userId: string;
  name: string;
  assetCents: number;
  equityCents: number;
};

type DebtOpt = { id: string; name: string; remainingCents: number };

const ASSET_CATS = [
  "home",
  "vehicle",
  "land",
  "jewelry",
  "electronics",
  "furniture",
  "other",
] as const;
const LIAB_CATS = ["mortgage", "loan", "other"] as const;
const OWNER_COLORS = [
  "#2dd4bf",
  "#a78bfa",
  "#fb7185",
  "#fbbf24",
  "#38bdf8",
  "#f472b6",
];

function itemSeries(item: Item, futureYears = 0) {
  return valueTimeline(
    {
      originalCents: item.valueCents,
      acquiredOn: item.acquiredOn,
      valueChange: item.valueChange,
      annualRatePercent: item.annualRatePercent,
      method: item.method,
      usefulLifeYears: item.usefulLifeYears,
      salvageCents: item.salvageCents,
    },
    item.improvements || [],
    {
      marketValueCents: item.marketValueCents,
      marketValueOn: item.marketValueOn,
    },
    { futureYears }
  ).map((p) => ({
    date: p.date,
    value: p.currentCents,
    estimate: p.estimatedCents,
    equity:
      item.linkedLiability != null
        ? p.currentCents - item.linkedLiability.currentCents
        : item.equityCents != null
          ? p.currentCents - (item.valuation.currentCents - item.equityCents)
          : undefined,
  }));
}

function policyToForm(p: ReturnType<typeof defaultValuePolicy>) {
  return {
    valueChange: p.valueChange,
    annualRatePercent: String(p.annualRatePercent),
    method: p.method,
    usefulLifeYears: p.usefulLifeYears != null ? String(p.usefulLifeYears) : "",
    salvage: "",
  };
}

export default function PropertiesPage() {
  const { money, t, tr, members } = useApp();
  const { confirm } = useConfirm();
  const [items, setItems] = useState<Item[]>([]);
  const [debtOpts, setDebtOpts] = useState<DebtOpt[]>([]);
  const [totals, setTotals] = useState({
    assetCents: 0,
    liabilityCents: 0,
    netCents: 0,
    equityCents: 0,
    ownerShares: [] as OwnerShare[],
    unassignedAssetCents: 0,
    unassignedEquityCents: 0,
  });
  const [futureYears, setFutureYears] = useState(0);
  const [mode, setMode] = useState<"none" | "new" | "edit">("none");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    kind: "asset" as Kind,
    category: "home",
    value: "",
    valueChange: "none" as ValueChange,
    annualRatePercent: "0",
    method: "compound" as ValueMethod,
    usefulLifeYears: "",
    salvage: "",
    notes: "",
    acquiredOn: "",
    debtMode: "none" as "none" | "create" | "existing",
    linkDebtId: "",
    monthlyPayment: "",
    paymentDay: "1",
    financeMode: "none" as "none" | "existing" | "create",
    financedById: "",
    liabilityName: "",
    liabilityValue: "",
    marketValue: "",
    marketValueOn: "",
    owners: {} as Record<string, string>,
  });

  const cats = t.properties.categories;

  async function load() {
    const data = await api<{
      items: Item[];
      debts?: DebtOpt[];
      totals: typeof totals;
    }>("/api/properties");
    setItems(data.items);
    setDebtOpts(data.debts || []);
    setTotals(data.totals);
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);

  function openNew(kind: Kind) {
    setMode("new");
    setEditId(null);
    setForm({
      name: "",
      kind,
      category: kind === "asset" ? "home" : "mortgage",
      value: "",
      ...policyToForm(defaultValuePolicy(kind, kind === "asset" ? "home" : "mortgage")),
      notes: "",
      acquiredOn: "",
      debtMode: kind === "liability" ? "create" : "none",
      linkDebtId: "",
      monthlyPayment: "",
      paymentDay: "1",
      financeMode: "none",
      financedById: "",
      liabilityName: "",
      liabilityValue: "",
      marketValue: "",
      marketValueOn: "",
      owners: {},
    });
  }

  function openEdit(item: Item) {
    setMode("edit");
    setEditId(item.id);
    setForm({
      name: item.name,
      kind: item.kind,
      category: item.category,
      value: centsToInput(item.valueCents),
      valueChange: item.valueChange || "none",
      annualRatePercent: String(item.annualRatePercent ?? 0),
      method: item.method || "compound",
      usefulLifeYears:
        item.usefulLifeYears != null ? String(item.usefulLifeYears) : "",
      salvage: item.salvageCents ? centsToInput(item.salvageCents) : "",
      notes: item.notes || "",
      acquiredOn: item.acquiredOn || "",
      debtMode: item.debtId ? "existing" : "none",
      linkDebtId: item.debtId || "",
      monthlyPayment: item.debt
        ? centsToInput(item.debt.monthlyPaymentCents)
        : "",
      paymentDay: item.debt ? String(item.debt.paymentDay) : "1",
      financeMode: item.financedById || item.linkedLiability ? "existing" : "none",
      financedById: item.financedById || item.linkedLiability?.id || "",
      liabilityName: "",
      liabilityValue: "",
      marketValue: item.marketValueCents
        ? centsToInput(item.marketValueCents)
        : "",
      marketValueOn: item.marketValueOn || "",
      owners: Object.fromEntries(
        (item.owners || []).map((o) => [o.userId, String(o.percent)])
      ),
    });
  }

  async function save() {
    try {
      if (form.kind === "asset" && ownerPctSum > 100.05) {
        toast.error(
          tr(t.properties.ownershipOver, { pct: ownerPctSum.toFixed(1) })
        );
        return;
      }
      const payload = {
        name: form.name,
        kind: form.kind,
        category: form.category,
        value: form.value,
        valueChange: form.valueChange,
        annualRatePercent: parseFloat(form.annualRatePercent) || 0,
        method: form.method,
        usefulLifeYears: form.usefulLifeYears
          ? parseFloat(form.usefulLifeYears)
          : null,
        salvage: form.salvage || 0,
        notes: form.notes || null,
        acquiredOn: form.acquiredOn || null,
        createDebt:
          (form.kind === "liability" && form.debtMode === "create") ||
          (form.kind === "asset" && form.financeMode === "create"),
        linkDebtId:
          form.kind === "liability" && form.debtMode === "existing"
            ? form.linkDebtId || null
            : form.kind === "liability" && form.debtMode === "none"
              ? null
              : undefined,
        monthlyPayment: form.monthlyPayment || 0,
        paymentDay: parseInt(form.paymentDay, 10) || 1,
        financedById:
          form.kind === "asset" && form.financeMode === "existing"
            ? form.financedById || null
            : form.kind === "asset" && form.financeMode === "none"
              ? null
              : undefined,
        createLiability: form.kind === "asset" && form.financeMode === "create",
        liabilityName: form.liabilityName || null,
        liabilityValue: form.liabilityValue || 0,
        marketValue:
          form.kind === "asset"
            ? form.marketValue
              ? form.marketValue
              : null
            : null,
        marketValueOn:
          form.kind === "asset" ? form.marketValueOn || null : null,
        owners:
          form.kind === "asset"
            ? Object.entries(form.owners)
                .map(([userId, percent]) => ({
                  userId,
                  percent: parseFloat(percent) || 0,
                }))
                .filter((o) => o.percent > 0)
            : [],
      };
      if (mode === "edit" && editId) {
        await api("/api/properties", {
          method: "PATCH",
          json: { id: editId, ...payload },
        });
        toast.success(t.properties.updated);
      } else {
        await api("/api/properties", { method: "POST", json: payload });
        toast.success(t.properties.created);
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
      description: t.properties.confirmDelete,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    await api(`/api/properties?id=${id}`, { method: "DELETE" });
    await load();
  }

  const formPreview = valueItem(
    {
      originalCents: amountToCents(form.value || 0),
      acquiredOn: form.acquiredOn || null,
      valueChange: form.valueChange,
      annualRatePercent: parseFloat(form.annualRatePercent) || 0,
      method: form.method,
      usefulLifeYears: form.usefulLifeYears
        ? parseFloat(form.usefulLifeYears)
        : null,
      salvageCents: amountToCents(form.salvage || 0),
    },
    [],
    {
      marketValueCents:
        form.kind === "asset" && form.marketValue
          ? amountToCents(form.marketValue)
          : null,
      marketValueOn: form.marketValueOn || null,
    }
  );

  const categoryOptions = form.kind === "asset" ? ASSET_CATS : LIAB_CATS;
  const assets = items.filter((i) => i.kind === "asset");
  const liabilities = items.filter((i) => i.kind === "liability");
  const householdSeries = useMemo(() => {
    const map = new Map<string, { date: string; value: number; equity: number }>();
    for (const item of assets) {
      for (const p of itemSeries(item, futureYears)) {
        const prev = map.get(p.date) || { date: p.date, value: 0, equity: 0 };
        prev.value += p.value;
        prev.equity += p.equity ?? p.value;
        map.set(p.date, prev);
      }
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [assets, futureYears]);
  const ownerPctSum = Object.values(form.owners).reduce(
    (s, v) => s + (parseFloat(v) || 0),
    0
  );
  const linkedForPreview =
    form.financeMode === "existing"
      ? items.find((i) => i.id === form.financedById)
      : null;
  const previewLiabCents =
    form.financeMode === "create"
      ? amountToCents(form.liabilityValue || 0)
      : linkedForPreview
        ? linkedForPreview.valuation.currentCents
        : null;
  const equityPreview =
    form.kind === "asset" && previewLiabCents != null
      ? formPreview.currentCents - previewLiabCents
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.properties}
        title={t.properties.title}
        subtitle={t.properties.subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openNew("asset")}>
              {t.properties.addAsset}
            </Button>
            <Button onClick={() => openNew("liability")}>
              {t.properties.addLiability}
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.properties.totalAssets}
          </div>
          <div className="mt-1 font-display text-2xl text-emerald-300">
            {money(totals.assetCents)}
          </div>
        </div>
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.properties.totalLiabilities}
          </div>
          <div className="mt-1 font-display text-2xl text-amber-200">
            {money(totals.liabilityCents)}
          </div>
        </div>
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.properties.netWorth}
          </div>
          <div
            className={`mt-1 font-display text-2xl ${
              totals.netCents >= 0 ? "text-[var(--accent)]" : "text-rose-300"
            }`}
          >
            {money(totals.netCents)}
          </div>
        </div>
      </div>

      {householdSeries.length >= 2 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{t.properties.chartHousehold}</CardTitle>
            <label className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
              <input
                type="checkbox"
                checked={futureYears > 0}
                onChange={(e) => setFutureYears(e.target.checked ? 3 : 0)}
              />
              {t.properties.chartFuture}
            </label>
          </CardHeader>
          <CardContent>
            <PropertyValueChart
              series={householdSeries}
              showEquity={householdSeries.some(
                (p) => p.equity !== undefined && p.equity !== p.value
              )}
            />
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--fg-faint)]">
              <span className="text-teal-200">● {t.properties.chartLegendValue}</span>
              <span className="text-violet-300">● {t.properties.chartLegendEquity}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {(totals.ownerShares.length > 0 || (totals.unassignedEquityCents || 0) > 0) &&
        assets.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              {t.properties.byOwner}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {totals.ownerShares.map((s, i) => (
                <div
                  key={s.userId}
                  className="rounded-xl border border-white/10 px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: OWNER_COLORS[i % OWNER_COLORS.length],
                      }}
                    />
                    {s.name}
                  </div>
                  <div className="mt-1 font-display text-lg text-emerald-300">
                    {money(s.equityCents)}
                  </div>
                </div>
              ))}
              {(totals.unassignedEquityCents || 0) > 0 && (
                <div className="rounded-xl border border-white/10 px-3 py-2">
                  <div className="text-sm text-[var(--fg-muted)]">
                    {t.properties.ownershipHousehold}
                  </div>
                  <div className="mt-1 font-display text-lg">
                    {money(totals.unassignedEquityCents)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {mode !== "none" && (
        <Card premium>
          <CardHeader>
            <CardTitle>
              {mode === "edit" ? t.edit : t.properties.newItem}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t.name}</Label>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.properties.kind}</Label>
              <Select
                className="mt-1"
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as Kind;
                  const category = kind === "asset" ? "home" : "mortgage";
                  setForm({
                    ...form,
                    kind,
                    category,
                    ...policyToForm(defaultValuePolicy(kind, category)),
                  });
                }}
              >
                <option value="asset">{t.properties.asset}</option>
                <option value="liability">{t.properties.liability}</option>
              </Select>
            </div>
            <div>
              <Label>{t.category}</Label>
              <Select
                className="mt-1"
                value={form.category}
                onChange={(e) => {
                  const category = e.target.value;
                  setForm({
                    ...form,
                    category,
                    ...policyToForm(defaultValuePolicy(form.kind, category)),
                  });
                }}
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {cats[c]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>
                {form.kind === "asset"
                  ? t.properties.estimatedValue
                  : t.properties.amountOwed}
              </Label>
              <Input
                money
                className="mt-1"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
            <div>
              <Label>{t.properties.acquiredOn}</Label>
              <Input
                type="date"
                className="mt-1"
                value={form.acquiredOn}
                onChange={(e) =>
                  setForm({ ...form, acquiredOn: e.target.value })
                }
              />
            </div>
            {form.kind === "asset" && (
              <>
                <div>
                  <Label>{t.properties.marketValue}</Label>
                  <Input
                    money
                    className="mt-1"
                    value={form.marketValue}
                    onChange={(e) =>
                      setForm({ ...form, marketValue: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>{t.properties.marketValueOn}</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={form.marketValueOn}
                    onChange={(e) =>
                      setForm({ ...form, marketValueOn: e.target.value })
                    }
                  />
                </div>
                <p className="sm:col-span-2 text-[11px] text-[var(--fg-faint)]">
                  {t.properties.marketHint}
                </p>
              </>
            )}
            <div>
              <Label>{t.properties.valueChange}</Label>
              <Select
                className="mt-1"
                value={form.valueChange}
                onChange={(e) =>
                  setForm({
                    ...form,
                    valueChange: e.target.value as ValueChange,
                  })
                }
              >
                <option value="none">{t.properties.changeNone}</option>
                <option value="appreciate">{t.properties.changeUp}</option>
                <option value="depreciate">{t.properties.changeDown}</option>
              </Select>
            </div>
            {form.valueChange !== "none" && (
              <>
                <div>
                  <Label>{t.properties.annualRate}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="mt-1"
                    value={form.annualRatePercent}
                    onChange={(e) =>
                      setForm({ ...form, annualRatePercent: e.target.value })
                    }
                  />
                </div>
                {form.valueChange === "depreciate" && (
                  <>
                    <div>
                      <Label>{t.properties.method}</Label>
                      <Select
                        className="mt-1"
                        value={form.method}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            method: e.target.value as ValueMethod,
                          })
                        }
                      >
                        <option value="compound">
                          {t.properties.methodCompound}
                        </option>
                        <option value="straight">
                          {t.properties.methodStraight}
                        </option>
                      </Select>
                    </div>
                    {form.method === "straight" && (
                      <>
                        <div>
                          <Label>{t.properties.usefulLife}</Label>
                          <Input
                            type="number"
                            step="0.5"
                            className="mt-1"
                            value={form.usefulLifeYears}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                usefulLifeYears: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <Label>{t.properties.salvage}</Label>
                          <Input
                            money
                            className="mt-1"
                            value={form.salvage}
                            onChange={(e) =>
                              setForm({ ...form, salvage: e.target.value })
                            }
                          />
                        </div>
                      </>
                    )}
                  </>
                )}
                <p className="sm:col-span-2 text-xs text-[var(--fg-muted)]">
                  {form.acquiredOn
                    ? tr(t.properties.previewToday, {
                        amount: money(formPreview.currentCents),
                      })
                    : t.properties.needsDate}
                </p>
              </>
            )}
            {form.kind === "asset" && (
              <div className="sm:col-span-2 space-y-3 rounded-xl border border-white/10 p-3">
                <Label>{t.properties.financeLink}</Label>
                <p className="text-[11px] text-[var(--fg-faint)]">
                  {t.properties.financeHint}
                </p>
                <Select
                  value={form.financeMode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      financeMode: e.target.value as
                        | "none"
                        | "existing"
                        | "create",
                    })
                  }
                >
                  <option value="none">{t.properties.financeNone}</option>
                  <option value="existing">
                    {t.properties.financeExisting}
                  </option>
                  <option value="create">{t.properties.financeCreate}</option>
                </Select>
                {form.financeMode === "existing" && (
                  <Select
                    value={form.financedById}
                    onChange={(e) =>
                      setForm({ ...form, financedById: e.target.value })
                    }
                  >
                    <option value="">{t.select}</option>
                    {liabilities
                      .filter(
                        (l) =>
                          !l.financesAsset ||
                          l.financesAsset.id === editId ||
                          l.id === form.financedById
                      )
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </Select>
                )}
                {form.financeMode === "create" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>{t.properties.liabilityName}</Label>
                      <Input
                        className="mt-1"
                        value={form.liabilityName}
                        placeholder={`Hipoteca ${form.name || ""}`.trim()}
                        onChange={(e) =>
                          setForm({ ...form, liabilityName: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>{t.properties.amountOwed}</Label>
                      <Input
                        money
                        className="mt-1"
                        value={form.liabilityValue}
                        onChange={(e) =>
                          setForm({ ...form, liabilityValue: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>{t.properties.monthlyPay}</Label>
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
                      <Label>{t.properties.paymentDay}</Label>
                      <Input
                        numeric
                        className="mt-1"
                        value={form.paymentDay}
                        onChange={(e) =>
                          setForm({ ...form, paymentDay: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}
                {equityPreview != null && (
                  <p className="text-xs text-emerald-300">
                    {tr(t.properties.equityOf, {
                      amount: money(equityPreview),
                    })}
                  </p>
                )}
              </div>
            )}
            {form.kind === "liability" && (
              <div className="sm:col-span-2 space-y-3 rounded-xl border border-white/10 p-3">
                <Label>{t.properties.debtLink}</Label>
                <p className="text-[11px] text-[var(--fg-faint)]">
                  {t.properties.debtHint}
                </p>
                <Select
                  value={form.debtMode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      debtMode: e.target.value as "none" | "create" | "existing",
                    })
                  }
                >
                  <option value="none">{t.properties.debtNone}</option>
                  <option value="create">{t.properties.debtCreate}</option>
                  <option value="existing">{t.properties.debtExisting}</option>
                </Select>
                {form.debtMode === "create" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>{t.properties.monthlyPay}</Label>
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
                      <Label>{t.properties.paymentDay}</Label>
                      <Input
                        numeric
                        className="mt-1"
                        value={form.paymentDay}
                        onChange={(e) =>
                          setForm({ ...form, paymentDay: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}
                {form.debtMode === "existing" && (
                  <Select
                    value={form.linkDebtId}
                    onChange={(e) =>
                      setForm({ ...form, linkDebtId: e.target.value })
                    }
                  >
                    <option value="">{t.select}</option>
                    {debtOpts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}
            {form.kind === "asset" && members.length > 0 && (
              <div className="sm:col-span-2 space-y-3 rounded-xl border border-white/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>{t.properties.ownership}</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!members.length) return;
                      const each = Math.round((100 / members.length) * 10) / 10;
                      setForm({
                        ...form,
                        owners: Object.fromEntries(
                          members.map((m) => [m.user.id, String(each)])
                        ),
                      });
                    }}
                  >
                    {t.properties.splitEqual}
                  </Button>
                </div>
                <p className="text-[11px] text-[var(--fg-faint)]">
                  {t.properties.ownershipHint}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {members.map((m) => (
                    <div key={m.user.id}>
                      <Label>{m.user.displayName}</Label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        className="mt-1"
                        value={form.owners[m.user.id] || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            owners: {
                              ...form.owners,
                              [m.user.id]: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <p
                  className={`text-xs ${
                    ownerPctSum > 100.05
                      ? "text-amber-200"
                      : "text-[var(--fg-muted)]"
                  }`}
                >
                  {ownerPctSum > 100.05
                    ? tr(t.properties.ownershipOver, {
                        pct: ownerPctSum.toFixed(1),
                      })
                    : tr(t.properties.ownershipTotal, {
                        pct: ownerPctSum.toFixed(1),
                      })}
                  {ownerPctSum < 99.95
                    ? ` · ${t.properties.ownershipHousehold} ${(100 - ownerPctSum).toFixed(1)}%`
                    : ""}
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

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-xl">
          <Home className="h-4 w-4" />
          {t.properties.assets}
        </h2>
        {assets.length === 0 && (
          <p className="text-sm text-[var(--fg-faint)]">
            {t.properties.noAssets}
          </p>
        )}
        {assets.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            categoryLabel={cats[item.category as keyof typeof cats] || item.category}
            onEdit={() => openEdit(item)}
            onDelete={() => remove(item.id)}
            onChanged={load}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-xl">
          <Landmark className="h-4 w-4" />
          {t.properties.liabilities}
        </h2>
        {liabilities.length === 0 && (
          <p className="text-sm text-[var(--fg-faint)]">
            {t.properties.noLiabilities}
          </p>
        )}
        {liabilities.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            categoryLabel={cats[item.category as keyof typeof cats] || item.category}
            onEdit={() => openEdit(item)}
            onDelete={() => remove(item.id)}
            onChanged={load}
          />
        ))}
      </section>
    </div>
  );
}

function ItemCard({
  item,
  categoryLabel,
  onEdit,
  onDelete,
  onChanged,
}: {
  item: Item;
  categoryLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => Promise<void>;
}) {
  const { money, t, tr } = useApp();
  const { confirm } = useConfirm();
  const [open, setOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [imp, setImp] = useState({
    description: "",
    cost: "",
    effect: "improve" as "improve" | "depreciate",
    recoveryPercent: "70",
    doneOn: "",
  });

  async function saveImprovement() {
    try {
      await api("/api/property-improvements", {
        method: "POST",
        json: {
          propertyId: item.id,
          description: imp.description,
          cost: imp.cost,
          effect: imp.effect,
          recoveryPercent: parseFloat(imp.recoveryPercent) || 70,
          doneOn: imp.doneOn || null,
        },
      });
      toast.success(t.properties.improvementAdded);
      setImp({
        description: "",
        cost: "",
        effect: "improve",
        recoveryPercent: "70",
        doneOn: "",
      });
      setAdding(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function removeImprovement(id: string) {
    const ok = await confirm({
      title: t.delete,
      description: t.properties.confirmDeleteImprovement,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    await api(`/api/property-improvements?id=${id}`, { method: "DELETE" });
    await onChanged();
  }

  const v = item.valuation;
  const imps = item.improvements || [];

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">{item.name}</div>
            <div className="text-xs text-[var(--fg-faint)]">
              {categoryLabel}
              {item.acquiredOn ? ` · ${item.acquiredOn}` : ""}
              {v && v.deltaCents !== 0
                ? ` · ${tr(t.properties.original, {
                    amount: money(v.originalCents),
                  })}`
                : ""}
              {item.notes ? ` · ${item.notes}` : ""}
              {item.debt
                ? ` · ${tr(t.properties.linkedDebt, { name: item.debt.name })}`
                : ""}
              {item.debt?.remainingCents != null
                ? ` · ${tr(t.properties.debtRemaining, {
                    amount: money(item.debt.remainingCents),
                  })}`
                : ""}
              {item.linkedLiability
                ? ` · ${tr(t.properties.linkedLiability, {
                    name: item.linkedLiability.name,
                  })}`
                : ""}
              {item.financesAsset
                ? ` · ${tr(t.properties.financesAsset, {
                    name: item.financesAsset.name,
                  })}`
                : ""}
              {v?.source === "market"
                ? ` · ${t.properties.marketSource}${
                    v.marketValueOn ? ` ${v.marketValueOn}` : ""
                  }`
                : ""}
              {v?.source === "market" && v.estimatedCents != null
                ? ` · ${tr(t.properties.estimateSource, {
                    amount: money(v.estimatedCents),
                  })}`
                : ""}
            </div>
            {v && v.investedCents > 0 && (
              <div className="mt-1 text-xs text-[var(--fg-muted)]">
                {tr(t.properties.invested, { amount: money(v.investedCents) })}
                {" · "}
                {tr(t.properties.impactOnValue, {
                  amount: `${v.improvementImpactCents >= 0 ? "+" : ""}${money(
                    v.improvementImpactCents
                  )}`,
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              {item.kind === "asset" && item.equityCents != null ? (
                <>
                  <div className="flex items-center justify-end gap-1 text-[11px] text-[var(--fg-faint)]">
                    <Scale className="h-3 w-3" />
                    {t.properties.equity}
                  </div>
                  <span className="font-display text-lg text-emerald-300">
                    {money(item.equityCents)}
                  </span>
                  <div className="text-[11px] text-[var(--fg-muted)]">
                    {tr(t.properties.valueMinusDebt, {
                      value: money(v?.currentCents ?? item.valueCents),
                      debt: money(item.linkedLiability?.currentCents ?? 0),
                    })}
                  </div>
                </>
              ) : (
                <>
                  <span
                    className={`font-display text-lg ${
                      item.kind === "asset"
                        ? "text-emerald-300"
                        : "money-expense"
                    }`}
                  >
                    {money(v?.currentCents ?? item.valueCents)}
                  </span>
                  {v && v.deltaPercent != null && v.deltaCents !== 0 && (
                    <div
                      className={`text-[11px] ${
                        v.deltaCents > 0
                          ? "text-emerald-300"
                          : "text-amber-200"
                      }`}
                    >
                      {tr(t.properties.changeVsOriginal, {
                        sign: v.deltaCents > 0 ? "+" : "",
                        pct: v.deltaPercent.toFixed(1),
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              {t.edit}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              {t.delete}
            </Button>
          </div>
        </div>

        {item.kind === "asset" && (item.owners || []).length > 0 && (
          <div className="space-y-1">
            <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
              {(item.owners || []).map((o, i) => (
                <div
                  key={o.userId}
                  style={{
                    width: `${Math.min(100, o.percent)}%`,
                    background: OWNER_COLORS[i % OWNER_COLORS.length],
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--fg-muted)]">
              {(item.owners || []).map((o, i) => {
                const base = item.equityCents ?? v?.currentCents ?? 0;
                return (
                  <span key={o.userId}>
                    <span
                      className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                      style={{
                        background: OWNER_COLORS[i % OWNER_COLORS.length],
                      }}
                    />
                    {tr(t.properties.shareOf, {
                      name: o.name,
                      pct: o.percent,
                    })}{" "}
                    {money(Math.round((base * o.percent) / 100))}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {item.kind === "asset" && item.acquiredOn && (
          <div>
            <button
              type="button"
              className="text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
              onClick={() => setChartOpen((o) => !o)}
            >
              {t.properties.chartTitle}
            </button>
            {chartOpen && (
              <div className="mt-2">
                <PropertyValueChart
                  series={itemSeries(item)}
                  showEstimate={v?.source === "market"}
                  showEquity={item.linkedLiability != null}
                  height={180}
                />
                <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[var(--fg-faint)]">
                  <span className="text-teal-200">
                    ● {t.properties.chartLegendValue}
                  </span>
                  {v?.source === "market" && (
                    <span className="text-amber-200">
                      – {t.properties.chartLegendEstimate}
                    </span>
                  )}
                  {item.linkedLiability && (
                    <span className="text-violet-300">
                      ● {t.properties.chartLegendEquity}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-white/10 pt-3">
          <button
            type="button"
            className="text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
            onClick={() => setOpen((o) => !o)}
          >
            {t.properties.improvements}
            {imps.length ? ` (${imps.length})` : ""}
          </button>
          {open && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-[var(--fg-faint)]">
                {t.properties.improvementHint}
              </p>
              {imps.length === 0 && !adding && (
                <p className="text-xs text-[var(--fg-faint)]">
                  {t.properties.noImprovements}
                </p>
              )}
              {imps.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-medium text-sm">{row.description}</div>
                    <div className="text-[var(--fg-faint)]">
                      {money(row.costCents)}
                      {" · "}
                      {row.effect === "depreciate"
                        ? t.properties.effectDown
                        : t.properties.effectImprove}
                      {` ${row.recoveryPercent}%`}
                      {row.doneOn ? ` · ${row.doneOn}` : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeImprovement(row.id)}
                  >
                    {t.delete}
                  </Button>
                </div>
              ))}
              {adding ? (
                <div className="grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>{t.description}</Label>
                    <Input
                      className="mt-1"
                      value={imp.description}
                      onChange={(e) =>
                        setImp({ ...imp, description: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>{t.properties.cost}</Label>
                    <Input
                      money
                      className="mt-1"
                      value={imp.cost}
                      onChange={(e) => setImp({ ...imp, cost: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>{t.properties.doneOn}</Label>
                    <Input
                      type="date"
                      className="mt-1"
                      value={imp.doneOn}
                      onChange={(e) =>
                        setImp({ ...imp, doneOn: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>{t.type}</Label>
                    <Select
                      className="mt-1"
                      value={imp.effect}
                      onChange={(e) => {
                        const effect = e.target.value as
                          | "improve"
                          | "depreciate";
                        setImp({
                          ...imp,
                          effect,
                          recoveryPercent:
                            effect === "depreciate" ? "100" : "70",
                        });
                      }}
                    >
                      <option value="improve">
                        {t.properties.effectImprove}
                      </option>
                      <option value="depreciate">
                        {t.properties.effectDown}
                      </option>
                    </Select>
                  </div>
                  <div>
                    <Label>{t.properties.recovery}</Label>
                    <Input
                      type="number"
                      className="mt-1"
                      value={imp.recoveryPercent}
                      onChange={(e) =>
                        setImp({ ...imp, recoveryPercent: e.target.value })
                      }
                    />
                    <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
                      {t.properties.recoveryHint}
                    </p>
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button size="sm" onClick={saveImprovement}>
                      {t.save}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAdding(false)}
                    >
                      {t.cancel}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setAdding(true)}
                >
                  {t.properties.addImprovement}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
