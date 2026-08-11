import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO } from "@/lib/utils";
import { suggestCategoryName } from "@/lib/categorize";
import { accountBalance } from "@/lib/money";
import { logActivity } from "@/lib/household";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const pref = await prisma.userPreference.findUnique({
      where: { userId: session.userId },
    });
    return jsonOk({ lastVisitAt: pref?.lastVisitAt ?? null });
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
        transactions: z
          .array(
            z.object({
              date: z.string(),
              amount: z.union([z.number(), z.string()]),
              description: z.string(),
              type: z.enum(["income", "expense"]),
              accountId: z.string().optional().nullable(),
              creditCardId: z.string().optional().nullable(),
              categoryId: z.string().optional().nullable(),
            })
          )
          .default([]),
        balanceAdjustments: z
          .array(
            z.object({
              accountId: z.string(),
              realBalance: z.union([z.number(), z.string()]),
            })
          )
          .default([]),
        debtPayments: z
          .array(
            z.object({
              debtId: z.string(),
              capital: z.union([z.number(), z.string()]),
              interest: z.union([z.number(), z.string()]).optional(),
              accountId: z.string().optional().nullable(),
              date: z.string().optional(),
            })
          )
          .default([]),
      })
      .parse(await req.json());

    let created = 0;

    for (const t of body.transactions) {
      let categoryId = t.categoryId || null;
      if (!categoryId) {
        const name = suggestCategoryName(t.description);
        if (name) {
          const cat = await prisma.category.findFirst({
            where: {
              householdId: m.householdId,
              name,
              type: t.type === "income" ? "income" : "expense",
            },
          });
          if (cat) categoryId = cat.id;
        }
      }
      const amountCents = pesosToCents(t.amount);
      const accountId = t.accountId || null;
      const creditCardId = t.creditCardId || null;
      await prisma.transaction.create({
        data: {
          householdId: m.householdId,
          date: t.date,
          amountCents,
          description: t.description,
          type: t.type,
          categoryId,
          accountId: creditCardId ? null : accountId,
          creditCardId,
          createdById: session.userId,
          spentById: session.userId,
          ...(t.type === "expense" && (accountId || creditCardId)
            ? {
                fundings: {
                  create: {
                    amountCents,
                    accountId: creditCardId ? null : accountId,
                    creditCardId,
                  },
                },
              }
            : {}),
        },
      });
      created++;
    }

    const allTx = await prisma.transaction.findMany({
      where: { householdId: m.householdId, deletedAt: null },
      select: {
        type: true,
        amountCents: true,
        accountId: true,
        toAccountId: true,
        date: true,
        deletedAt: true,
        creditCardId: true,
        fundings: {
          select: {
            amountCents: true,
            accountId: true,
            creditCardId: true,
          },
        },
      },
    });

    for (const adj of body.balanceAdjustments) {
      const account = await prisma.account.findFirst({
        where: { id: adj.accountId, householdId: m.householdId },
      });
      if (!account) continue;
      const current = accountBalance(
        account.initialBalanceCents,
        allTx,
        account.id
      );
      const target = pesosToCents(adj.realBalance);
      const diff = target - current;
      if (diff === 0) continue;
      await prisma.transaction.create({
        data: {
          householdId: m.householdId,
          date: todayISO(),
          amountCents: Math.abs(diff),
          description: "Ajuste de saldo (ponerse al día)",
          type: diff > 0 ? "income" : "expense",
          accountId: account.id,
          createdById: session.userId,
        },
      });
      created++;
    }

    for (const p of body.debtPayments) {
      await prisma.debtPayment.create({
        data: {
          householdId: m.householdId,
          debtId: p.debtId,
          date: p.date || todayISO(),
          capitalCents: pesosToCents(p.capital),
          interestCents: pesosToCents(p.interest || 0),
          accountId: p.accountId || null,
        },
      });
      created++;
    }

    await prisma.userPreference.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        householdId: m.householdId,
        lastVisitAt: new Date(),
      },
      update: { lastVisitAt: new Date() },
    });

    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "catchup",
      summary: `Se puso al día (${created} registros)`,
    });

    return jsonOk({ created });
  } catch (e) {
    return jsonError(e);
  }
}
