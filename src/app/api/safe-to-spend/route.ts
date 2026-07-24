import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { projectSafeToSpend, type FutureItem } from "@/lib/safe-to-spend";
import { monthKey, amountToCents } from "@/lib/utils";
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
  const monthsAhead = Math.max(3, Math.ceil(opts.horizonDays / 28) + 1);

  if (opts.includeIncome) {
    const recurring = await prisma.recurringIncome.findMany({
      where: { householdId: opts.householdId, active: true },
    });
    for (let i = 0; i < monthsAhead; i++) {
      const monthDate = addMonths(now, i);
      for (const r of recurring) {
        const day = Math.min(
          r.dayOfMonth,
          new Date(
            monthDate.getFullYear(),
            monthDate.getMonth() + 1,
            0
          ).getDate()
        );
        const d = setDate(new Date(monthDate), day);
        if (d >= now) {
          futureItems.push({
            date: format(d, "yyyy-MM-dd"),
            amountCents: r.amountCents,
            type: "income",
            label: r.description,
          });
        }
      }
    }
  }

  const plans = await prisma.installmentPlan.findMany({
    where: { householdId: opts.householdId },
  });
  const todayStr = format(now, "yyyy-MM-dd");
  for (const p of plans) {
    const start = new Date(p.startDate + "T12:00:00");
    for (let i = 0; i < p.months; i++) {
      const d = addMonths(start, i);
      const ds = format(d, "yyyy-MM-dd");
      if (ds >= todayStr) {
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
    const month = monthKey();
    // Sum both half-month budgets for current month
    const budgets = await prisma.budget.findMany({
      where: {
        householdId: opts.householdId,
        OR: [{ period: `${month}-1` }, { period: `${month}-2` }],
      },
    });
    const totalBudget = budgets.reduce((s, b) => s + b.amountCents, 0);
    if (totalBudget > 0) {
      futureItems.push({
        date: todayStr,
        amountCents: totalBudget,
        type: "expense",
        label: "Budget reserve",
      });
    }
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

    const accounts = await prisma.account.findMany({
      where: { householdId: m.householdId },
    });
    const acc = accountId
      ? accounts.find((a) => a.id === accountId)
      : accounts[0];
    if (!acc) return jsonOk({ empty: true });

    const transactions = await prisma.transaction.findMany({
      where: { householdId: m.householdId, deletedAt: null },
      select: {
        type: true,
        amountCents: true,
        accountId: true,
        toAccountId: true,
        date: true,
        deletedAt: true,
      },
    });

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
      initialBalanceCents: acc.initialBalanceCents,
      accountId: acc.id,
      transactions,
      futureItems,
      horizonDays,
      targetDate,
      targetAmountCents: targetAmount
        ? amountToCents(targetAmount)
        : undefined,
    });

    return jsonOk({
      account: acc,
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

    const accounts = await prisma.account.findMany({
      where: { householdId: m.householdId },
    });
    const acc = accountId
      ? accounts.find((a) => a.id === accountId)
      : accounts[0];
    if (!acc) return jsonOk({ empty: true });

    const transactions = await prisma.transaction.findMany({
      where: { householdId: m.householdId, deletedAt: null },
      select: {
        type: true,
        amountCents: true,
        accountId: true,
        toAccountId: true,
        date: true,
        deletedAt: true,
      },
    });

    const futureItems = await buildFutureItems({
      householdId: m.householdId,
      includeIncome,
      reserveBudgets,
      horizonDays,
      whatIf,
    });

    const result = projectSafeToSpend({
      initialBalanceCents: acc.initialBalanceCents,
      accountId: acc.id,
      transactions,
      futureItems,
      horizonDays,
      targetDate,
      targetAmountCents: targetAmount
        ? amountToCents(targetAmount)
        : undefined,
    });

    return jsonOk({
      account: acc,
      currency: m.household.currency,
      ...result,
      futureItems,
    });
  } catch (e) {
    return jsonError(e);
  }
}
