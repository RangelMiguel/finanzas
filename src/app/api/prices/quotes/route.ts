import { z } from "zod";
import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { requireAddon } from "@/lib/modules/access";

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
        unitPrice: z.union([z.number(), z.string()]),
        observedOn: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
      .parse(await req.json());
    const [item, store] = await Promise.all([
      prisma.priceItem.findFirst({
        where: { id: body.itemId, householdId: m.householdId },
      }),
      prisma.priceStore.findFirst({
        where: { id: body.storeId, householdId: m.householdId },
      }),
    ]);
    if (!item || !store) throw new Error("Artículo o tienda no encontrados");
    const quote = await prisma.priceQuote.create({
      data: {
        householdId: m.householdId,
        itemId: body.itemId,
        storeId: body.storeId,
        unitCents: pesosToCents(body.unitPrice),
        observedOn: body.observedOn || todayISO(),
        notes: body.notes || null,
      },
    });
    return jsonOk({ quote }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const m = await guard(true);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    const existing = await prisma.priceQuote.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    await prisma.priceQuote.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
