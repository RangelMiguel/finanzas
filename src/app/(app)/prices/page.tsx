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
import { useConfirm } from "@/components/providers/confirm-provider";
import { toast } from "sonner";

type Store = { id: string; name: string };
type Quote = {
  storeId: string;
  storeName: string;
  unitCents: number;
  observedOn: string;
};
type Item = {
  id: string;
  name: string;
  unit: string;
  latest: Quote[];
  cheapest: Quote | null;
};
type Txn = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
};
type Purchase = {
  id: string;
  quantity: number;
  paidTotalCents: number;
  purchasedOn: string;
  item: { id: string; name: string; unit: string };
  store: { id: string; name: string };
  transaction: Txn;
  comparison: {
    paidUnitCents: number;
    couldHaveSavedCents: number;
    savedCents: number;
    cheapest: Quote | null;
  };
};
type Totals = {
  spentCents: number;
  couldHaveSavedCents: number;
  savedCents: number;
};

export default function PricesPage() {
  const { money, t, tr } = useApp();
  const { confirm } = useConfirm();
  const [stores, setStores] = useState<Store[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [totals, setTotals] = useState<Totals>({
    spentCents: 0,
    couldHaveSavedCents: 0,
    savedCents: 0,
  });
  const [storeName, setStoreName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemUnit, setItemUnit] = useState("pza");
  const [quote, setQuote] = useState({
    itemId: "",
    storeId: "",
    unitPrice: "",
    observedOn: "",
  });
  const [link, setLink] = useState({
    transactionId: "",
    itemId: "",
    storeId: "",
    quantity: "1",
    paidTotal: "",
  });

  async function load() {
    const data = await api<{
      stores: Store[];
      items: Item[];
      purchases: Purchase[];
      transactions: Txn[];
      totals: Totals;
    }>("/api/prices");
    setStores(data.stores);
    setItems(data.items);
    setPurchases(data.purchases);
    setTxns(data.transactions);
    setTotals(data.totals);
    if (!quote.itemId && data.items[0]) {
      setQuote((q) => ({ ...q, itemId: data.items[0].id }));
    }
    if (!quote.storeId && data.stores[0]) {
      setQuote((q) => ({ ...q, storeId: data.stores[0].id }));
    }
    if (!link.itemId && data.items[0]) {
      setLink((l) => ({ ...l, itemId: data.items[0].id }));
    }
    if (!link.storeId && data.stores[0]) {
      setLink((l) => ({ ...l, storeId: data.stores[0].id }));
    }
  }

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unitLabel = (u: string) =>
    u === "kg"
      ? t.prices.unitKg
      : u === "L"
        ? t.prices.unitL
        : u === "pack"
          ? t.prices.unitPack
          : t.prices.unitPza;

  async function addStore() {
    try {
      await api("/api/prices/stores", {
        method: "POST",
        json: { name: storeName },
      });
      setStoreName("");
      toast.success(t.prices.created);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function seedStores() {
    try {
      await api("/api/prices/stores", { method: "POST", json: { seed: true } });
      toast.success(t.prices.created);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function addItem() {
    try {
      await api("/api/prices/items", {
        method: "POST",
        json: { name: itemName, unit: itemUnit },
      });
      setItemName("");
      toast.success(t.prices.created);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function addQuote() {
    try {
      await api("/api/prices/quotes", {
        method: "POST",
        json: {
          itemId: quote.itemId,
          storeId: quote.storeId,
          unitPrice: quote.unitPrice,
          observedOn: quote.observedOn || null,
        },
      });
      setQuote({ ...quote, unitPrice: "" });
      toast.success(t.prices.quoteAdded);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function linkPurchase() {
    try {
      await api("/api/prices/purchases", {
        method: "POST",
        json: {
          transactionId: link.transactionId,
          itemId: link.itemId,
          storeId: link.storeId,
          quantity: parseFloat(link.quantity) || 1,
          paidTotal: link.paidTotal || undefined,
        },
      });
      toast.success(t.prices.linked);
      setLink({ ...link, paidTotal: "", quantity: "1" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    }
  }

  async function removePurchase(id: string) {
    const ok = await confirm({
      title: t.delete,
      description: t.prices.confirmDelete,
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;
    await api(`/api/prices/purchases?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.prices}
        title={t.prices.title}
        subtitle={t.prices.subtitle}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.prices.totalsSpent}
          </div>
          <div className="mt-1 font-display text-2xl">{money(totals.spentCents)}</div>
        </div>
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.prices.totalsSaved}
          </div>
          <div className="mt-1 font-display text-2xl text-emerald-300">
            {money(totals.savedCents)}
          </div>
        </div>
        <div className="bento-stat">
          <div className="text-[11px] text-[var(--fg-faint)]">
            {t.prices.totalsCould}
          </div>
          <div className="mt-1 font-display text-2xl text-amber-200">
            {money(totals.couldHaveSavedCents)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.prices.stores}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={storeName}
                placeholder={t.prices.storeName}
                onChange={(e) => setStoreName(e.target.value)}
              />
              <Button onClick={addStore}>{t.prices.addStore}</Button>
            </div>
            <Button size="sm" variant="secondary" onClick={seedStores}>
              {t.prices.seedStores}
            </Button>
            {stores.length === 0 && (
              <p className="text-sm text-[var(--fg-faint)]">{t.prices.noStores}</p>
            )}
            <ul className="space-y-1 text-sm">
              {stores.map((s) => (
                <li key={s.id}>{s.name}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.prices.items}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                className="sm:col-span-2"
                value={itemName}
                placeholder={t.prices.itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
              <Select
                value={itemUnit}
                onChange={(e) => setItemUnit(e.target.value)}
              >
                <option value="pza">{t.prices.unitPza}</option>
                <option value="kg">{t.prices.unitKg}</option>
                <option value="L">{t.prices.unitL}</option>
                <option value="pack">{t.prices.unitPack}</option>
              </Select>
            </div>
            <Button onClick={addItem}>{t.prices.addItem}</Button>
            {items.length === 0 && (
              <p className="text-sm text-[var(--fg-faint)]">{t.prices.noItems}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card premium>
        <CardHeader>
          <CardTitle>{t.prices.addQuote}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label>{t.prices.itemName}</Label>
            <Select
              className="mt-1"
              value={quote.itemId}
              onChange={(e) => setQuote({ ...quote, itemId: e.target.value })}
            >
              <option value="">{t.select}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t.prices.stores}</Label>
            <Select
              className="mt-1"
              value={quote.storeId}
              onChange={(e) => setQuote({ ...quote, storeId: e.target.value })}
            >
              <option value="">{t.select}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t.prices.unitPrice}</Label>
            <Input
              money
              className="mt-1"
              value={quote.unitPrice}
              onChange={(e) => setQuote({ ...quote, unitPrice: e.target.value })}
            />
          </div>
          <div>
            <Label>{t.prices.observedOn}</Label>
            <Input
              type="date"
              className="mt-1"
              value={quote.observedOn}
              onChange={(e) => setQuote({ ...quote, observedOn: e.target.value })}
            />
          </div>
          <div>
            <Button onClick={addQuote}>{t.save}</Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="font-display text-xl">{t.prices.latest}</h2>
        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="space-y-2 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-medium">
                  {item.name}{" "}
                  <span className="text-xs text-[var(--fg-faint)]">
                    / {unitLabel(item.unit)}
                  </span>
                </div>
                {item.cheapest && (
                  <div className="text-xs text-emerald-300">
                    {tr(t.prices.cheapest, {
                      store: item.cheapest.storeName,
                      amount: money(item.cheapest.unitCents),
                    })}
                  </div>
                )}
              </div>
              {item.latest.length === 0 && (
                <p className="text-xs text-[var(--fg-faint)]">{t.prices.noQuotes}</p>
              )}
              <div className="grid gap-1 sm:grid-cols-2">
                {item.latest.map((q) => (
                  <div
                    key={q.storeId}
                    className="flex justify-between text-sm text-[var(--fg-muted)]"
                  >
                    <span>{q.storeName}</span>
                    <span>
                      {money(q.unitCents)} · {q.observedOn}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card premium>
        <CardHeader>
          <CardTitle>{t.prices.linkPurchase}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t.prices.pickTxn}</Label>
            <Select
              className="mt-1"
              value={link.transactionId}
              onChange={(e) =>
                setLink({ ...link, transactionId: e.target.value })
              }
            >
              <option value="">{t.select}</option>
              {txns.map((txn) => (
                <option key={txn.id} value={txn.id}>
                  {txn.date} · {txn.description} · {money(txn.amountCents)}
                </option>
              ))}
            </Select>
            {txns.length === 0 && (
              <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
                {t.prices.emptyTxns}
              </p>
            )}
          </div>
          <div>
            <Label>{t.prices.itemName}</Label>
            <Select
              className="mt-1"
              value={link.itemId}
              onChange={(e) => setLink({ ...link, itemId: e.target.value })}
            >
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t.prices.stores}</Label>
            <Select
              className="mt-1"
              value={link.storeId}
              onChange={(e) => setLink({ ...link, storeId: e.target.value })}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t.prices.quantity}</Label>
            <Input
              className="mt-1"
              value={link.quantity}
              onChange={(e) => setLink({ ...link, quantity: e.target.value })}
            />
          </div>
          <div>
            <Label>{t.prices.paidTotal}</Label>
            <Input
              money
              className="mt-1"
              value={link.paidTotal}
              onChange={(e) => setLink({ ...link, paidTotal: e.target.value })}
            />
          </div>
          <div>
            <Button onClick={linkPurchase}>{t.prices.linkPurchase}</Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="font-display text-xl">{t.prices.purchases}</h2>
        {purchases.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div>
                <div className="font-medium">
                  {p.item.name} · {p.store.name}
                </div>
                <div className="text-xs text-[var(--fg-faint)]">
                  {p.purchasedOn} · {p.transaction.description} · {p.quantity}{" "}
                  {unitLabel(p.item.unit)}
                </div>
                <div className="mt-1 text-sm">
                  {tr(t.prices.paidUnit, {
                    amount: money(p.comparison.paidUnitCents),
                    unit: unitLabel(p.item.unit),
                  })}
                </div>
                {p.comparison.savedCents > 0 && (
                  <div className="text-xs text-emerald-300">
                    {tr(t.prices.saved, { amount: money(p.comparison.savedCents) })}
                  </div>
                )}
                {p.comparison.couldHaveSavedCents > 0 && p.comparison.cheapest && (
                  <div className="text-xs text-amber-200">
                    {tr(t.prices.couldSave, {
                      amount: money(p.comparison.couldHaveSavedCents),
                      store: p.comparison.cheapest.storeName,
                    })}
                  </div>
                )}
                {!p.comparison.cheapest && (
                  <div className="text-xs text-[var(--fg-faint)]">
                    {t.prices.noCompare}
                  </div>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => removePurchase(p.id)}>
                {t.delete}
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
