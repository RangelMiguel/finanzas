import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/access";
import { canSeeModule } from "@/lib/visibility";
import { requireAddon } from "@/lib/modules/access";
import {
  comparePurchase,
  latestQuotesByStore,
  summarizePurchases,
  type StoreQuote,
} from "@/lib/prices/compare";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    await requireAddon(m.householdId, "prices");
    if (!canSeeModule(m.visibility, "prices")) {
      throw new ForbiddenError("Sin acceso a precios");
    }

    const [stores, items, quotes, purchases, txns] = await Promise.all([
      prisma.priceStore.findMany({
        where: { householdId: m.householdId },
        orderBy: { name: "asc" },
      }),
      prisma.priceItem.findMany({
        where: { householdId: m.householdId },
        orderBy: { name: "asc" },
      }),
      prisma.priceQuote.findMany({
        where: { householdId: m.householdId },
        include: { store: { select: { id: true, name: true } } },
        orderBy: { observedOn: "desc" },
      }),
      prisma.pricePurchase.findMany({
        where: { householdId: m.householdId },
        include: {
          item: true,
          store: true,
          transaction: {
            select: {
              id: true,
              date: true,
              amountCents: true,
              description: true,
            },
          },
        },
        orderBy: { purchasedOn: "desc" },
      }),
      prisma.transaction.findMany({
        where: {
          householdId: m.householdId,
          deletedAt: null,
          type: "expense",
        },
        select: {
          id: true,
          date: true,
          amountCents: true,
          description: true,
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 40,
      }),
    ]);

    const quotesByItem = new Map<string, StoreQuote[]>();
    for (const q of quotes) {
      const list = quotesByItem.get(q.itemId) || [];
      list.push({
        storeId: q.storeId,
        storeName: q.store.name,
        unitCents: q.unitCents,
        observedOn: q.observedOn,
      });
      quotesByItem.set(q.itemId, list);
    }

    const compared = purchases.map((p) => {
      const latest = latestQuotesByStore(
        quotesByItem.get(p.itemId) || [],
        p.purchasedOn
      ).filter((q) => q.storeId !== p.storeId);
      const comparison = comparePurchase({
        paidTotalCents: p.paidTotalCents,
        quantity: p.quantity,
        alternatives: latest,
      });
      return {
        ...p,
        comparison,
      };
    });

    const itemBoards = items.map((item) => {
      const latest = latestQuotesByStore(quotesByItem.get(item.id) || []);
      const cheapest = latest.reduce<StoreQuote | null>(
        (a, b) => (!a || b.unitCents < a.unitCents ? b : a),
        null
      );
      return { ...item, latest, cheapest };
    });

    return jsonOk({
      stores,
      items: itemBoards,
      quotes,
      purchases: compared,
      transactions: txns,
      totals: summarizePurchases(compared.map((p) => p.comparison)),
    });
  } catch (e) {
    return jsonError(e);
  }
}
