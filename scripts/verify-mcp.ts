import {
  dispatchMcpMessage,
  negotiateAccept,
  rpcError,
} from "../src/lib/mcp/protocol";
import { mcpToolList } from "../src/lib/mcp/catalog";
import { APP_TOOL_NAMES } from "../src/lib/mcp/app-catalog";
import { grokMcpCommand } from "../src/lib/mcp/command";

let failed = 0;

function assert(condition: unknown, message: string) {
  if (!condition) {
    failed += 1;
    console.error("FAIL", message);
  }
}

function bodyOf(result: Awaited<ReturnType<typeof dispatchMcpMessage>>) {
  assert(result.type === "json", "expected a JSON response");
  if (result.type !== "json") throw new Error(messageOf(result));
  return result.body as {
    result?: Record<string, unknown>;
    error?: { code: number; message: string };
  };
}

function messageOf(result: Awaited<ReturnType<typeof dispatchMcpMessage>>) {
  return result.type === "none" ? "notification" : JSON.stringify(result.body);
}

async function main() {
  assert(negotiateAccept(null) === "json", "missing accept is json");
  assert(negotiateAccept("application/json, text/event-stream") === "json", "both accepts prefer json");
  assert(negotiateAccept("text/event-stream") === "sse", "sse only");
  assert(negotiateAccept("text/html") === "reject", "html is rejected");

  const tools = mcpToolList([
    {
      name: "add_expense",
      description: "Create an expense",
      parameters: { type: "object", properties: { amount: { type: "number" } } },
    },
    {
      name: "delete_transaction",
      description: "Delete",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  ]);
  assert(tools[0]?.name === "finance_briefing", "briefing is first");
  assert(tools[0]?.annotations?.readOnlyHint === true, "briefing is read-only");
  assert(
    tools.find((tool) => tool.name === "budget_close_status")?.annotations?.readOnlyHint === true,
    "quincena preview is read-only"
  );
  assert(
    tools.find((tool) => tool.name === "close_budget_period")?.annotations?.readOnlyHint === false,
    "quincena close writes"
  );
  assert(
    tools.find((tool) => tool.name === "undo_budget_close")?.annotations?.destructiveHint === true,
    "undo close is destructive"
  );
  assert(APP_TOOL_NAMES.has("get_dashboard"), "dashboard tool");
  assert(APP_TOOL_NAMES.has("list_debts") && APP_TOOL_NAMES.has("save_goal"), "debts and goals");
  assert(APP_TOOL_NAMES.has("close_budget_period") === false, "quincena close stays on its own tool");
  for (const blocked of ["wipe_household", "impersonate", "security_alerts", "manage_visibility"]) {
    assert(!APP_TOOL_NAMES.has(blocked), `${blocked} is not exposed`);
  }
  assert(
    tools.find((tool) => tool.name === "delete_debt")?.annotations?.destructiveHint === true,
    "delete debt is destructive"
  );
  assert(
    tools.find((tool) => tool.name === "get_dashboard")?.annotations?.readOnlyHint === true,
    "dashboard is read-only"
  );
  assert(
    tools.find((tool) => tool.name === "add_expense")?.annotations?.readOnlyHint === false,
    "add_expense writes"
  );
  assert(
    tools.find((tool) => tool.name === "delete_transaction")?.annotations?.destructiveHint === true,
    "delete is destructive"
  );

  const init = bodyOf(
    await dispatchMcpMessage(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "grok", version: "1" } },
      },
      { tools, callTool: async () => ({ text: "", isError: false }) }
    )
  );
  assert(init.result?.protocolVersion === "2025-06-18", "negotiates client protocol");
  assert(typeof init.result?.instructions === "string", "initialize includes instructions");

  const fallback = bodyOf(
    await dispatchMcpMessage(
      { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } },
      { tools, callTool: async () => ({ text: "", isError: false }) }
    )
  );
  assert(fallback.result?.protocolVersion === "2025-03-26", "unknown protocol falls back");

  const listed = bodyOf(
    await dispatchMcpMessage(
      { jsonrpc: "2.0", id: "list", method: "tools/list" },
      { tools, callTool: async () => ({ text: "", isError: false }) }
    )
  );
  const names = (listed.result?.tools as { name: string }[]).map((tool) => tool.name);
  assert(names.includes("finance_briefing") && names.includes("add_expense"), "tools/list returns tools");

  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const called = bodyOf(
    await dispatchMcpMessage(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "add_expense", arguments: "{\"amount\":12.5}" },
      },
      {
        tools,
        callTool: async (name, args) => {
          calls.push({ name, args });
          return { text: "{\"ok\":true}", isError: false };
        },
      }
    )
  );
  const calledTool = calls[0];
  assert(calledTool?.name === "add_expense", "callTool name");
  assert(calledTool !== undefined && calledTool.args.amount === 12.5, "string arguments are parsed");
  const content = called.result?.content as { type: string; text: string }[];
  assert(content?.[0]?.text === "{\"ok\":true}" && called.result?.isError === false, "tool result content");

  const badArgs = bodyOf(
    await dispatchMcpMessage(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "add_expense", arguments: "not-json" } },
      { tools, callTool: async () => ({ text: "nope", isError: false }) }
    )
  );
  assert(badArgs.error?.code === -32602, "bad argument string is invalid params");

  const missing = bodyOf(
    await dispatchMcpMessage(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: {} },
      { tools, callTool: async () => ({ text: "", isError: false }) }
    )
  );
  assert(missing.error?.code === -32602, "missing tool name");

  const unknown = bodyOf(
    await dispatchMcpMessage(
      { jsonrpc: "2.0", id: 6, method: "widgets/spin" },
      { tools, callTool: async () => ({ text: "", isError: false }) }
    )
  );
  assert(unknown.error?.code === -32601, "unknown method");

  const note = await dispatchMcpMessage(
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { tools, callTool: async () => ({ text: "", isError: false }) }
  );
  assert(note.type === "none", "notification has no response");

  const batch = await dispatchMcpMessage([{ jsonrpc: "2.0", id: 1, method: "ping" }], {
    tools,
    callTool: async () => ({ text: "", isError: false }),
  });
  assert(batch.type === "json" && batch.status === 400, "batches are rejected");

  const ping = bodyOf(
    await dispatchMcpMessage(
      { jsonrpc: "2.0", id: 7, method: "ping" },
      { tools, callTool: async () => ({ text: "", isError: false }) }
    )
  );
  assert(ping.result && !ping.error, "ping");

  const resources = bodyOf(
    await dispatchMcpMessage(
      { jsonrpc: "2.0", id: 8, method: "resources/list" },
      { tools, callTool: async () => ({ text: "", isError: false }) }
    )
  );
  assert(Array.isArray(resources.result?.resources), "empty resources");

  const originalError = console.error;
  console.error = () => {};
  const thrown = bodyOf(
    await dispatchMcpMessage(
      { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "add_expense", arguments: {} } },
      {
        tools,
        callTool: async () => {
          throw new Error("database down");
        },
      }
    )
  );
  console.error = originalError;
  assert(thrown.error?.code === -32603, "tool throw becomes internal error");
  assert(!JSON.stringify(thrown).includes("database down"), "internal error hides the exception");

  const sample = rpcError(null, -32001, "Unauthorized");
  assert(sample.error.code === -32001, "rpc error helper");

  const command = grokMcpCommand(
    "https://finance.example/api/mcp",
    "mfmcp_abc",
    "  bypass secret  "
  );
  assert(
    command ===
      'grok mcp add --transport http finanzas https://finance.example/api/mcp --header "Authorization: Bearer mfmcp_abc" --header "x-vercel-protection-bypass: bypass secret"',
    "grok command quotes the bearer header and trims the bypass"
  );
  assert(!grokMcpCommand("https://finance.example/api/mcp", "mfmcp_abc", "  ").includes("bypass"), "blank bypass is omitted");

  if (failed) {
    console.error(`verify-mcp: ${failed} failed`);
    process.exit(1);
  }
  console.log("verify-mcp: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
