import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO } from "@/lib/utils";
import {
  consumePaymentPlanStep,
  debtPaymentDescription,
  parsePaymentPlan,
} from "@/lib/debts";
import { undoDebtPayment } from "@/lib/debt-payments";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        debtId: z.string(),
        date: z.string().optional(),
        capital: z.union([z.number(), z.string()]),
        interest: z.union([z.number(), z.string()]).optional(),
        accountId: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        /** Advance custom plan by one installment (default true when a plan exists). */
        consumePlan: z.boolean().optional(),
      })
      .parse(await req.json());
    const debt = await prisma.debt.findFirst({
      where: { id: body.debtId, householdId: m.householdId },
    });
    if (!debt) throw new Error("Deuda no encontrada");

    const capitalCents = pesosToCents(body.capital);
    const interestCents = pesosToCents(body.interest || 0);
    const date = body.date || todayISO();
    const cashCents = capitalCents + interestCents;

    const payment = await prisma.$transaction(async (tx) => {
      let transactionId: string | null = null;
      if (body.accountId && cashCents > 0) {
        const txn = await tx.transaction.create({
          data: {
            householdId: m.householdId,
            date,
            amountCents: cashCents,
            description: debtPaymentDescription(debt.name),
            type: "expense",
            accountId: body.accountId,
            createdById: session.userId,
            fundings: {
              create: {
                amountCents: cashCents,
                accountId: body.accountId,
              },
            },
          },
        });
        transactionId = txn.id;
      }

      const plan = parsePaymentPlan(debt.paymentPlanCents);
      const shouldConsume =
        body.consumePlan !== false && !!plan?.length && capitalCents > 0;
      const consumedPlanStepCents =
        shouldConsume && plan ? plan[0] : null;
      if (shouldConsume) {
        const rest = consumePaymentPlanStep(debt.paymentPlanCents);
        await tx.debt.update({
          where: { id: debt.id },
          data: {
            paymentPlanCents: rest === null ? Prisma.DbNull : rest,
          },
        });
      }

      return tx.debtPayment.create({
        data: {
          householdId: m.householdId,
          debtId: body.debtId,
          date,
          capitalCents,
          interestCents,
          accountId: body.accountId || null,
          notes: body.notes || null,
          transactionId,
          consumedPlanStepCents,
        },
      });
    });

    return jsonOk({ payment }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    const existing = await prisma.debtPayment.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Pago no encontrado");
    await prisma.$transaction(async (tx) => {
      await undoDebtPayment(tx, {
        householdId: m.householdId,
        payment: existing,
        deleteLinkedTransaction: true,
      });
    });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
