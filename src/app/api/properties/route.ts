import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { ForbiddenError } from "@/lib/auth";
import { requireAddon } from "@/lib/modules/access";
import { propertyEquityCents } from "@/lib/properties/valuation";
import {
  remainingDebtCents,
  valuePropertyRow,
} from "@/lib/properties/summary";

const valueChangeSchema = z.enum(["none", "appreciate", "depreciate"]);
const methodSchema = z.enum(["compound", "straight"]);

function parseMoneyOrNull(
  v: number | string | null | undefined
): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return pesosToCents(v);
}

const kindSchema = z.enum(["asset", "liability"]);
const categorySchema = z.enum([
  "home",
  "vehicle",
  "land",
  "jewelry",
  "electronics",
  "furniture",
  "mortgage",
  "loan",
  "other",
]);

type DebtWithPays = {
  id: string;
  name: string;
  principalCents: number;
  monthlyPaymentCents: number;
  paymentDay: number;
  annualRatePercent: number;
  payments: { capitalCents: number }[];
};

type ItemRow = {
  id: string;
  name: string;
  kind: string;
  valueCents: number;
  acquiredOn: string | null;
  valueChange: string;
  annualRatePercent: number;
  method: string;
  usefulLifeYears: number | null;
  salvageCents: number;
  marketValueCents: number | null;
  marketValueOn: string | null;
  debtId: string | null;
  financedById: string | null;
  improvements: {
    costCents: number;
    effect: string;
    recoveryPercent: number;
  }[];
  debt: DebtWithPays | null;
  financedBy: (ItemRow & { finances?: unknown }) | null;
  finances: { id: string; name: string } | null;
  owners?: {
    userId: string;
    percent: number;
    user?: { displayName: string };
  }[];
};

function debtPayload(debt: DebtWithPays | null) {
  if (!debt) return null;
  return {
    id: debt.id,
    name: debt.name,
    monthlyPaymentCents: debt.monthlyPaymentCents,
    paymentDay: debt.paymentDay,
    annualRatePercent: debt.annualRatePercent,
    remainingCents: remainingDebtCents(debt),
  };
}

function currentCentsFor(row: {
  kind: string;
  valueCents: number;
  acquiredOn: string | null;
  valueChange: string;
  annualRatePercent: number;
  method: string;
  usefulLifeYears: number | null;
  salvageCents: number;
  marketValueCents?: number | null;
  marketValueOn?: string | null;
  improvements: {
    costCents: number;
    effect: string;
    recoveryPercent: number;
  }[];
  debt: DebtWithPays | null;
}) {
  const valuation = valuePropertyRow({
    kind: row.kind,
    valueCents: row.valueCents,
    acquiredOn: row.acquiredOn,
    valueChange: row.valueChange,
    annualRatePercent: row.annualRatePercent,
    method: row.method,
    usefulLifeYears: row.usefulLifeYears,
    salvageCents: row.salvageCents,
    marketValueCents: row.marketValueCents ?? null,
    marketValueOn: row.marketValueOn ?? null,
    improvements: row.improvements,
    debt: row.debt,
  });
  const remaining = remainingDebtCents(row.debt);
  const currentCents =
    row.kind === "liability" && remaining != null
      ? remaining
      : valuation.currentCents;
  return { valuation, currentCents, remainingCents: remaining };
}

function present(row: ItemRow) {
  const { valuation, currentCents } = currentCentsFor(row);
  let linkedLiability: {
    id: string;
    name: string;
    currentCents: number;
    debt: ReturnType<typeof debtPayload>;
  } | null = null;
  let equityCents: number | null = null;
  if (row.kind === "asset" && row.financedBy) {
    const fb = currentCentsFor(row.financedBy);
    linkedLiability = {
      id: row.financedBy.id,
      name: row.financedBy.name,
      currentCents: fb.currentCents,
      debt: debtPayload(row.financedBy.debt),
    };
    equityCents = propertyEquityCents(currentCents, fb.currentCents);
  }
  return {
    ...row,
    financedBy: undefined,
    finances: undefined,
    valuation: { ...valuation, currentCents },
    debt: debtPayload(row.debt),
    linkedLiability,
    financesAsset: row.finances,
    equityCents,
    owners: (row.owners || []).map((o) => ({
      userId: o.userId,
      percent: o.percent,
      name: o.user?.displayName || "",
    })),
  };
}

const propertyInclude = {
  improvements: { orderBy: { createdAt: "desc" as const } },
  debt: { include: { payments: { select: { capitalCents: true } } } },
  financedBy: {
    include: {
      improvements: true,
      debt: { include: { payments: { select: { capitalCents: true } } } },
    },
  },
  finances: { select: { id: true, name: true } },
  owners: { include: { user: { select: { displayName: true } } } },
};

const ownersSchema = z
  .array(
    z.object({
      userId: z.string(),
      percent: z.number().min(0).max(100),
    })
  )
  .optional();

async function replaceOwners(
  householdId: string,
  propertyId: string,
  owners: { userId: string; percent: number }[] | undefined,
  // Prisma client or interactive transaction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any = prisma
) {
  if (owners === undefined) return;
  const members = await tx.membership.findMany({
    where: { householdId },
    select: { userId: true },
  });
  const allowed = new Set(
    (members as { userId: string }[]).map((x) => x.userId)
  );
  const cleaned = owners.filter((o) => o.percent > 0);
  for (const o of cleaned) {
    if (!allowed.has(o.userId)) throw new Error("Miembro no válido");
  }
  const sum = cleaned.reduce((s, o) => s + o.percent, 0);
  if (sum > 100.05) throw new Error("Los porcentajes no pueden sumar más de 100%");
  await tx.propertyOwner.deleteMany({ where: { propertyId } });
  if (cleaned.length) {
    await tx.propertyOwner.createMany({
      data: cleaned.map((o) => ({
        propertyId,
        userId: o.userId,
        percent: o.percent,
      })),
    });
  }
}

async function assertFinancedBy(
  householdId: string,
  financedById: string | null | undefined,
  assetId?: string
) {
  if (!financedById) return null;
  const liab = await prisma.propertyItem.findFirst({
    where: { id: financedById, householdId, kind: "liability" },
  });
  if (!liab) throw new Error("Pasivo no encontrado");
  const taken = await prisma.propertyItem.findFirst({
    where: {
      financedById,
      ...(assetId ? { id: { not: assetId } } : {}),
    },
  });
  if (taken) throw new Error("Ese pasivo ya está vinculado a otro activo");
  return financedById;
}

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    await requireAddon(m.householdId, "properties");
    if (!canSeeModule(m.visibility, "properties")) {
      throw new ForbiddenError("Sin acceso a propiedades");
    }
    const [rows, debts] = await Promise.all([
      prisma.propertyItem.findMany({
        where: { householdId: m.householdId },
        include: propertyInclude,
        orderBy: [{ kind: "asc" }, { name: "asc" }],
      }),
      prisma.debt.findMany({
        where: { householdId: m.householdId },
        include: { payments: { select: { capitalCents: true } } },
        orderBy: { name: "asc" },
      }),
    ]);
    const items = rows.map((row) => present(row as unknown as ItemRow));
    const assets = items.filter((i) => i.kind === "asset");
    const liabilities = items.filter((i) => i.kind === "liability");
    const assetCents = assets.reduce((s, i) => s + i.valuation.currentCents, 0);
    const liabilityCents = liabilities.reduce(
      (s, i) => s + i.valuation.currentCents,
      0
    );
    const equityCents = assets.reduce(
      (s, i) => s + (i.equityCents ?? i.valuation.currentCents),
      0
    );
    const shareMap = new Map<
      string,
      { userId: string; name: string; assetCents: number; equityCents: number }
    >();
    let unassignedAssetCents = 0;
    let unassignedEquityCents = 0;
    for (const a of assets) {
      const current = a.valuation.currentCents;
      const eq = a.equityCents ?? current;
      const owners = a.owners || [];
      const assigned = owners.reduce((s, o) => s + o.percent, 0);
      for (const o of owners) {
        const prev = shareMap.get(o.userId) || {
          userId: o.userId,
          name: o.name,
          assetCents: 0,
          equityCents: 0,
        };
        prev.assetCents += Math.round((current * o.percent) / 100);
        prev.equityCents += Math.round((eq * o.percent) / 100);
        shareMap.set(o.userId, prev);
      }
      const rest = Math.max(0, 100 - assigned);
      if (rest > 0) {
        unassignedAssetCents += Math.round((current * rest) / 100);
        unassignedEquityCents += Math.round((eq * rest) / 100);
      }
    }
    return jsonOk({
      items,
      debts: debts.map((d) => ({
        id: d.id,
        name: d.name,
        remainingCents: Math.max(
          0,
          d.principalCents - d.payments.reduce((s, p) => s + p.capitalCents, 0)
        ),
      })),
      totals: {
        assetCents,
        liabilityCents,
        equityCents,
        netCents: assetCents - liabilityCents,
        ownerShares: [...shareMap.values()],
        unassignedAssetCents,
        unassignedEquityCents,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    await requireAddon(m.householdId, "properties");
    if (!canSeeModule(m.visibility, "properties")) {
      throw new ForbiddenError("Sin acceso a propiedades");
    }
    const body = z
      .object({
        name: z.string().min(1),
        kind: kindSchema,
        category: categorySchema.optional(),
        value: z.union([z.number(), z.string()]),
        valueChange: valueChangeSchema.optional(),
        annualRatePercent: z.number().min(0).max(50).optional(),
        method: methodSchema.optional(),
        usefulLifeYears: z.number().min(0).max(80).optional().nullable(),
        salvage: z.union([z.number(), z.string()]).optional().nullable(),
        notes: z.string().optional().nullable(),
        acquiredOn: z.string().optional().nullable(),
        createDebt: z.boolean().optional(),
        linkDebtId: z.string().optional().nullable(),
        monthlyPayment: z.union([z.number(), z.string()]).optional(),
        paymentDay: z.number().int().min(1).max(31).optional(),
        financedById: z.string().optional().nullable(),
        createLiability: z.boolean().optional(),
        liabilityName: z.string().optional().nullable(),
        liabilityValue: z.union([z.number(), z.string()]).optional(),
        marketValue: z.union([z.number(), z.string(), z.null()]).optional(),
        marketValueOn: z.string().optional().nullable(),
        owners: ownersSchema,
      })
      .parse(await req.json());

    const row = await prisma.$transaction(async (tx) => {
      let debtId: string | null = body.linkDebtId || null;
      if (body.kind === "liability" && body.createDebt) {
        const debt = await tx.debt.create({
          data: {
            householdId: m.householdId,
            name: body.name,
            principalCents: pesosToCents(body.value),
            annualRatePercent: body.annualRatePercent ?? 0,
            monthlyPaymentCents: pesosToCents(body.monthlyPayment || 0),
            paymentDay: body.paymentDay || 1,
            notes: body.notes || null,
          },
        });
        debtId = debt.id;
      }

      let financedById: string | null = null;
      if (body.kind === "asset") {
        if (body.createLiability) {
          let linkedDebtId: string | null = null;
          const liabName =
            (body.liabilityName || "").trim() || `Hipoteca ${body.name}`;
          const liabCents = pesosToCents(body.liabilityValue || 0);
          if (body.createDebt !== false) {
            const debt = await tx.debt.create({
              data: {
                householdId: m.householdId,
                name: liabName,
                principalCents: liabCents,
                annualRatePercent: 0,
                monthlyPaymentCents: pesosToCents(body.monthlyPayment || 0),
                paymentDay: body.paymentDay || 1,
              },
            });
            linkedDebtId = debt.id;
          }
          const cat =
            body.category === "home" || body.category === "land"
              ? "mortgage"
              : "loan";
          const liab = await tx.propertyItem.create({
            data: {
              householdId: m.householdId,
              name: liabName,
              kind: "liability",
              category: cat,
              valueCents: liabCents,
              valueChange: "none",
              debtId: linkedDebtId,
            },
          });
          financedById = liab.id;
        } else {
          financedById = await assertFinancedBy(
            m.householdId,
            body.financedById
          );
        }
      }

      const created = await tx.propertyItem.create({
        data: {
          householdId: m.householdId,
          name: body.name,
          kind: body.kind,
          category: body.category || "other",
          valueCents: pesosToCents(body.value),
          valueChange: body.valueChange || "none",
          annualRatePercent: body.annualRatePercent ?? 0,
          method: body.method || "compound",
          usefulLifeYears: body.usefulLifeYears ?? null,
          salvageCents: body.salvage != null ? pesosToCents(body.salvage) : 0,
          notes: body.notes || null,
          acquiredOn: body.acquiredOn || null,
          marketValueCents:
            body.kind === "asset"
              ? parseMoneyOrNull(body.marketValue) ?? null
              : null,
          marketValueOn:
            body.kind === "asset" ? body.marketValueOn || null : null,
          debtId,
          financedById,
        },
      });
      if (body.kind === "asset") {
        await replaceOwners(m.householdId, created.id, body.owners, tx);
      }
      return tx.propertyItem.findUniqueOrThrow({
        where: { id: created.id },
        include: propertyInclude,
      });
    });
    return jsonOk({ item: present(row as unknown as ItemRow) }, 201);
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    await requireAddon(m.householdId, "properties");
    const body = z
      .object({
        id: z.string(),
        name: z.string().min(1).optional(),
        kind: kindSchema.optional(),
        category: categorySchema.optional(),
        value: z.union([z.number(), z.string()]).optional(),
        valueChange: valueChangeSchema.optional(),
        annualRatePercent: z.number().min(0).max(50).optional(),
        method: methodSchema.optional(),
        usefulLifeYears: z.number().min(0).max(80).optional().nullable(),
        salvage: z.union([z.number(), z.string()]).optional().nullable(),
        notes: z.string().nullable().optional(),
        acquiredOn: z.string().nullable().optional(),
        createDebt: z.boolean().optional(),
        linkDebtId: z.string().nullable().optional(),
        monthlyPayment: z.union([z.number(), z.string()]).optional(),
        paymentDay: z.number().int().min(1).max(31).optional(),
        financedById: z.string().nullable().optional(),
        createLiability: z.boolean().optional(),
        liabilityName: z.string().optional().nullable(),
        liabilityValue: z.union([z.number(), z.string()]).optional(),
        marketValue: z.union([z.number(), z.string(), z.null()]).optional(),
        marketValueOn: z.string().nullable().optional(),
        owners: ownersSchema,
      })
      .parse(await req.json());
    const existing = await prisma.propertyItem.findFirst({
      where: { id: body.id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");

    const row = await prisma.$transaction(async (tx) => {
      let debtId = body.linkDebtId === undefined ? undefined : body.linkDebtId;
      const kind = body.kind || existing.kind;
      if (body.createDebt && kind === "liability") {
        const debt = await tx.debt.create({
          data: {
            householdId: m.householdId,
            name: body.name || existing.name,
            principalCents:
              body.value !== undefined
                ? pesosToCents(body.value)
                : existing.valueCents,
            annualRatePercent:
              body.annualRatePercent ?? existing.annualRatePercent,
            monthlyPaymentCents: pesosToCents(body.monthlyPayment || 0),
            paymentDay: body.paymentDay || 1,
            notes: body.notes ?? existing.notes,
          },
        });
        debtId = debt.id;
      }

      let financedById: string | null | undefined =
        kind === "liability"
          ? null
          : body.financedById === undefined
            ? undefined
            : body.financedById;
      if (kind === "asset" && body.createLiability) {
        const liabName =
          (body.liabilityName || "").trim() ||
          `Hipoteca ${body.name || existing.name}`;
        const liabCents = pesosToCents(body.liabilityValue || 0);
        let linkedDebtId: string | null = null;
        if (body.createDebt !== false) {
          const debt = await tx.debt.create({
            data: {
              householdId: m.householdId,
              name: liabName,
              principalCents: liabCents,
              annualRatePercent: 0,
              monthlyPaymentCents: pesosToCents(body.monthlyPayment || 0),
              paymentDay: body.paymentDay || 1,
            },
          });
          linkedDebtId = debt.id;
        }
        const cat =
          (body.category || existing.category) === "home" ||
          (body.category || existing.category) === "land"
            ? "mortgage"
            : "loan";
        const liab = await tx.propertyItem.create({
          data: {
            householdId: m.householdId,
            name: liabName,
            kind: "liability",
            category: cat,
            valueCents: liabCents,
            valueChange: "none",
            debtId: linkedDebtId,
          },
        });
        financedById = liab.id;
      } else if (kind === "asset" && body.financedById) {
        financedById = await assertFinancedBy(
          m.householdId,
          body.financedById,
          body.id
        );
      }

      await tx.propertyItem.update({
        where: { id: body.id },
        data: {
          name: body.name,
          kind: body.kind,
          category: body.category,
          valueCents:
            body.value !== undefined ? pesosToCents(body.value) : undefined,
          valueChange: body.valueChange,
          annualRatePercent: body.annualRatePercent,
          method: body.method,
          usefulLifeYears: body.usefulLifeYears,
          salvageCents:
            body.salvage !== undefined && body.salvage !== null
              ? pesosToCents(body.salvage)
              : body.salvage === null
                ? 0
                : undefined,
          notes: body.notes,
          acquiredOn: body.acquiredOn,
          marketValueCents:
            kind === "liability"
              ? null
              : parseMoneyOrNull(body.marketValue),
          marketValueOn:
            kind === "liability"
              ? null
              : body.marketValueOn === undefined
                ? undefined
                : body.marketValueOn || null,
          debtId,
          financedById,
        },
      });
      if (kind === "asset") {
        await replaceOwners(m.householdId, body.id, body.owners, tx);
      } else if (kind === "liability") {
        await replaceOwners(m.householdId, body.id, [], tx);
      }
      return tx.propertyItem.findUniqueOrThrow({
        where: { id: body.id },
        include: propertyInclude,
      });
    });
    return jsonOk({ item: present(row as unknown as ItemRow) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    await requireAddon(m.householdId, "properties");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("id requerido");
    const existing = await prisma.propertyItem.findFirst({
      where: { id, householdId: m.householdId },
    });
    if (!existing) throw new Error("No encontrado");
    await prisma.propertyItem.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
