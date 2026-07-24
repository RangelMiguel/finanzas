import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO } from "@/lib/utils";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const plans = await prisma.installmentPlan.findMany({
      where: { householdId: m.householdId },
      include: { creditCard: true, category: true },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ installmentPlans: plans });
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
        description: z.string().min(1),
        totalAmount: z.union([z.number(), z.string()]),
        months: z.number().int().min(2).max(48),
        creditCardId: z.string().optional().nullable(),
        categoryId: z.string().optional().nullable(),
        startDate: z.string().optional(),
      })
      .parse(await req.json());
    const total = pesosToCents(body.totalAmount);
    const monthly = Math.round(total / body.months);
    const plan = await prisma.installmentPlan.create({
      data: {
        householdId: m.householdId,
        description: body.description,
        totalAmountCents: total,
        months: body.months,
        monthlyAmountCents: monthly,
        creditCardId: body.creditCardId || null,
        categoryId: body.categoryId || null,
        startDate: body.startDate || todayISO(),
      },
    });
    return jsonOk({ installmentPlan: plan }, 201);
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
    const existing = await prisma.installmentPlan.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Plan no encontrado");
    await prisma.transaction.updateMany({
      where: { installmentPlanId: id },
      data: { deletedAt: new Date() },
    });
    await prisma.installmentPlan.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
