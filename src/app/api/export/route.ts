import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/access";
import { encryptBackup } from "@/lib/crypto-backup";
import { ForbiddenError } from "@/lib/auth";
import { z } from "zod";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    if (!m.visibility.showExport || !m.visibility.modules.importExport) {
      throw new ForbiddenError("Export not allowed for this member");
    }
    const body = z.object({ password: z.string().min(4) }).parse(await req.json());

    const [
      accounts,
      categories,
      transactions,
      budgets,
      creditCards,
      installmentPlans,
      recurringIncomes,
      debts,
      debtPayments,
    ] = await Promise.all([
      prisma.account.findMany({ where: { householdId: m.householdId } }),
      prisma.category.findMany({ where: { householdId: m.householdId } }),
      prisma.transaction.findMany({
        where: { householdId: m.householdId, deletedAt: null },
      }),
      prisma.budget.findMany({ where: { householdId: m.householdId } }),
      prisma.creditCard.findMany({ where: { householdId: m.householdId } }),
      prisma.installmentPlan.findMany({ where: { householdId: m.householdId } }),
      prisma.recurringIncome.findMany({ where: { householdId: m.householdId } }),
      prisma.debt.findMany({ where: { householdId: m.householdId } }),
      prisma.debtPayment.findMany({ where: { householdId: m.householdId } }),
    ]);

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      household: { name: m.household.name, currency: m.household.currency },
      accounts,
      categories,
      transactions,
      budgets,
      creditCards,
      installmentPlans,
      recurringIncomes,
      debts,
      debtPayments,
    };

    const encrypted = await encryptBackup(JSON.stringify(payload), body.password);
    return new Response(Buffer.from(encrypted), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="misfinanzas-${m.household.name.replace(/\s+/g, "_")}.enc"`,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
