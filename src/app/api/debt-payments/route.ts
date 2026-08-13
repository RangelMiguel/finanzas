import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO } from "@/lib/utils";
import { consumePaymentPlanStep, parsePaymentPlan } from "@/lib/debts";

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

    const payment = await prisma.debtPayment.create({
      data: {
        householdId: m.householdId,
        debtId: body.debtId,
        date: body.date || todayISO(),
        capitalCents,
        interestCents,
        accountId: body.accountId || null,
        notes: body.notes || null,
      },
    });

    // Advance custom plan so projections stay in sync after "pay this month".
    const hasPlan = !!parsePaymentPlan(debt.paymentPlanCents)?.length;
    const shouldConsume = body.consumePlan !== false && hasPlan && capitalCents > 0;
    if (shouldConsume) {
      const rest = consumePaymentPlanStep(debt.paymentPlanCents);
      await prisma.debt.update({
        where: { id: debt.id },
        data: {
          paymentPlanCents: rest === null ? Prisma.DbNull : rest,
        },
      });
    }

    // Ledger movement only when the user pays from an account (same as cards).
    if (body.accountId && capitalCents + interestCents > 0) {
      await prisma.transaction.create({
        data: {
          householdId: m.householdId,
          date: body.date || todayISO(),
          amountCents: capitalCents + interestCents,
          description: `Pago a ${debt.name}`,
          type: "expense",
          accountId: body.accountId,
          createdById: session.userId,
          fundings: {
            create: {
              amountCents: capitalCents + interestCents,
              accountId: body.accountId,
            },
          },
        },
      });
    }

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
    await prisma.debtPayment.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
