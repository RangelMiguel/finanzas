"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { todayISO } from "@/lib/utils";
import { useApp } from "@/components/providers/app-provider";

type CardT = { id: string; name: string };
type Cat = { id: string; name: string; type: string };
type DetectedMSI = {
  description: string;
  totalAmount: string;
  months: string;
  monthlyAmount: string;
  selected: boolean;
};

export default function ImportStatementPage() {
  const { t, tr } = useApp();
  const [text, setText] = useState("");
  const [items, setItems] = useState<DetectedMSI[]>([]);
  const [cards, setCards] = useState<CardT[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [cardId, setCardId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [engineInfo, setEngineInfo] = useState<{
    engine: string;
    provider?: string;
    model?: string;
    llmAvailable?: boolean;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ creditCards: CardT[] }>("/api/credit-cards"),
      api<{ categories: Cat[] }>("/api/categories"),
      api<{ enabled: boolean; provider: string | null; model: string | null }>(
        "/api/ai/status"
      ).catch(() => ({ enabled: false, provider: null, model: null })),
    ]).then(([c, cat, ai]) => {
      setCards(c.creditCards);
      setCategories(cat.categories.filter((x) => x.type === "expense"));
      if (c.creditCards[0]) setCardId(c.creditCards[0].id);
      setEngineInfo({
        engine: ai.enabled ? "llm-ready" : "rules",
        provider: ai.provider || undefined,
        model: ai.model || undefined,
        llmAvailable: ai.enabled,
      });
    });
  }, []);

  async function analyze(raw?: string) {
    const payload = (raw ?? text).trim();
    if (!payload) return;
    setLoading(true);
    try {
      const res = await api<{
        items: DetectedMSI[];
        engine: string;
        provider?: string;
        model?: string;
        llmAvailable?: boolean;
        llmError?: string | null;
      }>("/api/statements/parse", {
        method: "POST",
        json: { text: payload },
      });
      setItems(res.items.map((i) => ({ ...i, selected: i.selected !== false })));
      setEngineInfo({
        engine: res.engine,
        provider: res.provider,
        model: res.model,
        llmAvailable: res.llmAvailable,
      });
      if (res.items.length === 0) {
        toast.error(t.statement.noneFound);
      } else {
        const label =
          res.engine === "llm"
            ? `AI (${res.provider || "llm"}) · ${res.items.length}`
            : tr(t.statement.detected, { n: res.items.length });
        toast.success(label);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  async function onFile(file: File) {
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        const data = new Uint8Array(await file.arrayBuffer());
        const doc = await pdfjs.getDocument({ data }).promise;
        let full = "";
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          full +=
            content.items.map((it) => ("str" in it ? it.str : "")).join(" ") +
            "\n";
        }
        setText(full);
        await analyze(full);
      } catch (e) {
        toast.error(t.statement.noneFound);
        console.error(e);
      }
    } else {
      const content = await file.text();
      setText(content);
      await analyze(content);
    }
  }

  async function importSelected() {
    const selected = items.filter((i) => i.selected);
    if (selected.length === 0) {
      toast.error(t.statement.selectCard);
      return;
    }
    if (!cardId) {
      toast.error(t.statement.selectCard);
      return;
    }
    setLoading(true);
    try {
      for (const item of selected) {
        await api("/api/installments", {
          method: "POST",
          json: {
            description: item.description || "MSI",
            totalAmount: item.totalAmount,
            months: parseInt(item.months, 10),
            creditCardId: cardId,
            categoryId: categoryId || null,
            startDate: todayISO(),
          },
        });
        await api("/api/transactions", {
          method: "POST",
          json: {
            description: item.description || "MSI",
            amount: item.totalAmount,
            type: "expense",
            creditCardId: cardId,
            categoryId: categoryId || null,
            msiMonths: parseInt(item.months, 10),
          },
        });
      }
      toast.success(tr(t.statement.detected, { n: selected.length }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t.nav.importStatement}
        title={t.statement.title}
        subtitle={t.statement.subtitle}
      />
      {engineInfo && (
        <p className="text-xs text-[var(--fg-faint)]">
          Engine:{" "}
          <span className="text-teal-200">
            {engineInfo.engine === "llm"
              ? `LLM (${engineInfo.provider || "?"}${
                  engineInfo.model ? " · " + engineInfo.model : ""
                })`
              : engineInfo.llmAvailable
                ? "rules (LLM available)"
                : "rules"}
          </span>
          {!engineInfo.llmAvailable && (
            <span> · set XAI_API_KEY or GEMINI_API_KEY for AI extraction</span>
          )}
        </p>
      )}

      <Card premium>
        <CardHeader>
          <CardTitle>{t.statement.fileOrText}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="stmt-file">{t.statement.pdfOrText}</Label>
            <Input
              id="stmt-file"
              type="file"
              accept=".pdf,.txt,text/plain,application/pdf"
              className="mt-1"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </div>
          <div>
            <Label htmlFor="stmt-text">{t.statement.editableText}</Label>
            <textarea
              id="stmt-text"
              className="mt-1 min-h-[140px] w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-[var(--fg)]"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t.statement.placeholder}
            />
          </div>
          <Button onClick={() => analyze()} disabled={loading || !text.trim()}>
            {loading ? t.loading : t.statement.detect}
          </Button>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card premium>
          <CardHeader>
            <CardTitle>
              {tr(t.statement.detected, { n: items.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{t.statement.assignCard}</Label>
                <Select
                  className="mt-1"
                  value={cardId}
                  onChange={(e) => setCardId(e.target.value)}
                >
                  <option value="">{t.statement.selectCard}</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t.category}</Label>
                <Select
                  className="mt-1"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">{t.none}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {items.map((item, i) => (
              <label
                key={i}
                className="flex items-start gap-3 rounded-xl border border-white/10 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = { ...item, selected: e.target.checked };
                    setItems(next);
                  }}
                />
                <div>
                  <div className="font-medium">{item.description}</div>
                  <div className="text-xs text-[var(--fg-faint)]">
                    {tr(t.statement.totalMonths, {
                      total: item.totalAmount,
                      months: item.months,
                      monthly: item.monthlyAmount,
                    })}
                  </div>
                </div>
              </label>
            ))}
            <Button onClick={importSelected} disabled={loading}>
              {t.statement.importSelected}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
