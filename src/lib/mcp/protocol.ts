export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const MCP_PROTOCOL = "2025-03-26";

export const MCP_INSTRUCTIONS = [
  "This server is the household finance app. You are signed in as one member; every change is real.",
  "Amounts are currency units (185.50), never cents.",
  "Call finance_briefing before answering questions about balances, spending, budgets, debts, or goals.",
  "Use list_accounts, list_categories, list_credit_cards, list_members, and search_transactions when you need ids or a fresh list.",
  "add_expense and add_income create movements. update_transaction edits one. delete_transaction removes one — only when the user clearly asked to delete it.",
  "If a tool returns an error, say so. Do not invent balances or claim you saved something the tool did not confirm.",
].join("\n");

export type JsonRpcId = string | number | null;

export type McpToolDefinition = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export type McpToolOutcome = {
  text: string;
  isError: boolean;
};

export type McpDispatch =
  | { type: "none" }
  | { type: "json"; status: number; body: unknown };

type Deps = {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolOutcome>;
};

const SERVER_INFO = { name: "finanzas", version: "1.0.0" };

export function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

export function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

/** Prefer a single JSON body when the client accepts it. SSE only if that is the only option. */
export function negotiateAccept(accept: string | null): "json" | "sse" | "reject" {
  if (!accept || !accept.trim() || accept.trim() === "*/*") return "json";
  const types = accept
    .split(",")
    .map((part) => part.trim().split(";")[0]?.trim().toLowerCase())
    .filter(Boolean);
  const json = types.includes("application/json") || types.includes("*/*");
  const sse = types.includes("text/event-stream");
  if (json) return "json";
  if (sse) return "sse";
  return "reject";
}

export function isSupportedProtocol(version: string): boolean {
  return (SUPPORTED_PROTOCOLS as readonly string[]).includes(version);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readId(message: Record<string, unknown>): {
  hasId: boolean;
  id: JsonRpcId;
  bad: boolean;
} {
  if (!("id" in message)) return { hasId: false, id: null, bad: false };
  const id = message.id;
  if (id === null || typeof id === "string") return { hasId: true, id, bad: false };
  if (typeof id === "number" && Number.isFinite(id)) return { hasId: true, id, bad: false };
  return { hasId: true, id: null, bad: true };
}

function negotiateProtocol(params: Record<string, unknown> | null): string {
  const requested = params && typeof params.protocolVersion === "string" ? params.protocolVersion : "";
  return isSupportedProtocol(requested) ? requested : MCP_PROTOCOL;
}

function parseArguments(value: unknown): { ok: true; args: Record<string, unknown> } | { ok: false } {
  let parsed = value ?? {};
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { ok: false };
    }
  }
  const args = asRecord(parsed);
  if (!args) return { ok: false };
  return { ok: true, args };
}

export async function dispatchMcpMessage(message: unknown, deps: Deps): Promise<McpDispatch> {
  if (Array.isArray(message) || !message || typeof message !== "object") {
    return {
      type: "json",
      status: 400,
      body: rpcError(null, -32600, "Invalid Request"),
    };
  }

  const record = message as Record<string, unknown>;
  const { hasId, id, bad } = readId(record);
  if (bad) {
    return { type: "json", status: 400, body: rpcError(null, -32600, "Invalid Request") };
  }
  if (hasId && record.jsonrpc !== "2.0") {
    return { type: "json", status: 400, body: rpcError(id, -32600, "Invalid Request") };
  }

  const method = record.method;
  if (typeof method !== "string" || !method) {
    if (!hasId) return { type: "none" };
    return { type: "json", status: 400, body: rpcError(id, -32600, "Invalid Request") };
  }

  if (method.startsWith("notifications/") || method === "initialized") {
    if (!hasId) return { type: "none" };
    return { type: "json", status: 200, body: rpcResult(id, {}) };
  }

  if (!hasId) return { type: "none" };

  const params = asRecord(record.params);

  switch (method) {
    case "initialize":
      return {
        type: "json",
        status: 200,
        body: rpcResult(id, {
          protocolVersion: negotiateProtocol(params),
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: MCP_INSTRUCTIONS,
        }),
      };
    case "ping":
    case "logging/setLevel":
      return { type: "json", status: 200, body: rpcResult(id, {}) };
    case "tools/list":
      return {
        type: "json",
        status: 200,
        body: rpcResult(id, { tools: deps.tools }),
      };
    case "resources/list":
      return { type: "json", status: 200, body: rpcResult(id, { resources: [] }) };
    case "resources/templates/list":
      return { type: "json", status: 200, body: rpcResult(id, { resourceTemplates: [] }) };
    case "prompts/list":
      return { type: "json", status: 200, body: rpcResult(id, { prompts: [] }) };
    case "tools/call": {
      const name = params?.name;
      if (typeof name !== "string" || !/^[A-Za-z0-9_-]+$/.test(name)) {
        return { type: "json", status: 200, body: rpcError(id, -32602, "Invalid params") };
      }
      const parsed = parseArguments(params?.arguments);
      if (!parsed.ok) {
        return { type: "json", status: 200, body: rpcError(id, -32602, "Invalid params") };
      }
      try {
        const outcome = await deps.callTool(name, parsed.args);
        return {
          type: "json",
          status: 200,
          body: rpcResult(id, {
            content: [{ type: "text", text: outcome.text }],
            isError: outcome.isError,
          }),
        };
      } catch (error) {
        console.error(error);
        return { type: "json", status: 200, body: rpcError(id, -32603, "Tool failed") };
      }
    }
    default:
      return { type: "json", status: 200, body: rpcError(id, -32601, "Method not found") };
  }
}

export function encodeSseMessage(body: unknown): string {
  const json = JSON.stringify(body);
  const data = json
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n");
  return `event: message\n${data}\n\n`;
}
