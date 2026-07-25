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
import { toast } from "sonner";
import { ocrTicketImage } from "@/lib/ticket-parse";
import { todayISO } from "@/lib/utils";
import { sourceKey } from "@/lib/transaction-funding";
import { Receipt, ScanLine, CheckSquare, Square } from "lucide-react";

type Item = {
  description: string;
  amount: number;
  quantity: number;
  unitPrice: number;
  categoryId: string | null;
  categoryName?: string | null;
  categoryIcon?: string;
  selected: boolean;
};
type Cat = { id: string; name: string; icon: string; type: string };
type Acc = { id: string; name: string };
type CardT = { id: string; name: string };

const SAMPLE = `OXXO STORE CENTRO
Fecha: 15/03/2026
COCA COLA 600ML        18.50
PAN BIMBO BLANCO       42.00
2 x AGUA CIEL 1L       30.00
SABRITAS ORIGINALES    18.00
LECHE LALA 1L          28.90
SUBTOTAL              137.40
IVA                    21.98
TOTAL                 159.38
GRACIAS POR SU COMPRA`;

export default function TicketsPage() {
  const { t, tr, money } = useApp();
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [accounts, setAccounts] = useState<Acc[]>([]);
  const [cards, setCards] = useState<CardT[]>([]);
  const [merchant, setMerchant] = useState("");
  const [ticketTotal, setTicketTotal] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [paymentSource, setPaymentSource] = useState("");
  const [ocrPct, setOcrPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [engineInfo, setEngineInfo] = useState<{
    engine: string;
    provider?: string | null;
    model?: string | null;
    llmAvailable?: boolean;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ categories: Cat[] }>("/api/categories"),
      api<{ accounts: Acc[] }>("/api/accounts"),
      api<{ creditCards: CardT[] }>("/api/credit-cards"),
    ]).then(([c, a, cc]) => {
      setCategories(c.categories.filter((x) => x.type === "expense"));
      setAccounts(a.accounts);
      setCards(cc.creditCards);
      if (a.accounts[0]) setPaymentSource(sourceKey("account", a.accounts[0].id));
      else if (cc.creditCards[0])
        setPaymentSource(sourceKey("card", cc.creditCards[0].id));
    });
  }, []);

  async function parse(raw?: string) {
    const payload = raw ?? text;
    if (!payload.trim()) return;
    setLoading(true);
    try {
      const res = await api<{
        items: Item[];
        merchant: string | null;
        total: number | null;
        date: string | null;
        categories: Cat[];
        engine?: string;
        provider?: string | null;
        model?: string | null;
        llmAvailable?: boolean;
      }>("/api/tickets/parse", { method: "POST", json: { text: payload } });
      setItems(
        res.items.map((i) => ({
          ...i,
          selected: true,
          categoryId: i.categoryId || null,
        }))
      );
      if (res.merchant) setMerchant(res.merchant);
      setTicketTotal(res.total);
      if (res.date) setDate(res.date);
      if (res.categories?.length) setCategories(res.categories);
      setEngineInfo({
        engine: res.engine || "rules",
        provider: res.provider,
        model: res.model,
        llmAvailable: res.llmAvailable,
      });
      if (!res.items.length) toast.message(t.tickets.noItems);
      else if (res.engine === "llm") {
        toast.success(
          `AI (${res.provider || "llm"}${res.model ? " · " + res.model : ""})`
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  async function onImage(file: File) {
    setOcrPct(0);
    try {
      const raw = await ocrTicketImage(file, setOcrPct);
      setText(raw);
      await parse(raw);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setOcrPct(null);
    }
  }

  async function importSelected() {
    const selected = items.filter((i) => i.selected);
    if (!selected.length) {
      toast.error(t.tickets.noItems);
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ created: number }>("/api/tickets/import", {
        method: "POST",
        json: {
          paymentSource: paymentSource || null,
          date,
          merchant: merchant || null,
          items: selected.map((i) => ({
            description: i.description,
            amount: i.amount,
            categoryId: i.categoryId,
            selected: true,
          })),
        },
      });
      toast.success(tr(t.tickets.imported, { n: res.created }));
      setItems([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  const selectedSum = items
    .filter((i) => i.selected)
    .reduce((s, i) => s + Math.round(i.amount * 100), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.tickets}
        title={t.tickets.title}
        subtitle={t.tickets.subtitle}
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setText(SAMPLE);
              parse(SAMPLE);
            }}
          >
            {t.tickets.sample}
          </Button>
        }
      />
      {engineInfo && (
        <p className="text-xs text-[var(--fg-faint)]">
          Engine:{" "}
          <span className="text-teal-200">
            {engineInfo.engine === "llm"
              ? `LLM (${engineInfo.provider || "?"}${
                  engineInfo.model ? " · " + engineInfo.model : ""
                })`
              : "rules / OCR"}
          </span>
          {!engineInfo.llmAvailable && (
            <span> · set XAI_API_KEY or GEMINI_API_KEY for AI extraction</span>
          )}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card premium className="noise-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-teal-300" />
              {t.tickets.paste}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-[var(--fg-faint)]">{t.tickets.pasteHint}</p>
            <div>
              <Label htmlFor="ticket-img">{t.tickets.upload}</Label>
              <Input
                id="ticket-img"
                type="file"
                accept="image/*"
                className="mt-1"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImage(f);
                }}
              />
              {ocrPct != null && (
                <p className="mt-1 text-xs text-teal-200">
                  {tr(t.tickets.ocrProgress, { n: ocrPct })}
                </p>
              )}
            </div>
            <textarea
              className="min-h-[200px] w-full rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-[var(--fg)]"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t.tickets.pasteHint}
            />
            <Button onClick={() => parse()} disabled={loading || !text.trim()}>
              <Receipt className="h-4 w-4" />
              {t.tickets.parse}
            </Button>
          </CardContent>
        </Card>

        <Card premium>
          <CardHeader>
            <CardTitle>{t.tickets.review}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t.tickets.merchant}</Label>
              <Input
                className="mt-1"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
              />
            </div>
            <div>
              <Label>{t.tickets.ticketDate}</Label>
              <Input
                type="date"
                className="mt-1"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{t.transactions.paidWith}</Label>
              <Select
                className="mt-1"
                value={paymentSource}
                onChange={(e) => setPaymentSource(e.target.value)}
              >
                <option value="">{t.select}</option>
                {accounts.length > 0 && (
                  <optgroup label={t.transactions.sourceAccounts}>
                    {accounts.map((a) => (
                      <option key={a.id} value={sourceKey("account", a.id)}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {cards.length > 0 && (
                  <optgroup label={t.transactions.sourceCards}>
                    {cards.map((c) => (
                      <option key={c.id} value={sourceKey("card", c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </div>
            {ticketTotal != null && (
              <p className="sm:col-span-2 text-sm text-[var(--fg-muted)]">
                {t.tickets.ticketTotal}:{" "}
                <span className="font-display text-lg text-teal-100">
                  {money(Math.round(ticketTotal * 100))}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {items.length > 0 && (
        <Card premium>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>
              {t.tickets.items} ({items.filter((i) => i.selected).length}/
              {items.length})
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setItems((list) => list.map((i) => ({ ...i, selected: true })))
                }
              >
                <CheckSquare className="h-3.5 w-3.5" />
                {t.tickets.selectAll}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setItems((list) => list.map((i) => ({ ...i, selected: false })))
                }
              >
                <Square className="h-3.5 w-3.5" />
                {t.tickets.selectNone}
              </Button>
              <Button onClick={importSelected} disabled={loading}>
                {t.tickets.import} · {money(selectedSum)}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((item, idx) => (
              <div
                key={idx}
                className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-12 ${
                  item.selected
                    ? "border-teal-400/25 bg-teal-400/5"
                    : "border-white/10 opacity-60"
                }`}
              >
                <label className="flex items-center gap-2 sm:col-span-1">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(e) =>
                      setItems((list) =>
                        list.map((x, i) =>
                          i === idx ? { ...x, selected: e.target.checked } : x
                        )
                      )
                    }
                  />
                </label>
                <Input
                  className="sm:col-span-4"
                  value={item.description}
                  onChange={(e) =>
                    setItems((list) =>
                      list.map((x, i) =>
                        i === idx ? { ...x, description: e.target.value } : x
                      )
                    )
                  }
                />
                <Input
                  className="sm:col-span-2"
                  type="number"
                  step="0.01"
                  value={item.amount}
                  onChange={(e) =>
                    setItems((list) =>
                      list.map((x, i) =>
                        i === idx
                          ? { ...x, amount: parseFloat(e.target.value) || 0 }
                          : x
                      )
                    )
                  }
                />
                <Select
                  className="sm:col-span-4"
                  value={item.categoryId || ""}
                  onChange={(e) =>
                    setItems((list) =>
                      list.map((x, i) =>
                        i === idx ? { ...x, categoryId: e.target.value || null } : x
                      )
                    )
                  }
                >
                  <option value="">{t.none}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </Select>
                <div className="text-xs text-[var(--fg-faint)] sm:col-span-1 self-center">
                  {item.quantity > 1 ? `×${item.quantity}` : ""}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {items.length === 0 && text && !loading && (
        <p className="text-sm text-[var(--fg-faint)]">{t.tickets.noItems}</p>
      )}
    </div>
  );
}
