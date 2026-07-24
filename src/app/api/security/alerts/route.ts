import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";

/**
 * Security feed for household members (dismissible per user).
 * GET  — list non-dismissed alerts
 * POST — mark seen and/or dismiss (body.action)
 * DELETE — dismiss one or all
 */
export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);

    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    const limit = Math.min(100, Number(url.searchParams.get("limit") || 40));

    const dismissed = await prisma.securityAlertDismissal.findMany({
      where: { userId: session.userId },
      select: { alertId: true },
    });
    const dismissedIds = dismissed.map((d) => d.alertId);

    const prefs = await prisma.userPreference.findUnique({
      where: { userId: session.userId },
    });
    const seenAt = prefs?.securityAlertsSeenAt ?? null;

    const baseWhere = {
      householdId: m.householdId,
      ...(dismissedIds.length ? { id: { notIn: dismissedIds } } : {}),
    };

    const alerts = await prisma.securityAlert.findMany({
      where: {
        ...baseWhere,
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
        ...baseWhere,
        ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
      },
    });

    return jsonOk({
      alerts,
      unreadCount,
      seenAt: seenAt?.toISOString() ?? null,
      serverTime: new Date().toISOString(),
      pollIntervalMs: 20000,
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const body = z
      .object({
        action: z
          .enum(["seen", "dismiss", "dismiss_all"])
          .default("seen"),
        alertId: z.string().optional(),
      })
      .parse(await req.json().catch(() => ({ action: "seen" })));

    if (body.action === "seen") {
      const now = new Date();
      await prisma.userPreference.upsert({
        where: { userId: session.userId },
        create: { userId: session.userId, securityAlertsSeenAt: now },
        update: { securityAlertsSeenAt: now },
      });
      return jsonOk({ seenAt: now.toISOString() });
    }

    if (body.action === "dismiss") {
      if (!body.alertId) throw new Error("alertId requerido");
      const alert = await prisma.securityAlert.findFirst({
        where: { id: body.alertId, householdId: m.householdId },
      });
      if (!alert) throw new Error("Alerta no encontrada");
      await prisma.securityAlertDismissal.upsert({
        where: {
          alertId_userId: { alertId: body.alertId, userId: session.userId },
        },
        create: { alertId: body.alertId, userId: session.userId },
        update: {},
      });
      return jsonOk({ dismissed: body.alertId });
    }

    // dismiss_all for this household from this user's view
    const alerts = await prisma.securityAlert.findMany({
      where: { householdId: m.householdId },
      select: { id: true },
      take: 500,
    });
    if (alerts.length) {
      await prisma.securityAlertDismissal.createMany({
        data: alerts.map((a) => ({
          alertId: a.id,
          userId: session.userId,
        })),
        skipDuplicates: true,
      });
    }
    const now = new Date();
    await prisma.userPreference.upsert({
      where: { userId: session.userId },
      create: { userId: session.userId, securityAlertsSeenAt: now },
      update: { securityAlertsSeenAt: now },
    });
    return jsonOk({ dismissedAll: true, count: alerts.length });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const body = z
      .object({
        alertId: z.string().optional(),
        all: z.boolean().optional(),
      })
      .parse(await req.json());

    if (body.all) {
      const alerts = await prisma.securityAlert.findMany({
        where: { householdId: m.householdId },
        select: { id: true },
        take: 500,
      });
      await prisma.securityAlertDismissal.createMany({
        data: alerts.map((a) => ({
          alertId: a.id,
          userId: session.userId,
        })),
        skipDuplicates: true,
      });
      return jsonOk({ dismissedAll: true });
    }

    if (!body.alertId) throw new Error("alertId requerido");
    const alert = await prisma.securityAlert.findFirst({
      where: { id: body.alertId, householdId: m.householdId },
    });
    if (!alert) throw new Error("Alerta no encontrada");
    await prisma.securityAlertDismissal.upsert({
      where: {
        alertId_userId: { alertId: body.alertId, userId: session.userId },
      },
      create: { alertId: body.alertId, userId: session.userId },
      update: {},
    });
    return jsonOk({ dismissed: body.alertId });
  } catch (e) {
    return jsonError(e);
  }
}
