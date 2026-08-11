import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { ForbiddenError } from "@/lib/auth";
import { requireAddon } from "@/lib/modules/access";
import { valueItem, type ValueChange, type ValueMethod } from "@/lib/properties/valuation";

const valueChangeSchema = z.enum(["none", "appreciate", "depreciate"]);
const methodSchema = z.enum(["compound", "straight"]);

function valued(row: {
  valueCents: number;
  acquiredOn: string | null;
  valueChange: string;
  annualRatePercent: number;
  method: string;
  usefulLifeYears: number | null;
  salvageCents: number;
}) {
  return valueItem({
    originalCents: row.valueCents,
    acquiredOn: row.acquiredOn,
    valueChange: (row.valueChange as ValueChange) || "none",
    annualRatePercent: row.annualRatePercent,
    method: (row.method as ValueMethod) || "compound",
    usefulLifeYears: row.usefulLifeYears,
    salvageCents: row.salvageCents,
  });
}

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
    const rows = await prisma.propertyItem.findMany({
      where: { householdId: m.householdId },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    const items = rows.map((row) => ({ ...row, valuation: valued(row) }));
    const assets = items.filter((i) => i.kind === "asset");
    const liabilities = items.filter((i) => i.kind === "liability");
    const assetCents = assets.reduce((s, i) => s + i.valuation.currentCents, 0);
    const liabilityCents = liabilities.reduce(
      (s, i) => s + i.valuation.currentCents,
      0
    );
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
        valueChange: valueChangeSchema.optional(),
        annualRatePercent: z.number().min(0).max(50).optional(),
        method: methodSchema.optional(),
        usefulLifeYears: z.number().min(0).max(80).optional().nullable(),
        salvage: z.union([z.number(), z.string()]).optional().nullable(),
        notes: z.string().optional().nullable(),
        acquiredOn: z.string().optional().nullable(),
      })
      .parse(await req.json());
    const row = await prisma.propertyItem.create({
      data: {
        householdId: m.householdId,
        name: body.name,
        kind: body.kind,
        category: body.category || "other",
        valueCents: pesosToCents(body.value),
        valueChange: body.valueChange || "none",
        annualRatePercent: body.annualRatePercent ?? 0,
        method: body.method || "compound",
        usefulLifeYears: body.usefulLifeYears ?? null,
        salvageCents: body.salvage != null ? pesosToCents(body.salvage) : 0,
        notes: body.notes || null,
        acquiredOn: body.acquiredOn || null,
      },
    });
    return jsonOk({ item: { ...row, valuation: valued(row) } }, 201);
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
        valueChange: valueChangeSchema.optional(),
        annualRatePercent: z.number().min(0).max(50).optional(),
        method: methodSchema.optional(),
        usefulLifeYears: z.number().min(0).max(80).optional().nullable(),
        salvage: z.union([z.number(), z.string()]).optional().nullable(),
        notes: z.string().nullable().optional(),
        acquiredOn: z.string().nullable().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.propertyItem.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    const row = await prisma.propertyItem.update({
      where: { id: body.id },
      data: {
        name: body.name,
        kind: body.kind,
        category: body.category,
        valueCents:
          body.value !== undefined ? pesosToCents(body.value) : undefined,
        valueChange: body.valueChange,
        annualRatePercent: body.annualRatePercent,
        method: body.method,
        usefulLifeYears: body.usefulLifeYears,
        salvageCents:
          body.salvage !== undefined && body.salvage !== null
            ? pesosToCents(body.salvage)
            : body.salvage === null
              ? 0
              : undefined,
        notes: body.notes,
        acquiredOn: body.acquiredOn,
      },
    });
    return jsonOk({ item: { ...row, valuation: valued(row) } });
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
