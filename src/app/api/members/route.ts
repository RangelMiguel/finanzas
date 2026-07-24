import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import {
  effectiveVisibility,
  FULL_VISIBILITY,
  parseVisibility,
  serializeVisibility,
  type MemberVisibility,
} from "@/lib/visibility";

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
