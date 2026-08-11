import { z } from "zod";
import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
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

const unitSchema = z.enum(["pza", "kg", "L", "pack"]);

export async function POST(req: Request) {
  try {
    const m = await guard(true);
    const body = z
      .object({
        name: z.string().min(1),
        unit: unitSchema.optional(),
        notes: z.string().optional().nullable(),
      })
      .parse(await req.json());
    const item = await prisma.priceItem.create({
      data: {
        householdId: m.householdId,
        name: body.name.trim(),
        unit: body.unit || "pza",
        notes: body.notes || null,
      },
    });
    return jsonOk({ item }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const m = await guard(true);
    const body = z
      .object({
        id: z.string(),
        name: z.string().min(1).optional(),
        unit: unitSchema.optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.priceItem.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    const item = await prisma.priceItem.update({
      where: { id: body.id },
      data: { name: body.name, unit: body.unit, notes: body.notes },
    });
    return jsonOk({ item });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const m = await guard(true);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    const existing = await prisma.priceItem.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    await prisma.priceItem.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
