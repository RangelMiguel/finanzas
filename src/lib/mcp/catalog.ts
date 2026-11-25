import type { ToolSpec } from "@/lib/ai/complete";
import { APP_TOOLS } from "./app-catalog";
import type { McpToolDefinition } from "./protocol";

export const FINANCE_BRIEFING_TOOL: ToolSpec = {
  name: "finance_briefing",
  description:
    "Current household briefing: who you are, balances, recent movements, budgets for this half-month, debts, and goals. Call this before answering questions about the money.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
};

const allocationSchema = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["emergency", "goal", "spent"],
      description:
        "emergency carries that amount to a category's next-quincena cushion. goal sends it to a savings goal. spent marks it used and carries nothing.",
    },
    amount: { type: "number", description: "Currency units, e.g. 150.50. Not cents." },
    category: {
      type: "string",
      description: "Expense category name or id. Only for emergency when the cushion should land on a different category.",
    },
    goal: { type: "string", description: "Goal name or id. Required when kind is goal." },
  },
  required: ["kind", "amount"],
  additionalProperties: false,
} as const;

export const BUDGET_MCP_TOOLS: ToolSpec[] = [
  {
    name: "budget_close_status",
    description:
      "Quincena (half-month) budget close preview. Periods are YYYY-MM-1 (days 1-15) and YYYY-MM-2 (day 16 through month end). Omit period to get the oldest quincena that is ready to close. Shows each category's planned, spent, and leftover, plus uncategorized expenses and income (those do not count against a budget until update_transaction sets a category). Also lists active goals that leftover can fund.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "YYYY-MM-1 or YYYY-MM-2. Omit for the oldest quincena waiting to be closed.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "close_budget_period",
    description:
      "Close one quincena and apply each category's leftover. Call budget_close_status first and only close when the user asked. leftover emergency carries unused money into the next quincena as emergency on the same category. leftover spent marks it used and carries nothing. If status.isStale is true, the app default is spent so old leftovers do not land on the current quincena. Omit lines to use that one leftover mode for every category. Pass lines only when the user splits a category across emergency, a goal, and spent. Each category's amounts must add up to its remaining amount, in currency units.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "YYYY-MM-1 or YYYY-MM-2. Omit to close the oldest ready quincena.",
        },
        leftover: {
          type: "string",
          enum: ["emergency", "spent"],
          description: "Where leftover goes when lines is omitted.",
        },
        lines: {
          type: "array",
          description: "Optional per-category split. Omit to use leftover for every category.",
          items: {
            type: "object",
            properties: {
              category: { type: "string", description: "Expense category name or id that has leftover" },
              allocations: { type: "array", items: allocationSchema },
            },
            required: ["category", "allocations"],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "undo_budget_close",
    description:
      "Undo a quincena close. Reverses the emergency carry and goal reserves that close created. Only when the user clearly asked to undo that quincena.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", description: "YYYY-MM-1 or YYYY-MM-2" },
      },
      required: ["period"],
      additionalProperties: false,
    },
  },
];

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
  budget_close_status: "Quincena close preview",
  close_budget_period: "Close quincena",
  undo_budget_close: "Undo quincena close",
};

const MUTATIONS = new Set([
  "add_expense",
  "add_income",
  "update_transaction",
  "delete_transaction",
  "close_budget_period",
  "undo_budget_close",
]);
const DESTRUCTIVE = new Set(["delete_transaction", "undo_budget_close"]);

export function mcpToolList(specs: ToolSpec[]): McpToolDefinition[] {
  const seen = new Set<string>();
  const ordered = [
    FINANCE_BRIEFING_TOOL,
    ...BUDGET_MCP_TOOLS,
    ...specs,
    ...APP_TOOLS.map((tool) => tool.spec),
  ].filter((spec) => {
    if (seen.has(spec.name)) return false;
    seen.add(spec.name);
    return true;
  });
  return ordered.map((spec) => {
    const appTool = APP_TOOLS.find((tool) => tool.spec.name === spec.name);
    const destructive = DESTRUCTIVE.has(spec.name) || Boolean(appTool?.destructive);
    const mutation = MUTATIONS.has(spec.name) || Boolean(appTool && !appTool.readOnly);
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
