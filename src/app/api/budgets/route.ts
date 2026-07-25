import { z } from "zod";
import {
  requireSession,
  requireHouseholdAccess,
  ForbiddenError,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import {
  pesosToCents,
  budgetPeriodKey,
  budgetPeriodBounds,
  parseBudgetPeriod,
} from "@/lib/utils";
import {
  canSeeModule,
  filterBudget,
  filterCategoryId,
  filterTransaction,
} from "@/lib/visibility";
import { ensurePeriodBudgets, saveBudgetWithScope } from "@/lib/budget-defaults";

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "budgets") || !m.visibility.showBudgets) {
      throw new ForbiddenError("No access to budgets");
    }
    const url = new URL(req.url);
    // accept period=YYYY-MM-1|2 or month=YYYY-MM + half=1|2
    let period = url.searchParams.get("period") || "";
    if (!period) {
      const month = url.searchParams.get("month");
      const half = (url.searchParams.get("half") || "1") as "1" | "2";
      if (month) period = `${month}-${half}`;
      else period = budgetPeriodKey();
    }

    const applied = await ensurePeriodBudgets(m.householdId, period);
    const { start, end } = budgetPeriodBounds(period);
    const meta = parseBudgetPeriod(period);

    const [budgets, defaults] = await Promise.all([
      prisma.budget.findMany({
        where: { householdId: m.householdId, period },
        include: { category: true },
      }),
      prisma.budgetDefault.findMany({
        where: { householdId: m.householdId },
        include: { category: true },
        orderBy: { category: { name: "asc" } },
      }),
    ]);

    const expenses = await prisma.transaction.findMany({
      where: {
        householdId: m.householdId,
        type: "expense",
        deletedAt: null,
        date: { gte: start, lte: end },
      },
      select: {
        id: true,
        categoryId: true,
        amountCents: true,
        type: true,
        accountId: true,
        toAccountId: true,
        creditCardId: true,
        createdById: true,
        spentById: true,
      },
    });
    const spentByCat: Record<string, number> = {};
    for (const e of expenses) {
      if (!e.categoryId) continue;
      if (!filterTransaction(m.visibility, e, session.userId)) continue;
      spentByCat[e.categoryId] =
        (spentByCat[e.categoryId] || 0) + e.amountCents;
    }

    const visibleBudgets = budgets.filter((b) =>
      filterBudget(m.visibility, b)
    );
    const visibleDefaults = defaults.filter((d) =>
      filterCategoryId(m.visibility, d.categoryId)
    );

    return jsonOk({
      period,
      month: meta.monthKey,
      half: meta.half,
      bounds: { start, end },
      appliedDefaults: applied,
      defaults: visibleDefaults,
      budgets: visibleBudgets.map((b) => ({
        ...b,
        spentCents: spentByCat[b.categoryId] || 0,
        isFromDefault: defaults.some((d) => d.categoryId === b.categoryId),
      })),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        categoryId: z.string(),
        amount: z.union([z.number(), z.string()]),
        period: z.string().optional(),
        month: z.string().optional(),
        half: z.union([z.literal(1), z.literal(2), z.literal("1"), z.literal("2")]).optional(),
        scope: z
          .enum(["this_period", "both_periods", "default", "next_year"])
          .default("this_period"),
      })
      .parse(await req.json());

    let period = body.period;
    if (!period && body.month) {
      const half = String(body.half || 1);
      period = `${body.month}-${half}`;
    }
    if (!period) period = budgetPeriodKey();

    const amountCents = pesosToCents(body.amount);
    await saveBudgetWithScope({
      householdId: m.householdId,
      categoryId: body.categoryId,
      amountCents,
      period,
      scope: body.scope,
    });

    const budget = await prisma.budget.findUnique({
      where: {
        householdId_categoryId_period: {
          householdId: m.householdId,
          categoryId: body.categoryId,
          period,
        },
      },
      include: { category: true },
    });
    return jsonOk({ budget, scope: body.scope, period }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        id: z.string(),
        amount: z.union([z.number(), z.string()]).optional(),
        categoryId: z.string().optional(),
        period: z.string().optional(),
        scope: z
          .enum(["this_period", "both_periods", "default", "next_year"])
          .default("this_period"),
      })
      .parse(await req.json());

    const existing = await prisma.budget.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Presupuesto no encontrado");

    const categoryId = body.categoryId || existing.categoryId;
    const amountCents =
      body.amount !== undefined
        ? pesosToCents(body.amount)
        : existing.amountCents;
    const period = body.period || existing.period;

    await saveBudgetWithScope({
      householdId: m.householdId,
      categoryId,
      amountCents,
      period,
      scope: body.scope,
    });

    const budget = await prisma.budget.findFirst({
      where: {
        householdId: m.householdId,
        categoryId,
        period,
      },
      include: { category: true },
    });
    return jsonOk({ budget, scope: body.scope, period });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const id = new URL(req.url).searchParams.get("id");
    const alsoDefault = new URL(req.url).searchParams.get("default") === "1";
    if (!id) throw new Error("id requerido");
    const existing = await prisma.budget.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Presupuesto no encontrado");
    await prisma.budget.delete({ where: { id } });
    if (alsoDefault) {
      await prisma.budgetDefault.deleteMany({
        where: {
          householdId: m.householdId,
          categoryId: existing.categoryId,
        },
      });
    }
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
