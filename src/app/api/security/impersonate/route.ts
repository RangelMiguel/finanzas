import { z } from "zod";
import {
  requireSession,
  requireHouseholdAccess,
  setImpersonationCookie,
  clearImpersonationCookie,
  ForbiddenError,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";

/** Start viewing the household as a member or pending invite (admin only). */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const body = z
      .object({
        membershipId: z.string().optional(),
        inviteId: z.string().optional(),
      })
      .parse(await req.json());

    if (body.membershipId) {
      const target = await prisma.membership.findFirst({
        where: { id: body.membershipId, householdId: m.householdId },
        include: {
          user: { select: { displayName: true, email: true } },
        },
      });
      if (!target) throw new Error("Miembro no encontrado");
      if (target.userId === session.userId) {
        throw new ForbiddenError("Ya eres ese miembro");
      }
      await setImpersonationCookie("membership", target.id);
      return jsonOk({
        impersonating: {
          kind: "membership",
          id: target.id,
          role: target.role,
          label: target.user.displayName || target.user.email,
        },
      });
    }

    if (body.inviteId) {
      const invite = await prisma.invite.findFirst({
        where: {
          id: body.inviteId,
          householdId: m.householdId,
          acceptedAt: null,
        },
      });
      if (!invite) throw new Error("Invitación no encontrada");
      await setImpersonationCookie("invite", invite.id);
      return jsonOk({
        impersonating: {
          kind: "invite",
          id: invite.id,
          role: invite.role,
          label: invite.email,
        },
      });
    }

    throw new Error("membershipId o inviteId requerido");
  } catch (e) {
    return jsonError(e);
  }
}

/** Stop impersonation and restore admin view. */
export async function DELETE() {
  try {
    await requireSession();
    await clearImpersonationCookie();
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

/** Current impersonation status (for the shell banner). */
export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    return jsonOk({
      impersonating: m.impersonating
        ? {
            kind: m.impersonating.kind,
            id: m.impersonating.id,
            role: m.impersonating.role,
            label: m.impersonating.label,
          }
        : null,
    });
  } catch (e) {
    return jsonError(e);
  }
}
