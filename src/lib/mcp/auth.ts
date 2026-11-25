import { randomBytes } from "crypto";
import {
  AuthError,
  ForbiddenError,
  RateLimitError,
  hashToken,
  requireHouseholdAccess,
  type HouseholdAccess,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

export const MCP_TOKEN_PREFIX = "mfmcp_";
export const MAX_MCP_TOKENS = 8;

export function generateMcpToken(): { token: string; hash: string; prefix: string } {
  const token = `${MCP_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 12) };
}

export function readBearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1] ?? null;
}

export async function findMcpToken(raw: string) {
  const token = raw.trim();
  if (!token.startsWith(MCP_TOKEN_PREFIX) || token.length < 20) return null;
  const row = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!row?.enabled) return null;
  return row;
}

async function touchMcpToken(id: string, lastUsedAt: Date | null) {
  if (lastUsedAt && Date.now() - lastUsedAt.getTime() < 5 * 60 * 1000) return;
  await prisma.mcpToken.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  });
}

export type McpAuth =
  | { ok: true; access: HouseholdAccess }
  | { ok: false; status: 401 | 403 | 429; message: string };

export async function authorizeMcpRequest(req: Request): Promise<McpAuth> {
  const ip = clientIp(req);
  const raw = readBearer(req);
  const row = raw ? await findMcpToken(raw) : null;
  if (!row) {
    try {
      await enforceRateLimit({ key: `mcp-fail:${ip}`, limit: 40, windowSec: 60 });
    } catch (error) {
      if (error instanceof RateLimitError) {
        return { ok: false, status: 429, message: error.message };
      }
      throw error;
    }
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  let access: HouseholdAccess;
  try {
    access = await requireHouseholdAccess(row.userId, { householdId: row.householdId });
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof AuthError) {
      return { ok: false, status: 403, message: "No household access" };
    }
    throw error;
  }

  await enforceRateLimit({ key: `mcp:${row.id}`, limit: 120, windowSec: 60 });
  try {
    await touchMcpToken(row.id, row.lastUsedAt);
  } catch (error) {
    console.error("mcp last-used update failed", error);
  }
  return { ok: true, access };
}
