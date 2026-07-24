import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { amountToCents } from "@/lib/utils";
import { allowanceUsage } from "@/lib/allowances";
import { logActivity } from "@/lib/household";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const allowances = await allowanceUsage({ householdId: m.householdId });
    return jsonOk({ allowances, currency: m.household.currency });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { admin: true });
    const body = z
      .object({
        userId: z.string(),
        name: z.string().min(1).max(120),
        amount: z.union([z.number(), z.string()]),
        period: z.enum(["monthly", "weekly"]).default("monthly"),
        categoryId: z.string().nullable().optional(),
        enforce: z.boolean().optional(),
        active: z.boolean().optional(),
        notes: z.string().nullable().optional(),
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

    if (body.categoryId) {
      const cat = await prisma.category.findFirst({
        where: { id: body.categoryId, householdId: m.householdId },
      });
      if (!cat) throw new Error("Category not found");
    }

    const allowance = await prisma.allowance.create({
      data: {
        householdId: m.householdId,
        userId: body.userId,
        name: body.name,
        amountCents: amountToCents(body.amount),
        period: body.period,
        categoryId: body.categoryId ?? null,
        enforce: body.enforce ?? true,
        active: body.active ?? true,
        notes: body.notes ?? null,
      },
      include: {
        user: { select: { id: true, displayName: true } },
        category: true,
      },
    });

    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "create",
      entityType: "allowance",
      entityId: allowance.id,
      summary: `Mesada "${allowance.name}" para ${allowance.user.displayName}`,
    });

    return jsonOk({ allowance }, 201);
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
        name: z.string().min(1).optional(),
        amount: z.union([z.number(), z.string()]).optional(),
        period: z.enum(["monthly", "weekly"]).optional(),
        categoryId: z.string().nullable().optional(),
        enforce: z.boolean().optional(),
        active: z.boolean().optional(),
        notes: z.string().nullable().optional(),
        userId: z.string().optional(),
      })
      .parse(await req.json());

    const existing = await prisma.allowance.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Allowance not found");

    const allowance = await prisma.allowance.update({
      where: { id: body.id },
      data: {
        name: body.name,
        amountCents:
          body.amount !== undefined ? amountToCents(body.amount) : undefined,
        period: body.period,
        categoryId: body.categoryId,
        enforce: body.enforce,
        active: body.active,
        notes: body.notes,
        userId: body.userId,
      },
    });
    return jsonOk({ allowance });
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
    const existing = await prisma.allowance.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Allowance not found");
    await prisma.allowance.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
