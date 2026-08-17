import { prisma } from "@/lib/db";
import {
  aliasList,
  buildPrivacyBook,
  nameTokens,
  type EntityAlias,
  type PrivacyBook,
} from "./privacy";

export type FinancePrivacy = {
  book: PrivacyBook;
  accounts: EntityAlias[];
  cards: EntityAlias[];
  members: EntityAlias[];
};

export async function loadFinancePrivacy(
  householdId: string,
  youUserId?: string
): Promise<FinancePrivacy> {
  const [household, memberships, accounts, cards] = await Promise.all([
    prisma.household.findUnique({
      where: { id: householdId },
      select: { name: true },
    }),
    prisma.membership.findMany({
      where: { householdId },
      include: { user: { select: { id: true, displayName: true, email: true } } },
      orderBy: { createdAt: "asc" },
      take: 30,
    }),
    prisma.account.findMany({
      where: { householdId, ownerUserId: null },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
      take: 40,
    }),
    prisma.creditCard.findMany({
      where: { householdId },
      select: { id: true, name: true, lastFour: true },
      orderBy: { createdAt: "asc" },
      take: 30,
    }),
  ]);

  const phrases: { from: string; to?: string }[] = [];
  for (const token of nameTokens(household?.name)) {
    phrases.push({ from: token, to: "[household]" });
  }
  for (const row of memberships) {
    for (const token of nameTokens(row.user.displayName, row.user.email?.split("@")[0])) {
      phrases.push({ from: token, to: "[name]" });
    }
    if (row.user.email) phrases.push({ from: row.user.email, to: "[email]" });
  }
  for (const card of cards) {
    if (card.lastFour && card.lastFour.trim().length >= 3) {
      phrases.push({ from: card.lastFour.trim(), to: "[card]" });
    }
  }

  const youIndex = memberships.findIndex((row) => row.userId === youUserId);
  const members = aliasList(
    memberships.map((row) => ({ id: row.userId, names: [row.user.displayName] })),
    "Member"
  ).map((alias, index) =>
    index === youIndex ? { ...alias, alias: "You" } : alias
  );

  return {
    book: buildPrivacyBook(phrases),
    accounts: aliasList(
      accounts.map((row) => ({ id: row.id, names: [row.name] })),
      "Account"
    ),
    cards: aliasList(
      cards.map((row) => ({ id: row.id, names: [row.name] })),
      "Card"
    ),
    members,
  };
}
