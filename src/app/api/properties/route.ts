import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { ForbiddenError } from "@/lib/auth";
import { requireAddon } from "@/lib/modules/access";

const kindSchema = z.enum(["asset", "liability"]);
const categorySchema = z.enum([
  "home",
  "vehicle",
  "land",
  "jewelry",
  "electronics",
  "furniture",
  "mortgage",
  "loan",
  "other",
]);

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    await requireAddon(m.householdId, "properties");
    if (!canSeeModule(m.visibility, "properties")) {
      throw new ForbiddenError("Sin acceso a propiedades");
    }
    const items = await prisma.propertyItem.findMany({
      where: { householdId: m.householdId },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    const assets = items.filter((i) => i.kind === "asset");
    const liabilities = items.filter((i) => i.kind === "liability");
    const assetCents = assets.reduce((s, i) => s + i.valueCents, 0);
    const liabilityCents = liabilities.reduce((s, i) => s + i.valueCents, 0);
    return jsonOk({
      items,
      totals: {
        assetCents,
        liabilityCents,
        netCents: assetCents - liabilityCents,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}

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
        name: z.string().min(1),
        kind: kindSchema,
        category: categorySchema.optional(),
        value: z.union([z.number(), z.string()]),
        notes: z.string().optional().nullable(),
        acquiredOn: z.string().optional().nullable(),
      })
      .parse(await req.json());
    const item = await prisma.propertyItem.create({
      data: {
        householdId: m.householdId,
        name: body.name,
        kind: body.kind,
        category: body.category || "other",
        valueCents: pesosToCents(body.value),
        notes: body.notes || null,
        acquiredOn: body.acquiredOn || null,
      },
    });
    return jsonOk({ item }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    await requireAddon(m.householdId, "properties");
    const body = z
      .object({
        id: z.string(),
        name: z.string().min(1).optional(),
        kind: kindSchema.optional(),
        category: categorySchema.optional(),
        value: z.union([z.number(), z.string()]).optional(),
        notes: z.string().nullable().optional(),
        acquiredOn: z.string().nullable().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.propertyItem.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    const item = await prisma.propertyItem.update({
      where: { id: body.id },
      data: {
        name: body.name,
        kind: body.kind,
        category: body.category,
        valueCents:
          body.value !== undefined ? pesosToCents(body.value) : undefined,
        notes: body.notes,
        acquiredOn: body.acquiredOn,
      },
    });
    return jsonOk({ item });
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
    const existing = await prisma.propertyItem.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    await prisma.propertyItem.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
