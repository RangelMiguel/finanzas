import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO, budgetPeriodKey } from "@/lib/utils";
import { accountBalance } from "@/lib/money";
import { logActivity } from "@/lib/household";
import { canSeeModule } from "@/lib/visibility";
import { ForbiddenError } from "@/lib/auth";

function mapGoal(
  g: {
    id: string;
    name: string;
    targetAmountCents: number;
    icon: string;
    notes: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    reserves: { amountCents: number; period: string; id: string; accountId: string; date: string; notes: string | null; createdAt: Date; account: { id: string; name: string; icon: string } }[];
  }
) {
  const reservedCents = g.reserves.reduce((s, r) => s + r.amountCents, 0);
  const progress =
    g.targetAmountCents > 0
      ? Math.min(100, Math.round((reservedCents / g.targetAmountCents) * 100))
      : 0;
  return {
    ...g,
    reservedCents,
    remainingCents: Math.max(0, g.targetAmountCents - reservedCents),
    progress,
  };
}

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "goals")) {
      throw new ForbiddenError("Sin acceso a metas");
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // active | completed | all
    const period = url.searchParams.get("period");

    const goals = await prisma.goal.findMany({
      where: {
        householdId: m.householdId,
        ...(status && status !== "all" ? { status } : {}),
      },
      include: {
        reserves: {
          include: {
            account: { select: { id: true, name: true, icon: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    const accounts = await prisma.account.findMany({
      where: { householdId: m.householdId },
      orderBy: { createdAt: "asc" },
    });
    const txns = await prisma.transaction.findMany({
      where: { householdId: m.householdId, deletedAt: null },
      select: {
        type: true,
        amountCents: true,
        accountId: true,
        toAccountId: true,
        date: true,
        deletedAt: true,
      },
    });
    const accountsWithBal = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      type: a.type,
      balanceCents: accountBalance(a.initialBalanceCents, txns, a.id),
    }));

    const mapped = goals.map(mapGoal);
    const periodReserves = period
      ? mapped.flatMap((g) =>
          g.reserves
            .filter((r) => r.period === period)
            .map((r) => ({
              ...r,
              goalId: g.id,
              goalName: g.name,
              goalIcon: g.icon,
            }))
        )
      : [];

    return jsonOk({
      goals: mapped,
      accounts: accountsWithBal,
      currentPeriod: budgetPeriodKey(),
      periodReserves,
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    if (!canSeeModule(m.visibility, "goals")) {
      throw new ForbiddenError("Sin acceso a metas");
    }

    const body = z
      .object({
        name: z.string().min(1).max(120),
        targetAmount: z.union([z.number(), z.string()]),
        icon: z.string().max(8).optional(),
        notes: z.string().max(500).optional().nullable(),
      })
      .parse(await req.json());

    const targetAmountCents = pesosToCents(body.targetAmount);
    if (targetAmountCents <= 0) throw new Error("La meta debe ser mayor a 0");

    const goal = await prisma.goal.create({
      data: {
        householdId: m.householdId,
        name: body.name.trim(),
        targetAmountCents,
        icon: body.icon || "🎯",
        notes: body.notes || null,
        createdById: session.userId,
      },
      include: {
        reserves: {
          include: { account: { select: { id: true, name: true, icon: true } } },
        },
      },
    });

    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "create",
      entityType: "goal",
      entityId: goal.id,
      summary: `Creó la meta ${goal.name}`,
    });

    return jsonOk({ goal: mapGoal(goal) }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    if (!canSeeModule(m.visibility, "goals")) {
      throw new ForbiddenError("Sin acceso a metas");
    }

    const body = z
      .object({
        id: z.string(),
        name: z.string().min(1).max(120).optional(),
        targetAmount: z.union([z.number(), z.string()]).optional(),
        icon: z.string().max(8).optional(),
        notes: z.string().max(500).optional().nullable(),
        status: z.enum(["active", "completed", "cancelled"]).optional(),
        /** Reserve money from an account for a quincena */
        reserve: z
          .object({
            accountId: z.string(),
            amount: z.union([z.number(), z.string()]),
            period: z.string().optional(),
            date: z.string().optional(),
            notes: z.string().max(300).optional().nullable(),
          })
          .optional(),
      })
      .parse(await req.json());

    const goal = await prisma.goal.findFirst({
      where: { id: body.id, householdId: m.householdId },
      include: { reserves: true },
    });
    if (!goal) throw new Error("Meta no encontrada");

    // —— Reserve for quincena ——
    if (body.reserve) {
      if (goal.status === "cancelled") {
        throw new Error("No puedes reservar en una meta cancelada");
      }
      const amountCents = pesosToCents(body.reserve.amount);
      if (amountCents <= 0) throw new Error("Monto inválido");

      const account = await prisma.account.findFirst({
        where: { id: body.reserve.accountId, householdId: m.householdId },
      });
      if (!account) throw new Error("Cuenta no encontrada");

      const txns = await prisma.transaction.findMany({
        where: { householdId: m.householdId, deletedAt: null },
        select: {
          type: true,
          amountCents: true,
          accountId: true,
          toAccountId: true,
          date: true,
          deletedAt: true,
        },
      });
      const bal = accountBalance(account.initialBalanceCents, txns, account.id);
      if (amountCents > bal) {
        throw new Error(
          `Saldo insuficiente en ${account.name}. Disponible: ${(bal / 100).toFixed(2)}`
        );
      }

      const period = body.reserve.period || budgetPeriodKey();
      const date = body.reserve.date || todayISO();
      const desc = `Reserva meta: ${goal.name} (${period})`;

      const result = await prisma.$transaction(async (tx) => {
        const txn = await tx.transaction.create({
          data: {
            householdId: m.householdId,
            date,
            amountCents,
            description: desc,
            type: "expense",
            accountId: account.id,
            createdById: session.userId,
            isAutoGenerated: true,
          },
        });
        const reserve = await tx.goalReserve.create({
          data: {
            householdId: m.householdId,
            goalId: goal.id,
            accountId: account.id,
            amountCents,
            period,
            date,
            notes: body.reserve!.notes || null,
            createdById: session.userId,
            transactionId: txn.id,
          },
          include: {
            account: { select: { id: true, name: true, icon: true } },
          },
        });

        const totalReserved =
          goal.reserves.reduce((s, r) => s + r.amountCents, 0) + amountCents;
        let status = goal.status;
        if (status === "active" && totalReserved >= goal.targetAmountCents) {
          status = "completed";
          await tx.goal.update({
            where: { id: goal.id },
            data: { status: "completed" },
          });
        }

        return { reserve, status, txn };
      });

      await logActivity({
        householdId: m.householdId,
        userId: session.userId,
        action: "reserve",
        entityType: "goal",
        entityId: goal.id,
        summary: `Reservó ${(amountCents / 100).toFixed(2)} a meta ${goal.name} desde ${account.name}`,
      });

      const refreshed = await prisma.goal.findFirstOrThrow({
        where: { id: goal.id },
        include: {
          reserves: {
            include: {
              account: { select: { id: true, name: true, icon: true } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      return jsonOk({
        goal: mapGoal(refreshed),
        reserve: result.reserve,
      });
    }

    // —— Normal update ——
    const data: {
      name?: string;
      targetAmountCents?: number;
      icon?: string;
      notes?: string | null;
      status?: string;
    } = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.targetAmount !== undefined) {
      const c = pesosToCents(body.targetAmount);
      if (c <= 0) throw new Error("La meta debe ser mayor a 0");
      data.targetAmountCents = c;
    }
    if (body.icon !== undefined) data.icon = body.icon;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.status !== undefined) data.status = body.status;

    const updated = await prisma.goal.update({
      where: { id: goal.id },
      data,
      include: {
        reserves: {
          include: {
            account: { select: { id: true, name: true, icon: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "update",
      entityType: "goal",
      entityId: goal.id,
      summary: `Actualizó la meta ${updated.name}`,
    });

    return jsonOk({ goal: mapGoal(updated) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    if (!canSeeModule(m.visibility, "goals")) {
      throw new ForbiddenError("Sin acceso a metas");
    }

    const body = z
      .object({
        id: z.string().optional(),
        reserveId: z.string().optional(),
      })
      .parse(await req.json());

    // Undo a reserve (soft-delete linked txn + remove reserve)
    if (body.reserveId) {
      const reserve = await prisma.goalReserve.findFirst({
        where: { id: body.reserveId, householdId: m.householdId },
        include: { goal: true },
      });
      if (!reserve) throw new Error("Reserva no encontrada");

      await prisma.$transaction(async (tx) => {
        if (reserve.transactionId) {
          await tx.transaction.updateMany({
            where: {
              id: reserve.transactionId,
              householdId: m.householdId,
            },
            data: { deletedAt: new Date() },
          });
        }
        await tx.goalReserve.delete({ where: { id: reserve.id } });

        // Re-open goal if it was completed and no longer funded
        if (reserve.goal.status === "completed") {
          const remaining = await tx.goalReserve.aggregate({
            where: { goalId: reserve.goalId },
            _sum: { amountCents: true },
          });
          const total = remaining._sum.amountCents || 0;
          if (total < reserve.goal.targetAmountCents) {
            await tx.goal.update({
              where: { id: reserve.goalId },
              data: { status: "active" },
            });
          }
        }
      });

      await logActivity({
        householdId: m.householdId,
        userId: session.userId,
        action: "delete",
        entityType: "goal_reserve",
        entityId: reserve.id,
        summary: `Deshizo reserva de meta ${reserve.goal.name}`,
      });

      return jsonOk({ ok: true });
    }

    if (!body.id) throw new Error("id requerido");

    const goal = await prisma.goal.findFirst({
      where: { id: body.id, householdId: m.householdId },
      include: { reserves: true },
    });
    if (!goal) throw new Error("Meta no encontrada");

    // Soft: cancel and keep history, or hard delete with soft-delete of txns
    await prisma.$transaction(async (tx) => {
      for (const r of goal.reserves) {
        if (r.transactionId) {
          await tx.transaction.updateMany({
            where: { id: r.transactionId, householdId: m.householdId },
            data: { deletedAt: new Date() },
          });
        }
      }
      await tx.goalReserve.deleteMany({ where: { goalId: goal.id } });
      await tx.goal.delete({ where: { id: goal.id } });
    });

    await logActivity({
      householdId: m.householdId,
      userId: session.userId,
      action: "delete",
      entityType: "goal",
      entityId: goal.id,
      summary: `Eliminó la meta ${goal.name}`,
    });

    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
