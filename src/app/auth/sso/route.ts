import { NextResponse } from "next/server";
import {
  createSessionToken,
  getSession,
  setSessionCookie,
} from "@/lib/auth";
import { acceptFinanceSuiteLogin } from "@/lib/integrations/suite-sso";
import { clientIp, clientUserAgent, enforceRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-monitor";

export async function GET(req: Request) {
  const here = new URL(req.url);
  const token = here.searchParams.get("token") || "";
  const home = new URL("/", here.origin);
  const fail = new URL("/login", here.origin);
  fail.searchParams.set("error", "sso");

  if (!token) {
    const session = await getSession();
    return NextResponse.redirect(session ? home : fail);
  }

  const ip = clientIp(req);
  const ua = clientUserAgent(req);

  try {
    await enforceRateLimit({
      key: `sso:ip:${ip}`,
      limit: 20,
      windowSec: 60,
    });

    const { user, created } = await acceptFinanceSuiteLogin(token);
    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    await setSessionCookie(sessionToken);

    await recordSecurityEvent({
      type: created ? "sso_register" : "sso_login",
      summary: created
        ? `Cuenta creada desde Meat: ${user.displayName} (${user.email})`
        : `Entró desde Meat: ${user.displayName} (${user.email})`,
      userId: user.id,
      ip,
      userAgent: ua,
    });

    return NextResponse.redirect(home);
  } catch {
    const session = await getSession();
    return NextResponse.redirect(session ? home : fail);
  }
}
