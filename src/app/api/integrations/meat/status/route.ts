import { jsonError, jsonOk } from "@/lib/access";
import { requireMeatLink } from "@/lib/integrations/meat";

export async function GET(req: Request) {
  try {
    const link = await requireMeatLink(req);
    return jsonOk({
      ok: true,
      householdName: link.household.name,
      currency: link.household.currency,
      enabled: link.enabled,
      categoryName: link.category?.name ?? null,
      accountName: link.account?.name ?? null,
      creditCardName: link.creditCard?.name ?? null,
    });
  } catch (e) {
    return jsonError(e);
  }
}
