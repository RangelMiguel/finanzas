import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { amountToCents, budgetPeriodKey, todayISO } from "@/lib/utils";

function periodFromDate(date: string): string {
  // date is YYYY-MM-DD
  const [y, m, d] = date.split("-").map((x) => parseInt(x, 10));
  return budgetPeriodKey(new Date(y, m - 1, d));
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        description: z.string().min(1),
        amount: z.union([z.number(), z.string()]),
        date: z.string().optional(),
        userId: z.string().optional(), // admin can add for someone
      })
      .parse(await req.json());

    let userId = session.userId;
    if (body.userId && body.userId !== session.userId) {
      if (m.role !== "owner" && m.role !== "admin") {
        throw new Error("Only admin can add income for others");
      }
      userId = body.userId;
    }
    const date = body.date || todayISO();
    const period = periodFromDate(date);

    const row = await prisma.personalIncome.create({
      data: {
        householdId: m.householdId,
        userId,
        description: body.description,
        amountCents: amountToCents(body.amount),
        date,
        period,
      },
    });
    return jsonOk({ income: row }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        id: z.string(),
        description: z.string().optional(),
        amount: z.union([z.number(), z.string()]).optional(),
        date: z.string().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.personalIncome.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Not found");
    if (
      existing.userId !== session.userId &&
      m.role !== "owner" &&
      m.role !== "admin"
    ) {
      throw new Error("Forbidden");
    }
    const date = body.date || existing.date;
    const row = await prisma.personalIncome.update({
      where: { id: body.id },
      data: {
        description: body.description,
        amountCents:
          body.amount !== undefined ? amountToCents(body.amount) : undefined,
        date,
        period: periodFromDate(date),
      },
    });
    return jsonOk({ income: row });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id required");
    const existing = await prisma.personalIncome.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Not found");
    if (
      existing.userId !== session.userId &&
      m.role !== "owner" &&
      m.role !== "admin"
    ) {
      throw new Error("Forbidden");
    }
    await prisma.personalIncome.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
