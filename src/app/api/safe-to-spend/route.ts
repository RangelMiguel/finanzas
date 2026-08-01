import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { projectSafeToSpend, type FutureItem } from "@/lib/safe-to-spend";
import { amountToCents, todayISO } from "@/lib/utils";
import {
  addDaysISO,
  listCardPayments,
} from "@/lib/credit-card-cycles";
import { buildBudgetReserveItems } from "@/lib/budget-defaults";
import {
  ensureRecurringIncomesPosted,
  listFutureRecurringDates,
} from "@/lib/recurring-income";
import { addMonths, format, setDate, differenceInCalendarDays } from "date-fns";

async function buildFutureItems(opts: {
  householdId: string;
  includeIncome: boolean;
  reserveBudgets: boolean;
  horizonDays: number;
  whatIf?: {
    date: string;
    amount: number | string;
    type: "income" | "expense";
    label?: string;
  }[];
}): Promise<FutureItem[]> {
  const futureItems: FutureItem[] = [];
  const now = new Date();
  const todayStr = todayISO();
  const untilDate = addDaysISO(todayStr, Math.max(0, opts.horizonDays));
  const monthsAhead = Math.max(3, Math.ceil(opts.horizonDays / 28) + 1);

  if (opts.includeIncome) {
    const recurring = await prisma.recurringIncome.findMany({
      where: { householdId: opts.householdId, active: true },
    });
    // Already posted as real income (auto or manual) — don't double-count in projection
    const posted = await prisma.transaction.findMany({
      where: {
        householdId: opts.householdId,
        deletedAt: null,
        type: "income",
        date: { gte: todayStr, lte: untilDate },
      },
      select: {
        date: true,
        amountCents: true,
        description: true,
        accountId: true,
      },
    });
    const postedKey = new Set(
      posted.map(
        (t) =>
          `${t.date}|${t.amountCents}|${t.description}|${t.accountId || ""}`
      )
    );

    for (const r of recurring) {
      const dates = listFutureRecurringDates({
        dayOfMonth: r.dayOfMonth,
        fromDate: todayStr,
        untilDate,
        monthsAhead,
      });
      for (const date of dates) {
        const key = `${date}|${r.amountCents}|${r.description}|${r.accountId || ""}`;
        // Also match posts that used default account (accountId null on template)
        const keyAnyAcctPrefix = `${date}|${r.amountCents}|${r.description}|`;
        const already = [...postedKey].some(
          (k) => k === key || k.startsWith(keyAnyAcctPrefix)
        );
        if (already) continue;
        futureItems.push({
          date,
          amountCents: r.amountCents,
          type: "income",
          label: r.description,
        });
      }
    }
  }

  // Credit-card statement payments (cut day + grace). Includes MSI linked to a card.
  // Recomputed from purchases whenever this endpoint runs — no stored payment rows.
  const [cards, cardTxns, plans] = await Promise.all([
    prisma.creditCard.findMany({
      where: { householdId: opts.householdId },
      select: {
        id: true,
        name: true,
        cutoffDay: true,
        graceDays: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        householdId: opts.householdId,
        type: "expense",
        deletedAt: null,
        date: { gte: addDaysISO(todayStr, -750) },
        OR: [
          { creditCardId: { not: null } },
          { fundings: { some: { creditCardId: { not: null } } } },
        ],
      },
      select: {
        creditCardId: true,
        amountCents: true,
        date: true,
        installmentPlanId: true,
        type: true,
        deletedAt: true,
        fundings: {
          select: {
            amountCents: true,
            accountId: true,
            creditCardId: true,
          },
        },
      },
    }),
    prisma.installmentPlan.findMany({
      where: { householdId: opts.householdId },
      select: {
        id: true,
        creditCardId: true,
        monthlyAmountCents: true,
        months: true,
        startDate: true,
        description: true,
        totalAmountCents: true,
        removedDates: true,
      },
    }),
  ]);

  for (const card of cards) {
    const payments = listCardPayments({
      creditCardId: card.id,
      creditCardName: card.name,
      cutoffDay: card.cutoffDay,
      graceDays: card.graceDays,
      asOf: todayStr,
      untilDate,
      transactions: cardTxns,
      installments: plans,
    });
    for (const p of payments) {
      futureItems.push({
        date: p.paymentDue,
        amountCents: p.amountCents,
        type: "expense",
        label: `CC: ${card.name}`,
      });
    }
  }

  // MSI without a card still project on installment anniversary dates
  for (const p of plans) {
    if (p.creditCardId) continue; // already inside CC payment cycles
    const start = new Date(p.startDate + "T12:00:00");
    for (let i = 0; i < p.months; i++) {
      const d = addMonths(start, i);
      const ds = format(d, "yyyy-MM-dd");
      if (ds >= todayStr && ds <= untilDate) {
        futureItems.push({
          date: ds,
          amountCents: p.monthlyAmountCents,
          type: "expense",
          label: `MSI: ${p.description}`,
        });
      }
    }
  }

  // Upcoming debt payments (suggested monthly)
  const debts = await prisma.debt.findMany({
    where: { householdId: opts.householdId },
  });
  for (let i = 0; i < monthsAhead; i++) {
    const monthDate = addMonths(now, i);
    for (const debt of debts) {
      if (debt.monthlyPaymentCents <= 0) continue;
      const day = Math.min(
        debt.paymentDay,
        new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
      );
      const d = setDate(new Date(monthDate), day);
      if (d >= now) {
        futureItems.push({
          date: format(d, "yyyy-MM-dd"),
          amountCents: debt.monthlyPaymentCents,
          type: "expense",
          label: `Debt: ${debt.name}`,
        });
      }
    }
  }

  if (opts.reserveBudgets) {
    // Ring-fence unutilized + future budgets (uses defaults when period empty)
    const budgetReserves = await buildBudgetReserveItems({
      householdId: opts.householdId,
      asOf: todayStr,
      untilDate,
    });
    futureItems.push(...budgetReserves);
  }

  if (opts.whatIf?.length) {
    for (const w of opts.whatIf) {
      const cents = amountToCents(w.amount);
      if (cents <= 0 || !w.date) continue;
      futureItems.push({
        date: w.date,
        amountCents: cents,
        type: w.type,
        label: w.label || (w.type === "income" ? "What-if income" : "What-if expense"),
      });
    }
  }

  return futureItems;
}

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const includeIncome = searchParams.get("includeIncome") !== "0";
    const reserveBudgets = searchParams.get("reserveBudgets") === "1";
    const targetDate = searchParams.get("targetDate") || undefined;
    const targetAmount = searchParams.get("targetAmount");
    let horizonDays = parseInt(searchParams.get("horizon") || "90", 10);

    if (targetDate) {
      const days = differenceInCalendarDays(
        new Date(targetDate + "T12:00:00"),
        new Date()
      );
      if (days > 0) horizonDays = Math.max(horizonDays, days + 1);
    }
    if (targetAmount) {
      horizonDays = Math.max(horizonDays, 365);
    }

    // Post due recurring salaries (incl. last month day-30) before projecting
    await ensureRecurringIncomesPosted(m.householdId, {
      userId: session.userId,
    });

    const accounts = await prisma.account.findMany({
      where: { householdId: m.householdId },
      orderBy: { createdAt: "asc" },
    });
    if (!accounts.length) return jsonOk({ empty: true });

    // Optional filter (legacy); default = all household accounts combined
    const selected = accountId
      ? accounts.filter((a) => a.id === accountId)
      : accounts;
    if (!selected.length) return jsonOk({ empty: true });

    const transactions = await loadBankTxnsForProjection(m.householdId);

    // whatIf as JSON query param
    let whatIf: {
      date: string;
      amount: number | string;
      type: "income" | "expense";
      label?: string;
    }[] = [];
    const whatIfRaw = searchParams.get("whatIf");
    if (whatIfRaw) {
      try {
        whatIf = JSON.parse(whatIfRaw);
      } catch {
        /* ignore */
      }
    }

    const futureItems = await buildFutureItems({
      householdId: m.householdId,
      includeIncome,
      reserveBudgets,
      horizonDays,
      whatIf,
    });

    const result = projectSafeToSpend({
      accounts: selected.map((a) => ({
        id: a.id,
        initialBalanceCents: a.initialBalanceCents,
      })),
      transactions,
      futureItems,
      horizonDays,
      targetDate,
      targetAmountCents: targetAmount
        ? amountToCents(targetAmount)
        : undefined,
    });

    return jsonOk({
      accounts: selected.map((a) => ({ id: a.id, name: a.name })),
      currency: m.household.currency,
      ...result,
      futureItems,
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const body = await req.json();
    const accountId = body.accountId as string | undefined;
    const includeIncome = body.includeIncome !== false;
    const reserveBudgets = body.reserveBudgets === true;
    const targetDate = body.targetDate as string | undefined;
    const targetAmount = body.targetAmount as string | number | undefined;
    let horizonDays = parseInt(String(body.horizon || 90), 10);
    const whatIf = (body.whatIf || []) as {
      date: string;
      amount: number | string;
      type: "income" | "expense";
      label?: string;
    }[];

    if (targetDate) {
      const days = differenceInCalendarDays(
        new Date(targetDate + "T12:00:00"),
        new Date()
      );
      if (days > 0) horizonDays = Math.max(horizonDays, days + 1);
    }
    if (targetAmount) horizonDays = Math.max(horizonDays, 365);

    await ensureRecurringIncomesPosted(m.householdId, {
      userId: session.userId,
    });

    const accounts = await prisma.account.findMany({
      where: { householdId: m.householdId },
      orderBy: { createdAt: "asc" },
    });
    if (!accounts.length) return jsonOk({ empty: true });

    const selected = accountId
      ? accounts.filter((a) => a.id === accountId)
      : accounts;
    if (!selected.length) return jsonOk({ empty: true });

    const transactions = await loadBankTxnsForProjection(m.householdId);

    const futureItems = await buildFutureItems({
      householdId: m.householdId,
      includeIncome,
      reserveBudgets,
      horizonDays,
      whatIf,
    });

    const result = projectSafeToSpend({
      accounts: selected.map((a) => ({
        id: a.id,
        initialBalanceCents: a.initialBalanceCents,
      })),
      transactions,
      futureItems,
      horizonDays,
      targetDate,
      targetAmountCents: targetAmount
        ? amountToCents(targetAmount)
        : undefined,
    });

    return jsonOk({
      accounts: selected.map((a) => ({ id: a.id, name: a.name })),
      currency: m.household.currency,
      ...result,
      futureItems,
    });
  } catch (e) {
    return jsonError(e);
  }
}

/**
 * Bank cash projection: only account fundings (or legacy non-CC accountId)
 * reduce the bank balance. Card charges leave on the payment due date.
 */
async function loadBankTxnsForProjection(householdId: string) {
  return prisma.transaction.findMany({
    where: { householdId, deletedAt: null },
    select: {
      type: true,
      amountCents: true,
      accountId: true,
      toAccountId: true,
      date: true,
      deletedAt: true,
      creditCardId: true,
      fundings: {
        select: {
          amountCents: true,
          accountId: true,
          creditCardId: true,
        },
      },
    },
  });
}
