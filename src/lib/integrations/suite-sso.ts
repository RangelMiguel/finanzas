import { randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AuthError, BadRequestError, getActiveMembership } from "@/lib/auth";
import { createHouseholdWithOwner } from "@/lib/household";

export const SUITE_APP = {
  finance: "finance",
  meat: "meat",
} as const;

export type SuiteAppId = (typeof SUITE_APP)[keyof typeof SUITE_APP];

export type SuiteSsoClaims = {
  email: string;
  displayName: string;
  locale: string;
};

const TOKEN_TTL = "90s";
const NONCE_TTL_MS = 5 * 60 * 1000;

export function suiteSecret(): Uint8Array | null {
  const value = (process.env.SUITE_SSO_SECRET || "").trim();
  if (value.length < 16) return null;
  return new TextEncoder().encode(value);
}

export function normalizeSuiteUrl(raw?: string | null): string {
  const value = (raw || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin + (url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, ""));
  } catch {
    return "";
  }
}

export async function resolveMeatAppUrl(userId: string): Promise<string> {
  const fromEnv = normalizeSuiteUrl(
    process.env.NEXT_PUBLIC_MEAT_URL || process.env.MEAT_URL
  );
  const membership = await getActiveMembership(userId);
  if (membership) {
    const link = await prisma.meatLink.findUnique({
      where: { householdId: membership.householdId },
      select: { appUrl: true },
    });
    const fromLink = normalizeSuiteUrl(link?.appUrl);
    if (fromLink) return fromLink;
  }
  return fromEnv;
}

export async function issueSuiteToken(opts: {
  issuer: SuiteAppId;
  audience: SuiteAppId;
  claims: SuiteSsoClaims;
}): Promise<string | null> {
  const secret = suiteSecret();
  if (!secret) return null;
  const displayName = opts.claims.displayName.trim().slice(0, 80);
  const email = opts.claims.email.trim().toLowerCase();
  if (!email || !displayName) return null;
  return new SignJWT({
    email,
    displayName,
    locale: opts.claims.locale === "en" ? "en" : "es",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(opts.issuer)
    .setAudience(opts.audience)
    .setJti(randomBytes(16).toString("hex"))
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret);
}

export async function verifySuiteToken(opts: {
  token: string;
  expectedIssuer: SuiteAppId;
  expectedAudience: SuiteAppId;
}): Promise<(SuiteSsoClaims & { jti: string }) | null> {
  const secret = suiteSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(opts.token, secret, {
      issuer: opts.expectedIssuer,
      audience: opts.expectedAudience,
    });
    if (
      typeof payload.email !== "string" ||
      typeof payload.displayName !== "string" ||
      typeof payload.jti !== "string"
    ) {
      return null;
    }
    const email = payload.email.trim().toLowerCase();
    const displayName = payload.displayName.trim().slice(0, 80);
    if (!email || !displayName || !email.includes("@")) return null;
    return {
      email,
      displayName,
      locale: payload.locale === "en" ? "en" : "es",
      jti: payload.jti,
    };
  } catch {
    return null;
  }
}

export async function consumeSuiteNonce(jti: string) {
  const now = new Date();
  await prisma.ssoNonce.deleteMany({ where: { expiresAt: { lt: now } } });
  try {
    await prisma.ssoNonce.create({
      data: {
        jti,
        expiresAt: new Date(now.getTime() + NONCE_TTL_MS),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AuthError("Este enlace de acceso ya se usó");
    }
    throw error;
  }
}

export async function ensureFinanceUserFromSuite(claims: SuiteSsoClaims) {
  const email = claims.email.trim().toLowerCase();
  const displayName =
    claims.displayName.trim().slice(0, 80) || email.split("@")[0] || "Usuario";
  const locale = claims.locale === "en" ? "en" : "es";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const membership = await getActiveMembership(existing.id);
    if (!membership) {
      await createHouseholdWithOwner({
        name: `Hogar de ${existing.displayName}`,
        userId: existing.id,
      });
    }
    return { user: existing, created: false };
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      displayName,
      locale,
    },
  });
  await createHouseholdWithOwner({
    name: `Hogar de ${displayName}`,
    userId: user.id,
  });
  return { user, created: true };
}

export async function acceptFinanceSuiteLogin(token: string) {
  const claims = await verifySuiteToken({
    token,
    expectedIssuer: SUITE_APP.meat,
    expectedAudience: SUITE_APP.finance,
  });
  if (!claims) throw new BadRequestError("Enlace de acceso inválido o caducado");
  await consumeSuiteNonce(claims.jti);
  return ensureFinanceUserFromSuite(claims);
}
