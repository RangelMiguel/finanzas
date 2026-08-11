import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { ForbiddenError } from "@/lib/auth";
import { ensureRecurringExpensesPosted } from "@/lib/recurring-expense";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "recurring")) {
      throw new ForbiddenError("No access to recurring");
    }
    const posted = await ensureRecurringExpensesPosted(m.householdId, {
      userId: session.userId,
    });
    const recurringExpenses = await prisma.recurringExpense.findMany({
      where: { householdId: m.householdId },
      include: { category: true, account: true, creditCard: true },
      orderBy: { dayOfMonth: "asc" },
    });
    return jsonOk({ recurringExpenses, autoPosted: posted.created });
  } catch (e) {
    return jsonError(e);
  }
}

const sourceSchema = z.object({
  description: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  categoryId: z.string().optional().nullable(),
  accountId: z.string().optional().nullable(),
  creditCardId: z.string().optional().nullable(),
  dayOfMonth: z.number().int().min(1).max(31),
  active: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    if (!canSeeModule(m.visibility, "recurring")) {
      throw new ForbiddenError("No access to recurring");
    }
    const body = sourceSchema.parse(await req.json());
    const creditCardId = body.creditCardId || null;
    const item = await prisma.recurringExpense.create({
      data: {
        householdId: m.householdId,
        description: body.description,
        amountCents: pesosToCents(body.amount),
        categoryId: body.categoryId || null,
        accountId: creditCardId ? null : body.accountId || null,
        creditCardId,
        dayOfMonth: body.dayOfMonth,
        active: body.active ?? true,
      },
    });
    return jsonOk({ recurringExpense: item }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const body = sourceSchema.partial().extend({ id: z.string() }).parse(
      await req.json()
    );
    const existing = await prisma.recurringExpense.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Pago recurrente no encontrado");
    const creditCardId =
      body.creditCardId === undefined
        ? undefined
        : body.creditCardId || null;
    const item = await prisma.recurringExpense.update({
      where: { id: body.id },
      data: {
        description: body.description,
        amountCents:
          body.amount !== undefined ? pesosToCents(body.amount) : undefined,
        categoryId: body.categoryId,
        accountId:
          creditCardId
            ? null
            : body.accountId === undefined
              ? undefined
              : body.accountId || null,
        creditCardId,
        dayOfMonth: body.dayOfMonth,
        active: body.active,
      },
    });
    return jsonOk({ recurringExpense: item });
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
    const existing = await prisma.recurringExpense.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    await prisma.recurringExpense.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
