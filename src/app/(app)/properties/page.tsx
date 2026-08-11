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
import { centsToInput } from "@/lib/utils";
import { toast } from "sonner";

type Kind = "asset" | "liability";

type Item = {
  id: string;
  name: string;
  kind: Kind;
  category: string;
  valueCents: number;
  notes: string | null;
  acquiredOn: string | null;
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

export default function PropertiesPage() {
  const { money, t } = useApp();
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
                  setForm({
                    ...form,
                    kind,
                    category: kind === "asset" ? "home" : "mortgage",
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
                onChange={(e) => setForm({ ...form, category: e.target.value })}
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
}: {
  item: Item;
  categoryLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { money, t } = useApp();
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <div className="font-medium">{item.name}</div>
          <div className="text-xs text-[var(--fg-faint)]">
            {categoryLabel}
            {item.acquiredOn ? ` · ${item.acquiredOn}` : ""}
            {item.notes ? ` · ${item.notes}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`font-display text-lg ${
              item.kind === "asset" ? "text-emerald-300" : "money-expense"
            }`}
          >
            {money(item.valueCents)}
          </span>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            {t.edit}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            {t.delete}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
