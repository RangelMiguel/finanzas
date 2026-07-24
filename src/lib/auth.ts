import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { effectiveVisibility, type MemberVisibility } from "./visibility";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";

const COOKIE = "mf_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

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

export async function requireHouseholdAccess(
  userId: string,
  opts?: { write?: boolean; admin?: boolean; householdId?: string }
) {
  const m = await getActiveMembership(userId, opts?.householdId);
  if (!m) throw new ForbiddenError("No perteneces a un hogar");
  if (opts?.write && !canWrite(m.role)) {
    throw new ForbiddenError("Solo lectura: no puedes modificar datos");
  }
  if (opts?.admin && !canAdmin(m.role)) {
    throw new ForbiddenError("Se requieren permisos de administrador");
  }
  const visibility = effectiveVisibility(
    m.role,
    (m as { visibility?: string }).visibility
  );
  return Object.assign(m, { visibility }) as typeof m & {
    visibility: MemberVisibility;
  };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken() {
  return randomBytes(32).toString("hex");
}

export { COOKIE as SESSION_COOKIE };
