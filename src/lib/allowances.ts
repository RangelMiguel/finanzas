import { prisma } from "./db";
import { periodBounds } from "./utils";

export type AllowanceCheckResult =
  | { ok: true }
  | {
      ok: false;
      allowanceId: string;
      name: string;
      amountCents: number;
      spentCents: number;
      remainingCents: number;
      message: string;
    };

/** Sum expenses for a member in a period, optionally filtered by category */
export async function spentOnAllowance(opts: {
  householdId: string;
  userId: string;
  period: "monthly" | "weekly";
  categoryId: string | null;
  excludeTxnId?: string;
}): Promise<number> {
  const { start, end } = periodBounds(opts.period);
  const where: Record<string, unknown> = {
    householdId: opts.householdId,
    type: "expense",
    deletedAt: null,
    spentById: opts.userId,
    date: { gte: start, lte: end },
  };
  if (opts.categoryId) {
    where.categoryId = opts.categoryId;
  }
  if (opts.excludeTxnId) {
    where.id = { not: opts.excludeTxnId };
  }
  const agg = await prisma.transaction.aggregate({
    where,
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents || 0;
}

/**
 * Enforce active allowances for the member who spent.
 * Category-specific allowances are checked first; overall (null category) also checked.
 */
export async function checkAllowances(opts: {
  householdId: string;
  spentById: string;
  amountCents: number;
  categoryId: string | null;
  locale?: string;
}): Promise<AllowanceCheckResult> {
  const allowances = await prisma.allowance.findMany({
    where: {
      householdId: opts.householdId,
      userId: opts.spentById,
      active: true,
      enforce: true,
    },
  });

  for (const a of allowances) {
    // category-specific only applies when category matches (or expense has that cat)
    if (a.categoryId && a.categoryId !== opts.categoryId) continue;

    const spent = await spentOnAllowance({
      householdId: opts.householdId,
      userId: opts.spentById,
      period: a.period as "monthly" | "weekly",
      categoryId: a.categoryId,
    });
    const next = spent + opts.amountCents;
    if (next > a.amountCents) {
      const remaining = Math.max(0, a.amountCents - spent);
      const msgEs = `Excede la mesada "${a.name}": disponible ${(remaining / 100).toFixed(2)}, intento ${(opts.amountCents / 100).toFixed(2)}`;
      const msgEn = `Exceeds allowance "${a.name}": remaining ${(remaining / 100).toFixed(2)}, attempted ${(opts.amountCents / 100).toFixed(2)}`;
      return {
        ok: false,
        allowanceId: a.id,
        name: a.name,
        amountCents: a.amountCents,
        spentCents: spent,
        remainingCents: remaining,
        message: opts.locale === "en" ? msgEn : msgEs,
      };
    }
  }
  return { ok: true };
}

export async function allowanceUsage(opts: {
  householdId: string;
  allowanceId?: string;
}) {
  const list = await prisma.allowance.findMany({
    where: {
      householdId: opts.householdId,
      ...(opts.allowanceId ? { id: opts.allowanceId } : {}),
    },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
      category: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const enriched = [];
  for (const a of list) {
    const spentCents = await spentOnAllowance({
      householdId: opts.householdId,
      userId: a.userId,
      period: a.period as "monthly" | "weekly",
      categoryId: a.categoryId,
    });
    const remainingCents = a.amountCents - spentCents;
    const ratio = a.amountCents > 0 ? spentCents / a.amountCents : 0;
    enriched.push({
      ...a,
      spentCents,
      remainingCents,
      ratio,
      status: ratio > 1 ? "over" : ratio >= 0.8 ? "near" : "ok",
    });
  }
  return enriched;
}
