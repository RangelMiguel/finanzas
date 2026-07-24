import { prisma } from "./db";

export type SecurityEventType =
  | "login_success"
  | "login_failed"
  | "login_passkey_success"
  | "login_passkey_failed"
  | "register"
  | "logout"
  | "wipe"
  | "passkey_added"
  | "passkey_removed"
  | "rate_limited"
  | "invite_accepted";

export type SecuritySeverity = "info" | "warning" | "critical";

const SEVERITY: Record<SecurityEventType, SecuritySeverity> = {
  login_success: "info",
  login_failed: "warning",
  login_passkey_success: "info",
  login_passkey_failed: "warning",
  register: "info",
  logout: "info",
  wipe: "critical",
  passkey_added: "info",
  passkey_removed: "warning",
  rate_limited: "warning",
  invite_accepted: "info",
};

export type RecordSecurityEventInput = {
  type: SecurityEventType;
  summary: string;
  detail?: string;
  userId?: string | null;
  householdId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Persist a security alert for the household feed (in-app only — no email).
 * Also writes a structured line to server logs for operators.
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

  console.info(
    JSON.stringify({
      kind: "security_alert",
      id: alert.id,
      type: input.type,
      severity,
      summary: input.summary,
      householdId,
      userId: input.userId || null,
      ip: input.ip || null,
      at: alert.createdAt.toISOString(),
    })
  );

  return alert;
}
