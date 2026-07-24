import { z } from "zod";
import {
  createSessionToken,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { NextResponse } from "next/server";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return NextResponse.json(
        { error: "Correo o contraseña incorrectos" },
        { status: 401 }
      );
    }
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });
    await setSessionCookie(token);
    return jsonOk({
      user: { id: user.id, email: user.email, displayName: user.displayName },
    });
  } catch (e) {
    return jsonError(e);
  }
}
