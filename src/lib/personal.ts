import { prisma } from "./db";
import { budgetPeriodBounds } from "./utils";
import { accountBalance } from "./money";

/** Private pocket for one member — not household cash. */
export function isPersonalAccount(account: {
  type?: string | null;
  ownerUserId?: string | null;
}) {
  return account.type === "personal" || !!account.ownerUserId;
}

/**
 * Ensure each household member has exactly one private personal account.
 * Funded via household transfers TO this account (not editable allocations).
 */
export async function ensurePersonalAccount(opts: {
  householdId: string;
  userId: string;
  displayName?: string;
}) {
  const existing = await prisma.account.findFirst({
    where: {
      householdId: opts.householdId,
      ownerUserId: opts.userId,
    },
  });
  if (existing) return existing;

  let name = opts.displayName;
  if (!name) {
    const u = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { displayName: true },
    });
    name = u?.displayName || "Personal";
  }

  return prisma.account.create({
    data: {
      householdId: opts.householdId,
      ownerUserId: opts.userId,
      name: `Personal · ${name}`,
      type: "personal",
      icon: "👤",
      initialBalanceCents: 0,
    },
  });
}

export async function ensureAllPersonalAccounts(householdId: string) {
  const members = await prisma.membership.findMany({
    where: { householdId },
    include: { user: { select: { id: true, displayName: true } } },
  });
  const accounts = [];
  for (const m of members) {
    accounts.push(
      await ensurePersonalAccount({
        householdId,
        userId: m.user.id,
        displayName: m.user.displayName,
      })
    );
  }
  return accounts;
}

/**
 * Personal pool for one half-month period (YYYY-MM-1 | YYYY-MM-2).
 * Funding = household transfers INTO the member's private personal account
 * during the period (admin "gives money" via a real movement).
 */
export async function personalPool(opts: {
  householdId: string;
  userId: string;
  period: string;
}) {
  const personalAccount = await ensurePersonalAccount({
    householdId: opts.householdId,
    userId: opts.userId,
  });
  const { start, end } = budgetPeriodBounds(opts.period);

  // Transfers into the personal account this quincena = "allocation received"
  const transfersIn = await prisma.transaction.findMany({
    where: {
      householdId: opts.householdId,
      deletedAt: null,
      type: "transfer",
      toAccountId: personalAccount.id,
      date: { gte: start, lte: end },
    },
    select: { amountCents: true },
  });
  const allocationCents = transfersIn.reduce((s, t) => s + t.amountCents, 0);

  const incomes = await prisma.personalIncome.findMany({
    where: {
      householdId: opts.householdId,
      userId: opts.userId,
      period: opts.period,
    },
  });
  const incomeCents = incomes.reduce((s, i) => s + i.amountCents, 0);

  const expenses = await prisma.personalExpense.findMany({
    where: {
      householdId: opts.householdId,
      userId: opts.userId,
      period: opts.period,
    },
  });
  const expenseCents = expenses.reduce((s, e) => s + e.amountCents, 0);

  const availableCents = allocationCents + incomeCents - expenseCents;

  // Full ledger balance of the private account (all-time)
  const allTxns = await prisma.transaction.findMany({
    where: {
      householdId: opts.householdId,
      deletedAt: null,
      OR: [
        { accountId: personalAccount.id },
        { toAccountId: personalAccount.id },
      ],
    },
    select: {
      type: true,
      amountCents: true,
      accountId: true,
      toAccountId: true,
      date: true,
      deletedAt: true,
    },
  });
  const accountBalanceCents = accountBalance(
    personalAccount.initialBalanceCents,
    allTxns,
    personalAccount.id
  );

  return {
    allocationCents,
    incomeCents,
    expenseCents,
    availableCents,
    totalPoolCents: allocationCents + incomeCents,
    personalAccount: {
      id: personalAccount.id,
      name: personalAccount.name,
      balanceCents: accountBalanceCents,
    },
  };
}
