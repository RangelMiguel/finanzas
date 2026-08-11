import { z } from "zod";
import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents, todayISO } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { requireAddon } from "@/lib/modules/access";
import {
  creditIsOverdue,
  creditLedgerType,
  creditRemainingCents,
  type CreditDirection,
  type CreditKind,
} from "@/lib/credits";

const directionSchema = z.enum(["lent", "borrowed"]);
const kindSchema = z.enum([
  "person",
  "family",
  "business",
  "employee",
  "store",
  "other",
]);

async function guard(write = false) {
  const session = await requireSession();
  const m = await requireHouseholdAccess(
    session.userId,
    write ? { write: true } : undefined
  );
  await requireAddon(m.householdId, "credits");
  if (!canSeeModule(m.visibility, "credits")) {
    throw new ForbiddenError("Sin acceso a créditos");
  }
  return { session, m };
}

function present<T extends {
  principalCents: number;
  dueOn: string | null;
  payments: { amountCents: number }[];
}>(row: T) {
  const paid = row.payments.reduce((s, p) => s + p.amountCents, 0);
  const remainingCents = creditRemainingCents(row.principalCents, paid);
  return {
    ...row,
    paidCents: paid,
    remainingCents,
    overdue: creditIsOverdue(remainingCents, row.dueOn),
  };
}

export async function GET() {
  try {
    const { m } = await guard();
    const rows = await prisma.credit.findMany({
      where: { householdId: m.householdId },
      include: {
        payments: { orderBy: { date: "desc" } },
        counterparty: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const credits = rows.map((r) => present(r));
    const receivableCents = credits
      .filter((c) => c.direction === "lent")
      .reduce((s, c) => s + c.remainingCents, 0);
    const payableCents = credits
      .filter((c) => c.direction === "borrowed")
      .reduce((s, c) => s + c.remainingCents, 0);
    return jsonOk({
      credits,
      totals: {
        receivableCents,
        payableCents,
        netCents: receivableCents - payableCents,
        overdueCount: credits.filter((c) => c.overdue).length,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const { session, m } = await guard(true);
    const body = z
      .object({
        direction: directionSchema,
        kind: kindSchema.optional(),
        counterpartyName: z.string().min(1),
        counterpartyUserId: z.string().optional().nullable(),
        principal: z.union([z.number(), z.string()]),
        dueOn: z.string().optional().nullable(),
        openedOn: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        accountId: z.string().optional().nullable(),
      })
      .parse(await req.json());

    if (body.counterpartyUserId) {
      const member = await prisma.membership.findFirst({
        where: { householdId: m.householdId, userId: body.counterpartyUserId },
      });
      if (!member) throw new Error("Miembro no válido");
    }

    const principalCents = pesosToCents(body.principal);
    const openedOn = body.openedOn || todayISO();
    const direction = body.direction as CreditDirection;
    const kind = (body.kind || "person") as CreditKind;

    const credit = await prisma.$transaction(async (tx) => {
      const row = await tx.credit.create({
        data: {
          householdId: m.householdId,
          direction,
          kind,
          counterpartyName: body.counterpartyName.trim(),
          counterpartyUserId: body.counterpartyUserId || null,
          principalCents,
          dueOn: body.dueOn || null,
          openedOn,
          notes: body.notes || null,
        },
      });
      if (body.accountId && principalCents > 0) {
        const type = creditLedgerType(direction, "open");
        await tx.transaction.create({
          data: {
            householdId: m.householdId,
            date: openedOn,
            amountCents: principalCents,
            description:
              type === "expense"
                ? `Crédito a ${row.counterpartyName}`
                : `Crédito de ${row.counterpartyName}`,
            type,
            accountId: body.accountId,
            createdById: session.userId,
            fundings: {
              create: { amountCents: principalCents, accountId: body.accountId },
            },
          },
        });
      }
      return row;
    });
    return jsonOk({ credit: present({ ...credit, payments: [] }) }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const { m } = await guard(true);
    const body = z
      .object({
        id: z.string(),
        direction: directionSchema.optional(),
        kind: kindSchema.optional(),
        counterpartyName: z.string().min(1).optional(),
        counterpartyUserId: z.string().nullable().optional(),
        principal: z.union([z.number(), z.string()]).optional(),
        dueOn: z.string().nullable().optional(),
        openedOn: z.string().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(await req.json());
    const existing = await prisma.credit.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    const credit = await prisma.credit.update({
      where: { id: body.id },
      data: {
        direction: body.direction,
        kind: body.kind,
        counterpartyName: body.counterpartyName,
        counterpartyUserId:
          body.counterpartyUserId === undefined
            ? undefined
            : body.counterpartyUserId,
        principalCents:
          body.principal !== undefined ? pesosToCents(body.principal) : undefined,
        dueOn: body.dueOn,
        openedOn: body.openedOn,
        notes: body.notes,
      },
      include: { payments: true },
    });
    return jsonOk({ credit: present(credit) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const { m } = await guard(true);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    const existing = await prisma.credit.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    await prisma.credit.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
