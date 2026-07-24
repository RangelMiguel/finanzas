import { prisma } from "./db";
import { RateLimitError } from "./auth";

export type RateLimitConfig = {
  /** Unique bucket prefix, e.g. "login:ip" */
  key: string;
  /** Max attempts in the window */
  limit: number;
  /** Window length in seconds */
  windowSec: number;
};

/**
 * Postgres-backed sliding fixed window rate limiter.
 * Safe for Vercel serverless (no Redis required).
 */
export async function consumeRateLimit(cfg: RateLimitConfig): Promise<{
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}> {
  const now = new Date();
  const windowMs = cfg.windowSec * 1000;

  const existing = await prisma.rateLimitBucket.findUnique({
    where: { key: cfg.key },
  });

  if (!existing || now.getTime() - existing.windowStart.getTime() >= windowMs) {
    await prisma.rateLimitBucket.upsert({
      where: { key: cfg.key },
      create: { key: cfg.key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now },
    });
    return { ok: true, remaining: cfg.limit - 1, retryAfterSec: 0 };
  }

  if (existing.count >= cfg.limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((existing.windowStart.getTime() + windowMs - now.getTime()) / 1000)
    );
    return { ok: false, remaining: 0, retryAfterSec };
  }

  await prisma.rateLimitBucket.update({
    where: { key: cfg.key },
    data: { count: { increment: 1 } },
  });
  return {
    ok: true,
    remaining: Math.max(0, cfg.limit - existing.count - 1),
    retryAfterSec: 0,
  };
}

export async function enforceRateLimit(cfg: RateLimitConfig) {
  const result = await consumeRateLimit(cfg);
  if (!result.ok) {
    throw new RateLimitError(
      `Demasiados intentos. Espera ${result.retryAfterSec}s e inténtalo de nuevo.`
    );
  }
  return result;
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function clientUserAgent(req: Request): string {
  return (req.headers.get("user-agent") || "").slice(0, 400);
}
