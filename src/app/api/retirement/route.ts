import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { accountBalance } from "@/lib/money";
import { pesosToCents } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { ForbiddenError } from "@/lib/auth";
import { computeRetirement, type RetirementInputs } from "@/lib/retirement";
import { householdPropertyTotalsIfInstalled } from "@/lib/properties/summary";
import { suggestRetirementFromHousehold } from "@/lib/retirement-suggest";

function pesosField(v: number | string | undefined, fallback = 0) {
  if (v === undefined || v === null || v === "") return fallback;
  return pesosToCents(v);
}

async function householdNestEgg(
  householdId: string,
  opts: {
    includeAccounts: boolean;
    includeGoals: boolean;
    includeProperties?: boolean;
  }
) {
  let total = 0;
  if (opts.includeAccounts) {
    const accounts = await prisma.account.findMany({
      where: { householdId },
    });
    const txns = await prisma.transaction.findMany({
      where: { householdId, deletedAt: null },
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
    for (const a of accounts) {
      total += accountBalance(a.initialBalanceCents, txns, a.id);
    }
  }
  if (opts.includeGoals) {
    const reserves = await prisma.goalReserve.aggregate({
      where: {
        householdId,
        // Leftover assigned at close never left accounts — do not double-count.
        source: "account",
      },
      _sum: { amountCents: true },
    });
    // Goal reserves already left accounts as expenses — do NOT double count.
    // includeGoalReserves means: count goal progress as part of retirement savings
    // only when we are NOT already counting accounts (or as additive "earmarked" view).
    // Better semantics: when both true, accounts already reflect reduced balances;
    // goal reserves are earmarked portion of past savings that left accounts.
    // So if includeAccounts, goal money is NOT in accounts anymore — add reserves back
    // as retirement-dedicated capital.
    if (opts.includeAccounts) {
      total += reserves._sum.amountCents || 0;
    } else {
      total += reserves._sum.amountCents || 0;
    }
  }
  if (opts.includeProperties) {
    const props = await householdPropertyTotalsIfInstalled(householdId);
    if (props) total += Math.max(0, props.equityCents);
  }
  return Math.max(0, total);
}

function planToInputs(
  plan: {
    currentAge: number;
    retirementAge: number;
    lifeExpectancyAge: number;
    desiredAnnualIncomeCents: number;
    currentAnnualIncomeCents: number;
    replacementPercent: number;
    currentSavingsCents: number | null;
    monthlyContributionCents: number;
    contributionGrowthPercent: number;
    returnPrePercent: number;
    returnPostPercent: number;
    inflationPercent: number;
    withdrawalRatePercent: number;
    pensionAnnualCents: number;
    otherIncomeAnnualCents: number;
    taxDragPercent: number;
  },
  savingsCents: number
): RetirementInputs {
  return {
    currentAge: plan.currentAge,
    retirementAge: plan.retirementAge,
    lifeExpectancyAge: plan.lifeExpectancyAge,
    desiredAnnualIncomeCents: plan.desiredAnnualIncomeCents,
    currentAnnualIncomeCents: plan.currentAnnualIncomeCents,
    replacementPercent: plan.replacementPercent,
    currentSavingsCents: savingsCents,
    monthlyContributionCents: plan.monthlyContributionCents,
    contributionGrowthPercent: plan.contributionGrowthPercent,
    returnPrePercent: plan.returnPrePercent,
    returnPostPercent: plan.returnPostPercent,
    inflationPercent: plan.inflationPercent,
    withdrawalRatePercent: plan.withdrawalRatePercent,
    pensionAnnualCents: plan.pensionAnnualCents,
    otherIncomeAnnualCents: plan.otherIncomeAnnualCents,
    taxDragPercent: plan.taxDragPercent,
  };
}

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "retirement")) {
      throw new ForbiddenError("Sin acceso a retiro");
    }

    let plan = await prisma.retirementPlan.findUnique({
      where: {
        householdId_userId: {
          householdId: m.householdId,
          userId: session.userId,
        },
      },
    });

    if (!plan) {
      plan = await prisma.retirementPlan.create({
        data: {
          householdId: m.householdId,
          userId: session.userId,
        },
      });
    }

    const autoNestEgg = await householdNestEgg(m.householdId, {
      includeAccounts: plan.includeAccountBalances,
      includeGoals: plan.includeGoalReserves,
      includeProperties: plan.includePropertyEquity,
    });
    const savingsCents =
      plan.currentSavingsCents != null ? plan.currentSavingsCents : autoNestEgg;

    const result = computeRetirement(planToInputs(plan, savingsCents));
    const propertyTotals = await householdPropertyTotalsIfInstalled(
      m.householdId
    );

    return jsonOk({
      plan,
      autoNestEggCents: autoNestEgg,
      effectiveSavingsCents: savingsCents,
      result,
      propertiesAvailable: propertyTotals != null,
    });
  } catch (e) {
    return jsonError(e);
  }
}

const saveSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  currentAge: z.number().int().min(18).max(100).optional(),
  retirementAge: z.number().int().min(18).max(100).optional(),
  lifeExpectancyAge: z.number().int().min(40).max(120).optional(),
  desiredAnnualIncome: z.union([z.number(), z.string()]).optional(),
  currentAnnualIncome: z.union([z.number(), z.string()]).optional(),
  replacementPercent: z.number().min(0).max(200).optional(),
  currentSavings: z.union([z.number(), z.string(), z.null()]).optional(),
  useAutoSavings: z.boolean().optional(),
  includeAccountBalances: z.boolean().optional(),
  includeGoalReserves: z.boolean().optional(),
  includePropertyEquity: z.boolean().optional(),
  monthlyContribution: z.union([z.number(), z.string()]).optional(),
  contributionGrowthPercent: z.number().min(0).max(30).optional(),
  returnPrePercent: z.number().min(-20).max(30).optional(),
  returnPostPercent: z.number().min(-20).max(30).optional(),
  inflationPercent: z.number().min(0).max(30).optional(),
  withdrawalRatePercent: z.number().min(0.5).max(15).optional(),
  pensionAnnual: z.union([z.number(), z.string()]).optional(),
  otherIncomeAnnual: z.union([z.number(), z.string()]).optional(),
  taxDragPercent: z.number().min(0).max(50).optional(),
  notes: z.string().max(1000).optional().nullable(),
  /** Preview without saving */
  preview: z.boolean().optional(),
});

export async function PUT(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    if (!canSeeModule(m.visibility, "retirement")) {
      throw new ForbiddenError("Sin acceso a retiro");
    }

    const body = saveSchema.parse(await req.json());

    const existing = await prisma.retirementPlan.findUnique({
      where: {
        householdId_userId: {
          householdId: m.householdId,
          userId: session.userId,
        },
      },
    });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.currentAge !== undefined) data.currentAge = body.currentAge;
    if (body.retirementAge !== undefined) data.retirementAge = body.retirementAge;
    if (body.lifeExpectancyAge !== undefined)
      data.lifeExpectancyAge = body.lifeExpectancyAge;
    if (body.desiredAnnualIncome !== undefined)
      data.desiredAnnualIncomeCents = pesosField(body.desiredAnnualIncome);
    if (body.currentAnnualIncome !== undefined)
      data.currentAnnualIncomeCents = pesosField(body.currentAnnualIncome);
    if (body.replacementPercent !== undefined)
      data.replacementPercent = Math.round(body.replacementPercent);
    if (body.useAutoSavings === true) data.currentSavingsCents = null;
    else if (body.currentSavings !== undefined) {
      data.currentSavingsCents =
        body.currentSavings === null ? null : pesosField(body.currentSavings);
    }
    if (body.includeAccountBalances !== undefined)
      data.includeAccountBalances = body.includeAccountBalances;
    if (body.includeGoalReserves !== undefined)
      data.includeGoalReserves = body.includeGoalReserves;
    if (body.includePropertyEquity !== undefined)
      data.includePropertyEquity = body.includePropertyEquity;
    if (body.monthlyContribution !== undefined)
      data.monthlyContributionCents = pesosField(body.monthlyContribution);
    if (body.contributionGrowthPercent !== undefined)
      data.contributionGrowthPercent = body.contributionGrowthPercent;
    if (body.returnPrePercent !== undefined)
      data.returnPrePercent = body.returnPrePercent;
    if (body.returnPostPercent !== undefined)
      data.returnPostPercent = body.returnPostPercent;
    if (body.inflationPercent !== undefined)
      data.inflationPercent = body.inflationPercent;
    if (body.withdrawalRatePercent !== undefined)
      data.withdrawalRatePercent = body.withdrawalRatePercent;
    if (body.pensionAnnual !== undefined)
      data.pensionAnnualCents = pesosField(body.pensionAnnual);
    if (body.otherIncomeAnnual !== undefined)
      data.otherIncomeAnnualCents = pesosField(body.otherIncomeAnnual);
    if (body.taxDragPercent !== undefined)
      data.taxDragPercent = body.taxDragPercent;
    if (body.notes !== undefined) data.notes = body.notes;

    // Validate ages
    const nextAge = (data.currentAge as number) ?? existing?.currentAge ?? 35;
    const nextRet =
      (data.retirementAge as number) ?? existing?.retirementAge ?? 65;
    const nextLife =
      (data.lifeExpectancyAge as number) ?? existing?.lifeExpectancyAge ?? 90;
    if (nextRet <= nextAge) {
      throw new Error("La edad de retiro debe ser mayor que la edad actual");
    }
    if (nextLife <= nextRet) {
      throw new Error("La esperanza de vida debe ser mayor que la edad de retiro");
    }

    let plan;
    if (body.preview) {
      plan = {
        ...(existing || {
          currentAge: 35,
          retirementAge: 65,
          lifeExpectancyAge: 90,
          desiredAnnualIncomeCents: 36000000,
          currentAnnualIncomeCents: 0,
          replacementPercent: 70,
          currentSavingsCents: null,
          includeAccountBalances: true,
          includeGoalReserves: true,
          includePropertyEquity: false,
          monthlyContributionCents: 0,
          contributionGrowthPercent: 0,
          returnPrePercent: 7,
          returnPostPercent: 4,
          inflationPercent: 3.5,
          withdrawalRatePercent: 4,
          pensionAnnualCents: 0,
          otherIncomeAnnualCents: 0,
          taxDragPercent: 0,
        }),
        ...data,
      } as NonNullable<typeof existing>;
    } else {
      plan = await prisma.retirementPlan.upsert({
        where: {
          householdId_userId: {
            householdId: m.householdId,
            userId: session.userId,
          },
        },
        create: {
          householdId: m.householdId,
          userId: session.userId,
          name: (data.name as string) || "Mi retiro",
          currentAge: nextAge,
          retirementAge: nextRet,
          lifeExpectancyAge: nextLife,
          desiredAnnualIncomeCents:
            (data.desiredAnnualIncomeCents as number) ?? 36000000,
          currentAnnualIncomeCents:
            (data.currentAnnualIncomeCents as number) ?? 0,
          replacementPercent: (data.replacementPercent as number) ?? 70,
          currentSavingsCents:
            (data.currentSavingsCents as number | null | undefined) ?? null,
          includeAccountBalances:
            (data.includeAccountBalances as boolean) ?? true,
          includeGoalReserves: (data.includeGoalReserves as boolean) ?? true,
          includePropertyEquity:
            (data.includePropertyEquity as boolean) ?? false,
          monthlyContributionCents:
            (data.monthlyContributionCents as number) ?? 0,
          contributionGrowthPercent:
            (data.contributionGrowthPercent as number) ?? 0,
          returnPrePercent: (data.returnPrePercent as number) ?? 7,
          returnPostPercent: (data.returnPostPercent as number) ?? 4,
          inflationPercent: (data.inflationPercent as number) ?? 3.5,
          withdrawalRatePercent: (data.withdrawalRatePercent as number) ?? 4,
          pensionAnnualCents: (data.pensionAnnualCents as number) ?? 0,
          otherIncomeAnnualCents: (data.otherIncomeAnnualCents as number) ?? 0,
          taxDragPercent: (data.taxDragPercent as number) ?? 0,
          notes: (data.notes as string | null) ?? null,
        },
        update: data,
      });
    }

    const autoNestEgg = await householdNestEgg(m.householdId, {
      includeAccounts: plan.includeAccountBalances,
      includeGoals: plan.includeGoalReserves,
      includeProperties: plan.includePropertyEquity,
    });
    const savingsCents =
      plan.currentSavingsCents != null ? plan.currentSavingsCents : autoNestEgg;
    const result = computeRetirement(planToInputs(plan, savingsCents));
    const propertyTotals = await householdPropertyTotalsIfInstalled(
      m.householdId
    );

    return jsonOk({
      plan,
      autoNestEggCents: autoNestEgg,
      effectiveSavingsCents: savingsCents,
      result,
      propertiesAvailable: propertyTotals != null,
      saved: !body.preview,
    });
  } catch (e) {
    return jsonError(e);
  }
}

/**
 * Suggest plan fields from recurring income (net pay) and this month's budgets.
 * Does not save; client applies to the form and can recalculate / save.
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "retirement")) {
      throw new ForbiddenError("Sin acceso a retiro");
    }

    let body: { replacementPercent?: number } = {};
    try {
      body = await req.json();
    } catch {
      /* empty body ok */
    }

    const plan = await prisma.retirementPlan.findUnique({
      where: {
        householdId_userId: {
          householdId: m.householdId,
          userId: session.userId,
        },
      },
    });

    const replacementPercent =
      typeof body.replacementPercent === "number"
        ? body.replacementPercent
        : plan?.replacementPercent ?? 70;

    const suggestion = await suggestRetirementFromHousehold(m.householdId, {
      replacementPercent,
    });

    return jsonOk({ suggestion });
  } catch (e) {
    return jsonError(e);
  }
}
