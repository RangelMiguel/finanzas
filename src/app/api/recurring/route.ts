import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { ForbiddenError } from "@/lib/auth";
import { ensureRecurringIncomesPosted } from "@/lib/recurring-income";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "recurring")) {
      throw new ForbiddenError("No access to recurring");
    }
    if (!m.visibility.showRecurringIncomes) {
      return jsonOk({ recurringIncomes: [] });
    }
    // Post any due occurrences so the household ledger stays in sync
    const posted = await ensureRecurringIncomesPosted(m.householdId, {
      userId: session.userId,
    });
    const recurringIncomes = await prisma.recurringIncome.findMany({
      where: { householdId: m.householdId },
      include: { category: true, account: true },
      orderBy: { dayOfMonth: "asc" },
    });
    return jsonOk({
      recurringIncomes,
      autoPosted: posted.created,
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = z
      .object({
        description: z.string().min(1),
        amount: z.union([z.number(), z.string()]),
        categoryId: z.string().optional().nullable(),
        accountId: z.string().optional().nullable(),
        dayOfMonth: z.number().int().min(1).max(31),
        active: z.boolean().optional(),
      })
      .parse(await req.json());
    const item = await prisma.recurringIncome.create({
      data: {
        householdId: m.householdId,
        description: body.description,
        amountCents: pesosToCents(body.amount),
        categoryId: body.categoryId || null,
        accountId: body.accountId || null,
        dayOfMonth: body.dayOfMonth,
        active: body.active ?? true,
      },
    });
    return jsonOk({ recurringIncome: item }, 201);
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
        categoryId: z.string().nullable().optional(),
        accountId: z.string().nullable().optional(),
        dayOfMonth: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.recurringIncome.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Ingreso recurrente no encontrado");
    const item = await prisma.recurringIncome.update({
      where: { id: body.id },
      data: {
        description: body.description,
        amountCents: body.amount !== undefined ? pesosToCents(body.amount) : undefined,
        categoryId: body.categoryId,
        accountId: body.accountId,
        dayOfMonth: body.dayOfMonth,
        active: body.active,
      },
    });
    return jsonOk({ recurringIncome: item });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    const existing = await prisma.recurringIncome.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    await prisma.recurringIncome.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
