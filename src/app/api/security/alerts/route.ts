import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";

/**
 * Security monitoring feed for any household member (in-app notifications).
 * Query: ?since=ISO  for polling new items
 * POST: mark all current alerts as seen for this user
 */
export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);

    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    const limit = Math.min(100, Number(url.searchParams.get("limit") || 40));

    const prefs = await prisma.userPreference.findUnique({
      where: { userId: session.userId },
    });
    const seenAt = prefs?.securityAlertsSeenAt ?? null;

    const alerts = await prisma.securityAlert.findMany({
      where: {
        householdId: m.householdId,
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });

    const unreadCount = await prisma.securityAlert.count({
      where: {
        householdId: m.householdId,
        ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
      },
    });

    return jsonOk({
      alerts,
      unreadCount,
      seenAt: seenAt?.toISOString() ?? null,
      serverTime: new Date().toISOString(),
      pollIntervalMs: 8000,
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST() {
  try {
    const session = await requireSession();
    await requireHouseholdAccess(session.userId);
    const now = new Date();
    await prisma.userPreference.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        securityAlertsSeenAt: now,
      },
      update: { securityAlertsSeenAt: now },
    });
    return jsonOk({ seenAt: now.toISOString() });
  } catch (e) {
    return jsonError(e);
  }
}
