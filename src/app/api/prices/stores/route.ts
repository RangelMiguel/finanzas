import { z } from "zod";
import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { canSeeModule } from "@/lib/visibility";
import { requireAddon } from "@/lib/modules/access";

const DEFAULT_STORES = [
  "Walmart",
  "Soriana",
  "Chedraui",
  "Bodega Aurrera",
  "Costco",
  "Mercado Libre",
  "Oxxo",
];

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
        name: z.string().min(1).optional(),
        seed: z.boolean().optional(),
      })
      .parse(await req.json());
    if (body.seed) {
      const existing = await prisma.priceStore.findMany({
        where: { householdId: m.householdId },
        select: { name: true },
      });
      const have = new Set(existing.map((s) => s.name.toLowerCase()));
      const toAdd = DEFAULT_STORES.filter((n) => !have.has(n.toLowerCase()));
      if (toAdd.length) {
        await prisma.priceStore.createMany({
          data: toAdd.map((name) => ({ householdId: m.householdId, name })),
        });
      }
      const stores = await prisma.priceStore.findMany({
        where: { householdId: m.householdId },
        orderBy: { name: "asc" },
      });
      return jsonOk({ stores });
    }
    if (!body.name) throw new Error("Nombre requerido");
    const store = await prisma.priceStore.create({
      data: { householdId: m.householdId, name: body.name.trim() },
    });
    return jsonOk({ store }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const m = await guard(true);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    const existing = await prisma.priceStore.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    await prisma.priceStore.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
