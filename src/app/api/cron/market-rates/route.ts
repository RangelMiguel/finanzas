import { NextResponse } from "next/server";
import { getMarketRates } from "@/lib/market-rates-refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const data = await getMarketRates({ force: true });
    return NextResponse.json({
      ok: true,
      monthKey: data.monthKey,
      fetchedAt: data.fetchedAt,
      refreshed: data.refreshed,
      status: data.status,
    });
  } catch (e) {
    console.error("[cron/market-rates]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al actualizar tasas" },
      { status: 500 }
    );
  }
}
