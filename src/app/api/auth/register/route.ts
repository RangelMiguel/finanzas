import { z } from "zod";
import {
  createSessionToken,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createHouseholdWithOwner } from "@/lib/household";
import { jsonError, jsonOk } from "@/lib/access";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(80),
  householdName: z.string().min(1).max(120).optional(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) return jsonError(new Error("Este correo ya está registrado"));

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash: await hashPassword(body.password),
        displayName: body.displayName,
      },
    });

    await createHouseholdWithOwner({
      name: body.householdName || `Hogar de ${body.displayName}`,
      userId: user.id,
    });

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    await setSessionCookie(token);

    return jsonOk({
      user: { id: user.id, email: user.email, displayName: user.displayName },
    }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
