import { runWithSession, type SessionPayload } from "@/lib/auth";
import { redactSecrets } from "@/lib/ai/privacy";
import type { ToolExecResult } from "@/lib/ai/complete";
import { APP_TOOLS, APP_TOOL_NAMES, type AppToolDef } from "./app-catalog";
import type { McpContext } from "./execute";

type AnyHandler = (
  req: Request,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>;

const SECRET_KEY =
  /email|password|secret|token|lastfour|last_four|passwordhash|tokenhash|apikey|visibility/i;

function stripSecurity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecurity);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/visibility/i.test(key)) continue;
    out[key] = stripSecurity(item);
  }
  return out;
}

function sanitize(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : sanitize(item);
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function loadHandler(def: AppToolDef, params: { id: string }): Promise<AnyHandler> {
  if (def.path === "/api/credit-cards/:id") {
    const { GET } = await import("@/app/api/credit-cards/[id]/route");
    return (req) => GET(req, { params: Promise.resolve(params) });
  }
  if (def.path === "/api/credit-cards/:id/pay") {
    const { POST } = await import("@/app/api/credit-cards/[id]/pay/route");
    return (req) => POST(req, { params: Promise.resolve(params) });
  }
  if (def.path === "/api/credit-cards/:id/adjust-processing") {
    const { POST } = await import("@/app/api/credit-cards/[id]/adjust-processing/route");
    return (req) => POST(req, { params: Promise.resolve(params) });
  }
  const loaders: Record<string, () => Promise<Record<string, AnyHandler>>> = {
    "/api/dashboard": async () => import("@/app/api/dashboard/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/budgets": async () => import("@/app/api/budgets/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/budgets/copy": async () => import("@/app/api/budgets/copy/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/budgets/defaults": async () => import("@/app/api/budgets/defaults/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/accounts": async () => import("@/app/api/accounts/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/accounts/transfer": async () => import("@/app/api/accounts/transfer/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/categories": async () => import("@/app/api/categories/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/credit-cards": async () => import("@/app/api/credit-cards/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/installments": async () => import("@/app/api/installments/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/recurring": async () => import("@/app/api/recurring/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/recurring-expenses": async () => import("@/app/api/recurring-expenses/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/debts": async () => import("@/app/api/debts/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/debt-payments": async () => import("@/app/api/debt-payments/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/goals": async () => import("@/app/api/goals/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/retirement": async () => import("@/app/api/retirement/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/retirement/rates": async () => import("@/app/api/retirement/rates/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/allowances": async () => import("@/app/api/allowances/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/personal/summary": async () => import("@/app/api/personal/summary/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/personal/incomes": async () => import("@/app/api/personal/incomes/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/personal/expenses": async () => import("@/app/api/personal/expenses/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/personal/budgets": async () => import("@/app/api/personal/budgets/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/personal/allocations": async () => import("@/app/api/personal/allocations/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/safe-to-spend": async () => import("@/app/api/safe-to-spend/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/catchup": async () => import("@/app/api/catchup/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/properties": async () => import("@/app/api/properties/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/property-improvements": async () => import("@/app/api/property-improvements/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/prices": async () => import("@/app/api/prices/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/prices/items": async () => import("@/app/api/prices/items/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/prices/stores": async () => import("@/app/api/prices/stores/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/prices/quotes": async () => import("@/app/api/prices/quotes/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/prices/purchases": async () => import("@/app/api/prices/purchases/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/investments": async () => import("@/app/api/investments/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/credits": async () => import("@/app/api/credits/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/credit-payments": async () => import("@/app/api/credit-payments/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/households": async () => import("@/app/api/households/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/members": async () => import("@/app/api/members/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/invites": async () => import("@/app/api/invites/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/modules": async () => import("@/app/api/modules/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/preferences": async () => import("@/app/api/preferences/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/integrations/meat": async () => import("@/app/api/integrations/meat/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/tickets/parse": async () => import("@/app/api/tickets/parse/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/tickets/import": async () => import("@/app/api/tickets/import/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/statements/parse": async () => import("@/app/api/statements/parse/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/export": async () => import("@/app/api/export/route") as unknown as Promise<Record<string, AnyHandler>>,
    "/api/import": async () => import("@/app/api/import/route") as unknown as Promise<Record<string, AnyHandler>>,
  };
  const load = loaders[def.path];
  if (!load) throw new Error(`No handler for ${def.path}`);
  const mod = await load();
  const handler = mod[def.method];
  if (!handler) throw new Error(`No ${def.method} for ${def.path}`);
  return handler;
}

function queryString(args: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(args)) {
    if (value == null || value === "") continue;
    if (typeof value === "object") params.set(key, JSON.stringify(value));
    else params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function readResult(res: Response, summary: string): Promise<ToolExecResult> {
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/octet-stream")) {
    const bytes = Buffer.from(await res.arrayBuffer());
    const disposition = res.headers.get("content-disposition") || "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || "misfinanzas.enc";
    if (bytes.length > 12_000) {
      return {
        ok: res.ok,
        summary: `Encrypted backup is ${bytes.length} bytes. Download it from Import / export in the app.`,
        data: { filename, bytes: bytes.length },
      };
    }
    return {
      ok: res.ok,
      summary,
      data: { filename, base64: bytes.toString("base64") },
    };
  }
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 2000) };
    }
  }
  const clean = sanitize(parsed);
  if (!res.ok) {
    const message =
      isRecord(clean) && typeof clean.error === "string" ? clean.error : `Request failed (${res.status})`;
    return { ok: false, summary: message, error: "app", data: clean ?? undefined };
  }
  return { ok: true, summary, data: clean ?? undefined };
}

async function callRoute(
  session: SessionPayload,
  def: AppToolDef,
  method: AppToolDef["method"],
  args: Record<string, unknown>
): Promise<ToolExecResult> {
  const bodyArgs = stripSecurity(args);
  const record = isRecord(bodyArgs) ? bodyArgs : {};
  const paramId = def.param ? String(record.id || "") : "";
  if (def.param && !paramId) {
    return { ok: false, summary: "id is required", error: "id" };
  }
  const rest = { ...record };
  if (def.param) delete rest.id;

  return runWithSession(session, async () => {
    let req: Request;
    if (def.spec.name === "import_backup") {
      const password = String(record.password || "");
      const fileBase64 = String(record.fileBase64 || "");
      const form = new FormData();
      form.set("password", password);
      if (record.mode != null) form.set("mode", String(record.mode));
      const bytes = Buffer.from(fileBase64, "base64");
      form.set("file", new File([bytes], String(record.filename || "backup.enc")));
      req = new Request("http://mcp.internal/api/import", { method: "POST", body: form });
    } else if (method === "GET" || method === "DELETE") {
      req = new Request(`http://mcp.internal${def.path.replace(":id", paramId)}${queryString(rest)}`, {
        method,
      });
    } else {
      req = new Request(`http://mcp.internal${def.path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rest),
      });
    }
    const handler = await loadHandler(def, { id: paramId });
    const res = await handler(req, def.param ? { params: Promise.resolve({ id: paramId }) } : undefined);
    return readResult(res, def.spec.description.split(". ")[0] || def.spec.name);
  });
}

export function isAppTool(name: string): boolean {
  return APP_TOOL_NAMES.has(name);
}

export async function executeAppTool(
  ctx: McpContext,
  name: string,
  args: Record<string, unknown>
): Promise<ToolExecResult> {
  const def = APP_TOOLS.find((tool) => tool.spec.name === name);
  if (!def) return { ok: false, summary: `Unknown tool ${name}`, error: "unknown_tool" };
  const method =
    def.upsert && typeof args.id === "string" && args.id.trim()
      ? def.updateMethod || "PATCH"
      : def.method;
  const session: SessionPayload = {
    userId: ctx.userId,
    email: ctx.email,
    displayName: ctx.displayName,
  };
  try {
    return await callRoute(session, def, method, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool failed";
    return { ok: false, summary: message, error: "app" };
  }
}
