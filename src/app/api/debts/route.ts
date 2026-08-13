import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { ForbiddenError } from "@/lib/auth";
import {
  amortizeDebt,
  normalizePaymentPlanCents,
  parsePaymentPlan,
  suggestMonthlyDebtPay,
} from "@/lib/debts";

/** Body payment plan: currency units → cents array, or null to clear. */
function planCentsFromBody(
  plan: unknown
): number[] | null | undefined {
  if (plan === undefined) return undefined;
  if (plan === null) return null;
  if (!Array.isArray(plan)) return null;
  const cents = plan
    .map((p) => pesosToCents(p as number | string))
    .filter((c) => c > 0);
  return normalizePaymentPlanCents(cents);
}

function toJsonPlan(
  plan: number[] | null | undefined
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (plan === undefined) return undefined;
  if (plan === null) return Prisma.DbNull;
  return plan;
}

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "debts")) {
      throw new ForbiddenError("No access to debts");
    }
    const debts = await prisma.debt.findMany({
      where: { householdId: m.householdId },
      include: {
        payments: { orderBy: { date: "desc" } },
        propertyItems: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const visibleDebts = debts.filter(
      (d) => !m.visibility.hiddenDebtIds.includes(d.id)
    );
    const enriched = visibleDebts.map((d) => {
      const paidCapital = d.payments.reduce((s, p) => s + p.capitalCents, 0);
      const paidInterest = d.payments.reduce((s, p) => s + p.interestCents, 0);
      const remaining = Math.max(0, d.principalCents - paidCapital);
      const show = m.visibility.showDebtBalances;
      const paymentPlanCents = parsePaymentPlan(d.paymentPlanCents);
      const nextBudget =
        paymentPlanCents?.[0] ?? d.monthlyPaymentCents;
      const suggested = suggestMonthlyDebtPay({
        remainingCents: remaining,
        monthlyPaymentCents: nextBudget,
        annualRatePercent: d.annualRatePercent,
      });
      const plan = amortizeDebt({
        remainingCents: remaining,
        monthlyPaymentCents: d.monthlyPaymentCents,
        annualRatePercent: d.annualRatePercent,
        paymentPlanCents,
        scheduleMonths: Math.max(
          6,
          paymentPlanCents?.length ?? 0,
          12
        ),
      });
      return {
        ...d,
        paymentPlanCents: show ? paymentPlanCents : null,
        principalCents: show ? d.principalCents : null,
        paidCapitalCents: show ? paidCapital : null,
        paidInterestCents: show ? paidInterest : null,
        remainingCents: show ? remaining : null,
        suggestedPay: show ? suggested : null,
        plan: show
          ? {
              months: plan.months,
              totalInterestCents: plan.totalInterestCents,
              payoffOk: plan.payoffOk,
              paymentCoversInterest: plan.paymentCoversInterest,
              minPaymentCents: plan.minPaymentCents,
              schedule: plan.schedule,
              next: plan.next,
              hasCustomPlan: plan.hasCustomPlan,
            }
          : null,
        balancesHidden: !show,
      };
    });
    return jsonOk({ debts: enriched });
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
        principal: z.union([z.number(), z.string()]),
        annualRatePercent: z.number().default(0),
        monthlyPayment: z.union([z.number(), z.string()]).default(0),
        paymentDay: z.number().int().min(1).max(31).default(1),
        notes: z.string().optional().nullable(),
        paymentPlan: z
          .array(z.union([z.number(), z.string()]))
          .nullable()
          .optional(),
      })
      .parse(await req.json());
    const paymentPlanCents = planCentsFromBody(body.paymentPlan);
    const debt = await prisma.debt.create({
      data: {
        householdId: m.householdId,
        name: body.name,
        principalCents: pesosToCents(body.principal),
        annualRatePercent: body.annualRatePercent,
        monthlyPaymentCents: pesosToCents(body.monthlyPayment),
        paymentDay: body.paymentDay,
        notes: body.notes || null,
        paymentPlanCents: toJsonPlan(paymentPlanCents),
      },
    });
    return jsonOk({ debt }, 201);
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
        principal: z.union([z.number(), z.string()]).optional(),
        annualRatePercent: z.number().optional(),
        monthlyPayment: z.union([z.number(), z.string()]).optional(),
        paymentDay: z.number().int().optional(),
        notes: z.string().nullable().optional(),
        paymentPlan: z
          .array(z.union([z.number(), z.string()]))
          .nullable()
          .optional(),
      })
      .parse(await req.json());
    const existing = await prisma.debt.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Deuda no encontrada");
    const paymentPlanCents = planCentsFromBody(body.paymentPlan);
    const debt = await prisma.debt.update({
      where: { id: body.id },
      data: {
        name: body.name,
        principalCents:
          body.principal !== undefined ? pesosToCents(body.principal) : undefined,
        annualRatePercent: body.annualRatePercent,
        monthlyPaymentCents:
          body.monthlyPayment !== undefined
            ? pesosToCents(body.monthlyPayment)
            : undefined,
        paymentDay: body.paymentDay,
        notes: body.notes,
        ...(paymentPlanCents !== undefined
          ? { paymentPlanCents: toJsonPlan(paymentPlanCents) }
          : {}),
      },
    });
    return jsonOk({ debt });
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
    const existing = await prisma.debt.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Deuda no encontrada");
    await prisma.debt.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
