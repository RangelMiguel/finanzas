import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO } from "@/lib/utils";
import { logActivity } from "@/lib/household";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        fromAccountId: z.string(),
        toAccountId: z.string(),
        amount: z.union([z.number(), z.string()]),
        description: z.string().optional(),
        date: z.string().optional(),
        /** Optional purpose category (e.g. school allowance for a child). */
        categoryId: z.string().nullable().optional(),
      })
      .parse(await req.json());
    if (body.fromAccountId === body.toAccountId) {
      throw new Error("No puedes transferir a la misma cuenta");
    }
    const amountCents = pesosToCents(body.amount);
    if (amountCents <= 0) throw new Error("Monto inválido");

    const categoryId =
      body.categoryId && body.categoryId.length > 0 ? body.categoryId : null;

    const [from, to, category] = await Promise.all([
      prisma.account.findFirst({
        where: { id: body.fromAccountId, householdId: m.householdId },
      }),
      prisma.account.findFirst({
        where: { id: body.toAccountId, householdId: m.householdId },
      }),
      categoryId
        ? prisma.category.findFirst({
            where: { id: categoryId, householdId: m.householdId },
          })
        : Promise.resolve(null),
    ]);
    if (!from || !to) throw new Error("Cuenta no encontrada");
    if (categoryId && !category) throw new Error("Categoría no encontrada");

    // Members may only send into their own personal account (or between shared accounts)
    const { canAdmin } = await import("@/lib/auth");
    const admin = canAdmin(m.realRole || m.role);
    if (to.ownerUserId && to.ownerUserId !== session.userId && !admin) {
      throw new Error("No puedes transferir a la cuenta personal de otro");
    }
    if (from.ownerUserId && from.ownerUserId !== session.userId && !admin) {
      throw new Error("No puedes transferir desde la cuenta personal de otro");
    }

    const txn = await prisma.transaction.create({
      data: {
        householdId: m.householdId,
        date: body.date || todayISO(),
        amountCents,
        description: body.description || "Transferencia entre cuentas",
        type: "transfer",
        accountId: body.fromAccountId,
        toAccountId: body.toAccountId,
        categoryId,
        createdById: session.userId,
      },
      include: { category: true },
    });
    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "create",
      entityType: "transfer",
      entityId: txn.id,
      summary: category
        ? `Transferencia ${from.name} → ${to.name} (${category.icon} ${category.name})`
        : `Transferencia ${from.name} → ${to.name}`,
    });
    return jsonOk({ transaction: txn }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
