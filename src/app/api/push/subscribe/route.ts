import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { clientUserAgent } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string().min(1),
          auth: z.string().min(1),
        }),
      })
      .parse(await req.json());

    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId: session.userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: clientUserAgent(req),
      },
      update: {
        userId: session.userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: clientUserAgent(req),
      },
    });

    return jsonOk({ ok: true, id: sub.id });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const body = z
      .object({ endpoint: z.string().url().optional() })
      .parse(await req.json().catch(() => ({})));

    if (body.endpoint) {
      await prisma.pushSubscription.deleteMany({
        where: { userId: session.userId, endpoint: body.endpoint },
      });
    } else {
      await prisma.pushSubscription.deleteMany({
        where: { userId: session.userId },
      });
    }
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
