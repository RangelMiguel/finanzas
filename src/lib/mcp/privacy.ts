import { prisma } from "@/lib/db";
import { buildPrivacyBook } from "@/lib/ai/privacy";
import type { FinancePrivacy } from "@/lib/ai/privacyBook";

/**
 * Labels for the member's own Grok connection.
 * Emails and card last-four are still scrubbed. Account, card, and member names stay readable.
 */
export async function loadMcpPrivacy(
  householdId: string,
  youUserId?: string
): Promise<FinancePrivacy> {
  const [memberships, accounts, cards] = await Promise.all([
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
  for (const row of memberships) {
    if (row.user.email) phrases.push({ from: row.user.email, to: "[email]" });
  }
  for (const card of cards) {
    if (card.lastFour && card.lastFour.trim().length >= 3) {
      phrases.push({ from: card.lastFour.trim(), to: "[card]" });
    }
  }

  return {
    book: buildPrivacyBook(phrases),
    accounts: accounts.map((row) => ({
      id: row.id,
      alias: row.name,
      names: [row.name],
    })),
    cards: cards.map((row) => ({
      id: row.id,
      alias: row.name,
      names: [row.name],
    })),
    members: memberships.map((row) => ({
      id: row.userId,
      alias: row.user.displayName || (row.userId === youUserId ? "You" : "Member"),
      names: [row.user.displayName].filter(Boolean),
    })),
  };
}
