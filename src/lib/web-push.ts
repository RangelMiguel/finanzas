import webpush from "web-push";
import { prisma } from "./db";

export function vapidConfigured() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim()
  );
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function ensureVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:security@misfinanzas.local";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  severity?: string;
};

/** Send web push to all subscriptions for the given user ids */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  if (!userIds.length || !ensureVapid()) return 0;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  if (!subs.length) return 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    tag: payload.tag || "mf-security",
    severity: payload.severity || "info",
  });

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
          { TTL: 60 * 60 }
        );
        sent++;
      } catch (e: unknown) {
        const status =
          e && typeof e === "object" && "statusCode" in e
            ? Number((e as { statusCode: number }).statusCode)
            : 0;
        // Gone / expired subscription
        if (status === 404 || status === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => {});
        } else {
          console.warn("[web-push] send failed", status, e);
        }
      }
    })
  );
  return sent;
}

/** Notify household members (optional exclude actor) for a security alert */
export async function pushSecurityAlert(opts: {
  householdId: string | null;
  severity: string;
  summary: string;
  detail?: string | null;
  excludeUserId?: string | null;
}) {
  // System tray: only warning + critical to avoid spam
  if (opts.severity !== "warning" && opts.severity !== "critical") {
    return 0;
  }
  if (!opts.householdId || !ensureVapid()) return 0;

  const members = await prisma.membership.findMany({
    where: { householdId: opts.householdId },
    select: { userId: true },
  });
  const userIds = members
    .map((m) => m.userId)
    .filter((id) => id !== opts.excludeUserId);

  return sendPushToUsers(userIds, {
    title:
      opts.severity === "critical"
        ? "Finance · Alerta crítica"
        : "Finance · Aviso de seguridad",
    body: opts.detail
      ? `${opts.summary} — ${opts.detail}`.slice(0, 180)
      : opts.summary.slice(0, 180),
    url: "/",
    tag: `mf-${opts.severity}`,
    severity: opts.severity,
  });
}
