import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Cleanup seed — removes legacy demo accounts. App is passkey-only;
 * create real households via /register.
 */
async function main() {
  const demoEmails = ["alice@familia.local", "bob@familia.local"];

  for (const email of demoEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    await prisma.membership.deleteMany({ where: { userId: user.id } });
    await prisma.userPreference.deleteMany({ where: { userId: user.id } });
    await prisma.webAuthnCredential.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(async () => {
      // If FKs remain, soft-skip
      console.warn(`Could not fully delete user ${email}`);
    });
    console.log(`Removed demo user ${email}`);
  }

  const demoHousehold = await prisma.household.findFirst({
    where: { name: "Familia Demo" },
  });
  if (demoHousehold) {
    await prisma.household.delete({ where: { id: demoHousehold.id } });
    console.log("Removed household Familia Demo");
  }

  console.log("Seed cleanup done. No demo logins — use /register with a passkey.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
