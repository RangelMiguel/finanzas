import { prisma } from "./db";
import { pushSecurityAlert } from "./web-push";

export type SecurityEventType =
  | "login_success"
  | "login_failed"
  | "login_passkey_success"
  | "login_passkey_failed"
  | "sso_login"
  | "sso_register"
  | "register"
  | "logout"
  | "wipe"
  | "passkey_added"
  | "passkey_removed"
  | "rate_limited"
  | "invite_accepted"
  | "member_removed";

export type SecuritySeverity = "info" | "warning" | "critical";

const SEVERITY: Record<SecurityEventType, SecuritySeverity> = {
  login_success: "info",
  login_failed: "warning",
  login_passkey_success: "info",
  login_passkey_failed: "warning",
  sso_login: "info",
  sso_register: "info",
  register: "info",
  logout: "info",
  wipe: "critical",
  passkey_added: "info",
  passkey_removed: "warning",
  rate_limited: "warning",
  invite_accepted: "info",
  member_removed: "warning",
};

/** Events that land in the in-app tray (info login spam excluded) */
const TRAY_TYPES = new Set<SecurityEventType>([
  "login_failed",
  "login_passkey_failed",
  "wipe",
  "passkey_added",
  "passkey_removed",
  "rate_limited",
  "invite_accepted",
  "register",
  "sso_register",
  "member_removed",
  // login_success intentionally omitted from default tray noise
]);

export type RecordSecurityEventInput = {
  type: SecurityEventType;
  summary: string;
  detail?: string;
  userId?: string | null;
  householdId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Force into tray even if type is noisy */
  forceTray?: boolean;
};

/**
 * Persist a security alert, log it, optionally push to device trays.
 * Successful logins are logged server-side only (not the in-app tray).
 */
export async function recordSecurityEvent(input: RecordSecurityEventInput) {
  let householdId = input.householdId || null;

  if (!householdId && input.userId) {
    const m = await prisma.membership.findFirst({
      where: { userId: input.userId },
      orderBy: { createdAt: "asc" },
      select: { householdId: true },
    });
    householdId = m?.householdId || null;
  }

  const severity = SEVERITY[input.type] || "info";
  const inTray = input.forceTray || TRAY_TYPES.has(input.type);

  // Always log
  console.info(
    JSON.stringify({
      kind: "security_alert",
      type: input.type,
      severity,
      summary: input.summary,
      householdId,
      userId: input.userId || null,
      ip: input.ip || null,
      tray: inTray,
      at: new Date().toISOString(),
    })
  );

  if (!inTray) {
    return null;
  }

  const alert = await prisma.securityAlert.create({
    data: {
      type: input.type,
      severity,
      summary: input.summary,
      detail: input.detail || null,
      userId: input.userId || null,
      householdId,
      ip: input.ip || null,
      userAgent: input.userAgent || null,
    },
  });

  // Fire-and-forget system notifications (Android/iOS tray when PWA installed)
  void pushSecurityAlert({
    householdId,
    severity,
    summary: input.summary,
    detail: input.detail,
    excludeUserId: input.userId,
  }).catch((e) => console.warn("[push]", e));

  return alert;
}
