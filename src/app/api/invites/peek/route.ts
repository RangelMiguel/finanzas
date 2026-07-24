import { hashToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";

export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) throw new Error("token requerido");
    const invite = await prisma.invite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { household: { select: { name: true } } },
    });
    if (!invite || invite.acceptedAt) throw new Error("Invitación inválida");
    if (invite.expiresAt < new Date()) throw new Error("Invitación expirada");
    return jsonOk({
      email: invite.email,
      role: invite.role,
      householdName: invite.household.name,
      expiresAt: invite.expiresAt,
    });
  } catch (e) {
    return jsonError(e);
  }
}
