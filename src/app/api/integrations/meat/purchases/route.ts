import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/access";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createMeatPurchase, requireMeatLink } from "@/lib/integrations/meat";
import { extractIdempotencyKey, withIdempotency } from "@/lib/idempotency";

export async function POST(req: Request) {
  try {
    const link = await requireMeatLink(req);
    await enforceRateLimit({
      key: `meat-in:${link.id}`,
      limit: 30,
      windowSec: 60,
    });
    const raw = await req.json();
    const idemKey = extractIdempotencyKey(req, raw);
    const ownerId = link.household.createdBy;
    const run = async () => {
        const body = z
          .object({
            amount: z.union([z.number(), z.string()]),
            date: z.string().optional(),
            description: z.string().optional(),
            items: z
              .array(
                z.object({
                  name: z.string(),
                  grams: z.number().optional(),
                })
              )
              .optional(),
            source: z.string().optional(),
            clientMutationId: z.string().optional(),
          })
          .parse(raw);

        const transaction = await createMeatPurchase({
          link,
          amount: body.amount,
          date: body.date,
          description: body.description,
          items: body.items,
        });
        return jsonOk(
          {
            transaction: {
              id: transaction.id,
              amountCents: transaction.amountCents,
              description: transaction.description,
              date: transaction.date,
            },
          },
          201
        );
    };
    if (ownerId) {
      return withIdempotency(
        { userId: ownerId, path: "/api/integrations/meat/purchases", key: idemKey },
        run
      );
    }
    return run();
  } catch (e) {
    return jsonError(e);
  }
}
