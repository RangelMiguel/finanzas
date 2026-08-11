import { prisma } from "@/lib/db";
import { isModuleInstalled } from "@/lib/modules/access";
import {
  propertyEquityCents,
  valueItem,
  type ValueChange,
  type ValueMethod,
} from "@/lib/properties/valuation";

type DebtPays = {
  principalCents: number;
  payments: { capitalCents: number }[];
};

type ValueRow = {
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
  improvements: {
    costCents: number;
    effect: string;
    recoveryPercent: number;
  }[];
  debt: DebtPays | null;
};

export type PropertyTotals = {
  assetCents: number;
  liabilityCents: number;
  netCents: number;
  equityCents: number;
  itemCount: number;
};

export function remainingDebtCents(debt: DebtPays | null): number | null {
  if (!debt) return null;
  const paid = debt.payments.reduce((s, p) => s + p.capitalCents, 0);
  return Math.max(0, debt.principalCents - paid);
}

export function valuePropertyRow(row: ValueRow) {
  return valueItem(
    {
      originalCents: row.valueCents,
      acquiredOn: row.acquiredOn,
      valueChange: (row.valueChange as ValueChange) || "none",
      annualRatePercent: row.annualRatePercent,
      method: (row.method as ValueMethod) || "compound",
      usefulLifeYears: row.usefulLifeYears,
      salvageCents: row.salvageCents,
    },
    row.improvements.map((i) => ({
      costCents: i.costCents,
      effect: i.effect === "depreciate" ? "depreciate" : "improve",
      recoveryPercent: i.recoveryPercent,
    })),
    {
      marketValueCents: row.kind === "asset" ? row.marketValueCents : null,
      marketValueOn: row.marketValueOn,
    }
  );
}

export function currentCentsForRow(row: ValueRow): number {
  const remaining = remainingDebtCents(row.debt);
  if (row.kind === "liability" && remaining != null) return remaining;
  return valuePropertyRow(row).currentCents;
}

export async function householdPropertyTotals(
  householdId: string
): Promise<PropertyTotals> {
  const rows = await prisma.propertyItem.findMany({
    where: { householdId },
    include: {
      improvements: true,
      debt: { include: { payments: { select: { capitalCents: true } } } },
      financedBy: {
        include: {
          improvements: true,
          debt: { include: { payments: { select: { capitalCents: true } } } },
        },
      },
    },
  });

  let assetCents = 0;
  let liabilityCents = 0;
  let equityCents = 0;
  for (const row of rows) {
    const current = currentCentsForRow(row);
    if (row.kind === "asset") {
      assetCents += current;
      if (row.financedBy) {
        const owe = currentCentsForRow(row.financedBy);
        equityCents += propertyEquityCents(current, owe) ?? current;
      } else {
        equityCents += current;
      }
    } else {
      liabilityCents += current;
    }
  }

  return {
    assetCents,
    liabilityCents,
    netCents: assetCents - liabilityCents,
    equityCents,
    itemCount: rows.length,
  };
}

/** Totals when the add-on is installed; otherwise null. */
export async function householdPropertyTotalsIfInstalled(
  householdId: string
): Promise<PropertyTotals | null> {
  const installed = await isModuleInstalled(householdId, "properties");
  if (!installed) return null;
  return householdPropertyTotals(householdId);
}
