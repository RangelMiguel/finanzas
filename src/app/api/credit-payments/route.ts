import { z } from "zod";
import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { requireAddon } from "@/lib/modules/access";
import {
  clampPaymentCents,
  creditLedgerType,
  creditRemainingCents,
  type CreditDirection,
} from "@/lib/credits";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    await requireAddon(m.householdId, "credits");
    if (!canSeeModule(m.visibility, "credits")) {
      throw new ForbiddenError("Sin acceso a créditos");
    }
    const body = z
      .object({
        creditId: z.string(),
        amount: z.union([z.number(), z.string()]),
        date: z.string().optional(),
        accountId: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
      .parse(await req.json());
    const credit = await prisma.credit.findFirst({
      where: { id: body.creditId, householdId: m.householdId },
      include: { payments: { select: { amountCents: true } } },
    });
    if (!credit) throw new Error("Crédito no encontrado");
    const paid = credit.payments.reduce((s, p) => s + p.amountCents, 0);
    const remaining = creditRemainingCents(credit.principalCents, paid);
    const amountCents = clampPaymentCents(pesosToCents(body.amount), remaining);
    if (amountCents <= 0) throw new Error("Nada por registrar");
    const date = body.date || todayISO();

    const payment = await prisma.$transaction(async (tx) => {
      const row = await tx.creditPayment.create({
        data: {
          householdId: m.householdId,
          creditId: credit.id,
          date,
          amountCents,
          accountId: body.accountId || null,
          notes: body.notes || null,
        },
      });
      if (body.accountId) {
        const type = creditLedgerType(credit.direction as CreditDirection, "repay");
        await tx.transaction.create({
          data: {
            householdId: m.householdId,
            date,
            amountCents,
            description:
              type === "income"
                ? `Cobro a ${credit.counterpartyName}`
                : `Pago a ${credit.counterpartyName}`,
            type,
            accountId: body.accountId,
            createdById: session.userId,
            fundings: {
              create: { amountCents, accountId: body.accountId },
            },
          },
        });
      }
      return row;
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
    await requireAddon(m.householdId, "credits");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    const existing = await prisma.creditPayment.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    await prisma.creditPayment.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
