import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "./db";
import type { User } from "@prisma/client";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function webauthnConfig(req: Request) {
  const url = new URL(req.url);
  const hostHeader =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const host = hostHeader.split(",")[0].trim();
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  const origin =
    process.env.WEBAUTHN_ORIGIN?.trim() || `${proto}://${host}`;
  const rpID =
    process.env.WEBAUTHN_RP_ID?.trim() || host.replace(/:\d+$/, "");
  const rpName = process.env.WEBAUTHN_RP_NAME?.trim() || "MisFinanzas Familiar";
  return { rpID, rpName, origin };
}

async function storeChallenge(data: {
  type: "registration" | "authentication";
  challenge: string;
  userId?: string;
  email?: string;
}) {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await prisma.webAuthnChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  await prisma.webAuthnChallenge.create({
    data: {
      type: data.type,
      challenge: data.challenge,
      userId: data.userId,
      email: data.email?.toLowerCase(),
      expiresAt,
    },
  });
}

function toTransports(
  json: string | null | undefined
): AuthenticatorTransportFuture[] | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as AuthenticatorTransportFuture[];
  } catch {
    return undefined;
  }
}

export async function createRegistrationOptions(user: User, req: Request) {
  const { rpID, rpName } = webauthnConfig(req);
  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId: user.id },
  });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.displayName,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: toTransports(c.transports),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await storeChallenge({
    type: "registration",
    challenge: options.challenge,
    userId: user.id,
  });

  return options;
}

export async function verifyRegistration(
  user: User,
  req: Request,
  body: RegistrationResponseJSON,
  nickname?: string
) {
  const { rpID, origin } = webauthnConfig(req);

  const pending = await prisma.webAuthnChallenge.findFirst({
    where: {
      userId: user.id,
      type: "registration",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) {
    throw new Error("Desafío de registro expirado. Intenta de nuevo.");
  }

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: pending.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  await prisma.webAuthnChallenge
    .delete({ where: { id: pending.id } })
    .catch(() => {});

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("No se pudo verificar la llave de seguridad");
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  return prisma.webAuthnCredential.create({
    data: {
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: body.response.transports
        ? JSON.stringify(body.response.transports)
        : null,
      nickname: nickname?.trim() || null,
    },
  });
}

export async function createAuthenticationOptions(req: Request, email?: string) {
  const { rpID } = webauthnConfig(req);
  let allowCredentials:
    | { id: string; transports?: AuthenticatorTransportFuture[] }[]
    | undefined;

  if (email) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { webauthnCredentials: true },
    });
    if (user?.webauthnCredentials.length) {
      allowCredentials = user.webauthnCredentials.map((c) => ({
        id: c.credentialId,
        transports: toTransports(c.transports),
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials,
  });

  await storeChallenge({
    type: "authentication",
    challenge: options.challenge,
    email: email?.toLowerCase(),
  });

  return options;
}

export async function verifyAuthentication(
  req: Request,
  body: AuthenticationResponseJSON
) {
  const { rpID, origin } = webauthnConfig(req);

  const cred = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: body.id },
    include: { user: true },
  });
  if (!cred) throw new Error("Llave de seguridad no registrada");

  const candidates = await prisma.webAuthnChallenge.findMany({
    where: {
      type: "authentication",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  if (!candidates.length) {
    throw new Error("Desafío de autenticación expirado. Intenta de nuevo.");
  }

  let verified = false;
  let newCounter = Number(cred.counter);
  let usedId: string | null = null;

  for (const c of candidates) {
    try {
      const result = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: c.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: cred.credentialId,
          publicKey: new Uint8Array(cred.publicKey),
          counter: Number(cred.counter),
          transports: toTransports(cred.transports),
        },
      });
      if (result.verified && result.authenticationInfo) {
        verified = true;
        newCounter = result.authenticationInfo.newCounter;
        usedId = c.id;
        break;
      }
    } catch {
      // try next stored challenge
    }
  }

  if (!verified) {
    throw new Error("No se pudo verificar la llave de seguridad");
  }

  if (usedId) {
    await prisma.webAuthnChallenge
      .delete({ where: { id: usedId } })
      .catch(() => {});
  }

  await prisma.webAuthnCredential.update({
    where: { id: cred.id },
    data: {
      counter: BigInt(newCounter),
      lastUsedAt: new Date(),
    },
  });

  return cred.user;
}

export async function listCredentials(userId: string) {
  return prisma.webAuthnCredential.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nickname: true,
      deviceType: true,
      backedUp: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });
}

export async function removeCredential(userId: string, credentialDbId: string) {
  const cred = await prisma.webAuthnCredential.findFirst({
    where: { id: credentialDbId, userId },
  });
  if (!cred) throw new Error("Llave no encontrada");
  await prisma.webAuthnCredential.delete({ where: { id: cred.id } });
  return cred;
}
