import { z } from "zod";
import {
  requireSession,
  requireHouseholdAccess,
  ForbiddenError,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO } from "@/lib/utils";
import { logActivity } from "@/lib/household";
import { suggestCategoryName } from "@/lib/categorize";
import { canSeeModule, filterTransaction } from "@/lib/visibility";
import {
  legacyFieldsFromFundings,
  normalizeExpenseFundings,
  type FundingInput,
} from "@/lib/transaction-funding";

const fundingInclude = {
  fundings: {
    include: {
      account: { select: { id: true, name: true, icon: true } },
      creditCard: { select: { id: true, name: true, lastFour: true } },
    },
  },
};

const fundingBodySchema = z.array(
  z.object({
    source: z.string().optional(),
    amount: z.union([z.number(), z.string()]).optional(),
    amountCents: z.number().optional(),
    accountId: z.string().nullable().optional(),
    creditCardId: z.string().nullable().optional(),
  })
);

async function replaceFundings(transactionId: string, fundings: FundingInput[]) {
  await prisma.transactionFunding.deleteMany({ where: { transactionId } });
  if (fundings.length === 0) return;
  await prisma.transactionFunding.createMany({
    data: fundings.map((f) => ({
      transactionId,
      amountCents: f.amountCents,
      accountId: f.accountId || null,
      creditCardId: f.creditCardId || null,
    })),
  });
}

function resolveExpenseFundings(
  body: {
    fundings?: z.infer<typeof fundingBodySchema>;
    accountId?: string | null;
    creditCardId?: string | null;
    amount: number | string;
  },
  amountCents: number
): FundingInput[] {
  if (body.fundings && body.fundings.length > 0) {
    return normalizeExpenseFundings(body.fundings, amountCents);
  }
  // Legacy single fields
  if (body.creditCardId) {
    return [
      {
        amountCents,
        accountId: null,
        creditCardId: body.creditCardId,
      },
    ];
  }
  if (body.accountId) {
    return [
      {
        amountCents,
        accountId: body.accountId,
        creditCardId: null,
      },
    ];
  }
  return [];
}

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
    const spentById = searchParams.get("spentById");
    const categoryId = searchParams.get("categoryId");
    const accountId = searchParams.get("accountId");
    const creditCardId = searchParams.get("creditCardId");
    const minAmount = searchParams.get("minAmount");
    const maxAmount = searchParams.get("maxAmount");
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
    if (spentById === "unassigned") {
      where.spentById = null;
    } else if (spentById) {
      where.spentById = spentById;
    }
    if (categoryId === "unassigned") {
      where.categoryId = null;
    } else if (categoryId) {
      where.categoryId = categoryId;
    }
    if (accountId) {
      where.OR = [
        { accountId },
        { toAccountId: accountId },
        { fundings: { some: { accountId } } },
      ];
    } else if (creditCardId) {
      where.OR = [
        { creditCardId },
        { fundings: { some: { creditCardId } } },
      ];
    }
    const amountFilter: { gte?: number; lte?: number } = {};
    if (minAmount != null && minAmount !== "") {
      amountFilter.gte = pesosToCents(minAmount);
    }
    if (maxAmount != null && maxAmount !== "") {
      amountFilter.lte = pesosToCents(maxAmount);
    }
    if (amountFilter.gte != null || amountFilter.lte != null) {
      where.amountCents = amountFilter;
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
        ...fundingInclude,
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: Math.min(limit * 3, 500),
    });

    const filtered = transactions
      .filter((txn) => filterTransaction(m.visibility, txn, m.subjectUserId))
      .slice(0, limit)
      .map((txn) => {
        if (!m.visibility.showOtherMembers) {
          return {
            ...txn,
            createdBy:
              txn.createdById === m.subjectUserId ? txn.createdBy : null,
            spentBy: txn.spentById === m.subjectUserId ? txn.spentBy : null,
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
            type: z.enum(["income", "expense", "cc_payment"]),
            categoryId: z.string().optional().nullable(),
            accountId: z.string().optional().nullable(),
            creditCardId: z.string().optional().nullable(),
            fundings: fundingBodySchema.optional(),
            spentById: z.string().optional().nullable(),
            autoCategory: z.boolean().optional(),
            clientMutationId: z.string().optional(),
            msiMonths: z.number().int().min(2).max(48).optional(),
          })
          .parse(raw);

        if (body.type === "cc_payment") {
          throw new Error(
            "Los pagos de tarjeta solo se crean con el botón Pagar en Tarjetas"
          );
        }

        const amountCents = pesosToCents(body.amount);
        if (amountCents <= 0) throw new Error("Monto inválido");

        if (body.id) {
          const existing = await prisma.transaction.findFirst({
            where: { id: body.id, householdId: m.householdId },
            include: {
              category: true,
              account: true,
              creditCard: true,
              createdBy: { select: { id: true, displayName: true } },
              ...fundingInclude,
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

        let fundings: FundingInput[] = [];
        let accountId: string | null = body.accountId || null;
        let creditCardId: string | null = body.creditCardId || null;

        if (body.type === "expense") {
          fundings = resolveExpenseFundings(body, amountCents);
          const legacy = legacyFieldsFromFundings(fundings);
          accountId = legacy.accountId;
          creditCardId = legacy.creditCardId;
        }

        const cardFundings = fundings.filter((f) => f.creditCardId);
        let installmentPlanId: string | null = null;
        if (body.msiMonths && body.type === "expense") {
          if (cardFundings.length !== 1 || fundings.length !== 1) {
            throw new Error(
              "MSI solo aplica cuando pagas el total con una sola tarjeta"
            );
          }
          const msiAmount = cardFundings[0].amountCents;
          const monthly = Math.round(msiAmount / body.msiMonths);
          const plan = await prisma.installmentPlan.create({
            data: {
              householdId: m.householdId,
              description: body.description,
              totalAmountCents: msiAmount,
              months: body.msiMonths,
              monthlyAmountCents: monthly,
              creditCardId: cardFundings[0].creditCardId!,
              categoryId,
              startDate: body.date || todayISO(),
            },
          });
          installmentPlanId = plan.id;
        }

        // spentBy is optional. Do not default to the logger — that made
        // onlyOwn policies hide family expenses from limited members.
        // Empty / omitted = household shared; set explicitly for personal spend.
        const spentById =
          body.spentById && body.spentById.length > 0
            ? body.spentById
            : null;
        const txn = await prisma.transaction.create({
          data: {
            ...(body.id ? { id: body.id } : {}),
            householdId: m.householdId,
            date: body.date || todayISO(),
            amountCents,
            description: body.description,
            type: body.type,
            categoryId,
            accountId: body.type === "income" ? accountId : accountId,
            creditCardId: body.type === "expense" ? creditCardId : null,
            installmentPlanId,
            createdById: session.userId,
            spentById,
          },
        });

        if (body.type === "expense" && fundings.length > 0) {
          await replaceFundings(txn.id, fundings);
        }

        const full = await prisma.transaction.findFirst({
          where: { id: txn.id },
          include: {
            category: true,
            account: true,
            creditCard: true,
            createdBy: { select: { id: true, displayName: true } },
            ...fundingInclude,
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

        return jsonOk({ transaction: full }, 201);
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
        type: z.enum(["income", "expense", "transfer", "cc_payment"]).optional(),
        ccCycleDue: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        accountId: z.string().nullable().optional(),
        creditCardId: z.string().nullable().optional(),
        fundings: fundingBodySchema.optional(),
        spentById: z.string().nullable().optional(),
      })
      .parse(await req.json());

    const existing = await prisma.transaction.findFirst({
      where: { id: body.id, householdId: m.householdId, deletedAt: null },
      include: { fundings: true },
    });
    if (!existing) throw new Error("Transacción no encontrada");

    if (body.type === "cc_payment" && existing.type !== "cc_payment") {
      throw new Error(
        "Los pagos de tarjeta solo se crean con el botón Pagar en Tarjetas"
      );
    }
    if (
      existing.type === "cc_payment" &&
      body.type &&
      body.type !== "cc_payment"
    ) {
      throw new Error("Un pago de tarjeta no se convierte en otro tipo");
    }

    const nextType = body.type || existing.type;
    const amountCents =
      body.amount !== undefined
        ? pesosToCents(body.amount)
        : existing.amountCents;

    let accountId =
      body.accountId !== undefined ? body.accountId : existing.accountId;
    let creditCardId =
      body.creditCardId !== undefined
        ? body.creditCardId
        : existing.creditCardId;

    if (nextType === "expense") {
      let finalFundings: FundingInput[];

      if (body.fundings && body.fundings.length > 0) {
        finalFundings = normalizeExpenseFundings(body.fundings, amountCents);
      } else if (
        body.accountId !== undefined ||
        body.creditCardId !== undefined
      ) {
        finalFundings = resolveExpenseFundings(
          {
            accountId:
              body.accountId !== undefined
                ? body.accountId
                : existing.accountId,
            creditCardId:
              body.creditCardId !== undefined
                ? body.creditCardId
                : existing.creditCardId,
            amount: amountCents / 100,
          },
          amountCents
        );
      } else if (existing.fundings.length === 1) {
        finalFundings = [
          {
            amountCents,
            accountId: existing.fundings[0].accountId,
            creditCardId: existing.fundings[0].creditCardId,
          },
        ];
      } else if (existing.fundings.length > 1) {
        if (body.amount !== undefined && amountCents !== existing.amountCents) {
          throw new Error(
            "Al cambiar el monto de un pago dividido, reasigna las formas de pago"
          );
        }
        finalFundings = existing.fundings.map((f) => ({
          amountCents: f.amountCents,
          accountId: f.accountId,
          creditCardId: f.creditCardId,
        }));
      } else {
        finalFundings = resolveExpenseFundings(
          {
            accountId: existing.accountId,
            creditCardId: existing.creditCardId,
            amount: amountCents / 100,
          },
          amountCents
        );
      }

      const legacy = legacyFieldsFromFundings(finalFundings);
      accountId = legacy.accountId;
      creditCardId = legacy.creditCardId;
      await replaceFundings(existing.id, finalFundings);
    } else if (nextType === "income") {
      await replaceFundings(existing.id, []);
      creditCardId = null;
    }

    // Keep linked MSI plan in sync (or drop it if no longer a single-card purchase)
    let clearInstallment = false;
    if (existing.installmentPlanId) {
      const fundingsNow =
        nextType === "expense"
          ? await prisma.transactionFunding.findMany({
              where: { transactionId: existing.id },
            })
          : [];
      const cardOnly =
        fundingsNow.length === 1 &&
        !!fundingsNow[0].creditCardId &&
        !fundingsNow[0].accountId;

      if (nextType !== "expense" || !cardOnly || !creditCardId) {
        clearInstallment = true;
      } else {
        const plan = await prisma.installmentPlan.findFirst({
          where: {
            id: existing.installmentPlanId,
            householdId: m.householdId,
          },
        });
        if (plan) {
          const nextDesc = body.description ?? existing.description;
          const nextDate = body.date ?? existing.date;
          const monthly = Math.round(amountCents / plan.months);
          await prisma.installmentPlan.update({
            where: { id: plan.id },
            data: {
              description: nextDesc,
              startDate: nextDate,
              totalAmountCents: amountCents,
              monthlyAmountCents: monthly,
              creditCardId,
            },
          });
        }
      }
    }

    if (clearInstallment && existing.installmentPlanId) {
      const planId = existing.installmentPlanId;
      await prisma.transaction.update({
        where: { id: existing.id },
        data: { installmentPlanId: null },
      });
      await prisma.installmentPlan.deleteMany({
        where: { id: planId, householdId: m.householdId },
      });
    }

    const txn = await prisma.transaction.update({
      where: { id: body.id },
      data: {
        date: body.date,
        amountCents: body.amount !== undefined ? amountCents : undefined,
        description: body.description,
        type: body.type,
        categoryId: body.categoryId,
        accountId,
        creditCardId,
        spentById: body.spentById,
        ccCycleDue:
          body.ccCycleDue !== undefined ? body.ccCycleDue : undefined,
      },
      include: {
        category: true,
        account: true,
        creditCard: true,
        createdBy: { select: { id: true, displayName: true } },
        ...fundingInclude,
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

    const planId = existing.installmentPlanId;

    if (hard) {
      await prisma.transaction.delete({ where: { id } });
    } else {
      await prisma.transaction.update({
        where: { id },
        data: { deletedAt: new Date(), installmentPlanId: null },
      });
    }

    // Drop MSI plan so safe-to-spend / card schedules stop counting installments
    if (planId) {
      await prisma.installmentPlan.deleteMany({
        where: { id: planId, householdId: m.householdId },
      });
    }

    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
