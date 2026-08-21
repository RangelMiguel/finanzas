"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { pesosToCents } from "@/lib/utils";
import { useApp } from "@/components/providers/app-provider";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";
import {
  lineKey,
  suggestProcessingMatches,
  type AdjustableLine,
} from "@/lib/cc-processing-adjust";
import { nextCutoffAfter } from "@/lib/credit-card-cycles";

export type AdjustLine = {
  date: string;
  amountCents: number;
  label: string;
  kind: "purchase" | "msi";
  paymentDue: string;
  planId?: string;
  transactionId?: string;
  billingCutoff?: string | null;
};

export type AdjustCycle = {
  start: string;
  end: string;
  paymentDue: string;
  chargedCents: number;
  lines: AdjustLine[];
};

export type AdjustTarget = {
  cardId: string;
  cardName: string;
  cutoffDay: number;
  cycle: AdjustCycle;
  nextCycle: AdjustCycle | null;
};

function toAdjustable(line: AdjustLine): AdjustableLine | null {
  if (line.kind === "purchase" && !line.transactionId) return null;
  if (line.kind === "msi" && !line.planId) return null;
  return {
    key: lineKey(line),
    kind: line.kind,
    transactionId: line.transactionId,
    planId: line.planId,
    date: line.date,
    amountCents: line.amountCents,
    label: line.label,
  };
}

export function CreditCardAdjustDialog({
  target,
  onClose,
  onAdjusted,
}: {
  target: AdjustTarget | null;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const { t, tr, money } = useApp();
  const rootRef = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [autoFor, setAutoFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => {
    if (!target) {
      return {
        native: [] as AdjustableLine[],
        alreadyMoved: [] as AdjustableLine[],
        fromNext: [] as AdjustableLine[],
      };
    }
    const native: AdjustableLine[] = [];
    for (const line of target.cycle.lines) {
      const item = toAdjustable(line);
      if (item) native.push(item);
    }
    const alreadyMoved: AdjustableLine[] = [];
    const fromNext: AdjustableLine[] = [];
    if (target.nextCycle) {
      for (const line of target.nextCycle.lines) {
        const item = toAdjustable(line);
        if (!item) continue;
        if (line.date >= target.cycle.start && line.date <= target.cycle.end) {
          alreadyMoved.push(item);
        } else {
          fromNext.push(item);
        }
      }
    }
    return { native, alreadyMoved, fromNext };
  }, [target]);

  const actualCents = actual.trim() === "" ? null : pesosToCents(actual);
  const charged = target?.cycle.chargedCents ?? 0;
  const diff =
    actualCents == null ? null : charged - actualCents;

  const suggestions = useMemo(() => {
    if (!target || diff == null || diff === 0) return [];
    if (diff > 0) return suggestProcessingMatches(groups.native, diff);
    const restorePool = [...groups.alreadyMoved, ...groups.fromNext];
    return suggestProcessingMatches(restorePool, -diff);
  }, [target, diff, groups]);

  useEffect(() => {
    if (!target) return;
    setActual("");
    setSelected(new Set());
    setAutoFor(null);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [target]);

  useEffect(() => {
    if (diff == null || diff === 0) return;
    if (autoFor === diff) return;
    const best = suggestions[0];
    if (!best || best.remainderCents !== 0) {
      setAutoFor(diff);
      return;
    }
    setSelected(new Set(best.keys));
    setAutoFor(diff);
  }, [diff, suggestions, autoFor]);

  if (!target) return null;

  const byKey = new Map<string, AdjustableLine>();
  for (const item of [
    ...groups.native,
    ...groups.alreadyMoved,
    ...groups.fromNext,
  ]) {
    byKey.set(item.key, item);
  }

  const selectedItems = [...selected]
    .map((k) => byKey.get(k))
    .filter((x): x is AdjustableLine => !!x);
  const selectedSum = selectedItems.reduce((s, l) => s + l.amountCents, 0);
  const targetGap = diff == null ? 0 : Math.abs(diff);
  const matches = diff != null && diff !== 0 && selectedSum === targetGap;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applySuggestion(keys: string[]) {
    setSelected(new Set(keys));
  }

  async function submit() {
    if (!target) return;
    if (selected.size === 0) {
      toast.error(t.cards.adjustNothing);
      return;
    }
    const alreadyKeys = new Set(groups.alreadyMoved.map((l) => l.key));
    const nextKeys = new Set(groups.fromNext.map((l) => l.key));
    const moves = selectedItems.map((item) => {
      const action = alreadyKeys.has(item.key)
        ? "clear"
        : nextKeys.has(item.key)
          ? "this"
          : "next";
      return {
        kind: item.kind,
        transactionId: item.transactionId,
        planId: item.planId,
        chargeDate: item.kind === "msi" ? item.date : undefined,
        action,
      };
    });
    setSaving(true);
    try {
      await api(`/api/credit-cards/${target.cardId}/adjust-processing`, {
        method: "POST",
        json: { cycleEnd: target.cycle.end, moves },
      });
      toast.success(t.cards.adjustSuccess);
      onAdjusted();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setSaving(false);
    }
  }

  const nextEnd = nextCutoffAfter(target.cycle.end, target.cutoffDay);
  const hasAny =
    groups.native.length +
      groups.alreadyMoved.length +
      groups.fromNext.length >
    0;

  return (
    <div ref={rootRef}>
    <Card premium className="mb-6 border-sky-400/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-sky-200" aria-hidden />
          {t.cards.adjustProcessingTitle} · {target.cardName}
        </CardTitle>
        <p className="mt-1 text-xs text-[var(--fg-faint)]">
          {t.cards.adjustProcessingHint}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm">
            <p className="text-xs text-[var(--fg-faint)]">
              {t.cards.adjustAppCharged}
            </p>
            <p className="mt-0.5 font-display text-lg">{money(charged)}</p>
            <p className="text-xs text-[var(--fg-faint)]">
              {tr(t.cards.cycleRange, {
                start: target.cycle.start,
                end: target.cycle.end,
              })}
            </p>
          </div>
          <div>
            <Label>{t.cards.adjustStatementBalance}</Label>
            <Input
              money
              className="mt-1"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        {diff == null && (
          <p className="text-xs text-[var(--fg-faint)]">
            {t.cards.adjustEnterBalance}
          </p>
        )}
        {diff === 0 && (
          <p className="text-sm text-teal-200">{t.cards.adjustMatch}</p>
        )}
        {diff != null && diff > 0 && (
          <p className="text-sm text-amber-100">
            {tr(t.cards.adjustAppHigher, { amount: money(diff) })}
          </p>
        )}
        {diff != null && diff < 0 && (
          <p className="text-sm text-amber-100">
            {tr(t.cards.adjustAppLower, { amount: money(-diff) })}
          </p>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--fg-faint)]">
              {t.cards.adjustSuggested}
            </p>
            {suggestions.slice(0, 3).map((s) => {
              const labels = s.keys
                .map((k) => byKey.get(k)?.label)
                .filter(Boolean)
                .join(" + ");
              return (
                <button
                  key={s.keys.join("|")}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-sm hover:bg-white/[0.04]"
                  onClick={() => applySuggestion(s.keys)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[var(--fg)]">{labels}</p>
                    <p className="text-xs text-[var(--fg-faint)]">
                      {s.remainderCents === 0
                        ? t.cards.adjustSuggestedExact
                        : tr(t.cards.adjustSuggestedClose, {
                            amount: money(s.remainderCents),
                          })}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-sky-200">
                    {t.cards.adjustUseSuggestion}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!hasAny && (
          <p className="text-sm text-[var(--fg-faint)]">
            {t.cards.adjustNoCandidates}
          </p>
        )}

        {groups.native.length > 0 && (
          <LinePicker
            title={t.cards.pendingPayments}
            lines={groups.native}
            selected={selected}
            onToggle={toggle}
          />
        )}
        {groups.alreadyMoved.length > 0 && (
          <LinePicker
            title={t.cards.adjustAlreadyMoved}
            lines={groups.alreadyMoved}
            selected={selected}
            onToggle={toggle}
          />
        )}
        {diff != null && diff < 0 && groups.fromNext.length > 0 && (
          <LinePicker
            title={`${t.cards.adjustFromNext} · ${nextEnd}`}
            lines={groups.fromNext}
            selected={selected}
            onToggle={toggle}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--fg-muted)]">
            {diff != null && diff !== 0
              ? matches
                ? t.cards.adjustSelectedMatch
                : tr(t.cards.adjustSelected, {
                    selected: money(selectedSum),
                    target: money(targetGap),
                  })
              : selected.size > 0
                ? money(selectedSum)
                : ""}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={submit}
              disabled={saving || selected.size === 0}
            >
              {diff != null && diff < 0
                ? selectedItems.every((i) =>
                    groups.alreadyMoved.some((m) => m.key === i.key)
                  )
                  ? t.cards.adjustRestore
                  : t.cards.adjustPullThis
                : t.cards.adjustMoveNext}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              {t.cancel}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}

function LinePicker({
  title,
  lines,
  selected,
  onToggle,
}: {
  title: string;
  lines: AdjustableLine[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  const { money } = useApp();
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--fg-faint)]">
        {title}
      </p>
      <div className="max-h-64 divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/10">
        {lines.map((line) => {
          const on = selected.has(line.key);
          return (
            <label
              key={line.key}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                on ? "bg-sky-400/10" : "hover:bg-white/[0.03]"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sky-300"
                  checked={on}
                  onChange={() => onToggle(line.key)}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[var(--fg)]">
                    {line.label}
                  </span>
                  <span className="block text-xs text-[var(--fg-faint)]">
                    {line.date}
                    {line.kind === "msi" ? " · MSI" : ""}
                  </span>
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{money(line.amountCents)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
