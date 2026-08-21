import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { todayISO } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import {
  addDaysISO,
  detailedCardPaymentSchedule,
} from "@/lib/credit-card-cycles";
import { loadRecordedCardPayments } from "@/lib/cc-payment";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "creditCards")) {
      throw new ForbiddenError("No access to credit cards");
    }
    const { id } = await ctx.params;
    if (m.visibility.hiddenCreditCardIds.includes(id)) {
      throw new ForbiddenError("No access to this card");
    }

    const card = await prisma.creditCard.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!card) throw new Error("Tarjeta no encontrada");

    const asOf = todayISO();
    const [txns, plans, recordedPayments] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          householdId: m.householdId,
          type: "expense",
          deletedAt: null,
          date: { gte: addDaysISO(asOf, -750) },
          OR: [
            { creditCardId: id },
            { fundings: { some: { creditCardId: id } } },
          ],
        },
        select: {
          id: true,
          creditCardId: true,
          amountCents: true,
          date: true,
          description: true,
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
        where: { householdId: m.householdId, creditCardId: id },
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
      loadRecordedCardPayments(m.householdId, id),
    ]);

    const schedule = detailedCardPaymentSchedule({
      creditCardId: card.id,
      cutoffDay: card.cutoffDay,
      graceDays: card.graceDays,
      asOf,
      transactions: txns,
      installments: plans,
      recordedPayments,
    });

    // Full plan rows for in-place editing (orphaned garbage from pre-fix deletes, etc.)
    const msiPlans = plans.map((p) => {
      const pending = schedule.msiPending.find((x) => x.id === p.id);
      return {
        ...p,
        monthsLeft: pending?.monthsLeft ?? 0,
        remainingCents: pending?.remainingCents ?? 0,
        nextChargeDate: pending?.nextChargeDate ?? null,
      };
    });

    return jsonOk({
      creditCard: card,
      asOf,
      payments: schedule.payments.map((p) => ({
        ...p,
        amountCents: p.remainingCents,
      })),
      recordedPayments,
      msiPending: schedule.msiPending,
      msiPlans,
      totalPendingCents: schedule.totalPendingCents,
      totalMsiRemainingCents: schedule.msiPending.reduce(
        (s, p) => s + p.remainingCents,
        0
      ),
    });
  } catch (e) {
    return jsonError(e);
  }
}
