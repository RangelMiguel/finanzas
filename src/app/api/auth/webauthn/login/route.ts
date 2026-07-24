import { z } from "zod";
import {
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/access";
import {
  createAuthenticationOptions,
  verifyAuthentication,
} from "@/lib/webauthn";
import {
  clientIp,
  clientUserAgent,
  enforceRateLimit,
} from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-monitor";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

/** POST — start (options); PUT — verify + session */
export async function POST(req: Request) {
  const ip = clientIp(req);
  try {
    await enforceRateLimit({
      key: `webauthn-login:ip:${ip}`,
      limit: 20,
      windowSec: 15 * 60,
    });
    const body = z
      .object({ email: z.string().email().optional() })
      .parse(await req.json().catch(() => ({})));
    const options = await createAuthenticationOptions(req, body.email);
    return jsonOk(options);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  const ip = clientIp(req);
  const ua = clientUserAgent(req);
  try {
    await enforceRateLimit({
      key: `webauthn-login:ip:${ip}`,
      limit: 20,
      windowSec: 15 * 60,
    });

    const body = z
      .object({ response: z.unknown() })
      .parse(await req.json());

    const user = await verifyAuthentication(
      req,
      body.response as AuthenticationResponseJSON
    );

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    await setSessionCookie(token);

    await recordSecurityEvent({
      type: "login_passkey_success",
      summary: `Inicio de sesión con llave: ${user.displayName} (${user.email})`,
      userId: user.id,
      ip,
      userAgent: ua,
    });

    return jsonOk({
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  } catch (e) {
    await recordSecurityEvent({
      type: "login_passkey_failed",
      summary: "Fallo de acceso con llave de seguridad",
      detail: e instanceof Error ? e.message : "unknown",
      ip,
      userAgent: ua,
    }).catch(() => {});
    return jsonError(e);
  }
}
