import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from "../src/lib/seeds";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("familia123", 12);

  const alice = await prisma.user.upsert({
    where: { email: "alice@familia.local" },
    update: {},
    create: {
      email: "alice@familia.local",
      passwordHash,
      displayName: "Alice",
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@familia.local" },
    update: {},
    create: {
      email: "bob@familia.local",
      passwordHash,
      displayName: "Bob",
    },
  });

  let household = await prisma.household.findFirst({
    where: { name: "Familia Demo" },
  });

  if (!household) {
    household = await prisma.household.create({
      data: {
        name: "Familia Demo",
        createdBy: alice.id,
        memberships: {
          create: [
            { userId: alice.id, role: "owner" },
            { userId: bob.id, role: "member" },
          ],
        },
      },
    });

    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({
        householdId: household!.id,
        name: c.name,
        type: c.type,
        icon: c.icon,
        color: c.color,
        isDefault: true,
      })),
    });

    await prisma.account.createMany({
      data: DEFAULT_ACCOUNTS.map((a) => ({
        householdId: household!.id,
        name: a.name,
        type: a.type,
        icon: a.icon,
        initialBalanceCents: a.type === "checking" ? 1500000 : a.type === "cash" ? 50000 : 200000,
      })),
    });

    const categories = await prisma.category.findMany({ where: { householdId: household.id } });
    const accounts = await prisma.account.findMany({ where: { householdId: household.id } });
    const salary = categories.find((c) => c.name === "Salario")!;
    const food = categories.find((c) => c.name === "Alimentación")!;
    const checking = accounts.find((a) => a.type === "checking")!;
    const cash = accounts.find((a) => a.type === "cash")!;

    const month = new Date().toISOString().slice(0, 7);
    const day = (d: number) => `${month}-${String(d).padStart(2, "0")}`;

    await prisma.transaction.createMany({
      data: [
        {
          householdId: household.id,
          date: day(1),
          amountCents: 2500000,
          description: "Nómina quincena",
          type: "income",
          categoryId: salary.id,
          accountId: checking.id,
          createdById: alice.id,
        },
        {
          householdId: household.id,
          date: day(3),
          amountCents: 45000,
          description: "Super Walmart",
          type: "expense",
          categoryId: food.id,
          accountId: checking.id,
          createdById: bob.id,
          spentById: bob.id,
        },
        {
          householdId: household.id,
          date: day(5),
          amountCents: 20000,
          description: "Retiro cajero",
          type: "transfer",
          accountId: checking.id,
          toAccountId: cash.id,
          createdById: alice.id,
        },
      ],
    });

    const period = `${month}-1`;
    await prisma.budget.create({
      data: {
        householdId: household.id,
        categoryId: food.id,
        amountCents: 800000,
        period,
      },
    });

    await prisma.creditCard.create({
      data: {
        householdId: household.id,
        name: "BBVA Oro",
        lastFour: "4242",
        cutoffDay: 15,
        graceDays: 20,
      },
    });

    
    const entertainment = categories.find((c) => c.name === "Entretenimiento");
    await prisma.allowance.create({
      data: {
        householdId: household.id,
        userId: bob.id,
        name: "Mesada semanal Bob",
        amountCents: 100000,
        period: "weekly",
        categoryId: entertainment?.id ?? null,
        enforce: true,
        active: true,
        notes: "Demo allowance",
      },
    });
    await prisma.allowance.create({
      data: {
        householdId: household.id,
        userId: bob.id,
        name: "Tope general mensual",
        amountCents: 500000,
        period: "monthly",
        categoryId: null,
        enforce: true,
        active: true,
      },
    });

    for (const uid of [alice.id, bob.id]) {
      await prisma.userPreference.upsert({
        where: { userId: uid },
        create: { userId: uid, householdId: household.id },
        update: { householdId: household.id },
      });
    }
  }

  console.log("Seed OK");
  console.log("  alice@familia.local / familia123 (owner)");
  console.log("  bob@familia.local / familia123 (member)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
