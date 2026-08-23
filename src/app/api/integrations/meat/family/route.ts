import { jsonError, jsonOk } from "@/lib/access";
import { prisma } from "@/lib/db";
import { requireMeatLink } from "@/lib/integrations/meat";

/** Meat pulls the Finance household roster to import the same people. */
export async function GET(req: Request) {
  try {
    const link = await requireMeatLink(req);
    await prisma.meatLink.update({
      where: { id: link.id },
      data: { lastUsedAt: new Date() },
    });
    const members = await prisma.membership.findMany({
      where: { householdId: link.householdId },
      include: {
        user: { select: { email: true, displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return jsonOk({
      householdName: link.household.name,
      members: members.map((row) => ({
        email: row.user.email,
        displayName: row.user.displayName,
        role: row.role,
      })),
    });
  } catch (e) {
    return jsonError(e);
  }
}
