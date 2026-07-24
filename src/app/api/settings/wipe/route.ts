import { z } from "zod";
import { requireSession, requireHouseholdAccess, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { seedHouseholdDefaults } from "@/lib/household";
import { logActivity } from "@/lib/household";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const body = z
      .object({ password: z.string().min(1), confirm: z.literal("BORRAR") })
      .parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new Error("Contraseña incorrecta");
    }

    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { householdId: m.householdId } }),
      prisma.budget.deleteMany({ where: { householdId: m.householdId } }),
      prisma.debtPayment.deleteMany({ where: { householdId: m.householdId } }),
      prisma.debt.deleteMany({ where: { householdId: m.householdId } }),
      prisma.installmentPlan.deleteMany({ where: { householdId: m.householdId } }),
      prisma.recurringIncome.deleteMany({ where: { householdId: m.householdId } }),
      prisma.creditCard.deleteMany({ where: { householdId: m.householdId } }),
      prisma.account.deleteMany({ where: { householdId: m.householdId } }),
      prisma.category.deleteMany({ where: { householdId: m.householdId } }),
      prisma.activityEvent.deleteMany({ where: { householdId: m.householdId } }),
    ]);

    await seedHouseholdDefaults(m.householdId);
    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "wipe",
      summary: "Borró todos los datos financieros del hogar",
    });

    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
