import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import {
  createRegistrationOptions,
  verifyRegistration,
  listCredentials,
  removeCredential,
} from "@/lib/webauthn";
import { clientIp, clientUserAgent, enforceRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-monitor";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

/** GET — list passkeys; POST options; PUT verify; DELETE remove */
export async function GET() {
  try {
    const session = await requireSession();
    const credentials = await listCredentials(session.userId);
    return jsonOk({ credentials });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    await enforceRateLimit({
      key: `webauthn-reg:${session.userId}`,
      limit: 10,
      windowSec: 60 * 60,
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });
    const options = await createRegistrationOptions(user, req);
    return jsonOk(options);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  const ip = clientIp(req);
  const ua = clientUserAgent(req);
  try {
    const session = await requireSession();
    const body = z
      .object({
        response: z.unknown(),
        nickname: z.string().max(80).optional(),
      })
      .parse(await req.json());

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });
    const cred = await verifyRegistration(
      user,
      req,
      body.response as RegistrationResponseJSON,
      body.nickname
    );

    await recordSecurityEvent({
      type: "passkey_added",
      summary: `Llave de seguridad registrada: ${cred.nickname || cred.deviceType || "passkey"}`,
      userId: user.id,
      ip,
      userAgent: ua,
    });

    return jsonOk({
      credential: {
        id: cred.id,
        nickname: cred.nickname,
        deviceType: cred.deviceType,
        createdAt: cred.createdAt,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  const ip = clientIp(req);
  const ua = clientUserAgent(req);
  try {
    const session = await requireSession();
    const body = z.object({ id: z.string().min(1) }).parse(await req.json());

    const count = await prisma.webAuthnCredential.count({
      where: { userId: session.userId },
    });
    if (count <= 1) {
      throw new Error(
        "No puedes eliminar tu única llave de acceso. Registra otra antes de quitar esta."
      );
    }

    const cred = await removeCredential(session.userId, body.id);

    await recordSecurityEvent({
      type: "passkey_removed",
      summary: `Llave de seguridad eliminada: ${cred.nickname || cred.deviceType || "passkey"}`,
      userId: session.userId,
      ip,
      userAgent: ua,
    });

    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
