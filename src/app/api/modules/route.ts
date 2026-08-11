import { z } from "zod";
import { requireSession, requireHouseholdAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { ADDON_MODULES, getModule, isAddonModule } from "@/lib/modules/catalog";
import { listInstalledModuleIds } from "@/lib/modules/access";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    const installed = await listInstalledModuleIds(m.householdId);
    return jsonOk({
      catalog: ADDON_MODULES,
      installed,
      canManage: m.realRole === "owner" || m.realRole === "admin",
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, {
      write: true,
      admin: true,
    });
    const body = z.object({ moduleId: z.string().min(1) }).parse(await req.json());
    if (!isAddonModule(body.moduleId) || !getModule(body.moduleId)) {
      throw new Error("Módulo no disponible");
    }
    await prisma.householdModule.upsert({
      where: {
        householdId_moduleId: {
          householdId: m.householdId,
          moduleId: body.moduleId,
        },
      },
      create: {
        householdId: m.householdId,
        moduleId: body.moduleId,
        installedById: session.userId,
      },
      update: {},
    });
    const installed = await listInstalledModuleIds(m.householdId);
    return jsonOk({ installed, moduleId: body.moduleId });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId, {
      write: true,
      admin: true,
    });
    const moduleId = new URL(req.url).searchParams.get("moduleId");
    if (!moduleId || !isAddonModule(moduleId)) {
      throw new Error("Módulo no válido");
    }
    await prisma.householdModule.deleteMany({
      where: { householdId: m.householdId, moduleId },
    });
    const installed = await listInstalledModuleIds(m.householdId);
    return jsonOk({ installed, moduleId });
  } catch (e) {
    return jsonError(e);
  }
}
