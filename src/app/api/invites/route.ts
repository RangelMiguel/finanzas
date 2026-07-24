import { z } from "zod";
import {
  requireSession,
  requireHouseholdAccess,
  generateInviteToken,
  hashToken,
  canManageMembers,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { logActivity } from "@/lib/household";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const invites = await prisma.invite.findMany({
      where: { householdId: m.householdId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ invites: invites.map(({ tokenHash, ...rest }) => rest) });
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
        email: z.string().email(),
        role: z.enum(["admin", "member", "viewer"]).default("member"),
      })
      .parse(await req.json());

    const token = generateInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await prisma.invite.create({
      data: {
        householdId: m.householdId,
        email: body.email.toLowerCase(),
        role: body.role,
        tokenHash: hashToken(token),
        expiresAt,
        createdById: session.userId,
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

    // Return raw token once (for shareable link)
    return jsonOk(
      {
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
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
