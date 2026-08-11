import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/auth";
import { canSeeModule, type MemberVisibility } from "@/lib/visibility";
import {
  getModule,
  isAddonModule,
  type AppModuleId,
} from "@/lib/modules/catalog";

export async function listInstalledModuleIds(
  householdId: string
): Promise<string[]> {
  const rows = await prisma.householdModule.findMany({
    where: { householdId },
    select: { moduleId: true },
  });
  return rows.map((r) => r.moduleId);
}

export async function isModuleInstalled(
  householdId: string,
  moduleId: string
): Promise<boolean> {
  if (!isAddonModule(moduleId)) return true;
  const row = await prisma.householdModule.findUnique({
    where: {
      householdId_moduleId: { householdId, moduleId },
    },
    select: { id: true },
  });
  return Boolean(row);
}

/** Nav / API: core modules use visibility only; add-ons also need an install. */
export function canUseModule(
  vis: MemberVisibility,
  installedIds: string[],
  moduleId: AppModuleId | keyof MemberVisibility["modules"]
): boolean {
  const def = getModule(String(moduleId));
  if (def?.kind === "addon" && !installedIds.includes(def.id)) return false;
  return canSeeModule(vis, moduleId as keyof MemberVisibility["modules"]);
}

export async function requireAddon(
  householdId: string,
  moduleId: string
): Promise<void> {
  const def = getModule(moduleId);
  if (!def || def.kind !== "addon") {
    throw new ForbiddenError("Módulo no válido");
  }
  const ok = await isModuleInstalled(householdId, moduleId);
  if (!ok) {
    throw new ForbiddenError("Este módulo no está instalado");
  }
}
