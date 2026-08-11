import { requireSession, requireHouseholdAccess, ForbiddenError } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/access";
import { canSeeModule } from "@/lib/visibility";
import { getMarketRates } from "@/lib/market-rates-refresh";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const m = await requireHouseholdAccess(session.userId);
    if (!canSeeModule(m.visibility, "retirement")) {
      throw new ForbiddenError("Sin acceso a retiro");
    }
    const data = await getMarketRates();
    return jsonOk(data);
  } catch (e) {
    return jsonError(e);
  }
}
