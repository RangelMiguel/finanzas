import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { projectSafeToSpend, type FutureItem } from "@/lib/safe-to-spend";
import { isPersonalAccount } from "@/lib/personal";
import { amountToCents, todayISO } from "@/lib/utils";
import {
  addDaysISO,
  listCardPayments,
} from "@/lib/credit-card-cycles";
import { buildBudgetReserveItems } from "@/lib/budget-defaults";
import {
  loadRecordedCardPayments,
  recordedForCard,
} from "@/lib/cc-payment";
import {
  listFutureRecurringDates,
  recurringOccurrenceHandled,
} from "@/lib/recurring-income";
import { recurringExpenseOccurrenceHandled } from "@/lib/recurring-expense";
import { ensureRecurringPosted } from "@/lib/recurring";
import {
  daysBetweenISO,
  parseInterestMethod,
  parsePaymentPlan,
  projectedDebtPaymentAmounts,
} from "@/lib/debts";
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
      include: { account: { select: { type: true, ownerUserId: true } } },
    });
    // Skip dates already on the ledger or soft-deleted by the user (dismissed auto-salary)
    for (const r of recurring) {
      if (r.account && isPersonalAccount(r.account)) continue;
      const dates = listFutureRecurringDates({
        dayOfMonth: r.dayOfMonth,
        fromDate: todayStr,
        untilDate,
        monthsAhead,
      });
      for (const date of dates) {
        const handled = await recurringOccurrenceHandled({
          householdId: opts.householdId,
          date,
          amountCents: r.amountCents,
          description: r.description,
          accountId: r.accountId,
        });
        if (handled) continue;
        futureItems.push({
          date,
          amountCents: r.amountCents,
          type: "income",
          label: r.description,
        });
      }
    }
  }

  const recurringExpenses = await prisma.recurringExpense.findMany({
    where: { householdId: opts.householdId, active: true },
    include: { account: { select: { type: true, ownerUserId: true } } },
  });
  for (const r of recurringExpenses) {
    if (r.account && isPersonalAccount(r.account)) continue;
    const dates = listFutureRecurringDates({
      dayOfMonth: r.dayOfMonth,
      fromDate: todayStr,
      untilDate,
      monthsAhead,
    });
    for (const date of dates) {
      const handled = await recurringExpenseOccurrenceHandled({
        householdId: opts.householdId,
        date,
        amountCents: r.amountCents,
        description: r.description,
        accountId: r.accountId,
        creditCardId: r.creditCardId,
      });
      if (handled) continue;
      futureItems.push({
        date,
        amountCents: r.amountCents,
        type: "expense",
        label: r.description,
      });
    }
  }

  // Credit-card statement payments (cut day + grace). Includes MSI linked to a card.
  // Recomputed from purchases whenever this endpoint runs — no stored payment rows.
  const [cards, cardTxns, plans, recordedAll] = await Promise.all([
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
        ccBillingCutoff: true,
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
        billingCutoffs: true,
      },
    }),
    loadRecordedCardPayments(opts.householdId),
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
      recordedPayments: recordedForCard(recordedAll, card.id),
    });
    for (const p of payments) {
      const date = p.paymentDue < todayStr ? todayStr : p.paymentDue;
      futureItems.push({
        date,
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

  // Upcoming debt payments until principal is paid off (not forever)
  const debts = await prisma.debt.findMany({
    where: { householdId: opts.householdId },
    include: { payments: { select: { capitalCents: true } } },
  });
  for (const debt of debts) {
    const paymentPlanCents = parsePaymentPlan(debt.paymentPlanCents);
    const hasPlan = !!(paymentPlanCents && paymentPlanCents.length > 0);
    if (debt.monthlyPaymentCents <= 0 && !hasPlan) continue;
    const paidCapital = debt.payments.reduce((s, p) => s + p.capitalCents, 0);
    const remaining = Math.max(0, debt.principalCents - paidCapital);
    if (remaining <= 0) continue;

    // Candidate payment dates in the projection window (same day-of-month rules)
    const dates: string[] = [];
    for (let i = 0; i < monthsAhead; i++) {
      const monthDate = addMonths(now, i);
      const day = Math.min(
        debt.paymentDay,
        new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
      );
      const d = setDate(new Date(monthDate), day);
      const ds = format(d, "yyyy-MM-dd");
      if (ds >= todayStr && ds <= untilDate) dates.push(ds);
    }
    if (!dates.length) continue;

    // Accrual days between consecutive payment dates (for simple daily interest).
    const method = parseInterestMethod(debt.interestMethod);
    const periodDays: number[] = [];
    let prev = todayStr;
    for (const ds of dates) {
      const days = daysBetweenISO(prev, ds);
      periodDays.push(days > 0 ? days : 30);
      prev = ds;
    }

    const amounts = projectedDebtPaymentAmounts({
      remainingCents: remaining,
      monthlyPaymentCents: debt.monthlyPaymentCents,
      annualRatePercent: debt.annualRatePercent,
      paymentPlanCents,
      method,
      originalPrincipalCents: debt.principalCents,
      daysInPeriod: method === "simple_daily" ? periodDays : undefined,
      maxPayments: dates.length,
    });
    for (let i = 0; i < amounts.length; i++) {
      futureItems.push({
        date: dates[i],
        amountCents: amounts[i],
        type: "expense",
        label: `Debt: ${debt.name}`,
      });
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
      horizonDays = Math.max(horizonDays, 730);
    }

    // Post due recurring salaries (incl. last month day-30) before projecting
    await ensureRecurringPosted(m.householdId, {
      userId: session.userId,
    });

    const selected = await loadHouseholdAccountsForProjection(
      m.householdId,
      accountId
    );
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
    if (targetAmount) horizonDays = Math.max(horizonDays, 730);

    await ensureRecurringPosted(m.householdId, {
      userId: session.userId,
    });

    const selected = await loadHouseholdAccountsForProjection(
      m.householdId,
      accountId
    );
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
 * Shared household cash only. Personal member pockets are a private pool
 * and must not inflate (or drain) “how much can I spend”.
 */
async function loadHouseholdAccountsForProjection(
  householdId: string,
  accountId?: string | null
) {
  const accounts = await prisma.account.findMany({
    where: {
      householdId,
      ownerUserId: null,
      type: { not: "personal" },
    },
    orderBy: { createdAt: "asc" },
  });
  if (accountId) return accounts.filter((a) => a.id === accountId);
  return accounts;
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
