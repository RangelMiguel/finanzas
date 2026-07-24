import { z } from "zod";
import {
  requireSession,
  requireHouseholdAccess,
  BadRequestError,
  ForbiddenError,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO } from "@/lib/utils";
import { logActivity } from "@/lib/household";
import { suggestCategoryName } from "@/lib/categorize";
import { canSeeModule, filterTransaction } from "@/lib/visibility";

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "transactions")) {
      throw new ForbiddenError("No access to transactions");
    }
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const type = searchParams.get("type");
    const q = searchParams.get("q");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

    const where: Record<string, unknown> = {
      householdId: m.householdId,
      deletedAt: null,
    };
    if (type) where.type = type;
    if (month) {
      where.date = { gte: `${month}-01`, lte: `${month}-31` };
    }
    if (q) {
      where.description = { contains: q };
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
        account: true,
        toAccount: true,
        creditCard: true,
        createdBy: { select: { id: true, displayName: true } },
        spentBy: { select: { id: true, displayName: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: Math.min(limit * 3, 500),
    });

    const filtered = transactions
      .filter((txn) => filterTransaction(m.visibility, txn, session.userId))
      .slice(0, limit)
      .map((txn) => {
        if (!m.visibility.showOtherMembers) {
          return {
            ...txn,
            createdBy:
              txn.createdById === session.userId ? txn.createdBy : null,
            spentBy: txn.spentById === session.userId ? txn.spentBy : null,
          };
        }
        return txn;
      });

    return jsonOk({ transactions: filtered });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const raw = await req.json();
    const { extractIdempotencyKey, withIdempotency } = await import(
      "@/lib/idempotency"
    );
    const idemKey = extractIdempotencyKey(req, raw);

    return withIdempotency(
      { userId: session.userId, path: "/api/transactions", key: idemKey },
      async () => {
        const body = z
          .object({
            id: z.string().min(8).max(40).optional(),
            date: z.string().optional(),
            amount: z.union([z.number(), z.string()]),
            description: z.string().min(1),
            type: z.enum(["income", "expense"]),
            categoryId: z.string().optional().nullable(),
            accountId: z.string().optional().nullable(),
            creditCardId: z.string().optional().nullable(),
            spentById: z.string().optional().nullable(),
            autoCategory: z.boolean().optional(),
            clientMutationId: z.string().optional(),
            // MSI
            msiMonths: z.number().int().min(2).max(48).optional(),
          })
          .parse(raw);

        const amountCents = pesosToCents(body.amount);
        if (amountCents <= 0) throw new Error("Monto inválido");

        // If client sent a stable id that already exists, return it (offline replay)
        if (body.id) {
          const existing = await prisma.transaction.findFirst({
            where: { id: body.id, householdId: m.householdId },
            include: {
              category: true,
              account: true,
              createdBy: { select: { id: true, displayName: true } },
            },
          });
          if (existing) return jsonOk({ transaction: existing });
        }

        let categoryId = body.categoryId || null;
        if (!categoryId && body.autoCategory !== false) {
          const name = suggestCategoryName(body.description);
          if (name) {
            const cat = await prisma.category.findFirst({
              where: {
                householdId: m.householdId,
                name,
                type: body.type === "income" ? "income" : "expense",
              },
            });
            if (cat) categoryId = cat.id;
          }
        }

        let installmentPlanId: string | null = null;
        if (body.msiMonths && body.type === "expense" && body.creditCardId) {
          const monthly = Math.round(amountCents / body.msiMonths);
          const plan = await prisma.installmentPlan.create({
            data: {
              householdId: m.householdId,
              description: body.description,
              totalAmountCents: amountCents,
              months: body.msiMonths,
              monthlyAmountCents: monthly,
              creditCardId: body.creditCardId,
              categoryId,
              startDate: body.date || todayISO(),
            },
          });
          installmentPlanId = plan.id;
        }

        const spentById = body.spentById || session.userId;
        const txn = await prisma.transaction.create({
          data: {
            ...(body.id ? { id: body.id } : {}),
            householdId: m.householdId,
            date: body.date || todayISO(),
            amountCents,
            description: body.description,
            type: body.type,
            categoryId,
            accountId: body.accountId || null,
            creditCardId: body.creditCardId || null,
            installmentPlanId,
            createdById: session.userId,
            spentById,
          },
          include: {
            category: true,
            account: true,
            createdBy: { select: { id: true, displayName: true } },
          },
        });

        await logActivity({
          householdId: m.householdId,
          userId: session.userId,
          action: "create",
          entityType: "transaction",
          entityId: txn.id,
          summary: `${body.type === "income" ? "Ingreso" : "Gasto"}: ${body.description}`,
        });

        return jsonOk({ transaction: txn }, 201);
      }
    );
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
        date: z.string().optional(),
        amount: z.union([z.number(), z.string()]).optional(),
        description: z.string().optional(),
        type: z.enum(["income", "expense", "transfer"]).optional(),
        categoryId: z.string().nullable().optional(),
        accountId: z.string().nullable().optional(),
        creditCardId: z.string().nullable().optional(),
        spentById: z.string().nullable().optional(),
      })
      .parse(await req.json());

    const existing = await prisma.transaction.findFirst({
      where: { id: body.id, householdId: m.householdId, deletedAt: null },
    });
    if (!existing) throw new Error("Transacción no encontrada");

    const txn = await prisma.transaction.update({
      where: { id: body.id },
      data: {
        date: body.date,
        amountCents: body.amount !== undefined ? pesosToCents(body.amount) : undefined,
        description: body.description,
        type: body.type,
        categoryId: body.categoryId,
        accountId: body.accountId,
        creditCardId: body.creditCardId,
        spentById: body.spentById,
      },
    });
    return jsonOk({ transaction: txn });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const hard = searchParams.get("hard") === "1";
    if (!id) throw new Error("id requerido");
    const existing = await prisma.transaction.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Transacción no encontrada");
    if (hard) {
      await prisma.transaction.delete({ where: { id } });
    } else {
      await prisma.transaction.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
