import { z } from "zod";
import {
  requireSession,
  requireHouseholdAccess,
  ForbiddenError,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import {
  effectiveVisibility,
  FULL_VISIBILITY,
  parseVisibility,
  serializeVisibility,
} from "@/lib/visibility";
import { logActivity } from "@/lib/household";
import { recordSecurityEvent } from "@/lib/security-monitor";
import { clientIp, clientUserAgent } from "@/lib/rate-limit";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const members = await prisma.membership.findMany({
      where: { householdId: m.householdId },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const accounts = await prisma.account.findMany({
      where: { householdId: m.householdId },
      select: { id: true, name: true, icon: true },
    });
    const categories = await prisma.category.findMany({
      where: { householdId: m.householdId },
      select: { id: true, name: true, icon: true, type: true },
    });
    const creditCards = await prisma.creditCard.findMany({
      where: { householdId: m.householdId },
      select: { id: true, name: true, lastFour: true },
    });
    const debts = await prisma.debt.findMany({
      where: { householdId: m.householdId },
      select: { id: true, name: true },
    });

    return jsonOk({
      members: members.map((row) => ({
        id: row.id,
        role: row.role,
        user: row.user,
        visibility: effectiveVisibility(row.role, row.visibility),
        rawVisibility: parseVisibility(row.visibility),
      })),
      role: m.role,
      myVisibility: m.visibility,
      catalogs: { accounts, categories, creditCards, debts },
      defaults: FULL_VISIBILITY,
    });
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
        membershipId: z.string(),
        role: z.enum(["admin", "member", "viewer"]).optional(),
        visibility: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await req.json());

    const target = await prisma.membership.findFirst({
      where: { id: body.membershipId, householdId: m.householdId },
    });
    if (!target) throw new Error("Member not found");
    if (target.role === "owner") {
      if (body.role) throw new Error("Cannot change owner role");
      // still allow visibility? no - owner always full
      if (body.visibility) {
        throw new Error("Owner always has full access");
      }
    }

    const data: { role?: string; visibility?: string } = {};
    if (body.role && target.role !== "owner") data.role = body.role;
    if (body.visibility) {
      // merge with full defaults so partial updates work
      const merged = parseVisibility({
        ...parseVisibility(target.visibility),
        ...body.visibility,
        modules: {
          ...parseVisibility(target.visibility).modules,
          ...((body.visibility.modules as object) || {}),
        },
      });
      data.visibility = serializeVisibility(merged);
    }

    const updated = await prisma.membership.update({
      where: { id: body.membershipId },
      data,
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });

    return jsonOk({
      membership: {
        id: updated.id,
        role: updated.role,
        user: updated.user,
        visibility: effectiveVisibility(updated.role, updated.visibility),
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}

/**
 * Remove a member from the household (not the user account).
 * Owner/admin only. Cannot remove owner, self, or (as admin) another admin.
 */
export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const membershipId = new URL(req.url).searchParams.get("id");
    if (!membershipId) throw new Error("id requerido");

    const target = await prisma.membership.findFirst({
      where: { id: membershipId, householdId: m.householdId },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
    if (!target) throw new Error("Miembro no encontrado");

    if (target.role === "owner") {
      throw new ForbiddenError("No se puede quitar al dueño del hogar");
    }
    if (target.userId === session.userId) {
      throw new ForbiddenError("No puedes quitarte a ti mismo del hogar");
    }
    if (m.role !== "owner" && target.role === "admin") {
      throw new ForbiddenError(
        "Solo el dueño puede quitar a un administrador"
      );
    }

    const otherMembership = await prisma.membership.findFirst({
      where: {
        userId: target.userId,
        householdId: { not: m.householdId },
      },
      orderBy: { createdAt: "asc" },
    });

    await prisma.$transaction(async (tx) => {
      await tx.membership.delete({ where: { id: target.id } });

      const pref = await tx.userPreference.findUnique({
        where: { userId: target.userId },
      });
      if (pref?.householdId === m.householdId) {
        await tx.userPreference.update({
          where: { userId: target.userId },
          data: { householdId: otherMembership?.householdId ?? null },
        });
      }
    });

    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "remove_member",
      entityType: "membership",
      entityId: target.id,
      summary: `Quitó a ${target.user.displayName} (${target.user.email}) del hogar`,
    });

    await recordSecurityEvent({
      type: "member_removed",
      summary: `${session.displayName} quitó a ${target.user.displayName} del hogar`,
      householdId: m.householdId,
      userId: session.userId,
      ip: clientIp(req),
      userAgent: clientUserAgent(req),
    });

    return jsonOk({
      ok: true,
      removed: {
        membershipId: target.id,
        userId: target.userId,
        displayName: target.user.displayName,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
