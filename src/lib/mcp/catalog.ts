import type { ToolSpec } from "@/lib/ai/complete";
import type { McpToolDefinition } from "./protocol";

export const FINANCE_BRIEFING_TOOL: ToolSpec = {
  name: "finance_briefing",
  description:
    "Current household briefing: who you are, balances, recent movements, budgets for this half-month, debts, and goals. Call this before answering questions about the money.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

const TITLES: Record<string, string> = {
  finance_briefing: "Household briefing",
  list_accounts: "List accounts",
  list_categories: "List categories",
  list_credit_cards: "List credit cards",
  list_members: "List members",
  search_transactions: "Search movements",
  add_expense: "Add expense",
  add_income: "Add income",
  update_transaction: "Update movement",
  delete_transaction: "Delete movement",
};

const MUTATIONS = new Set(["add_expense", "add_income", "update_transaction", "delete_transaction"]);

export function mcpToolList(specs: ToolSpec[]): McpToolDefinition[] {
  const seen = new Set<string>();
  const ordered = [FINANCE_BRIEFING_TOOL, ...specs].filter((spec) => {
    if (seen.has(spec.name)) return false;
    seen.add(spec.name);
    return true;
  });
  return ordered.map((spec) => {
    const destructive = spec.name === "delete_transaction";
    const mutation = MUTATIONS.has(spec.name);
    return {
      name: spec.name,
      title: TITLES[spec.name] || spec.name,
      description: spec.description,
      inputSchema: spec.parameters,
      annotations: {
        readOnlyHint: !mutation,
        destructiveHint: destructive,
        idempotentHint: !mutation,
        openWorldHint: false,
      },
    };
  });
}
