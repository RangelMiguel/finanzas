"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { centsToInput } from "@/lib/utils";
import { useApp } from "@/components/providers/app-provider";
import { Target, X } from "lucide-react";

type GoalOpt = { id: string; name: string; icon: string; status: string };

export function BudgetToGoalDialog({
  open,
  categoryName,
  remainingCents,
  loading,
  defaultGoalId,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  categoryName: string;
  remainingCents: number;
  loading?: boolean;
  defaultGoalId?: string;
  onCancel: () => void;
  onConfirm: (body: { goalId: string; amount: string; notes?: string }) => void;
}) {
  const { money, t } = useApp();
  const [goals, setGoals] = useState<GoalOpt[]>([]);
  const [goalId, setGoalId] = useState(defaultGoalId || "");
  const [amount, setAmount] = useState(centsToInput(remainingCents));
  const [notes, setNotes] = useState("");
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(centsToInput(remainingCents));
    setNotes("");
    setLoadError(false);
    let cancelled = false;
    api<{ goals: GoalOpt[] }>("/api/goals?status=active")
      .then((res) => {
        if (cancelled) return;
        const active = (res.goals || []).filter((g) => g.status === "active");
        setGoals(active);
        setGoalId((prev) => prev || defaultGoalId || active[0]?.id || "");
      })
      .catch(() => {
        if (cancelled) return;
        setGoals([]);
        setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, remainingCents, defaultGoalId]);

  if (!open) return null;

  const canSubmit = Boolean(goalId) && remainingCents > 0 && !loadError;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label={t.cancel}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[1] w-full max-w-md rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg text-[var(--fg)]">
              <Target className="h-4 w-4" aria-hidden />
              {t.budgets.toGoalTitle}
            </h2>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              {t.budgets.toGoalHint}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-[var(--fg-muted)] hover:bg-white/10 hover:text-[var(--fg)]"
            onClick={onCancel}
            aria-label={t.cancel}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm">
            <div className="text-[var(--fg-muted)]">{categoryName}</div>
            <div className="font-display text-lg text-[var(--fg)]">
              {money(remainingCents)}{" "}
              <span className="text-sm font-sans text-[var(--fg-muted)]">
                {t.budgets.remaining}
              </span>
            </div>
          </div>
          <div>
            <Label>{t.budgets.destGoal}</Label>
            <Select
              className="mt-1"
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">{t.select}</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.icon} {g.name}
                </option>
              ))}
            </Select>
            {(loadError || goals.length === 0) && (
              <p className="mt-1 text-xs text-[var(--fg-muted)]">
                {t.budgets.noGoals}
              </p>
            )}
          </div>
          <div>
            <Label>{t.amount}</Label>
            <Input
              money
              className="mt-1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>{t.notes}</Label>
            <Input
              className="mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" disabled={loading} onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button
            disabled={loading || !canSubmit}
            onClick={() =>
              onConfirm({
                goalId,
                amount,
                notes: notes.trim() || undefined,
              })
            }
          >
            {t.budgets.toGoal}
          </Button>
        </div>
      </div>
    </div>
  );
}
