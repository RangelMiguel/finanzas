import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { monthKey } from "@/lib/utils";
import { accountBalance, monthBounds } from "@/lib/money";
import {
  canSeeModule,
  filterAccountId,
  filterTransaction,
  filterCategoryId,
} from "@/lib/visibility";

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "dashboard")) {
      throw new ForbiddenError("No access to dashboard");
    }
    const month = new URL(req.url).searchParams.get("month") || monthKey();
    const { start, end } = monthBounds(month);
    const vis = m.visibility;

    const [accounts, categories, transactions, creditCards, recent, activity] =
      await Promise.all([
        prisma.account.findMany({ where: { householdId: m.householdId } }),
        prisma.category.findMany({ where: { householdId: m.householdId } }),
        prisma.transaction.findMany({
          where: { householdId: m.householdId, deletedAt: null },
          select: {
            id: true,
            type: true,
            amountCents: true,
            accountId: true,
            toAccountId: true,
            date: true,
            deletedAt: true,
            categoryId: true,
            description: true,
            creditCardId: true,
            createdById: true,
            spentById: true,
          },
        }),
        prisma.creditCard.findMany({ where: { householdId: m.householdId } }),
        prisma.transaction.findMany({
          where: {
            householdId: m.householdId,
            deletedAt: null,
            date: { gte: start, lte: end },
          },
          include: {
            category: true,
            createdBy: { select: { displayName: true } },
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 40,
        }),
        canSeeModule(vis, "activity")
          ? prisma.activityEvent.findMany({
              where: { householdId: m.householdId },
              include: { user: { select: { displayName: true } } },
              orderBy: { createdAt: "desc" },
              take: 10,
            })
          : Promise.resolve([]),
      ]);

    const visibleTxns = transactions.filter((t) =>
      filterTransaction(vis, t, session.userId)
    );

    let income = 0;
    let expenses = 0;
    for (const t of visibleTxns) {
      if (t.date < start || t.date > end) continue;
      if (t.type === "income" && vis.showIncome) income += t.amountCents;
      if (t.type === "expense" && vis.showExpense) expenses += t.amountCents;
    }

    const accountBalances = accounts
      .filter((a) => filterAccountId(vis, a.id))
      .map((a) => ({
        ...a,
        balanceCents: vis.showAccountBalances
          ? accountBalance(a.initialBalanceCents, visibleTxns, a.id)
          : null,
        balancesHidden: !vis.showAccountBalances,
      }));

    const expenseByCat: Record<string, number> = {};
    if (vis.showExpense) {
      for (const t of visibleTxns) {
        if (
          t.type !== "expense" ||
          t.date < start ||
          t.date > end ||
          !t.categoryId ||
          !filterCategoryId(vis, t.categoryId)
        )
          continue;
        expenseByCat[t.categoryId] =
          (expenseByCat[t.categoryId] || 0) + t.amountCents;
      }
    }
    const topCategories = Object.entries(expenseByCat)
      .map(([categoryId, amountCents]) => ({
        category: categories.find((c) => c.id === categoryId),
        amountCents,
      }))
      .filter((x) => x.category)
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 6);

    const recentVisible = recent
      .filter((t) => filterTransaction(vis, t, session.userId))
      .slice(0, 8)
      .map((t) => ({
        ...t,
        createdBy:
          !vis.showOtherMembers && t.createdBy
            ? null
            : t.createdBy,
      }));

    const cards = canSeeModule(vis, "creditCards")
      ? creditCards.filter((c) => !vis.hiddenCreditCardIds.includes(c.id))
      : [];

    return jsonOk({
      month,
      household: m.household,
      role: m.role,
      visibility: vis,
      summary: {
        incomeCents: vis.showDashboardIncome ? income : null,
        expenseCents: vis.showDashboardExpense ? expenses : null,
        balanceCents:
          vis.showDashboardBalance &&
          vis.showDashboardIncome &&
          vis.showDashboardExpense
            ? income - expenses
            : null,
      },
      accounts: canSeeModule(vis, "accounts") ? accountBalances : [],
      topCategories: vis.showExpense ? topCategories : [],
      creditCards: cards,
      recentTransactions: canSeeModule(vis, "transactions")
        ? recentVisible
        : [],
      activity: canSeeModule(vis, "activity") ? activity : [],
    });
  } catch (e) {
    return jsonError(e);
  }
}
