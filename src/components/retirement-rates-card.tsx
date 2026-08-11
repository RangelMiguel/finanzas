"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useApp } from "@/components/providers/app-provider";
import { api } from "@/lib/api-client";
import {
  MARKET_COUNTRIES,
  MARKET_INSTRUMENTS,
  formatRatePercent,
  groupInstrumentsByCategory,
  instrumentsForCountry,
  loc,
  nextMonthKey,
  realToNominal,
  type MarketCountryId,
  type MarketInstrument,
} from "@/lib/market-instruments";

type Props = {
  inflationPercent: number;
  onApplyPre: (percent: number) => void;
  onApplyPost: (percent: number) => void;
  onApplyInflation: (percent: number) => void;
};

export function RetirementRatesCard({
  inflationPercent,
  onApplyPre,
  onApplyPost,
  onApplyInflation,
}: Props) {
  const { t, tr, locale } = useApp();
  const lang = locale === "en" ? "en" : "es";
  const [countryId, setCountryId] = useState<MarketCountryId>("MX");
  const [instrumentId, setInstrumentId] = useState("");
  const [instruments, setInstruments] =
    useState<MarketInstrument[]>(MARKET_INSTRUMENTS);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<{
      instruments: MarketInstrument[];
      fetchedAt: string;
      monthKey: string;
    }>("/api/retirement/rates")
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.instruments) && data.instruments.length) {
          setInstruments(data.instruments);
        }
        if (data.fetchedAt) setFetchedAt(data.fetchedAt);
        if (data.monthKey) setMonthKey(data.monthKey);
      })
      .catch(() => {
        /* keep bundled snapshot */
      })
      .finally(() => {
        if (!cancelled) setLoadingRates(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const countryInstruments = useMemo(
    () => instrumentsForCountry(countryId, instruments),
    [countryId, instruments]
  );
  const groups = useMemo(
    () => groupInstrumentsByCategory(countryInstruments),
    [countryInstruments]
  );
  const selected = countryInstruments.find((i) => i.id === instrumentId) ?? null;

  function applyRate(
    inst: MarketInstrument,
    target: "pre" | "post" | "inflation"
  ) {
    if (target === "inflation" || inst.appliesTo === "inflation") {
      onApplyInflation(inst.annualRatePercent);
      toast.success(
        tr(t.retirement.rates.appliedInflation, {
          pct: formatRatePercent(inst.annualRatePercent),
        })
      );
      return;
    }

    const used =
      inst.rateKind === "real"
        ? realToNominal(inst.annualRatePercent, inflationPercent)
        : inst.annualRatePercent;
    const pct = formatRatePercent(used);
    if (target === "pre") onApplyPre(used);
    else onApplyPost(used);
    toast.success(
      inst.rateKind === "real"
        ? tr(t.retirement.rates.realAppliedAs, { pct })
        : tr(
            target === "pre"
              ? t.retirement.rates.appliedPre
              : t.retirement.rates.appliedPost,
            { pct }
          )
    );
  }

  function formatAsOf(iso: string) {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(
      lang === "en" ? "en-US" : "es-MX",
      { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }
    );
  }

  function formatMonthKey(key: string) {
    const next = nextMonthKey(key);
    const [y, m] = next.split("-").map(Number);
    if (!y || !m) return next;
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(
      lang === "en" ? "en-US" : "es-MX",
      { month: "long", year: "numeric", timeZone: "UTC" }
    );
  }

  return (
    <Card premium>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          {t.retirement.rates.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-[var(--fg-muted)]">
          {t.retirement.rates.subtitle}
        </p>
        <p className="text-[11px] text-[var(--fg-faint)]">
          {loadingRates
            ? t.retirement.rates.refreshing
            : fetchedAt
              ? tr(t.retirement.rates.lastRefresh, {
                  date: formatAsOf(fetchedAt.slice(0, 10)),
                })
              : t.retirement.rates.usingBundled}
          {monthKey
            ? ` · ${tr(t.retirement.rates.nextRefresh, {
                month: formatMonthKey(monthKey),
              })}`
            : ""}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t.retirement.rates.country}</Label>
            <Select
              className="mt-1"
              value={countryId}
              onChange={(e) => {
                setCountryId(e.target.value as MarketCountryId);
                setInstrumentId("");
              }}
            >
              {MARKET_COUNTRIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {loc(c.name, lang)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t.retirement.rates.instrument}</Label>
            <Select
              className="mt-1"
              value={instrumentId}
              onChange={(e) => {
                const nextId = e.target.value;
                setInstrumentId(nextId);
                const next = instruments.find((i) => i.id === nextId);
                if (next) setCountryId(next.countryId);
              }}
            >
              <option value="">{t.retirement.rates.pickInstrument}</option>
              {MARKET_COUNTRIES.map((c) => (
                <optgroup key={c.id} label={loc(c.name, lang)}>
                  {instrumentsForCountry(c.id, instruments).map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {loc(inst.name, lang)} —{" "}
                      {formatRatePercent(inst.annualRatePercent)}%
                      {inst.rateKind === "real"
                        ? ` (${t.retirement.rates.realShort})`
                        : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        </div>

        {selected && (
          <div className="flex flex-col gap-3 rounded-xl border border-teal-500/20 bg-teal-500/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">{loc(selected.name, lang)}</div>
              <div className="mt-0.5 font-display text-2xl text-[var(--accent)]">
                {formatRatePercent(selected.annualRatePercent)}%
                {selected.rateKind === "real" && (
                  <span className="ml-2 text-xs font-sans font-normal text-[var(--fg-muted)]">
                    {t.retirement.rates.realRate}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-[var(--fg-faint)]">
                {tr(t.retirement.rates.asOf, {
                  date: formatAsOf(selected.asOf),
                })}
                {" · "}
                {tr(t.retirement.rates.source, {
                  source: loc(selected.source, lang),
                })}
              </p>
            </div>
            <ApplyButtons
              inst={selected}
              labels={t.retirement.rates}
              onApply={applyRate}
            />
          </div>
        )}

        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.category}>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
                {t.retirement.rates.categories[group.category]}
              </div>
              <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
                {group.items.map((inst) => {
                  const active = inst.id === instrumentId;
                  return (
                    <div
                      key={inst.id}
                      className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${
                        active ? "bg-teal-500/10" : "bg-black/20"
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => setInstrumentId(inst.id)}
                      >
                        <div className="text-sm">{loc(inst.name, lang)}</div>
                        <div className="text-[11px] text-[var(--fg-faint)]">
                          {tr(t.retirement.rates.asOf, {
                            date: formatAsOf(inst.asOf),
                          })}
                          {" · "}
                          {loc(inst.source, lang)}
                        </div>
                      </button>
                      <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                        <div className="text-right">
                          <div className="font-display text-lg tabular-nums">
                            {formatRatePercent(inst.annualRatePercent)}%
                          </div>
                          {inst.rateKind === "real" && (
                            <div className="text-[10px] text-[var(--fg-faint)]">
                              {t.retirement.rates.realShort}
                            </div>
                          )}
                        </div>
                        <ApplyButtons
                          inst={inst}
                          labels={t.retirement.rates}
                          onApply={applyRate}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] leading-snug text-[var(--fg-faint)]">
          {t.retirement.rates.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}

function ApplyButtons({
  inst,
  labels,
  onApply,
}: {
  inst: MarketInstrument;
  labels: {
    applyPre: string;
    applyPost: string;
    applyInflation: string;
  };
  onApply: (
    inst: MarketInstrument,
    target: "pre" | "post" | "inflation"
  ) => void;
}) {
  if (inst.appliesTo === "inflation") {
    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => onApply(inst, "inflation")}
      >
        {labels.applyInflation}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => onApply(inst, "pre")}
      >
        {labels.applyPre}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => onApply(inst, "post")}
      >
        {labels.applyPost}
      </Button>
    </div>
  );
}
