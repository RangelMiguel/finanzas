import { z } from "zod";
import {
  ForbiddenError,
  requireHouseholdAccess,
  requireSession,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { logActivity } from "@/lib/household";
import { canSeeModule } from "@/lib/visibility";
import {
  addMonthsISO,
  nextCutoffAfter,
  parseBillingCutoffs,
  parseRemovedDates,
  serializeBillingCutoffs,
} from "@/lib/credit-card-cycles";

const moveSchema = z.object({
  kind: z.enum(["purchase", "msi"]),
  transactionId: z.string().optional(),
  planId: z.string().optional(),
  chargeDate: z.string().optional(),
  action: z.enum(["next", "this", "clear"]),
});

/**
 * Reassign charges that posted after the cut-off to another billing cycle
 * without changing the purchase date.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    if (!canSeeModule(m.visibility, "creditCards")) {
      throw new ForbiddenError("No access to credit cards");
    }
    const { id } = await ctx.params;
    if (m.visibility.hiddenCreditCardIds.includes(id)) {
      throw new ForbiddenError("No access to this card");
    }

    const body = z
      .object({
        cycleEnd: z.string().optional(),
        moves: z.array(moveSchema).min(1),
      })
      .parse(await req.json());

    const card = await prisma.creditCard.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!card) throw new Error("Tarjeta no encontrada");

    const needsCycle = body.moves.some((mv) => mv.action !== "clear");
    if (needsCycle && !body.cycleEnd) {
      throw new Error("Indica el ciclo que estás ajustando");
    }

    const cycleEnd = body.cycleEnd ? body.cycleEnd.slice(0, 10) : "";
    const nextEnd = cycleEnd
      ? nextCutoffAfter(cycleEnd, card.cutoffDay)
      : "";

    const purchaseIds = [
      ...new Set(
        body.moves
          .filter((mv) => mv.kind === "purchase" && mv.transactionId)
          .map((mv) => mv.transactionId!)
      ),
    ];
    const planIds = [
      ...new Set(
        body.moves
          .filter((mv) => mv.kind === "msi" && mv.planId)
          .map((mv) => mv.planId!)
      ),
    ];

    const [txns, plans] = await Promise.all([
      purchaseIds.length
        ? prisma.transaction.findMany({
            where: {
              id: { in: purchaseIds },
              householdId: m.householdId,
              deletedAt: null,
              type: "expense",
              OR: [
                { creditCardId: id },
                { fundings: { some: { creditCardId: id } } },
              ],
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      planIds.length
        ? prisma.installmentPlan.findMany({
            where: {
              id: { in: planIds },
              householdId: m.householdId,
              creditCardId: id,
            },
          })
        : Promise.resolve([]),
    ]);

    const txnSet = new Set(txns.map((t) => t.id));
    const planById = new Map(plans.map((p) => [p.id, p]));

    await prisma.$transaction(async (tx) => {
      for (const mv of body.moves) {
        if (mv.kind === "purchase") {
          if (!mv.transactionId || !txnSet.has(mv.transactionId)) {
            throw new Error("Cargo no encontrado en esta tarjeta");
          }
          const cutoff =
            mv.action === "clear"
              ? null
              : mv.action === "this"
                ? cycleEnd
                : nextEnd;
          await tx.transaction.update({
            where: { id: mv.transactionId },
            data: { ccBillingCutoff: cutoff },
          });
          continue;
        }

        if (!mv.planId || !mv.chargeDate) {
          throw new Error("Falta el cargo MSI a ajustar");
        }
        const plan = planById.get(mv.planId);
        if (!plan) throw new Error("Plan MSI no encontrado");
        const chargeDate = mv.chargeDate.slice(0, 10);
        const removed = parseRemovedDates(plan.removedDates);
        let valid = false;
        for (let i = 0; i < plan.months; i++) {
          if (addMonthsISO(plan.startDate, i) === chargeDate) {
            valid = true;
            break;
          }
        }
        if (!valid || removed.has(chargeDate)) {
          throw new Error("Esa fecha no pertenece a este plan MSI");
        }
        const map = parseBillingCutoffs(plan.billingCutoffs);
        if (mv.action === "clear") {
          delete map[chargeDate];
        } else {
          map[chargeDate] = mv.action === "this" ? cycleEnd : nextEnd;
        }
        const serialized = serializeBillingCutoffs(map);
        await tx.installmentPlan.update({
          where: { id: plan.id },
          data: { billingCutoffs: serialized },
        });
        plan.billingCutoffs = serialized;
      }
    });

    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "update",
      entityType: "credit_card",
      entityId: card.id,
      summary: `Ajuste por procesamiento: ${body.moves.length} cargo(s) en ${card.name}`,
    });

    return jsonOk({ ok: true, moved: body.moves.length });
  } catch (e) {
    return jsonError(e);
  }
}
