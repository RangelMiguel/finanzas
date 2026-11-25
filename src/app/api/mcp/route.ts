import { FINANCE_TOOLS } from "@/lib/ai/tools";
import { RateLimitError, type HouseholdAccess } from "@/lib/auth";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { authorizeMcpRequest } from "@/lib/mcp/auth";
import { mcpToolList } from "@/lib/mcp/catalog";
import { buildMcpContext, executeMcpTool, type McpContext } from "@/lib/mcp/execute";
import {
  dispatchMcpMessage,
  encodeSseMessage,
  isSupportedProtocol,
  negotiateAccept,
  rpcError,
} from "@/lib/mcp/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Protocol-Version",
  "Cache-Control": "no-store",
};

function withCors(status: number, body: string | null, extra?: Record<string, string>) {
  const headers = new Headers(CORS);
  headers.set("MCP-Protocol-Version", "2025-03-26");
  if (extra) {
    for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  }
  return new Response(body, { status, headers });
}

function jsonBody(status: number, body: unknown, accept: "json" | "sse") {
  if (accept === "sse") {
    return withCors(status, encodeSseMessage(body), {
      "Content-Type": "text/event-stream",
      Vary: "Accept",
    });
  }
  return withCors(status, JSON.stringify(body), {
    "Content-Type": "application/json",
    Vary: "Accept",
  });
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return true;
  const media = value.split(";")[0]?.trim().toLowerCase();
  return media === "application/json" || media === "application/json-rpc";
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const auth = await authorizeQuiet(req);
  if (auth) return auth;
  const res = jsonBody(405, rpcError(null, -32601, "Method not allowed. Use POST."), "json");
  res.headers.set("Allow", "POST, DELETE, OPTIONS");
  return res;
}

export async function DELETE(req: Request) {
  const auth = await authorizeQuiet(req);
  if (auth) return auth;
  return withCors(200, null);
}

async function authorizeQuiet(req: Request): Promise<Response | null> {
  try {
    await enforceRateLimit({
      key: `mcp-ip:${clientIp(req)}`,
      limit: 300,
      windowSec: 60,
    });
    const auth = await authorizeMcpRequest(req);
    if (!auth.ok) return jsonBody(auth.status, rpcError(null, -32001, auth.message), "json");
    return null;
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown): Response {
  if (error instanceof RateLimitError) {
    return jsonBody(429, rpcError(null, -32001, error.message), "json");
  }
  console.error(error);
  return jsonBody(500, rpcError(null, -32603, "Internal error"), "json");
}

export async function POST(req: Request) {
  try {
    await enforceRateLimit({
      key: `mcp-ip:${clientIp(req)}`,
      limit: 300,
      windowSec: 60,
    });
    const auth = await authorizeMcpRequest(req);
    if (!auth.ok) return jsonBody(auth.status, rpcError(null, -32001, auth.message), "json");

    if (!isJsonContentType(req.headers.get("content-type"))) {
      return jsonBody(415, rpcError(null, -32600, "Content-Type must be application/json"), "json");
    }
    const accept = negotiateAccept(req.headers.get("accept"));
    if (accept === "reject") {
      return jsonBody(406, rpcError(null, -32600, "Accept must include application/json or text/event-stream"), "json");
    }
    const protocolHeader = req.headers.get("mcp-protocol-version");
    if (protocolHeader && !isSupportedProtocol(protocolHeader)) {
      return jsonBody(400, rpcError(null, -32600, "Unsupported MCP-Protocol-Version"), accept);
    }

    const text = await req.text();
    if (text.length > 1_000_000) {
      return jsonBody(413, rpcError(null, -32600, "Payload too large"), accept);
    }
    if (!text.trim()) {
      return jsonBody(400, rpcError(null, -32700, "Parse error"), accept);
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return jsonBody(400, rpcError(null, -32700, "Parse error"), accept);
    }

    const access: HouseholdAccess = auth.access;
    let ctxPromise: Promise<McpContext> | null = null;
    const dispatched = await dispatchMcpMessage(body, {
      tools: mcpToolList(FINANCE_TOOLS),
      callTool: async (name, args) => {
        ctxPromise ??= buildMcpContext(access);
        return executeMcpTool(await ctxPromise, name, args);
      },
    });
    if (dispatched.type === "none") return withCors(202, null);
    return jsonBody(dispatched.status, dispatched.body, accept);
  } catch (error) {
    return failure(error);
  }
}
