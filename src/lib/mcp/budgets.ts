import { prisma } from "@/lib/db";
import { requireHouseholdAccess } from "@/lib/auth";
import { redactForModel } from "@/lib/ai/privacy";
import type { ToolExecResult } from "@/lib/ai/complete";
import type { FinanceToolContext } from "@/lib/ai/tools";
import {
  closeBudgetPeriod,
  findPendingClose,
  getCloseStatus,
  undoBudgetPeriodClose,
  type CloseStatus,
} from "@/lib/budget-close";
import {
  budgetRemainingCents,
  spentByCategoryInRange,
  type CloseLineInput,
} from "@/lib/budget-math";
import { allocationsForPeriod, loadGoalAllocations } from "@/lib/goal-budget";
import { canSeeModule, filterTransaction } from "@/lib/visibility";
import {
  budgetPeriodBounds,
  budgetPeriodKey,
  formatMoney,
  parseBudgetPeriod,
  todayISO,
} from "@/lib/utils";

const PERIOD_KEY = /^\d{4}-\d{2}-[12]$/;

function units(cents: number): number {
  return Math.round(cents) / 100;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function money(cents: number, ctx: FinanceToolContext): string {
  return formatMoney(cents, ctx.currency, ctx.locale);
}

function budgetsAllowed(ctx: FinanceToolContext): ToolExecResult | null {
  if (!canSeeModule(ctx.visibility, "budgets") || !ctx.visibility.showBudgets) {
    return { ok: false, summary: "No access to budgets", error: "forbidden" };
  }
  return null;
}

function periodKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return PERIOD_KEY.test(key) ? key : null;
}

type Named = { id: string; name: string };

function matchNamed(hint: string, rows: Named[]): { id: string } | { error: string; choices?: string[] } {
  const trimmed = hint.trim();
  if (!trimmed) return { error: "Name is empty" };
  const byId = rows.find((row) => row.id === trimmed);
  if (byId) return { id: byId.id };
  const hits = rows.filter((row) => fold(row.name) === fold(trimmed));
  if (hits.length === 1) return { id: hits[0].id };
  if (hits.length > 1) {
    return { error: `Several matches for "${trimmed}": ${hits.map((row) => row.name).join(", ")}` };
  }
  return {
    error: `No match for "${trimmed}"`,
    choices: rows.map((row) => row.name),
  };
}

async function loadNames(householdId: string) {
  const [categories, goals] = await Promise.all([
    prisma.category.findMany({
      where: { householdId, type: "expense" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.goal.findMany({
      where: { householdId, status: { not: "cancelled" } },
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { categories, goals };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

type LineResolve =
  | { ok: true; lines?: CloseLineInput[] }
  | { ok: false; error: ToolExecResult };

async function resolveLines(householdId: string, raw: unknown): Promise<LineResolve> {
  if (raw == null) return { ok: true };
  if (!Array.isArray(raw)) {
    return { ok: false, error: { ok: false, summary: "lines must be a list", error: "lines" } };
  }
  if (raw.length === 0) return { ok: true };
  const { categories, goals } = await loadNames(householdId);
  const lines: CloseLineInput[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const categoryHint = typeof row?.category === "string" ? row.category : "";
    const category = matchNamed(categoryHint, categories);
    if ("error" in category) {
      return {
        ok: false,
        error: {
          ok: false,
          summary: `Category: ${category.error}`,
          error: "category",
          data: category.choices ? { categories: category.choices } : undefined,
        },
      };
    }
    if (!Array.isArray(row?.allocations) || row.allocations.length === 0) {
      return {
        ok: false,
        error: {
          ok: false,
          summary: `Category ${categoryHint} needs allocations that add up to its leftover`,
          error: "allocations",
        },
      };
    }
    const allocations: CloseLineInput["allocations"] = [];
    for (const entry of row.allocations) {
      const alloc = asRecord(entry);
      if (!alloc) {
        return { ok: false, error: { ok: false, summary: "Each allocation must be an object", error: "allocations" } };
      }
      const kind = alloc.kind;
      if (kind !== "emergency" && kind !== "goal" && kind !== "spent") {
        return {
          ok: false,
          error: { ok: false, summary: "Each allocation kind must be emergency, goal, or spent", error: "kind" },
        };
      }
      const amount = alloc.amount;
      if (typeof amount !== "number" && typeof amount !== "string") {
        return {
          ok: false,
          error: { ok: false, summary: "Each allocation needs an amount in currency units", error: "amount" },
        };
      }
      const next: CloseLineInput["allocations"][number] = { kind, amount };
      if (kind === "goal") {
        const goalHint = typeof alloc.goal === "string" ? alloc.goal : "";
        const goal = matchNamed(goalHint, goals);
        if ("error" in goal) {
          return {
            ok: false,
            error: {
              ok: false,
              summary: `Goal: ${goal.error}`,
              error: "goal",
              data: goal.choices ? { goals: goal.choices } : undefined,
            },
          };
        }
        next.goalId = goal.id;
      }
      if (kind === "emergency" && typeof alloc.category === "string" && alloc.category.trim()) {
        const dest = matchNamed(alloc.category, categories);
        if ("error" in dest) {
          return {
            ok: false,
            error: {
              ok: false,
              summary: `Emergency category: ${dest.error}`,
              error: "category",
              data: dest.choices ? { categories: dest.choices } : undefined,
            },
          };
        }
        next.categoryId = dest.id;
      }
      allocations.push(next);
    }
    lines.push({ categoryId: category.id, allocations });
  }
  return { ok: true, lines };
}

async function describePeriod(
  ctx: FinanceToolContext,
  status: CloseStatus,
  pendingPeriod: string | null
): Promise<ToolExecResult> {
  const { start, end } = status.bounds;
  const [budgets, spendRows, goalAllocRows, movements, goals] = await Promise.all([
    prisma.budget.findMany({
      where: { householdId: ctx.householdId, period: status.period },
      include: { category: { select: { name: true } } },
      orderBy: { category: { name: "asc" } },
    }),
    prisma.transaction.findMany({
      where: {
        householdId: ctx.householdId,
        deletedAt: null,
        date: { gte: start, lte: end },
        OR: [{ type: "expense" }, { type: "transfer", categoryId: { not: null } }],
      },
      select: { categoryId: true, amountCents: true, type: true, date: true },
    }),
    loadGoalAllocations({ householdId: ctx.householdId, period: status.period }),
    prisma.transaction.findMany({
      where: {
        householdId: ctx.householdId,
        deletedAt: null,
        date: { gte: start, lte: end },
        categoryId: null,
        type: { in: ["expense", "income"] },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 80,
    }),
    prisma.goal.findMany({
      where: { householdId: ctx.householdId, status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 30,
    }),
  ]);
  const spentByCat = spentByCategoryInRange(spendRows, start, end);
  const goalByCat = allocationsForPeriod(goalAllocRows, status.period);
  const lines = budgets.map((budget) => {
    const spentCents = spentByCat[budget.categoryId] || 0;
    const goalCents = goalByCat[budget.categoryId] || 0;
    const remainingCents = budgetRemainingCents(
      budget.amountCents,
      budget.emergencyCents,
      spentCents,
      goalCents
    );
    return {
      category: budget.category.name,
      categoryId: budget.categoryId,
      planned: units(budget.amountCents),
      emergency: units(budget.emergencyCents),
      spent: units(spentCents),
      remaining: units(remainingCents),
      plannedLabel: money(budget.amountCents, ctx),
      spentLabel: money(spentCents, ctx),
      remainingLabel: money(remainingCents, ctx),
    };
  });
  const visibleUncategorized = movements
    .filter((txn) => filterTransaction(ctx.visibility, txn, ctx.subjectUserId))
    .slice(0, 25)
    .map((txn) => ({
      id: txn.id,
      date: txn.date,
      type: txn.type,
      amount: units(txn.amountCents),
      amountLabel: money(txn.amountCents, ctx),
      description: redactForModel(txn.description, ctx.privacy?.book),
    }));
  const leftoverMeaning =
    status.defaultKind === "spent"
      ? "Mark leftover as spent. Do not carry it into a later quincena."
      : "Carry leftover into the next quincena as emergency on the same category.";
  const { half } = parseBudgetPeriod(status.period);
  return {
    ok: true,
    summary: status.canClose
      ? `Quincena ${status.period} can be closed. Leftover ${money(status.totalRemainingCents, ctx)}.`
      : status.closed
        ? `Quincena ${status.period} is already closed.`
        : `Quincena ${status.period} cannot be closed yet. Last day is ${status.bounds.end}.`,
    data: {
      period: status.period,
      half: half === 1 ? "days 1-15" : "day 16 through month end",
      from: status.bounds.start,
      to: status.bounds.end,
      nextPeriod: status.toPeriod,
      currentPeriod: budgetPeriodKey(new Date(todayISO() + "T12:00:00")),
      pendingPeriod,
      closed: status.closed,
      closedAt: status.closedAt,
      canClose: status.canClose,
      canUndo: status.canUndo,
      tooEarly: status.tooEarly,
      isStale: status.isStale,
      defaultLeftover: status.defaultKind,
      defaultLeftoverMeaning: leftoverMeaning,
      leftover: units(status.totalRemainingCents),
      leftoverLabel: money(status.totalRemainingCents, ctx),
      lines,
      uncategorized: visibleUncategorized,
      uncategorizedTruncated: movements.length >= 80,
      uncategorizedNote:
        "These movements have no category, so they are not counted against a budget. Use update_transaction with the movement id and a category name before closing if they should count.",
      goals: goals.map((goal) => ({ id: goal.id, name: goal.name })),
      applied: status.appliedSummary
        ? {
            emergency: units(status.appliedSummary.emergencyCents),
            goals: units(status.appliedSummary.goalCents),
            spent: units(status.appliedSummary.spentCents),
          }
        : null,
    },
  };
}

export async function budgetCloseStatus(
  ctx: FinanceToolContext,
  args: Record<string, unknown>
): Promise<ToolExecResult> {
  const denied = budgetsAllowed(ctx);
  if (denied) return denied;
  const requested = args.period;
  if (requested != null && requested !== "" && !periodKey(requested)) {
    return {
      ok: false,
      summary: "period must be YYYY-MM-1 (days 1-15) or YYYY-MM-2 (day 16 through month end)",
      error: "period",
    };
  }
  const key = periodKey(requested);
  if (!key) {
    const pending = await findPendingClose(ctx.householdId);
    if (!pending) {
      const current = budgetPeriodKey(new Date(todayISO() + "T12:00:00"));
      const bounds = budgetPeriodBounds(current);
      return {
        ok: true,
        summary: "No quincena is waiting to be closed.",
        data: {
          pendingPeriod: null,
          currentPeriod: current,
          currentFrom: bounds.start,
          currentTo: bounds.end,
        },
      };
    }
    return describePeriod(ctx, pending, pending.period);
  }
  const status = await getCloseStatus(ctx.householdId, key);
  const pending = await findPendingClose(ctx.householdId);
  return describePeriod(ctx, status, pending?.period ?? null);
}

export async function closeBudgetPeriodTool(
  ctx: FinanceToolContext,
  args: Record<string, unknown>
): Promise<ToolExecResult> {
  const denied = budgetsAllowed(ctx);
  if (denied) return denied;
  await requireHouseholdAccess(ctx.userId, { write: true, householdId: ctx.householdId });
  let key = periodKey(args.period);
  if (args.period != null && args.period !== "" && !key) {
    return {
      ok: false,
      summary: "period must be YYYY-MM-1 or YYYY-MM-2",
      error: "period",
    };
  }
  if (!key) {
    const pending = await findPendingClose(ctx.householdId);
    if (!pending) return { ok: false, summary: "No quincena is ready to close", error: "none" };
    key = pending.period;
  }
  const leftover = args.leftover;
  if (leftover != null && leftover !== "emergency" && leftover !== "spent") {
    return {
      ok: false,
      summary: "leftover must be emergency (carry to the next quincena) or spent (do not carry)",
      error: "leftover",
    };
  }
  const resolved = await resolveLines(ctx.householdId, args.lines);
  if (!resolved.ok) return resolved.error;
  const defaultKind = leftover === "emergency" || leftover === "spent" ? leftover : undefined;
  try {
    const status = await closeBudgetPeriod({
      householdId: ctx.householdId,
      period: key,
      userId: ctx.userId,
      defaultKind,
      lines: resolved.lines,
    });
    const described = await describePeriod(ctx, status, null);
    const applied = status.appliedSummary;
    const summary = applied
      ? `Closed quincena ${key}. Emergency ${units(applied.emergencyCents)}, goals ${units(applied.goalCents)}, marked spent ${units(applied.spentCents)}.`
      : `Closed quincena ${key}.`;
    return {
      ok: true,
      summary,
      data: described.data,
      mutated: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not close the quincena";
    return { ok: false, summary: message, error: "close" };
  }
}

export async function undoBudgetCloseTool(
  ctx: FinanceToolContext,
  args: Record<string, unknown>
): Promise<ToolExecResult> {
  const denied = budgetsAllowed(ctx);
  if (denied) return denied;
  await requireHouseholdAccess(ctx.userId, { write: true, householdId: ctx.householdId });
  const key = periodKey(args.period);
  if (!key) {
    return {
      ok: false,
      summary: "period is required (YYYY-MM-1 or YYYY-MM-2)",
      error: "period",
    };
  }
  try {
    const status = await undoBudgetPeriodClose({
      householdId: ctx.householdId,
      period: key,
      userId: ctx.userId,
    });
    const described = await describePeriod(ctx, status, null);
    return {
      ok: true,
      summary: `Undid the close of quincena ${key}.`,
      data: described.data,
      mutated: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not undo the close";
    return { ok: false, summary: message, error: "undo" };
  }
}

export async function executeBudgetTool(
  ctx: FinanceToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<ToolExecResult> {
  switch (name) {
    case "budget_close_status":
      return budgetCloseStatus(ctx, args);
    case "close_budget_period":
      return closeBudgetPeriodTool(ctx, args);
    case "undo_budget_close":
      return undoBudgetCloseTool(ctx, args);
    default:
      return { ok: false, summary: `Unknown tool ${name}`, error: "unknown_tool" };
  }
}
