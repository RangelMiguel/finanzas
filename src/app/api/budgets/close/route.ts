import { z } from "zod";
import {
  requireSession,
  requireHouseholdAccess,
  ForbiddenError,
} from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/access";
import { budgetPeriodKey, todayISO } from "@/lib/utils";
import { canSeeModule } from "@/lib/visibility";
import {
  closeBudgetPeriod,
  findPendingClose,
  getCloseStatus,
  undoBudgetPeriodClose,
} from "@/lib/budget-close";

function assertBudgetsAccess(
  visibility: Parameters<typeof canSeeModule>[0]
) {
  if (!canSeeModule(visibility, "budgets") || !visibility.showBudgets) {
    throw new ForbiddenError("No access to budgets");
  }
}

export async function GET(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    assertBudgetsAccess(m.visibility);
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "";
    const today = todayISO();

    if (period) {
      const close = await getCloseStatus(m.householdId, period, today);
      const pending = await findPendingClose(m.householdId, today);
      return jsonOk({ close, pendingClose: pending });
    }

    const pending = await findPendingClose(m.householdId, today);
    return jsonOk({
      close: pending,
      pendingClose: pending,
      currentPeriod: budgetPeriodKey(new Date(today + "T12:00:00")),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    assertBudgetsAccess(m.visibility);
    const allocationSchema = z.object({
      kind: z.enum(["emergency", "goal", "spent"]),
      amountCents: z.number().int().nonnegative().optional(),
      amount: z.union([z.number(), z.string()]).optional(),
      categoryId: z.string().optional(),
      goalId: z.string().optional(),
    });
    const body = z
      .object({
        period: z.string().min(6),
        defaultKind: z.enum(["emergency", "spent"]).optional(),
        lines: z
          .array(
            z.object({
              categoryId: z.string(),
              allocations: z.array(allocationSchema),
            })
          )
          .optional(),
      })
      .parse(await req.json());
    const close = await closeBudgetPeriod({
      householdId: m.householdId,
      period: body.period,
      userId: session.userId,
      defaultKind: body.defaultKind,
      lines: body.lines,
    });
    return jsonOk({ close });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, { write: true });
    assertBudgetsAccess(m.visibility);
    const period = new URL(req.url).searchParams.get("period");
    if (!period) throw new Error("period requerido");
    const close = await undoBudgetPeriodClose({
      householdId: m.householdId,
      period,
      userId: session.userId,
    });
    return jsonOk({ close });
  } catch (e) {
    return jsonError(e);
  }
}
