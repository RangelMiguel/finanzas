import { z } from "zod";
import { requireHouseholdAccess, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { generateMeatToken, serializeMeatLink } from "@/lib/integrations/meat";

function normalizeAppUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin + (url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, ""));
  } catch {
    return "";
  }
}
import { logActivity } from "@/lib/household";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const link = await prisma.meatLink.findUnique({
      where: { householdId: m.householdId },
    });
    return jsonOk({ meat: serializeMeatLink(link) });
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
        enabled: z.boolean().optional(),
        accountId: z.string().nullable().optional(),
        creditCardId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        appUrl: z.string().max(300).optional(),
      })
      .parse(await req.json());

    const existing = await prisma.meatLink.findUnique({
      where: { householdId: m.householdId },
    });
    if (!existing) {
      throw new Error("Genera una llave antes de elegir cuenta, tarjeta o categoría");
    }

    if (body.accountId) {
      const account = await prisma.account.findFirst({
        where: { id: body.accountId, householdId: m.householdId },
      });
      if (!account) throw new Error("Cuenta no encontrada");
    }
    if (body.creditCardId) {
      const card = await prisma.creditCard.findFirst({
        where: { id: body.creditCardId, householdId: m.householdId },
      });
      if (!card) throw new Error("Tarjeta no encontrada");
    }
    if (body.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: body.categoryId, householdId: m.householdId, type: "expense" },
      });
      if (!category) throw new Error("Categoría no encontrada");
    }

    const link = await prisma.meatLink.update({
      where: { id: existing.id },
      data: {
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.accountId !== undefined ? { accountId: body.accountId } : {}),
        ...(body.creditCardId !== undefined ? { creditCardId: body.creditCardId } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.appUrl !== undefined ? { appUrl: normalizeAppUrl(body.appUrl) } : {}),
      },
    });
    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "update",
      entityType: "meatLink",
      entityId: link.id,
      summary: "Conexión meat actualizada",
    });
    return jsonOk({ meat: serializeMeatLink(link) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const generated = generateMeatToken();
    const existing = await prisma.meatLink.findUnique({
      where: { householdId: m.householdId },
    });
    const link = existing
      ? await prisma.meatLink.update({
          where: { id: existing.id },
          data: {
            tokenHash: generated.hash,
            tokenPrefix: generated.prefix,
            enabled: true,
          },
        })
      : await prisma.meatLink.create({
          data: {
            householdId: m.householdId,
            tokenHash: generated.hash,
            tokenPrefix: generated.prefix,
            enabled: true,
          },
        });
    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: existing ? "update" : "create",
      entityType: "meatLink",
      entityId: link.id,
      summary: existing ? "Llave meat regenerada" : "Llave meat creada",
    });
    return jsonOk({ meat: serializeMeatLink(link), token: generated.token });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    await prisma.meatLink.deleteMany({ where: { householdId: m.householdId } });
    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "delete",
      entityType: "meatLink",
      entityId: m.householdId,
      summary: "Llave meat revocada",
    });
    return jsonOk({ meat: serializeMeatLink(null) });
  } catch (e) {
    return jsonError(e);
  }
}
