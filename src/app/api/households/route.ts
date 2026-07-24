import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { createHouseholdWithOwner, logActivity } from "@/lib/household";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { CURRENCIES } from "@/lib/currencies";

const currencyCodes = CURRENCIES.map((c) => c.code) as [string, ...string[]];

export async function GET() {
  try {
    const session = await requireSession();
    const memberships = await prisma.membership.findMany({
      where: { userId: session.userId },
      include: { household: true },
    });
    return jsonOk({ memberships });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = z
      .object({
        name: z.string().min(1).max(120),
        currency: z.enum(currencyCodes as [string, ...string[]]).optional(),
      })
      .parse(await req.json());
    const household = await createHouseholdWithOwner({
      name: body.name,
      userId: session.userId,
    });
    if (body.currency) {
      await prisma.household.update({
        where: { id: household.id },
        data: { currency: body.currency },
      });
    }
    return jsonOk({ household }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        currency: z.enum(currencyCodes as [string, ...string[]]).optional(),
      })
      .parse(await req.json());
    const household = await prisma.household.update({
      where: { id: m.householdId },
      data: {
        name: body.name,
        currency: body.currency,
      },
    });
    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "update",
      entityType: "household",
      entityId: household.id,
      summary: body.currency
        ? `Currency set to ${body.currency}`
        : `Household renamed to "${household.name}"`,
    });
    return jsonOk({ household });
  } catch (e) {
    return jsonError(e);
  }
}
