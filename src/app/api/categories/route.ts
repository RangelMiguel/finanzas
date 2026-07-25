import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { filterCategoryId } from "@/lib/visibility";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const categories = await prisma.category.findMany({
      where: { householdId: m.householdId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    // Don't offer categories this member is not allowed to see
    const visible = categories.filter((c) =>
      filterCategoryId(m.visibility, c.id)
    );
    return jsonOk({ categories: visible });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        name: z.string().min(1),
        type: z.enum(["income", "expense"]),
        icon: z.string().default("📦"),
        color: z.string().default("#6366f1"),
      })
      .parse(await req.json());
    const category = await prisma.category.create({
      data: { householdId: m.householdId, ...body },
    });
    return jsonOk({ category }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        id: z.string(),
        name: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.category.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Categoría no encontrada");
    const category = await prisma.category.update({
      where: { id: body.id },
      data: { name: body.name, icon: body.icon, color: body.color },
    });
    return jsonOk({ category });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    const existing = await prisma.category.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Categoría no encontrada");
    await prisma.category.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
