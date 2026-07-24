import { prisma } from "./db";
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from "./seeds";

export async function seedHouseholdDefaults(householdId: string) {
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({
      householdId,
      name: c.name,
      type: c.type,
      icon: c.icon,
      color: c.color,
      isDefault: true,
    })),
  });
  await prisma.account.createMany({
    data: DEFAULT_ACCOUNTS.map((a) => ({
      householdId,
      name: a.name,
      type: a.type,
      icon: a.icon,
      initialBalanceCents: 0,
    })),
  });
}

export async function createHouseholdWithOwner(opts: {
  name: string;
  userId: string;
}) {
  const household = await prisma.household.create({
    data: {
      name: opts.name,
      createdBy: opts.userId,
      memberships: {
        create: {
          userId: opts.userId,
          role: "owner",
        },
      },
    },
  });
  await seedHouseholdDefaults(household.id);
  await prisma.userPreference.upsert({
    where: { userId: opts.userId },
    create: { userId: opts.userId, householdId: household.id },
    update: { householdId: household.id },
  });
  return household;
}

export async function logActivity(opts: {
  householdId: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  summary: string;
}) {
  await prisma.activityEvent.create({
    data: {
      householdId: opts.householdId,
      userId: opts.userId,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      summary: opts.summary,
    },
  });
}
