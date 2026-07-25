import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";
import {
  effectiveVisibility,
  parseVisibility,
  type MemberVisibility,
} from "./visibility";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";

const COOKIE = "mf_session";
const IMPERSONATE_COOKIE = "mf_impersonate";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days
const IMPERSONATE_MAX_AGE = 60 * 60 * 8; // 8 hours

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  userId: string;
  email: string;
  displayName: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string | null | undefined) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (
      typeof payload.userId === "string" &&
      typeof payload.email === "string" &&
      typeof payload.displayName === "string"
    ) {
      return {
        userId: payload.userId,
        email: payload.email,
        displayName: payload.displayName,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new AuthError("No autenticado");
  return s;
}

export class AuthError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class BadRequestError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class RateLimitError extends Error {
  status = 429;
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export type Role = "owner" | "admin" | "member" | "viewer";

const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export function canWrite(role: string) {
  return ROLE_RANK[role as Role] >= ROLE_RANK.member;
}

export function canAdmin(role: string) {
  return ROLE_RANK[role as Role] >= ROLE_RANK.admin;
}

export function canManageMembers(role: string) {
  return ROLE_RANK[role as Role] >= ROLE_RANK.admin;
}

/** Resolve active household membership for user (preference, else first). */
export async function getActiveMembership(userId: string, householdId?: string) {
  if (householdId) {
    return prisma.membership.findUnique({
      where: { householdId_userId: { householdId, userId } },
      include: { household: true },
    });
  }
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { householdId: true },
  });
  if (pref?.householdId) {
    const preferred = await prisma.membership.findUnique({
      where: {
        householdId_userId: { householdId: pref.householdId, userId },
      },
      include: { household: true },
    });
    if (preferred) return preferred;
  }
  return prisma.membership.findFirst({
    where: { userId },
    include: { household: true },
    orderBy: { createdAt: "asc" },
  });
}

export type ImpersonationState = {
  kind: "membership" | "invite";
  id: string;
  householdId: string;
  role: string;
  /** User id for onlyOwn filters; null when previewing an invite */
  subjectUserId: string | null;
  label: string;
  visibilityRaw: string;
};

export type HouseholdAccess = NonNullable<
  Awaited<ReturnType<typeof getActiveMembership>>
> & {
  visibility: MemberVisibility;
  /** Real admin/owner role of the signed-in user */
  realRole: string;
  /** User id used for visibility filters (impersonated member when active) */
  subjectUserId: string;
  impersonating: ImpersonationState | null;
};

/** Read active impersonation cookie (if any). */
export async function readImpersonationCookie(): Promise<{
  kind: "membership" | "invite";
  id: string;
} | null> {
  const jar = await cookies();
  const raw = jar.get(IMPERSONATE_COOKIE)?.value;
  if (!raw) return null;
  if (raw.startsWith("m:")) return { kind: "membership", id: raw.slice(2) };
  if (raw.startsWith("i:")) return { kind: "invite", id: raw.slice(2) };
  return null;
}

export async function setImpersonationCookie(
  kind: "membership" | "invite",
  id: string
) {
  const jar = await cookies();
  jar.set(IMPERSONATE_COOKIE, `${kind === "membership" ? "m" : "i"}:${id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: IMPERSONATE_MAX_AGE,
  });
}

export async function clearImpersonationCookie() {
  const jar = await cookies();
  jar.delete(IMPERSONATE_COOKIE);
}

async function resolveImpersonation(
  householdId: string
): Promise<ImpersonationState | null> {
  const cookie = await readImpersonationCookie();
  if (!cookie) return null;

  if (cookie.kind === "membership") {
    const target = await prisma.membership.findFirst({
      where: { id: cookie.id, householdId },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
    if (!target) {
      await clearImpersonationCookie();
      return null;
    }
    return {
      kind: "membership",
      id: target.id,
      householdId,
      role: target.role,
      subjectUserId: target.userId,
      label: target.user.displayName || target.user.email,
      visibilityRaw: target.visibility || "{}",
    };
  }

  const invite = await prisma.invite.findFirst({
    where: { id: cookie.id, householdId, acceptedAt: null },
  });
  if (!invite) {
    await clearImpersonationCookie();
    return null;
  }
  return {
    kind: "invite",
    id: invite.id,
    householdId,
    role: invite.role,
    subjectUserId: null,
    label: invite.email,
    visibilityRaw: invite.visibility || "{}",
  };
}

export async function requireHouseholdAccess(
  userId: string,
  opts?: { write?: boolean; admin?: boolean; householdId?: string }
): Promise<HouseholdAccess> {
  const m = await getActiveMembership(userId, opts?.householdId);
  if (!m) throw new ForbiddenError("No perteneces a un hogar");

  // Privilege checks always use the real membership
  if (opts?.write && !canWrite(m.role)) {
    throw new ForbiddenError("Solo lectura: no puedes modificar datos");
  }
  if (opts?.admin && !canAdmin(m.role)) {
    throw new ForbiddenError("Se requieren permisos de administrador");
  }

  // Only real admins/owners may hold an active impersonation session
  const activeImp = canAdmin(m.role)
    ? await resolveImpersonation(m.householdId)
    : null;

  // Block mutations while impersonating (view-only walkthrough)
  if (opts?.write && activeImp) {
    throw new ForbiddenError(
      "Estás en vista de miembro. Sal de la simulación para modificar datos."
    );
  }

  // Admin-only routes always use real full admin access (security UI stays usable)
  if (opts?.admin) {
    const visibility = effectiveVisibility(
      m.role,
      (m as { visibility?: string }).visibility
    );
    return Object.assign(m, {
      visibility,
      realRole: m.role,
      subjectUserId: userId,
      impersonating: activeImp,
    }) as HouseholdAccess;
  }

  if (activeImp) {
    // What that member actually experiences:
    // owner/admin → full; member/viewer → stored policy
    const visibility = effectiveVisibility(
      activeImp.role,
      activeImp.visibilityRaw
    );
    return Object.assign(m, {
      visibility,
      realRole: m.role,
      subjectUserId: activeImp.subjectUserId || "__invite_preview__",
      impersonating: activeImp,
    }) as HouseholdAccess;
  }

  const visibility = effectiveVisibility(
    m.role,
    (m as { visibility?: string }).visibility
  );
  return Object.assign(m, {
    visibility,
    realRole: m.role,
    subjectUserId: userId,
    impersonating: null,
  }) as HouseholdAccess;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken() {
  return randomBytes(32).toString("hex");
}

export { COOKIE as SESSION_COOKIE, IMPERSONATE_COOKIE };

