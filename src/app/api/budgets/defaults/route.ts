import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents } from "@/lib/utils";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const defaults = await prisma.budgetDefault.findMany({
      where: { householdId: m.householdId },
      include: { category: true },
      orderBy: { category: { name: "asc" } },
    });
    return jsonOk({ defaults });
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
        categoryId: z.string(),
        amount: z.union([z.number(), z.string()]),
      })
      .parse(await req.json());
    const row = await prisma.budgetDefault.upsert({
      where: {
        householdId_categoryId: {
          householdId: m.householdId,
          categoryId: body.categoryId,
        },
      },
      create: {
        householdId: m.householdId,
        categoryId: body.categoryId,
        amountCents: pesosToCents(body.amount),
      },
      update: { amountCents: pesosToCents(body.amount) },
      include: { category: true },
    });
    return jsonOk({ default: row }, 201);
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
    await prisma.budgetDefault.deleteMany({
      where: { id, householdId: m.householdId },
    });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
