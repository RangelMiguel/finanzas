import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import {
  parseVisibility,
  serializeVisibility,
} from "@/lib/visibility";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const rows = await prisma.visibilityTemplate.findMany({
      where: { householdId: m.householdId },
      orderBy: { name: "asc" },
    });
    return jsonOk({
      templates: rows.map((r) => ({
        id: r.id,
        name: r.name,
        visibility: parseVisibility(r.visibility),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const body = z
      .object({
        name: z.string().min(1).max(80),
        visibility: z.record(z.string(), z.unknown()),
      })
      .parse(await req.json());

    const visibility = parseVisibility(body.visibility);
    const created = await prisma.visibilityTemplate.create({
      data: {
        householdId: m.householdId,
        name: body.name.trim(),
        visibility: serializeVisibility(visibility),
      },
    });

    return jsonOk(
      {
        template: {
          id: created.id,
          name: created.name,
          visibility,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      },
      201
    );
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const body = z
      .object({
        id: z.string(),
        name: z.string().min(1).max(80).optional(),
        visibility: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await req.json());

    const existing = await prisma.visibilityTemplate.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Plantilla no encontrada");

    const data: { name?: string; visibility?: string } = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.visibility !== undefined) {
      data.visibility = serializeVisibility(parseVisibility(body.visibility));
    }

    const updated = await prisma.visibilityTemplate.update({
      where: { id: body.id },
      data,
    });

    return jsonOk({
      template: {
        id: updated.id,
        name: updated.name,
        visibility: parseVisibility(updated.visibility),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    await prisma.visibilityTemplate.deleteMany({
      where: { id, householdId: m.householdId },
    });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
