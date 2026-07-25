import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { monthKey, todayISO } from "@/lib/utils";
import { canListCreditCards, canSeeModule } from "@/lib/visibility";
import { ForbiddenError } from "@/lib/auth";
import { monthBounds } from "@/lib/money";
import {
  addDaysISO,
  summarizeCardPayments,
} from "@/lib/credit-card-cycles";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    // Names for "paid with" on movements even without full cards module
    if (!canListCreditCards(m.visibility)) {
      throw new ForbiddenError("No access to credit cards");
    }
    const fullCardsModule = canSeeModule(m.visibility, "creditCards");
    const cards = await prisma.creditCard.findMany({
      where: { householdId: m.householdId },
      orderBy: { name: "asc" },
    });
    const visible = cards.filter(
      (c) => !m.visibility.hiddenCreditCardIds.includes(c.id)
    );

    // Picker-only: names without payment cycle totals
    if (!fullCardsModule) {
      return jsonOk({
        creditCards: visible.map((c) => ({
          ...c,
          monthSpendCents: 0,
          nextPayment: null,
          followingPayment: null,
          namesOnly: true,
        })),
      });
    }

    const asOf = todayISO();
    const month = monthKey();
    const { start: monthStart, end: monthEnd } = monthBounds(month);

    // Look back far enough for closed cycles + MSI months (≈ 2 years of MSI)
    const lookbackStart = addDaysISO(asOf, -750);

    const [spend, installments] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          householdId: m.householdId,
          type: "expense",
          deletedAt: null,
          date: { gte: lookbackStart },
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
        where: {
          householdId: m.householdId,
          creditCardId: { not: null },
        },
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

    return jsonOk({
      creditCards: visible.map((c) => {
        const summary = summarizeCardPayments({
          creditCardId: c.id,
          cutoffDay: c.cutoffDay,
          graceDays: c.graceDays,
          asOf,
          monthStart,
          monthEnd,
          transactions: spend,
          installments,
        });
        return {
          ...c,
          monthSpendCents: summary.monthSpendCents,
          nextPayment: summary.nextPayment,
          followingPayment: summary.followingPayment,
        };
      }),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        name: z.string().min(1),
        lastFour: z.string().max(4).default(""),
        cutoffDay: z.number().int().min(1).max(31).default(1),
        graceDays: z.number().int().min(0).max(45).default(20),
        color: z.string().optional(),
      })
      .parse(await req.json());
    const card = await prisma.creditCard.create({
      data: { householdId: m.householdId, ...body },
    });
    return jsonOk({ creditCard: card }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        id: z.string(),
        name: z.string().optional(),
        lastFour: z.string().optional(),
        cutoffDay: z.number().int().optional(),
        graceDays: z.number().int().optional(),
        color: z.string().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.creditCard.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Tarjeta no encontrada");
    const { id, ...data } = body;
    const card = await prisma.creditCard.update({ where: { id }, data });
    return jsonOk({ creditCard: card });
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
    const existing = await prisma.creditCard.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Tarjeta no encontrada");
    await prisma.creditCard.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
