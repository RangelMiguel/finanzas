import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import {
  budgetPeriodKey,
  budgetPeriodBounds,
  parseBudgetPeriod,
  makeBudgetPeriod,
} from "@/lib/utils";
import { ensureAllPersonalAccounts, personalPool } from "@/lib/personal";
import { canSeeModule } from "@/lib/visibility";

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "allowances")) {
      throw new ForbiddenError("No access");
    }
    const url = new URL(req.url);
    let period = url.searchParams.get("period");
    if (!period) {
      const month = url.searchParams.get("month");
      const half = url.searchParams.get("half");
      if (month && half) {
        const { year, month: mo } = parseBudgetPeriod(`${month}-1`);
        period = makeBudgetPeriod(year, mo, half === "2" ? 2 : 1);
      } else {
        period = budgetPeriodKey();
      }
    }
    const parsed = parseBudgetPeriod(period);
    const bounds = budgetPeriodBounds(period);

    // Admins can view another user via ?userId=
    let userId = session.userId;
    const qUser = url.searchParams.get("userId");
    if (qUser && (m.role === "owner" || m.role === "admin")) {
      userId = qUser;
    }

    // Lazy-create private personal accounts for every member
    await ensureAllPersonalAccounts(m.householdId);

    const pool = await personalPool({
      householdId: m.householdId,
      userId,
      period,
    });

    const [incomes, budgets, expenses, members, transfersIn] =
      await Promise.all([
        prisma.personalIncome.findMany({
          where: { householdId: m.householdId, userId, period },
          orderBy: { date: "desc" },
        }),
        prisma.personalBudget.findMany({
          where: { householdId: m.householdId, userId, period },
          include: {
            expenses: true,
          },
          orderBy: { createdAt: "asc" },
        }),
        prisma.personalExpense.findMany({
          where: { householdId: m.householdId, userId, period },
          include: { personalBudget: true },
          orderBy: { date: "desc" },
        }),
        m.role === "owner" || m.role === "admin"
          ? prisma.membership.findMany({
              where: { householdId: m.householdId },
              include: {
                user: { select: { id: true, displayName: true, email: true } },
              },
            })
          : Promise.resolve([]),
        prisma.transaction.findMany({
          where: {
            householdId: m.householdId,
            deletedAt: null,
            type: "transfer",
            toAccountId: pool.personalAccount.id,
            date: { gte: bounds.start, lte: bounds.end },
          },
          select: {
            id: true,
            date: true,
            amountCents: true,
            description: true,
            account: { select: { name: true } },
          },
          orderBy: { date: "desc" },
        }),
      ]);

    const budgetsEnriched = budgets.map((b) => {
      const spentCents = b.expenses.reduce((s, e) => s + e.amountCents, 0);
      return {
        ...b,
        spentCents,
        remainingCents: b.amountCents - spentCents,
      };
    });

    return jsonOk({
      period,
      month: parsed.monthKey,
      half: parsed.half,
      bounds,
      userId,
      pool,
      // Legacy field kept empty — funding is via personal account transfers
      allocations: [],
      transfersIn,
      incomes,
      budgets: budgetsEnriched,
      expenses,
      personalAccount: pool.personalAccount,
      members: members.map((x) => ({
        id: x.id,
        role: x.role,
        user: x.user,
      })),
      isAdmin: m.role === "owner" || m.role === "admin",
      currency: m.household.currency,
    });
  } catch (e) {
    return jsonError(e);
  }
}
