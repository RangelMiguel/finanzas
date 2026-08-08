"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { api } from "@/lib/api-client";
import { amountToCents, centsToInput } from "@/lib/utils";
import { useApp } from "@/components/providers/app-provider";
import type { CarryoverJson, CloseLineInput } from "@/lib/budget-math";
import { Plus, Trash2, X } from "lucide-react";

export type CloseLine = {
  categoryId: string;
  categoryName: string;
  icon: string;
  amountCents: number;
  emergencyCents: number;
  spentCents: number;
  remainingCents: number;
};

export type CloseStatus = {
  period: string;
  toPeriod: string;
  bounds: { start: string; end: string };
  closed: boolean;
  closedAt: string | null;
  canClose: boolean;
  canUndo: boolean;
  tooEarly: boolean;
  isStale: boolean;
  defaultKind: "emergency" | "spent";
  carryovers: CloseLine[];
  totalRemainingCents: number;
  applied: CarryoverJson[] | null;
  appliedSummary: {
    emergencyCents: number;
    goalCents: number;
    spentCents: number;
    movedCents: number;
  } | null;
};

type GoalOpt = { id: string; name: string; icon: string; status: string };
type CatOpt = { id: string; name: string; icon: string };

type UiKind = "emergency" | "emergency_other" | "goal" | "spent";
type SplitRow = {
  kind: UiKind;
  amount: string;
  categoryId: string;
  goalId: string;
};

type Preset = "emergency" | "spent" | "custom";

export function BudgetCloseDialog({
  open,
  close,
  categories,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  close: CloseStatus;
  categories: CatOpt[];
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (body: {
    defaultKind?: "emergency" | "spent";
    lines?: CloseLineInput[];
  }) => void;
}) {
  const { money, t, tr } = useApp();
  const [preset, setPreset] = useState<Preset>(close.defaultKind);
  const [splits, setSplits] = useState<Record<string, SplitRow[]>>({});
  const [goals, setGoals] = useState<GoalOpt[]>([]);
  const [goalsOk, setGoalsOk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPreset(close.defaultKind);
    setSplits(initialSplits(close));
    let cancelled = false;
    api<{ goals: GoalOpt[] }>("/api/goals?status=active")
      .then((res) => {
        if (cancelled) return;
        setGoals((res.goals || []).filter((g) => g.status === "active"));
        setGoalsOk(true);
      })
      .catch(() => {
        if (cancelled) return;
        setGoals([]);
        setGoalsOk(false);
      });
    return () => {
      cancelled = true;
    };
    // close.carryovers is a fresh array each render; period/defaultKind is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close.period, close.defaultKind]);

  const leftover = close.carryovers;
  const issues = useMemo(() => {
    if (preset !== "custom") return [];
    return leftover
      .map((line) => {
        const rows = splits[line.categoryId] || [];
        const sum = rows.reduce((s, r) => s + amountToCents(r.amount), 0);
        const delta = sum - line.remainingCents;
        return { categoryId: line.categoryId, delta };
      })
      .filter((x) => x.delta !== 0);
  }, [preset, leftover, splits]);

  if (!open) return null;

  function updateSplit(catId: string, idx: number, patch: Partial<SplitRow>) {
    setSplits((prev) => {
      const rows = [...(prev[catId] || [])];
      rows[idx] = { ...rows[idx], ...patch };
      return { ...prev, [catId]: rows };
    });
  }

  function addSplit(line: CloseLine) {
    const rows = splits[line.categoryId] || [];
    const used = rows.reduce((s, r) => s + amountToCents(r.amount), 0);
    const leftoverCents = Math.max(0, line.remainingCents - used);
    setSplits((prev) => ({
      ...prev,
      [line.categoryId]: [
        ...(prev[line.categoryId] || []),
        {
          kind: "spent",
          amount: centsToInput(leftoverCents),
          categoryId: line.categoryId,
          goalId: goals[0]?.id || "",
        },
      ],
    }));
  }

  function removeSplit(catId: string, idx: number) {
    setSplits((prev) => {
      const rows = [...(prev[catId] || [])];
      if (rows.length <= 1) return prev;
      rows.splice(idx, 1);
      return { ...prev, [catId]: rows };
    });
  }

  function submit() {
    if (leftover.length === 0 || preset !== "custom") {
      onConfirm({
        defaultKind: preset === "custom" ? close.defaultKind : preset,
      });
      return;
    }
    if (issues.length) return;
    const lines: CloseLineInput[] = leftover.map((line) => ({
      categoryId: line.categoryId,
      allocations: (splits[line.categoryId] || []).map((row) => ({
        kind: row.kind === "emergency_other" ? "emergency" : row.kind,
        amount: row.amount,
        ...(row.kind === "emergency" || row.kind === "emergency_other"
          ? {
              categoryId:
                row.kind === "emergency_other"
                  ? row.categoryId
                  : line.categoryId,
            }
          : {}),
        ...(row.kind === "goal" ? { goalId: row.goalId } : {}),
      })),
    }));
    onConfirm({ lines });
  }

  const canSubmit =
    leftover.length === 0 ||
    preset !== "custom" ||
    (issues.length === 0 &&
      leftover.every((line) =>
        (splits[line.categoryId] || []).every((row) => {
          if (amountToCents(row.amount) <= 0) return true;
          if (row.kind === "goal") return Boolean(row.goalId);
          if (row.kind === "emergency_other") return Boolean(row.categoryId);
          return true;
        })
      ));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={t.cancel}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[1] flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--surface)] shadow-2xl ring-1 ring-white/5"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-display text-lg text-[var(--fg)]">
              {tr(t.budgets.closeDialogTitle, { period: close.period })}
            </h2>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              {close.isStale
                ? t.budgets.closePeriodReadyStale
                : tr(t.budgets.closePeriodReady, { next: close.toPeriod })}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-[var(--fg-faint)] hover:bg-white/10 hover:text-[var(--fg)]"
            onClick={onCancel}
            aria-label={t.cancel}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {close.isStale && (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-50">
              {t.budgets.staleBanner}
            </p>
          )}

          {leftover.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">
              {t.budgets.closeNothing}
            </p>
          ) : (
            <>
              <div>
                <Label>{t.budgets.presetLabel}</Label>
                <div className="mt-2 grid gap-2">
                  {(
                    (close.isStale
                      ? (["spent", "emergency", "custom"] as const)
                      : (["emergency", "spent", "custom"] as const)
                    ).map((id) => {
                      const label =
                        id === "spent"
                          ? t.budgets.presetSpent
                          : id === "emergency"
                            ? t.budgets.presetEmergency
                            : t.budgets.presetCustom;
                      const hint =
                        id === "spent"
                          ? t.budgets.presetSpentHint
                          : id === "emergency"
                            ? tr(t.budgets.presetEmergencyHint, {
                                next: close.toPeriod,
                              })
                            : t.budgets.presetCustomHint;
                      return [id, label, hint] as const;
                    })
                  ).map(([id, label, hint]) => (
                    <label
                      key={id}
                      className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                        preset === id
                          ? "border-[var(--accent)]/40 bg-[var(--accent)]/10"
                          : "border-white/10 bg-black/20"
                      }`}
                    >
                      <input
                        type="radio"
                        name="close-preset"
                        className="mt-1"
                        checked={preset === id}
                        onChange={() => {
                          setPreset(id);
                          if (id !== "custom") setSplits(initialSplits(close));
                        }}
                      />
                      <span>
                        <span className="font-medium text-[var(--fg)]">
                          {label}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--fg-faint)]">
                          {hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <ul className="grid gap-1.5 sm:grid-cols-2">
                {leftover.map((line) => (
                  <li
                    key={line.categoryId}
                    className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm"
                  >
                    <span>
                      {line.icon} {line.categoryName}
                    </span>
                    <span className="text-amber-100">
                      {money(line.remainingCents)}
                    </span>
                  </li>
                ))}
              </ul>

              {preset === "custom" && (
                <div className="space-y-4">
                  {leftover.map((line) => {
                    const rows = splits[line.categoryId] || [];
                    const sum = rows.reduce(
                      (s, r) => s + amountToCents(r.amount),
                      0
                    );
                    const delta = sum - line.remainingCents;
                    return (
                      <div
                        key={line.categoryId}
                        className="rounded-2xl border border-white/10 bg-black/20 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="font-medium">
                            {line.icon} {line.categoryName}
                          </span>
                          <span className="text-[var(--fg-muted)]">
                            {money(line.remainingCents)}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {rows.map((row, idx) => (
                            <div
                              key={idx}
                              className="grid gap-2 sm:grid-cols-[7rem_1fr_auto]"
                            >
                              <Input
                                money
                                value={row.amount}
                                onChange={(e) =>
                                  updateSplit(line.categoryId, idx, {
                                    amount: e.target.value,
                                  })
                                }
                                aria-label={t.amount}
                              />
                              <div className="space-y-2">
                                <Select
                                  value={row.kind}
                                  onChange={(e) =>
                                    updateSplit(line.categoryId, idx, {
                                      kind: e.target.value as UiKind,
                                    })
                                  }
                                >
                                  <option value="emergency">
                                    {tr(t.budgets.allocEmergencySame, {
                                      next: close.toPeriod,
                                    })}
                                  </option>
                                  <option value="emergency_other">
                                    {tr(t.budgets.allocEmergencyOther, {
                                      next: close.toPeriod,
                                    })}
                                  </option>
                                  {goalsOk && (
                                    <option value="goal">
                                      {t.budgets.allocGoal}
                                    </option>
                                  )}
                                  <option value="spent">
                                    {t.budgets.allocSpent}
                                  </option>
                                </Select>
                                {row.kind === "emergency_other" && (
                                  <Select
                                    value={row.categoryId}
                                    onChange={(e) =>
                                      updateSplit(line.categoryId, idx, {
                                        categoryId: e.target.value,
                                      })
                                    }
                                    aria-label={t.budgets.destCategory}
                                  >
                                    <option value="">{t.select}</option>
                                    {categories.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.icon} {c.name}
                                      </option>
                                    ))}
                                  </Select>
                                )}
                                {row.kind === "goal" && (
                                  <Select
                                    value={row.goalId}
                                    onChange={(e) =>
                                      updateSplit(line.categoryId, idx, {
                                        goalId: e.target.value,
                                      })
                                    }
                                    aria-label={t.budgets.destGoal}
                                  >
                                    <option value="">{t.select}</option>
                                    {goals.map((g) => (
                                      <option key={g.id} value={g.id}>
                                        {g.icon} {g.name}
                                      </option>
                                    ))}
                                  </Select>
                                )}
                                {row.kind === "goal" && goals.length === 0 && (
                                  <p className="text-[11px] text-[var(--fg-faint)]">
                                    {t.budgets.noGoals}
                                  </p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={rows.length <= 1}
                                onClick={() =>
                                  removeSplit(line.categoryId, idx)
                                }
                                aria-label={t.budgets.splitRemove}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => addSplit(line)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t.budgets.splitAdd}
                          </Button>
                          {delta < 0 && (
                            <span className="text-xs text-amber-200">
                              {tr(t.budgets.allocUnassigned, {
                                amount: money(-delta),
                              })}
                            </span>
                          )}
                          {delta > 0 && (
                            <span className="text-xs text-rose-300">
                              {tr(t.budgets.allocOver, {
                                amount: money(delta),
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" disabled={loading} onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button disabled={loading || !canSubmit} onClick={submit}>
            {t.budgets.closeDialogSubmit}
          </Button>
        </div>
      </div>
    </div>
  );
}

function initialSplits(close: CloseStatus): Record<string, SplitRow[]> {
  const kind: UiKind = close.defaultKind === "spent" ? "spent" : "emergency";
  const out: Record<string, SplitRow[]> = {};
  for (const line of close.carryovers) {
    out[line.categoryId] = [
      {
        kind,
        amount: centsToInput(line.remainingCents),
        categoryId: line.categoryId,
        goalId: "",
      },
    ];
  }
  return out;
}
