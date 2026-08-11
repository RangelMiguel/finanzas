import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

function isPublic(path: string) {
  const publicExact = ["/login", "/register"];
  if (publicExact.includes(path)) return true;
  if (path.startsWith("/invite/")) return true;
  if (path === "/api/auth/login" || path === "/api/auth/register") return true;
  // WebAuthn login (options + verify) must be reachable without a session
  if (path.startsWith("/api/auth/webauthn/login")) return true;
  if (path.startsWith("/api/invites/peek")) return true;
  if (path.startsWith("/api/cron/")) return true;
  if (path.startsWith("/_next") || path.startsWith("/favicon")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get("mf_session")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("no secret");
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
