import { z } from "zod";
import { BadRequestError, requireHouseholdAccess, requireSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/access";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/household";
import { enforceRateLimit } from "@/lib/rate-limit";
import { MAX_MCP_TOKENS, generateMcpToken } from "@/lib/mcp/auth";

function serialize(row: {
  id: string;
  label: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  household: { name: string };
}) {
  return {
    id: row.id,
    label: row.label,
    tokenPrefix: row.tokenPrefix,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    householdName: row.household.name,
  };
}

export async function GET() {
  try {
    const session = await requireSession();
    await requireHouseholdAccess(session.userId);
    const tokens = await prisma.mcpToken.findMany({
      where: { userId: session.userId },
      include: { household: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return jsonOk({ tokens: tokens.map(serialize) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const access = await requireHouseholdAccess(session.userId);
    await enforceRateLimit({
      key: `mcp-mint:${session.userId}`,
      limit: 10,
      windowSec: 60 * 60,
    });
    const body = z
      .object({ label: z.string().max(40).optional() })
      .parse(await req.json().catch(() => ({})));
    const label = body.label?.trim().slice(0, 40) || "Grok";
    const generated = generateMcpToken();
    const created = await prisma.$transaction(async (tx) => {
      const count = await tx.mcpToken.count({ where: { userId: session.userId } });
      if (count >= MAX_MCP_TOKENS) {
        throw new BadRequestError("Máximo 8 llaves. Revoca una para crear otra.");
      }
      return tx.mcpToken.create({
        data: {
          userId: session.userId,
          householdId: access.householdId,
          label,
          tokenHash: generated.hash,
          tokenPrefix: generated.prefix,
          enabled: true,
        },
        include: { household: { select: { name: true } } },
      });
    });
    await logActivity({
      householdId: access.householdId,
      userId: session.userId,
      action: "create",
      entityType: "mcpToken",
      entityId: created.id,
      summary: `Llave MCP creada (${label})`,
    });
    return jsonOk({ token: generated.token, credential: serialize(created) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    await requireHouseholdAccess(session.userId);
    const body = z.object({ id: z.string().min(1) }).parse(await req.json());
    const existing = await prisma.mcpToken.findFirst({
      where: { id: body.id, userId: session.userId },
    });
    if (!existing) throw new BadRequestError("Llave no encontrada");
    await prisma.mcpToken.delete({ where: { id: existing.id } });
    await logActivity({
      householdId: existing.householdId,
      userId: session.userId,
      action: "delete",
      entityType: "mcpToken",
      entityId: existing.id,
      summary: `Llave MCP revocada (${existing.label})`,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
