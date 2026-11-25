import { prisma } from "@/lib/db";
import {
  AuthError,
  BadRequestError,
  ForbiddenError,
  RateLimitError,
  type HouseholdAccess,
} from "@/lib/auth";
import { redactSecrets } from "@/lib/ai/privacy";
import { buildFinanceContext } from "@/lib/ai/context";
import type { ToolExecResult } from "@/lib/ai/complete";
import { executeFinanceTool, type FinanceToolContext } from "@/lib/ai/tools";
import type { McpToolOutcome } from "./protocol";
import { FINANCE_BRIEFING_TOOL } from "./catalog";
import { executeBudgetTool } from "./budgets";
import { executeAppTool, isAppTool } from "./app-run";
import { loadMcpPrivacy } from "./privacy";

export type McpContext = FinanceToolContext & {
  displayName: string;
  email: string;
  role: string;
};

export async function buildMcpContext(access: HouseholdAccess): Promise<McpContext> {
  const user = await prisma.user.findUnique({
    where: { id: access.userId },
    select: { locale: true, displayName: true, email: true },
  });
  const privacy = await loadMcpPrivacy(access.householdId, access.subjectUserId);
  return {
    userId: access.userId,
    householdId: access.householdId,
    visibility: access.visibility,
    subjectUserId: access.subjectUserId,
    currency: access.household.currency || "MXN",
    locale: user?.locale || "es",
    privacy,
    displayName: user?.displayName?.trim() || "You",
    email: user?.email || "",
    role: access.role,
  };
}

async function financeBriefing(ctx: McpContext): Promise<ToolExecResult> {
  const household = await prisma.household.findUnique({
    where: { id: ctx.householdId },
    select: { name: true },
  });
  const privacy = ctx.privacy ?? (await loadMcpPrivacy(ctx.householdId, ctx.subjectUserId));
  const text = await buildFinanceContext({
    householdId: ctx.householdId,
    visibility: ctx.visibility,
    subjectUserId: ctx.subjectUserId,
    currency: ctx.currency,
    householdName: household?.name || "Finance",
    locale: ctx.locale,
    privacy,
    named: true,
  });
  const header = redactSecrets(`Signed in as ${ctx.displayName} (${ctx.role}).`);
  return {
    ok: true,
    summary: "Household briefing",
    data: { briefing: `${header}\n${text}` },
  };
}

function payload(result: ToolExecResult): string {
  const body: Record<string, unknown> = { ok: result.ok, summary: result.summary };
  if (result.error) body.error = result.error;
  if (result.data !== undefined) body.data = result.data;
  return JSON.stringify(body);
}

export async function executeMcpTool(
  ctx: McpContext,
  name: string,
  args: Record<string, unknown>
): Promise<McpToolOutcome> {
  try {
    const result =
      name === FINANCE_BRIEFING_TOOL.name
        ? await financeBriefing(ctx)
        : name === "budget_close_status" || name === "close_budget_period" || name === "undo_budget_close"
          ? await executeBudgetTool(ctx, name, args)
          : isAppTool(name)
            ? await executeAppTool(ctx, name, args)
            : await executeFinanceTool(ctx, { id: "mcp", name, arguments: args });
    return { text: payload(result), isError: !result.ok };
  } catch (error) {
    if (
      error instanceof ForbiddenError ||
      error instanceof BadRequestError ||
      error instanceof AuthError ||
      error instanceof RateLimitError
    ) {
      return {
        text: JSON.stringify({ ok: false, summary: error.message, error: error.name }),
        isError: true,
      };
    }
    console.error(error);
    return {
      text: JSON.stringify({ ok: false, summary: "Tool failed", error: "internal" }),
      isError: true,
    };
  }
}
