import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";

export async function GET() {
  try {
    const session = await requireSession();
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, displayName: true, locale: true },
    });
    const pref = await prisma.userPreference.findUnique({
      where: { userId: session.userId },
    });
    return jsonOk({ user, preference: pref });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const body = z
      .object({
        locale: z.enum(["es", "en"]).optional(),
        displayName: z.string().min(1).max(80).optional(),
        theme: z.string().optional(),
      })
      .parse(await req.json());

    if (body.locale || body.displayName) {
      await prisma.user.update({
        where: { id: session.userId },
        data: {
          locale: body.locale,
          displayName: body.displayName,
        },
      });
    }

    if (body.theme !== undefined) {
      await prisma.userPreference.upsert({
        where: { userId: session.userId },
        create: { userId: session.userId, theme: body.theme },
        update: { theme: body.theme },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, displayName: true, locale: true },
    });
    return jsonOk({ user });
  } catch (e) {
    return jsonError(e);
  }
}
