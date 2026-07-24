import { z } from "zod";
import {
  createSessionToken,
  setSessionCookie,
  hashToken,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createHouseholdWithOwner, logActivity } from "@/lib/household";
import { jsonError, jsonOk } from "@/lib/access";
import {
  clientIp,
  clientUserAgent,
  enforceRateLimit,
} from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-monitor";

const schema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
  householdName: z.string().min(1).max(120).optional(),
  /** When set, join this household instead of creating a new one. */
  inviteToken: z.string().min(10).optional(),
});

/**
 * Create account. Password auth is disabled — client must immediately
 * register a passkey via /api/auth/webauthn/register.
 *
 * With `inviteToken`: create user + join the invited household (no own home).
 * Without: create user + own household as owner.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const ua = clientUserAgent(req);

  try {
    await enforceRateLimit({
      key: `register:ip:${ip}`,
      limit: 5,
      windowSec: 60 * 60,
    });

    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return jsonError(new Error("Este correo ya está registrado"));

    // ── Invite path: account + join household (no new home) ─────────────
    if (body.inviteToken) {
      const invite = await prisma.invite.findUnique({
        where: { tokenHash: hashToken(body.inviteToken) },
        include: { household: true },
      });
      if (!invite || invite.acceptedAt) {
        throw new Error("Invitación inválida");
      }
      if (invite.expiresAt < new Date()) {
        throw new Error("Invitación expirada");
      }
      if (invite.email.toLowerCase() !== email) {
        throw new Error(
          `Esta invitación es para ${invite.email}. Usa ese correo para unirte.`
        );
      }

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: null,
          displayName: body.displayName,
        },
      });

      await prisma.$transaction([
        prisma.membership.create({
          data: {
            householdId: invite.householdId,
            userId: user.id,
            role: invite.role,
          },
        }),
        prisma.invite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        }),
        prisma.userPreference.upsert({
          where: { userId: user.id },
          create: { userId: user.id, householdId: invite.householdId },
          update: { householdId: invite.householdId },
        }),
      ]);

      const sessionToken = await createSessionToken({
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
      });
      await setSessionCookie(sessionToken);

      await logActivity({
        householdId: invite.householdId,
        userId: user.id,
        action: "join",
        entityType: "membership",
        summary: `${user.displayName} se unió al hogar (invitación)`,
      });

      await recordSecurityEvent({
        type: "register",
        summary: `Cuenta vía invitación: ${user.displayName} (${user.email}) → ${invite.household.name}`,
        householdId: invite.householdId,
        userId: user.id,
        ip,
        userAgent: ua,
      });

      await recordSecurityEvent({
        type: "invite_accepted",
        summary: `${user.displayName} aceptó invitación al crear cuenta`,
        householdId: invite.householdId,
        userId: user.id,
        ip,
        userAgent: ua,
      });

      return jsonOk(
        {
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
          },
          household: {
            id: invite.household.id,
            name: invite.household.name,
          },
          joinedViaInvite: true,
          requirePasskey: true,
        },
        201
      );
    }

    // ── Default path: account + own household as owner ──────────────────
    const user = await prisma.user.create({
      data: {
        email,
        // Passkey-only: no usable password
        passwordHash: null,
        displayName: body.displayName,
      },
    });

    const household = await createHouseholdWithOwner({
      name: body.householdName || `Hogar de ${body.displayName}`,
      userId: user.id,
    });

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    await setSessionCookie(token);

    await recordSecurityEvent({
      type: "register",
      summary: `Nueva cuenta y hogar: ${user.displayName} (${user.email})`,
      householdId: household.id,
      userId: user.id,
      ip,
      userAgent: ua,
    });

    return jsonOk(
      {
        user: { id: user.id, email: user.email, displayName: user.displayName },
        requirePasskey: true,
      },
      201
    );
  } catch (e) {
    return jsonError(e);
  }
}
