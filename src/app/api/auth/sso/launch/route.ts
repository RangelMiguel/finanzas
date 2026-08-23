import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  SUITE_APP,
  issueSuiteToken,
  resolveMeatAppUrl,
} from "@/lib/integrations/suite-sso";

export async function GET(req: Request) {
  const session = await getSession();
  const here = new URL(req.url);
  if (!session) {
    const login = new URL("/login", here.origin);
    login.searchParams.set("next", "/api/auth/sso/launch");
    return NextResponse.redirect(login);
  }

  const peer = await resolveMeatAppUrl(session.userId);
  if (!peer) {
    return NextResponse.redirect(new URL("/settings", here.origin));
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, displayName: true, locale: true },
  });
  if (!user) {
    return NextResponse.redirect(new URL("/login", here.origin));
  }

  const token = await issueSuiteToken({
    issuer: SUITE_APP.finance,
    audience: SUITE_APP.meat,
    claims: {
      email: user.email,
      displayName: user.displayName,
      locale: user.locale || "es",
    },
  });

  const dest = token
    ? `${peer}/auth/sso?token=${encodeURIComponent(token)}`
    : peer;
  const res = NextResponse.redirect(dest);
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
