import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { monthKey } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { ForbiddenError } from "@/lib/auth";
import { monthBounds } from "@/lib/money";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "creditCards")) {
      throw new ForbiddenError("No access to credit cards");
    }
    const cards = await prisma.creditCard.findMany({
      where: { householdId: m.householdId },
      orderBy: { name: "asc" },
    });
    const month = monthKey();
    const { start, end } = monthBounds(month);
    const spend = await prisma.transaction.findMany({
      where: {
        householdId: m.householdId,
        type: "expense",
        deletedAt: null,
        creditCardId: { not: null },
        date: { gte: start, lte: end },
      },
      select: { creditCardId: true, amountCents: true },
    });
    const byCard: Record<string, number> = {};
    for (const s of spend) {
      if (!s.creditCardId) continue;
      byCard[s.creditCardId] = (byCard[s.creditCardId] || 0) + s.amountCents;
    }
    const visible = cards.filter(
      (c) => !m.visibility.hiddenCreditCardIds.includes(c.id)
    );
    return jsonOk({
      creditCards: visible.map((c) => ({
        ...c,
        monthSpendCents: byCard[c.id] || 0,
      })),
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
        name: z.string().min(1),
        lastFour: z.string().max(4).default(""),
        cutoffDay: z.number().int().min(1).max(31).default(1),
        graceDays: z.number().int().min(0).max(45).default(20),
        color: z.string().optional(),
      })
      .parse(await req.json());
    const card = await prisma.creditCard.create({
      data: { householdId: m.householdId, ...body },
    });
    return jsonOk({ creditCard: card }, 201);
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
        name: z.string().optional(),
        lastFour: z.string().optional(),
        cutoffDay: z.number().int().optional(),
        graceDays: z.number().int().optional(),
        color: z.string().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.creditCard.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Tarjeta no encontrada");
    const { id, ...data } = body;
    const card = await prisma.creditCard.update({ where: { id }, data });
    return jsonOk({ creditCard: card });
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
    const existing = await prisma.creditCard.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Tarjeta no encontrada");
    await prisma.creditCard.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
