import { z } from "zod";
import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { requireAddon } from "@/lib/modules/access";

const effectSchema = z.enum(["improve", "depreciate"]);

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    await requireAddon(m.householdId, "properties");
    if (!canSeeModule(m.visibility, "properties")) {
      throw new ForbiddenError("Sin acceso a propiedades");
    }
    const body = z
      .object({
        propertyId: z.string(),
        description: z.string().min(1),
        cost: z.union([z.number(), z.string()]),
        effect: effectSchema.optional(),
        recoveryPercent: z.number().min(0).max(150).optional(),
        doneOn: z.string().optional().nullable(),
      })
      .parse(await req.json());
    const property = await prisma.propertyItem.findFirst({
      where: { id: body.propertyId, householdId: m.householdId },
    });
    if (!property) throw new Error("Propiedad no encontrada");
    const effect = body.effect || "improve";
    const item = await prisma.propertyImprovement.create({
      data: {
        householdId: m.householdId,
        propertyId: property.id,
        description: body.description,
        costCents: pesosToCents(body.cost),
        effect,
        recoveryPercent:
          body.recoveryPercent ?? (effect === "depreciate" ? 100 : 70),
        doneOn: body.doneOn || null,
      },
    });
    return jsonOk({ improvement: item }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    await requireAddon(m.householdId, "properties");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    const existing = await prisma.propertyImprovement.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    await prisma.propertyImprovement.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
