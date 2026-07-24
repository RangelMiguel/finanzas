import { z } from "zod";
import { requireSession, hashToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { logActivity } from "@/lib/household";
import { recordSecurityEvent } from "@/lib/security-monitor";
import { clientIp, clientUserAgent } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = z.object({ token: z.string().min(10) }).parse(await req.json());
    const invite = await prisma.invite.findUnique({
      where: { tokenHash: hashToken(body.token) },
      include: { household: true },
    });
    if (!invite || invite.acceptedAt) throw new Error("Invitación inválida");
    if (invite.expiresAt < new Date()) throw new Error("Invitación expirada");

    // Prefer matching invite email (token is still the secret)
    if (
      invite.email.toLowerCase() !== session.email.toLowerCase()
    ) {
      throw new Error(
        `Esta invitación es para ${invite.email}. Inicia sesión con ese correo o crea una cuenta desde el enlace.`
      );
    }

    const existing = await prisma.membership.findUnique({
      where: {
        householdId_userId: {
          householdId: invite.householdId,
          userId: session.userId,
        },
      },
    });
    if (existing) {
      await prisma.userPreference.upsert({
        where: { userId: session.userId },
        create: { userId: session.userId, householdId: invite.householdId },
        update: { householdId: invite.householdId },
      });
      return jsonOk({ household: invite.household, alreadyMember: true });
    }

    await prisma.$transaction([
      prisma.membership.create({
        data: {
          householdId: invite.householdId,
          userId: session.userId,
          role: invite.role,
        },
      }),
      prisma.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
      prisma.userPreference.upsert({
        where: { userId: session.userId },
        create: { userId: session.userId, householdId: invite.householdId },
        update: { householdId: invite.householdId },
      }),
    ]);

    await logActivity({
      householdId: invite.householdId,
      userId: session.userId,
      action: "join",
      entityType: "membership",
      summary: `${session.displayName} se unió al hogar`,
    });

    await recordSecurityEvent({
      type: "invite_accepted",
      summary: `${session.displayName} aceptó invitación al hogar`,
      householdId: invite.householdId,
      userId: session.userId,
      ip: clientIp(req),
      userAgent: clientUserAgent(req),
    });

    return jsonOk({ household: invite.household });
  } catch (e) {
    return jsonError(e);
  }
}
