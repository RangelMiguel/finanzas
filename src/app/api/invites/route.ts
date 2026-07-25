import { z } from "zod";
import {
  requireSession,
  requireHouseholdAccess,
  generateInviteToken,
  hashToken,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { logActivity } from "@/lib/household";
import {
  LIMITED_VISIBILITY,
  parseVisibility,
  serializeVisibility,
  type MemberVisibility,
} from "@/lib/visibility";

function defaultVisibilityForRole(role: string): MemberVisibility {
  if (role === "admin") {
    // Admins always get full access at runtime; still store full for consistency
    return parseVisibility({});
  }
  if (role === "viewer") {
    return {
      ...LIMITED_VISIBILITY,
      modules: {
        ...LIMITED_VISIBILITY.modules,
        tickets: false,
        safeToSpend: false,
      },
      onlyOwnTransactions: true,
    };
  }
  return { ...LIMITED_VISIBILITY };
}

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const invites = await prisma.invite.findMany({
      where: { householdId: m.householdId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({
      invites: invites.map(({ tokenHash, ...rest }) => ({
        ...rest,
        visibility: parseVisibility(rest.visibility),
        rawVisibility: parseVisibility(rest.visibility),
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
        /** Resend an existing pending invite: new token + extended expiry only. Does not change role or visibility. */
        resendInviteId: z.string().optional(),
        email: z.string().email().optional(),
        role: z.enum(["admin", "member", "viewer"]).default("member"),
        visibility: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await req.json());

    // --- Resend path: regenerate token & extend expiry; keep policies ---
    if (body.resendInviteId) {
      const existing = await prisma.invite.findFirst({
        where: {
          id: body.resendInviteId,
          householdId: m.householdId,
          acceptedAt: null,
        },
      });
      if (!existing) throw new Error("Invitación no encontrada");

      const token = generateInviteToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const updated = await prisma.invite.update({
        where: { id: existing.id },
        data: {
          tokenHash: hashToken(token),
          expiresAt,
          // intentionally do NOT touch role, email, or visibility
        },
      });

      await logActivity({
        householdId: m.householdId,
        userId: session.userId,
        action: "invite_resend",
        entityType: "invite",
        entityId: updated.id,
        summary: `Reenvió invitación a ${updated.email}`,
      });

      return jsonOk({
        invite: {
          id: updated.id,
          email: updated.email,
          role: updated.role,
          expiresAt: updated.expiresAt,
          visibility: parseVisibility(updated.visibility),
        },
        token,
        inviteUrl: `/invite/${token}`,
        resent: true,
      });
    }

    // --- Create path ---
    if (!body.email) throw new Error("email requerido");

    const token = generateInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const base = defaultVisibilityForRole(body.role);
    const visibility = body.visibility
      ? parseVisibility({
          ...base,
          ...body.visibility,
          modules: {
            ...base.modules,
            ...((body.visibility.modules as object) || {}),
          },
        })
      : base;

    const invite = await prisma.invite.create({
      data: {
        householdId: m.householdId,
        email: body.email.toLowerCase(),
        role: body.role,
        tokenHash: hashToken(token),
        expiresAt,
        createdById: session.userId,
        visibility: serializeVisibility(visibility),
      },
    });

    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "invite",
      entityType: "invite",
      entityId: invite.id,
      summary: `Invitó a ${body.email} como ${body.role}`,
    });

    return jsonOk(
      {
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
          visibility,
        },
        token,
        inviteUrl: `/invite/${token}`,
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
        inviteId: z.string(),
        role: z.enum(["admin", "member", "viewer"]).optional(),
        visibility: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await req.json());

    const existing = await prisma.invite.findFirst({
      where: {
        id: body.inviteId,
        householdId: m.householdId,
        acceptedAt: null,
      },
    });
    if (!existing) throw new Error("Invitación no encontrada");

    const data: { role?: string; visibility?: string } = {};
    if (body.role) data.role = body.role;

    if (body.visibility) {
      const current = parseVisibility(existing.visibility);
      const merged = parseVisibility({
        ...current,
        ...body.visibility,
        modules: {
          ...current.modules,
          ...((body.visibility.modules as object) || {}),
        },
      });
      data.visibility = serializeVisibility(merged);
    }

    const updated = await prisma.invite.update({
      where: { id: existing.id },
      data,
    });

    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "update",
      entityType: "invite",
      entityId: updated.id,
      summary: `Actualizó permisos de invitación ${updated.email}`,
    });

    return jsonOk({
      invite: {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        expiresAt: updated.expiresAt,
        visibility: parseVisibility(updated.visibility),
        rawVisibility: parseVisibility(updated.visibility),
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
    await prisma.invite.deleteMany({
      where: { id, householdId: m.householdId },
    });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
