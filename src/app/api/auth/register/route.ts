import { z } from "zod";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createHouseholdWithOwner } from "@/lib/household";
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
});

/**
 * Create account + household. Password auth is disabled — client must
 * immediately register a passkey via /api/auth/webauthn/register.
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
