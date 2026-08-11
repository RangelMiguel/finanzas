"use client";

import { useEffect, useState } from "react";
import { Home, Landmark } from "lucide-react";
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
  type ValueChange,
  type ValueMethod,
} from "@/lib/properties/valuation";

type Kind = "asset" | "liability";

type Valuation = {
  originalCents: number;
  currentCents: number;
  deltaCents: number;
  deltaPercent: number | null;
  yearsHeld: number;
  investedCents: number;
  improvementImpactCents: number;
  baseCents: number;
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
  valuation: Valuation;
  improvements: Improvement[];
};

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
  const { money, t, tr } = useApp();
  const { confirm } = useConfirm();
  const [items, setItems] = useState<Item[]>([]);
  const [totals, setTotals] = useState({
    assetCents: 0,
    liabilityCents: 0,
    netCents: 0,
  });
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
  });

  const cats = t.properties.categories;

  async function load() {
    const data = await api<{
      items: Item[];
      totals: typeof totals;
    }>("/api/properties");
    setItems(data.items);
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
    });
  }

  async function save() {
    try {
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

  const formPreview = valueItem({
    originalCents: amountToCents(form.value || 0),
    acquiredOn: form.acquiredOn || null,
    valueChange: form.valueChange,
    annualRatePercent: parseFloat(form.annualRatePercent) || 0,
    method: form.method,
    usefulLifeYears: form.usefulLifeYears
      ? parseFloat(form.usefulLifeYears)
      : null,
    salvageCents: amountToCents(form.salvage || 0),
  });

  const categoryOptions = form.kind === "asset" ? ASSET_CATS : LIAB_CATS;
  const assets = items.filter((i) => i.kind === "asset");
  const liabilities = items.filter((i) => i.kind === "liability");

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
              <span
                className={`font-display text-lg ${
                  item.kind === "asset" ? "text-emerald-300" : "money-expense"
                }`}
              >
                {money(v?.currentCents ?? item.valueCents)}
              </span>
              {v && v.deltaPercent != null && v.deltaCents !== 0 && (
                <div
                  className={`text-[11px] ${
                    v.deltaCents > 0 ? "text-emerald-300" : "text-amber-200"
                  }`}
                >
                  {tr(t.properties.changeVsOriginal, {
                    sign: v.deltaCents > 0 ? "+" : "",
                    pct: v.deltaPercent.toFixed(1),
                  })}
                </div>
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
