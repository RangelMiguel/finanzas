import { z } from "zod";
import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { pesosToCents } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import { requireAddon } from "@/lib/modules/access";
import { getMarketRates } from "@/lib/market-rates-refresh";
import {
  clampTaxPercent,
  recommendInvestments,
  type RecommendInput,
} from "@/lib/investments/recommend";
import type { RiskLevel } from "@/lib/investments/catalog";

const riskSchema = z.enum(["low", "medium", "high"]);

async function liveRateMap(): Promise<Record<string, number>> {
  try {
    const data = await getMarketRates();
    const map: Record<string, number> = {};
    for (const i of data.instruments) {
      map[i.id] = i.annualRatePercent;
    }
    return map;
  } catch {
    return {};
  }
}

function asRisk(v: string | null | undefined): RiskLevel {
  return v === "low" || v === "high" || v === "medium" ? v : "medium";
}

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    await requireAddon(m.householdId, "investments");
    if (!canSeeModule(m.visibility, "investments")) {
      throw new ForbiddenError("Sin acceso a inversiones");
    }
    let profile = await prisma.investmentProfile.findUnique({
      where: {
        householdId_userId: {
          householdId: m.householdId,
          userId: session.userId,
        },
      },
    });
    if (!profile) {
      profile = await prisma.investmentProfile.create({
        data: {
          householdId: m.householdId,
          userId: session.userId,
        },
      });
    }
    const liveRates = await liveRateMap();
    const input: RecommendInput = {
      risk: asRisk(profile.risk),
      horizonYears: profile.horizonYears,
      amountCents: profile.amountCents,
      marginalTaxPercent: profile.marginalTaxPercent,
      liveRates,
    };
    return jsonOk({
      profile,
      ranked: recommendInvestments(input),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    await requireAddon(m.householdId, "investments");
    if (!canSeeModule(m.visibility, "investments")) {
      throw new ForbiddenError("Sin acceso a inversiones");
    }
    const body = z
      .object({
        risk: riskSchema,
        horizonYears: z.number().min(0).max(50),
        amount: z.union([z.number(), z.string()]),
        marginalTaxPercent: z.number().min(0).max(35),
      })
      .parse(await req.json());
    const profile = await prisma.investmentProfile.upsert({
      where: {
        householdId_userId: {
          householdId: m.householdId,
          userId: session.userId,
        },
      },
      create: {
        householdId: m.householdId,
        userId: session.userId,
        risk: body.risk,
        horizonYears: Math.round(body.horizonYears),
        amountCents: pesosToCents(body.amount),
        marginalTaxPercent: clampTaxPercent(body.marginalTaxPercent),
      },
      update: {
        risk: body.risk,
        horizonYears: Math.round(body.horizonYears),
        amountCents: pesosToCents(body.amount),
        marginalTaxPercent: clampTaxPercent(body.marginalTaxPercent),
      },
    });
    const liveRates = await liveRateMap();
    return jsonOk({
      profile,
      ranked: recommendInvestments({
        risk: asRisk(profile.risk),
        horizonYears: profile.horizonYears,
        amountCents: profile.amountCents,
        marginalTaxPercent: profile.marginalTaxPercent,
        liveRates,
      }),
      saved: true,
    });
  } catch (e) {
    return jsonError(e);
  }
}
