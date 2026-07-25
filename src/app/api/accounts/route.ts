import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { accountBalance } from "@/lib/money";
import { logActivity } from "@/lib/household";
import { pesosToCents } from "@/lib/utils";
import {
  canListAccounts,
  canSeeAccountBalances,
  canSeeModule,
  filterAccountId,
  filterTransaction,
} from "@/lib/visibility";
import { ForbiddenError } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    // Names for pickers (movements, etc.) even if Accounts page is off
    if (!canListAccounts(m.visibility)) {
      throw new ForbiddenError("No access to accounts");
    }
    const accounts = await prisma.account.findMany({
      where: { householdId: m.householdId },
      orderBy: { createdAt: "asc" },
    });
    const visible = accounts.filter((a) => filterAccountId(m.visibility, a.id));
    const showBalances = canSeeAccountBalances(m.visibility);

    let visibleTxns: {
      id: string;
      type: string;
      amountCents: number;
      accountId: string | null;
      toAccountId: string | null;
      date: string;
      deletedAt: Date | null;
      creditCardId: string | null;
      categoryId: string | null;
      createdById: string | null;
      spentById: string | null;
      fundings: {
        amountCents: number;
        accountId: string | null;
        creditCardId: string | null;
      }[];
    }[] = [];

    if (showBalances) {
      const txns = await prisma.transaction.findMany({
        where: { householdId: m.householdId, deletedAt: null },
        select: {
          id: true,
          type: true,
          amountCents: true,
          accountId: true,
          toAccountId: true,
          date: true,
          deletedAt: true,
          creditCardId: true,
          categoryId: true,
          createdById: true,
          spentById: true,
          fundings: {
            select: {
              amountCents: true,
              accountId: true,
              creditCardId: true,
            },
          },
        },
      });
      visibleTxns = txns.filter((t) =>
        filterTransaction(m.visibility, t, m.subjectUserId)
      );
    }

    const withBalances = visible.map((a) => ({
      ...a,
      // Never leak balances when the policy hides them (even if accounts module is on)
      balanceCents: showBalances
        ? accountBalance(a.initialBalanceCents, visibleTxns, a.id)
        : null,
      initialBalanceCents: showBalances ? a.initialBalanceCents : null,
      balancesHidden: !showBalances,
      // Soft flag for clients that only need names (movements form)
      namesOnly: !canSeeModule(m.visibility, "accounts"),
    }));
    return jsonOk({ accounts: withBalances });
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
        type: z.string().default("checking"),
        icon: z.string().default("🏦"),
        initialBalance: z.union([z.number(), z.string()]).default(0),
      })
      .parse(await req.json());
    const account = await prisma.account.create({
      data: {
        householdId: m.householdId,
        name: body.name,
        type: body.type,
        icon: body.icon,
        initialBalanceCents: pesosToCents(body.initialBalance),
      },
    });
    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "create",
      entityType: "account",
      entityId: account.id,
      summary: `Creó la cuenta ${account.name}`,
    });
    return jsonOk({ account }, 201);
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
        name: z.string().min(1).optional(),
        type: z.string().optional(),
        icon: z.string().optional(),
        initialBalance: z.union([z.number(), z.string()]).optional(),
      })
      .parse(await req.json());
    const existing = await prisma.account.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Cuenta no encontrada");
    const account = await prisma.account.update({
      where: { id: body.id },
      data: {
        name: body.name,
        type: body.type,
        icon: body.icon,
        initialBalanceCents:
          body.initialBalance !== undefined
            ? pesosToCents(body.initialBalance)
            : undefined,
      },
    });
    return jsonOk({ account });
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
    if (!id) throw new Error("id requerido");
    const existing = await prisma.account.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("Cuenta no encontrada");
    await prisma.account.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
