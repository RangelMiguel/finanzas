import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  parsePaymentPlan,
  paymentMatchesLedgerTxn,
  prependPaymentPlanStep,
} from "@/lib/debts";

type Db = Prisma.TransactionClient | typeof prisma;

export type DebtPaymentUndoRow = {
  id: string;
  debtId: string;
  capitalCents: number;
  interestCents: number;
  transactionId?: string | null;
  consumedPlanStepCents?: number | null;
};

function restoredPlanStepCents(
  payment: DebtPaymentUndoRow,
  currentPlan: unknown
): number | null {
  if (
    payment.consumedPlanStepCents != null &&
    payment.consumedPlanStepCents > 0
  ) {
    return payment.consumedPlanStepCents;
  }
  // Legacy payments did not store the consumed step. Only restore when a
  // custom plan is still present (not the last installment, which cleared it).
  if (!parsePaymentPlan(currentPlan)) return null;
  const cash = payment.capitalCents + payment.interestCents;
  return cash > 0 ? cash : null;
}

/** Reverse a recorded payment: restore the custom plan and drop the row. */
export async function undoDebtPayment(
  db: Db,
  opts: {
    householdId: string;
    payment: DebtPaymentUndoRow;
    /** Soft-delete the linked movement when undoing from Debts. */
    deleteLinkedTransaction?: boolean;
  }
) {
  const debt = await db.debt.findFirst({
    where: { id: opts.payment.debtId, householdId: opts.householdId },
  });
  if (debt) {
    const step = restoredPlanStepCents(opts.payment, debt.paymentPlanCents);
    if (step) {
      const restored = prependPaymentPlanStep(debt.paymentPlanCents, step);
      await db.debt.update({
        where: { id: debt.id },
        data: {
          paymentPlanCents: restored === null ? Prisma.DbNull : restored,
        },
      });
    }
  }

  if (opts.deleteLinkedTransaction && opts.payment.transactionId) {
    await db.transaction.updateMany({
      where: {
        id: opts.payment.transactionId,
        householdId: opts.householdId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
  }

  await db.debtPayment.deleteMany({
    where: { id: opts.payment.id, householdId: opts.householdId },
  });
}

export async function findDebtPaymentForTransaction(
  db: Db,
  txn: {
    id: string;
    householdId: string;
    date: string;
    amountCents: number;
    accountId: string | null;
    description: string;
    type: string;
  }
) {
  const byId = await db.debtPayment.findFirst({
    where: { householdId: txn.householdId, transactionId: txn.id },
  });
  if (byId) return byId;
  if (txn.type !== "expense") return null;

  const candidates = await db.debtPayment.findMany({
    where: {
      householdId: txn.householdId,
      transactionId: null,
      date: txn.date,
      accountId: txn.accountId,
    },
    include: { debt: { select: { name: true } } },
  });
  return (
    candidates.find((p) =>
      paymentMatchesLedgerTxn(p, txn, p.debt.name)
    ) ?? null
  );
}

/**
 * Drop payments whose ledger movement was deleted, and backfill transactionId
 * on older rows that still have a live matching movement.
 */
export async function healOrphanedDebtPayments(householdId: string) {
  return prisma.$transaction(async (db) => {
    const payments = await db.debtPayment.findMany({
      where: { householdId },
      include: { debt: { select: { name: true } } },
    });
    if (payments.length === 0) return 0;

    const linkedIds = payments
      .map((p) => p.transactionId)
      .filter((id): id is string => !!id);
    const linkedTxns =
      linkedIds.length > 0
        ? await db.transaction.findMany({
            where: { householdId, id: { in: linkedIds } },
            select: { id: true, deletedAt: true },
          })
        : [];
    const linkedById = new Map(linkedTxns.map((t) => [t.id, t]));

    const unlinked = payments.filter((p) => !p.transactionId && p.accountId);
    const matchTxns =
      unlinked.length > 0
        ? await db.transaction.findMany({
            where: {
              householdId,
              type: "expense",
              OR: unlinked.map((p) => ({
                date: p.date,
                accountId: p.accountId,
                amountCents: p.capitalCents + p.interestCents,
              })),
            },
            select: {
              id: true,
              date: true,
              amountCents: true,
              accountId: true,
              description: true,
              type: true,
              deletedAt: true,
            },
          })
        : [];

    let undone = 0;
    const usedTxnIds = new Set<string>(linkedIds);

    for (const p of payments) {
      if (p.transactionId) {
        const t = linkedById.get(p.transactionId);
        if (!t || t.deletedAt) {
          await undoDebtPayment(db, { householdId, payment: p });
          undone += 1;
        }
        continue;
      }
      if (!p.accountId) continue;

      const matches = matchTxns.filter(
        (t) =>
          !usedTxnIds.has(t.id) && paymentMatchesLedgerTxn(p, t, p.debt.name)
      );
      const live = matches.find((t) => !t.deletedAt);
      if (live) {
        await db.debtPayment.update({
          where: { id: p.id },
          data: { transactionId: live.id },
        });
        usedTxnIds.add(live.id);
        continue;
      }
      const dead = matches.find((t) => t.deletedAt);
      if (dead) {
        usedTxnIds.add(dead.id);
        await undoDebtPayment(db, { householdId, payment: p });
        undone += 1;
      }
    }

    return undone;
  });
}
