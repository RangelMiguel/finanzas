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
      })
      .parse(await req.json());
    if (body.fromAccountId === body.toAccountId) {
      throw new Error("No puedes transferir a la misma cuenta");
    }
    const amountCents = pesosToCents(body.amount);
    if (amountCents <= 0) throw new Error("Monto inválido");

    const [from, to] = await Promise.all([
      prisma.account.findFirst({
        where: { id: body.fromAccountId, householdId: m.householdId },
      }),
      prisma.account.findFirst({
        where: { id: body.toAccountId, householdId: m.householdId },
      }),
    ]);
    if (!from || !to) throw new Error("Cuenta no encontrada");

    const txn = await prisma.transaction.create({
      data: {
        householdId: m.householdId,
        date: body.date || todayISO(),
        amountCents,
        description: body.description || "Transferencia entre cuentas",
        type: "transfer",
        accountId: body.fromAccountId,
        toAccountId: body.toAccountId,
        createdById: session.userId,
      },
    });
    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "create",
      entityType: "transfer",
      entityId: txn.id,
      summary: `Transferencia ${from.name} → ${to.name}`,
    });
    return jsonOk({ transaction: txn }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
