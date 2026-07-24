import { getSession, getActiveMembership } from "@/lib/auth";
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

  const visibility = membership
    ? effectiveVisibility(
        membership.role,
        (membership as { visibility?: string }).visibility
      )
    : null;

  return jsonOk({
    user: {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale || "es",
    },
    household: membership?.household ?? null,
    role: membership?.role ?? null,
    currency: membership?.household.currency ?? "MXN",
    visibility,
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      user: m.user,
    })),
  });
}
