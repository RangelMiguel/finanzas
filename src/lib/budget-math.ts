import { isBudgetableSpend } from "./visibility";

export type BudgetableSpendRow = {
  categoryId?: string | null;
  amountCents: number;
  type: string;
  date: string;
};

/** Planned envelope + emergency cushion. Emergency never inflates `amountCents`. */
export function budgetAvailableCents(
  amountCents: number,
  emergencyCents: number
): number {
  return Math.max(0, amountCents) + Math.max(0, emergencyCents);
}

/** Leftover after spend: first consumes the planned amount, then emergency. */
export function budgetRemainingCents(
  amountCents: number,
  emergencyCents: number,
  spentCents: number
): number {
  return Math.max(
    0,
    budgetAvailableCents(amountCents, emergencyCents) - Math.max(0, spentCents)
  );
}

export function spentAgainstBudget(
  amountCents: number,
  spentCents: number
): number {
  return Math.min(Math.max(0, spentCents), Math.max(0, amountCents));
}

export function spentAgainstEmergency(
  amountCents: number,
  emergencyCents: number,
  spentCents: number
): number {
  const overPlan = Math.max(0, spentCents - Math.max(0, amountCents));
  return Math.min(overPlan, Math.max(0, emergencyCents));
}

export function isOverBudget(
  amountCents: number,
  emergencyCents: number,
  spentCents: number
): boolean {
  return spentCents > budgetAvailableCents(amountCents, emergencyCents);
}

export function isUsingEmergency(
  amountCents: number,
  emergencyCents: number,
  spentCents: number
): boolean {
  return (
    emergencyCents > 0 &&
    spentCents > amountCents &&
    !isOverBudget(amountCents, emergencyCents, spentCents)
  );
}

export function spentByCategoryInRange(
  rows: BudgetableSpendRow[],
  start: string,
  end: string
): Record<string, number> {
  const spent: Record<string, number> = {};
  for (const e of rows) {
    if (!e.categoryId || !isBudgetableSpend(e)) continue;
    if (e.date < start || e.date > end) continue;
    spent[e.categoryId] = (spent[e.categoryId] || 0) + e.amountCents;
  }
  return spent;
}

export type CloseAllocationKind = "emergency" | "goal" | "spent";

export type CloseAllocationJson = {
  kind: CloseAllocationKind;
  amountCents: number;
  /** Destination category for `emergency` (defaults to the leftover's category). */
  categoryId?: string;
  goalId?: string;
  /** Set after persist so undo can delete the GoalReserve. */
  reserveId?: string;
};

export type CarryoverJson = {
  categoryId: string;
  remainingCents: number;
  allocations?: CloseAllocationJson[];
};

export type CloseAllocationInput = {
  kind: CloseAllocationKind;
  amountCents?: number;
  amount?: number | string;
  categoryId?: string;
  goalId?: string;
};

export type CloseLineInput = {
  categoryId: string;
  allocations: CloseAllocationInput[];
};

function asCents(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function parseCloseAllocations(raw: unknown): CloseAllocationJson[] {
  if (!Array.isArray(raw)) return [];
  const out: CloseAllocationJson[] = [];
  for (const row of raw) {
    const rec = row as Partial<CloseAllocationJson>;
    const kind = rec.kind;
    if (kind !== "emergency" && kind !== "goal" && kind !== "spent") continue;
    const amountCents = asCents(rec.amountCents);
    if (amountCents <= 0) continue;
    const item: CloseAllocationJson = { kind, amountCents };
    if (rec.categoryId) item.categoryId = String(rec.categoryId);
    if (rec.goalId) item.goalId = String(rec.goalId);
    if (rec.reserveId) item.reserveId = String(rec.reserveId);
    out.push(item);
  }
  return out;
}

/** Legacy closes (no allocations) = all leftover became same-category emergency. */
export function effectiveAllocations(row: CarryoverJson): CloseAllocationJson[] {
  if (row.allocations && row.allocations.length > 0) {
    return row.allocations.filter((a) => a.amountCents > 0);
  }
  if (row.remainingCents > 0) {
    return [
      {
        kind: "emergency",
        amountCents: row.remainingCents,
        categoryId: row.categoryId,
      },
    ];
  }
  return [];
}

export function parseCarryovers(raw: string): CarryoverJson[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        const rec = row as CarryoverJson;
        const categoryId = String(rec.categoryId || "");
        const remainingCents = Math.max(0, asCents(rec.remainingCents));
        const allocations = parseCloseAllocations(rec.allocations);
        return {
          categoryId,
          remainingCents,
          ...(allocations.length ? { allocations } : {}),
        };
      })
      .filter((row) => row.categoryId && row.remainingCents > 0);
  } catch {
    return [];
  }
}

export function summarizeCloseAllocations(rows: CarryoverJson[]): {
  emergencyCents: number;
  goalCents: number;
  spentCents: number;
  movedCents: number;
} {
  let emergencyCents = 0;
  let goalCents = 0;
  let spentCents = 0;
  for (const row of rows) {
    for (const a of effectiveAllocations(row)) {
      if (a.kind === "emergency") emergencyCents += a.amountCents;
      else if (a.kind === "goal") goalCents += a.amountCents;
      else spentCents += a.amountCents;
    }
  }
  return {
    emergencyCents,
    goalCents,
    spentCents,
    movedCents: emergencyCents + goalCents,
  };
}

function inputAmountCents(a: CloseAllocationInput): number {
  if (a.amountCents != null) return asCents(a.amountCents);
  if (a.amount == null || a.amount === "") return 0;
  const n = typeof a.amount === "string" ? parseFloat(a.amount) : a.amount;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

/**
 * Build the persisted leftover plan. If `lines` is omitted, every leftover
 * category uses `defaultKind` (emergency → same category; spent → discarded).
 */
export function buildCloseAllocations(opts: {
  leftover: { categoryId: string; remainingCents: number }[];
  lines?: CloseLineInput[];
  defaultKind: "emergency" | "spent";
}): CarryoverJson[] {
  const leftover = opts.leftover.filter((l) => l.remainingCents > 0);
  const byCat = new Map(leftover.map((l) => [l.categoryId, l.remainingCents]));
  const lineByCat = new Map(
    (opts.lines || []).map((l) => [l.categoryId, l.allocations || []])
  );

  for (const [catId, allocs] of lineByCat) {
    if (!byCat.has(catId)) {
      if (allocs.some((a) => inputAmountCents(a) > 0)) {
        throw new Error(
          "Hay destinos para una categoría sin sobrante en esta quincena"
        );
      }
    }
  }

  return leftover.map((row) => {
    const raw = lineByCat.get(row.categoryId);
    let allocations: CloseAllocationJson[];
    if (!raw || raw.length === 0) {
      allocations = [
        {
          kind: opts.defaultKind,
          amountCents: row.remainingCents,
          ...(opts.defaultKind === "emergency"
            ? { categoryId: row.categoryId }
            : {}),
        },
      ];
    } else {
      allocations = raw.map((a) => {
        const amountCents = inputAmountCents(a);
        if (a.kind === "goal" && amountCents > 0 && !a.goalId) {
          throw new Error("Elige una meta para el sobrante");
        }
        if (a.kind === "emergency" && amountCents > 0 && !a.categoryId) {
          return {
            kind: "emergency" as const,
            amountCents,
            categoryId: row.categoryId,
          };
        }
        return {
          kind: a.kind,
          amountCents,
          ...(a.kind === "emergency"
            ? { categoryId: a.categoryId || row.categoryId }
            : {}),
          ...(a.kind === "goal" && a.goalId ? { goalId: a.goalId } : {}),
        };
      }).filter((a) => a.amountCents > 0);
    }

    const sum = allocations.reduce((s, a) => s + a.amountCents, 0);
    if (sum !== row.remainingCents) {
      throw new Error(
        "Los destinos del sobrante deben sumar exactamente el restante de cada categoría"
      );
    }

    return {
      categoryId: row.categoryId,
      remainingCents: row.remainingCents,
      allocations,
    };
  });
}
