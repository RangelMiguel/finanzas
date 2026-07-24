import { NextResponse } from "next/server";
import { clientIp, clientUserAgent } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-monitor";

/** Password login is disabled — use WebAuthn passkeys only. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const ua = clientUserAgent(req);
  await recordSecurityEvent({
    type: "login_failed",
    summary: "Intento de acceso con contraseña (deshabilitado)",
    detail: "La app solo permite llaves de acceso / biometría",
    ip,
    userAgent: ua,
  }).catch(() => {});

  return NextResponse.json(
    {
      error:
        "El acceso con contraseña está deshabilitado. Usa una llave de acceso (Face ID, huella o llave de seguridad).",
    },
    { status: 403 }
  );
}
