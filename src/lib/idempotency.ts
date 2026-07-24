import { prisma } from "./db";
import { NextResponse } from "next/server";

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function extractIdempotencyKey(
  req: Request,
  body: unknown
): string | null {
  const header = req.headers.get("idempotency-key") || req.headers.get("Idempotency-Key");
  if (header && header.length >= 8 && header.length <= 128) return header;
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof (body as { clientMutationId?: unknown }).clientMutationId === "string"
  ) {
    const k = (body as { clientMutationId: string }).clientMutationId;
    if (k.length >= 8 && k.length <= 128) return k;
  }
  return null;
}

/**
 * If a prior successful response exists for this key, return it.
 * Otherwise run `handler`, persist JSON body, return handler result.
 */
export async function withIdempotency(
  opts: {
    userId: string;
    path: string;
    key: string | null;
  },
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const { userId, path, key } = opts;
  if (!key) return handler();

  const existing = await prisma.mutationIdempotency.findUnique({
    where: { userId_key: { userId, key } },
  });
  if (existing) {
    try {
      const data = JSON.parse(existing.responseJson);
      return NextResponse.json(data, { status: 200 });
    } catch {
      /* fall through and re-run */
    }
  }

  const res = await handler();
  if (res.ok) {
    try {
      const clone = res.clone();
      const data = await clone.json();
      await prisma.mutationIdempotency.upsert({
        where: { userId_key: { userId, key } },
        create: {
          userId,
          key,
          path,
          responseJson: JSON.stringify(data),
        },
        update: {
          responseJson: JSON.stringify(data),
          path,
        },
      });
    } catch (e) {
      console.error("[idempotency] failed to store", e);
    }
  }

  // Opportunistic cleanup of old keys (best-effort, non-blocking)
  void prisma.mutationIdempotency
    .deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - MAX_AGE_MS) } },
    })
    .catch(() => undefined);

  return res;
}
