import { prisma } from "./db";
import type { RecordedCardPayment } from "./credit-card-cycles";

export async function loadRecordedCardPayments(
  householdId: string,
  creditCardId?: string
): Promise<(RecordedCardPayment & { creditCardId: string | null })[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      householdId,
      type: "cc_payment",
      deletedAt: null,
      ...(creditCardId
        ? { creditCardId }
        : { creditCardId: { not: null } }),
    },
    select: {
      id: true,
      creditCardId: true,
      amountCents: true,
      date: true,
      description: true,
      ccCycleDue: true,
      account: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    creditCardId: r.creditCardId,
    amountCents: r.amountCents,
    date: r.date,
    description: r.description,
    ccCycleDue: r.ccCycleDue,
    accountName: r.account?.name || null,
  }));
}

export function recordedForCard(
  all: (RecordedCardPayment & { creditCardId: string | null })[],
  creditCardId: string
): RecordedCardPayment[] {
  return all.filter((p) => p.creditCardId === creditCardId);
}
