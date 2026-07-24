import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { amountToCents } from "@/lib/utils";
import { logActivity } from "@/lib/household";

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const body = z
      .object({
        userId: z.string(),
        name: z.string().min(1).default("Asignación personal"),
        amount: z.union([z.number(), z.string()]),
        period: z.enum(["bimonthly", "monthly", "weekly"]).default("bimonthly"),
        notes: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(await req.json());

    const member = await prisma.membership.findUnique({
      where: {
        householdId_userId: {
          householdId: m.householdId,
          userId: body.userId,
        },
      },
    });
    if (!member) throw new Error("Member not in household");

    const row = await prisma.personalAllocation.create({
      data: {
        householdId: m.householdId,
        userId: body.userId,
        name: body.name,
        amountCents: amountToCents(body.amount),
        period: body.period,
        notes: body.notes ?? null,
        active: body.active ?? true,
      },
    });
    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "create",
      entityType: "personal_allocation",
      entityId: row.id,
      summary: `Personal allocation for user ${body.userId}`,
    });
    return jsonOk({ allocation: row }, 201);
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
        id: z.string(),
        name: z.string().optional(),
        amount: z.union([z.number(), z.string()]).optional(),
        period: z.enum(["bimonthly", "monthly", "weekly"]).optional(),
        notes: z.string().nullable().optional(),
        active: z.boolean().optional(),
        userId: z.string().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.personalAllocation.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Not found");
    const row = await prisma.personalAllocation.update({
      where: { id: body.id },
      data: {
        name: body.name,
        amountCents:
          body.amount !== undefined ? amountToCents(body.amount) : undefined,
        period: body.period,
        notes: body.notes,
        active: body.active,
        userId: body.userId,
      },
    });
    return jsonOk({ allocation: row });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id required");
    await prisma.personalAllocation.deleteMany({
      where: { id, householdId: m.householdId },
    });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
