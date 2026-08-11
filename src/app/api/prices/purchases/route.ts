import { z } from "zod";
import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { requireAddon } from "@/lib/modules/access";
import { paidUnitCents } from "@/lib/prices/compare";

async function guard(write = false) {
  const session = await requireSession();
  const m = await requireHouseholdAccess(session.userId, write ? { write: true } : undefined);
  await requireAddon(m.householdId, "prices");
  if (!canSeeModule(m.visibility, "prices")) {
    throw new ForbiddenError("Sin acceso a precios");
  }
  return m;
}

export async function POST(req: Request) {
  try {
    const m = await guard(true);
    const body = z
      .object({
        itemId: z.string(),
        storeId: z.string(),
        transactionId: z.string(),
        quantity: z.number().positive(),
        paidTotal: z.union([z.number(), z.string()]).optional(),
      })
      .parse(await req.json());
    const [item, store, txn] = await Promise.all([
      prisma.priceItem.findFirst({
        where: { id: body.itemId, householdId: m.householdId },
      }),
      prisma.priceStore.findFirst({
        where: { id: body.storeId, householdId: m.householdId },
      }),
      prisma.transaction.findFirst({
        where: {
          id: body.transactionId,
          householdId: m.householdId,
          deletedAt: null,
        },
      }),
    ]);
    if (!item || !store || !txn) throw new Error("Datos no encontrados");
    const paidTotalCents =
      body.paidTotal !== undefined
        ? pesosToCents(body.paidTotal)
        : txn.amountCents;
    const purchasedOn = txn.date || todayISO();
    const purchase = await prisma.$transaction(async (tx) => {
      const row = await tx.pricePurchase.create({
        data: {
          householdId: m.householdId,
          itemId: body.itemId,
          storeId: body.storeId,
          transactionId: body.transactionId,
          quantity: body.quantity,
          paidTotalCents,
          purchasedOn,
        },
      });
      const unit = paidUnitCents(paidTotalCents, body.quantity);
      if (unit > 0) {
        await tx.priceQuote.create({
          data: {
            householdId: m.householdId,
            itemId: body.itemId,
            storeId: body.storeId,
            unitCents: unit,
            observedOn: purchasedOn,
            notes: "Desde movimiento",
          },
        });
      }
      return row;
    });
    return jsonOk({ purchase }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const m = await guard(true);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    const existing = await prisma.pricePurchase.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    await prisma.pricePurchase.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
