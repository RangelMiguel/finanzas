import {
  getSession,
  getActiveMembership,
  requireHouseholdAccess,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonOk } from "@/lib/access";
import { NextResponse } from "next/server";
import { effectiveVisibility } from "@/lib/visibility";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, displayName: true, locale: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getActiveMembership(session.userId);
  const members = membership
    ? await prisma.membership.findMany({
        where: { householdId: membership.householdId },
        include: { user: { select: { id: true, email: true, displayName: true } } },
      })
    : [];

  // Apply impersonation for visibility / view-as mode
  let visibility = membership
    ? effectiveVisibility(
        membership.role,
        (membership as { visibility?: string }).visibility
      )
    : null;
  let impersonating: {
    kind: "membership" | "invite";
    id: string;
    role: string;
    label: string;
  } | null = null;
  let viewRole = membership?.role ?? null;

  if (membership) {
    try {
      const access = await requireHouseholdAccess(session.userId);
      visibility = access.visibility;
      viewRole = access.impersonating?.role ?? membership.role;
      if (access.impersonating) {
        impersonating = {
          kind: access.impersonating.kind,
          id: access.impersonating.id,
          role: access.impersonating.role,
          label: access.impersonating.label,
        };
      }
    } catch {
      /* no household access */
    }
  }

  const pref = await prisma.userPreference.findUnique({
    where: { userId: session.userId },
    select: { theme: true },
  });

  return jsonOk({
    user: {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale || "es",
    },
    household: membership?.household ?? null,
    /** Real role of the signed-in user (admin checks) */
    role: membership?.role ?? null,
    /** Role of the view being simulated (if any) */
    viewRole,
    currency: membership?.household.currency ?? "MXN",
    theme: pref?.theme ?? "midnight",
    visibility,
    impersonating,
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      user: m.user,
    })),
  });
}
