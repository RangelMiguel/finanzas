import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { seedHouseholdDefaults, logActivity } from "@/lib/household";
import { recordSecurityEvent } from "@/lib/security-monitor";
import { clientIp, clientUserAgent, enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    await enforceRateLimit({
      key: `wipe:${session.userId}`,
      limit: 3,
      windowSec: 3600,
    });
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const body = z
      .object({ confirm: z.literal("BORRAR") })
      .parse(await req.json());
    void body;

    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { householdId: m.householdId } }),
      prisma.budget.deleteMany({ where: { householdId: m.householdId } }),
      prisma.debtPayment.deleteMany({ where: { householdId: m.householdId } }),
      prisma.debt.deleteMany({ where: { householdId: m.householdId } }),
      prisma.installmentPlan.deleteMany({ where: { householdId: m.householdId } }),
      prisma.recurringIncome.deleteMany({ where: { householdId: m.householdId } }),
      prisma.recurringExpense.deleteMany({ where: { householdId: m.householdId } }),
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

    await recordSecurityEvent({
      type: "wipe",
      summary: "Borrado total de datos del hogar",
      detail: `Por ${session.email}`,
      householdId: m.householdId,
      userId: session.userId,
      ip: clientIp(req),
      userAgent: clientUserAgent(req),
    });

    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
