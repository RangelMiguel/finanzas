/**
 * Monthly refresh of Mexican reference rates.
 *
 * Sources (no API token required):
 * - CETES Directo ticker → CETES, Bonos M, Udibonos
 * - Banxico tasas HTML → target rate + TIIE
 * - Banxico SIE CP151 → INPC annual inflation
 * - Public SURA/CONSAR IRN table → SIEFORE Inicial weighted average
 */

import { prisma } from "@/lib/db";
import {
  MARKET_INSTRUMENT_DEFS,
  MARKET_INSTRUMENTS,
  applyQuotes,
  mexicoDateParts,
  type MarketInstrument,
  type MarketRateQuote,
} from "@/lib/market-instruments";

const SNAPSHOT_ID = "global";
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT =
  "MisFinanzas/1.0 (+https://github.com; monthly reference rates)";

export type MarketRatesPayload = {
  instruments: MarketInstrument[];
  monthKey: string;
  fetchedAt: string;
  refreshed: boolean;
  usingFallback: boolean;
  status: Record<string, string>;
};

type LiveBundle = {
  quotes: MarketRateQuote[];
  status: Record<string, string>;
};

let inflight: Promise<MarketRatesPayload> | null = null;

export function getMarketRates(opts?: { force?: boolean }) {
  if (!inflight) {
    inflight = loadMarketRates(opts).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function loadMarketRates(opts?: {
  force?: boolean;
}): Promise<MarketRatesPayload> {
  const { monthKey } = mexicoDateParts();
  const existing = await readSnapshot();

  if (!opts?.force && existing && existing.monthKey === monthKey) {
    return {
      instruments: applyQuotes(existing.quotes),
      monthKey: existing.monthKey,
      fetchedAt: existing.fetchedAt.toISOString(),
      refreshed: false,
      usingFallback: false,
      status: existing.status,
    };
  }

  const live = await fetchLiveQuotes();
  if (live.quotes.length === 0) {
    if (existing) {
      return {
        instruments: applyQuotes(existing.quotes),
        monthKey: existing.monthKey,
        fetchedAt: existing.fetchedAt.toISOString(),
        refreshed: false,
        usingFallback: false,
        status: { ...existing.status, ...live.status },
      };
    }
    return {
      instruments: MARKET_INSTRUMENTS,
      monthKey,
      fetchedAt: new Date().toISOString(),
      refreshed: false,
      usingFallback: true,
      status: live.status,
    };
  }

  const merged = mergeQuotes(existing?.quotes ?? seedQuotes(), live.quotes);
  const fetchedAt = new Date();
  const status = { ...existing?.status, ...live.status };

  const saved = await writeSnapshot({
    monthKey,
    fetchedAt,
    quotes: merged,
    status,
  });

  return {
    instruments: applyQuotes(merged),
    monthKey,
    fetchedAt: (saved?.fetchedAt ?? fetchedAt).toISOString(),
    refreshed: true,
    usingFallback: false,
    status,
  };
}

function seedQuotes(): MarketRateQuote[] {
  return MARKET_INSTRUMENTS.map((i) => ({
    id: i.id,
    annualRatePercent: i.annualRatePercent,
    asOf: i.asOf,
  }));
}

function mergeQuotes(
  previous: MarketRateQuote[],
  incoming: MarketRateQuote[]
): MarketRateQuote[] {
  const byId = new Map<string, MarketRateQuote>();
  for (const q of seedQuotes()) byId.set(q.id, q);
  for (const q of previous) byId.set(q.id, q);
  for (const q of incoming) byId.set(q.id, q);
  return MARKET_INSTRUMENTS.map((i) => byId.get(i.id)!);
}

async function readSnapshot(): Promise<{
  monthKey: string;
  fetchedAt: Date;
  quotes: MarketRateQuote[];
  status: Record<string, string>;
} | null> {
  try {
    const row = await prisma.marketRateSnapshot.findUnique({
      where: { id: SNAPSHOT_ID },
    });
    if (!row) return null;
    return {
      monthKey: row.monthKey,
      fetchedAt: row.fetchedAt,
      quotes: parseQuotes(row.quotesJson),
      status: parseStatus(row.statusJson),
    };
  } catch (e) {
    console.warn("[market-rates] could not read snapshot", e);
    return null;
  }
}

async function writeSnapshot(data: {
  monthKey: string;
  fetchedAt: Date;
  quotes: MarketRateQuote[];
  status: Record<string, string>;
}) {
  try {
    return await prisma.marketRateSnapshot.upsert({
      where: { id: SNAPSHOT_ID },
      create: {
        id: SNAPSHOT_ID,
        monthKey: data.monthKey,
        fetchedAt: data.fetchedAt,
        quotesJson: JSON.stringify(data.quotes),
        statusJson: JSON.stringify(data.status),
      },
      update: {
        monthKey: data.monthKey,
        fetchedAt: data.fetchedAt,
        quotesJson: JSON.stringify(data.quotes),
        statusJson: JSON.stringify(data.status),
      },
    });
  } catch (e) {
    console.warn("[market-rates] could not persist snapshot", e);
    return null;
  }
}

function parseQuotes(raw: string): MarketRateQuote[] {
  try {
    const parsed = JSON.parse(raw) as MarketRateQuote[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (q) =>
        q &&
        typeof q.id === "string" &&
        typeof q.annualRatePercent === "number" &&
        Number.isFinite(q.annualRatePercent) &&
        typeof q.asOf === "string"
    );
  } catch {
    return [];
  }
}

function parseStatus(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function fetchLiveQuotes(): Promise<LiveBundle> {
  const status: Record<string, string> = {};
  const quotes: MarketRateQuote[] = [];

  const [cetes, banxico, inflation, afore] = await Promise.allSettled([
    fetchCetesTicker(),
    fetchBanxicoTasas(),
    fetchBanxicoInflation(),
    fetchAforeInicial(),
  ]);

  const push = (
    key: string,
    result: PromiseSettledResult<MarketRateQuote[]>,
    emptyMsg: string
  ) => {
    if (result.status === "rejected") {
      status[key] = result.reason instanceof Error ? result.reason.message : String(result.reason);
      return;
    }
    if (!result.value.length) {
      status[key] = emptyMsg;
      return;
    }
    quotes.push(...result.value);
    status[key] = "ok";
  };

  push("cetesDirecto", cetes, "ticker vacío");
  push("banxico", banxico, "sin series");
  push("inflation", inflation, "sin dato anual");
  push("afore", afore, "sin IRN");

  return { quotes, status };
}

async function fetchText(url: string): Promise<{ text: string; lastModified?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json,*/*" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const text = decodeBody(buf);
    return { text, lastModified: res.headers.get("last-modified") || undefined };
  } finally {
    clearTimeout(timer);
  }
}

function decodeBody(buf: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (utf8.includes("\uFFFD") || /Ã.|&ntilde;|charset=iso-8859/i.test(utf8.slice(0, 400))) {
    return new TextDecoder("latin1").decode(buf);
  }
  return utf8;
}

function decodeEntities(s: string) {
  return s
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&");
}

function normalizeLabel(s: string) {
  return decodeEntities(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseRate(raw: string): number | null {
  const m = decodeEntities(raw).replace(",", ".").match(/([+-]?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : null;
}

function dmyToIso(dmy: string): string | null {
  const m = dmy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

async function fetchCetesTicker(): Promise<MarketRateQuote[]> {
  const { text } = await fetchText(
    "https://www.cetesdirecto.com/sites/cetes/ticker.json"
  );
  const parsed = JSON.parse(text) as {
    datos?: { tipo?: string; porcentaje?: string }[];
  };
  const rows = parsed.datos || [];
  // ticker.json Last-Modified is often stale; these are the currently posted rates.
  const asOf = mexicoDateParts().date;
  const quotes: MarketRateQuote[] = [];

  for (const def of MARKET_INSTRUMENT_DEFS) {
    if (def.fetch.kind !== "cetes-ticker") continue;
    const needle = def.fetch.match;
    const row = rows.find((r) => normalizeLabel(r.tipo || "").includes(needle));
    const rate = row ? parseRate(row.porcentaje || "") : null;
    if (rate == null) continue;
    quotes.push({ id: def.id, annualRatePercent: rate, asOf });
  }
  if (!quotes.length) throw new Error("no se reconocieron instrumentos del ticker");
  return quotes;
}

async function fetchBanxicoTasas(): Promise<MarketRateQuote[]> {
  const { text } = await fetchText(
    "https://www.banxico.org.mx/tipcamb/llenarTasasInteresAction.do?idioma=sp"
  );
  const quotes: MarketRateQuote[] = [];
  for (const def of MARKET_INSTRUMENT_DEFS) {
    if (def.fetch.kind !== "banxico-series") continue;
    const sid = def.fetch.seriesId;
    const dateMatch = text.match(
      new RegExp(`id="fecha${sid}"[^>]*>([\\s\\S]*?)</div>`, "i")
    );
    const valMatch = text.match(
      new RegExp(`id="td${sid}"[^>]*>([\\s\\S]*?)</div>`, "i")
    );
    const rate = valMatch ? parseRate(valMatch[1]) : null;
    const asOf = dateMatch ? dmyToIso(dateMatch[1].replace(/\s+/g, " ").trim()) : null;
    if (rate == null) continue;
    quotes.push({
      id: def.id,
      annualRatePercent: rate,
      asOf: asOf || mexicoDateParts().date,
    });
  }
  if (!quotes.length) throw new Error("no se leyeron series de Banxico");
  return quotes;
}

const MONTH_NAME_TO_NUM: Record<string, string> = {
  jan: "01",
  ene: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  abr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  ago: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
  dic: "12",
};

function monthLabelToIso(label: string): string | null {
  const m = label.trim().match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ.]+)\s+(\d{4})$/);
  if (!m) return null;
  const key = m[1].toLowerCase().replace(".", "").slice(0, 3);
  const mm = MONTH_NAME_TO_NUM[key];
  if (!mm) return null;
  const last = new Date(Date.UTC(Number(m[2]), Number(mm), 0));
  return last.toISOString().slice(0, 10);
}

async function fetchBanxicoInflation(): Promise<MarketRateQuote[]> {
  const { text } = await fetchText(
    "https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=8&accion=consultarCuadro&idCuadro=CP151&locale=es"
  );
  const table = text.match(
    /id="tablaObservaciones_nodo_[^"]+_SP30578"[\s\S]{0,5000}?<\/table>/i
  );
  if (!table) throw new Error("no se encontró la tabla SP30578");
  const headers = [...table[0].matchAll(/<th[^>]*>\s*([^<]+?)\s*<\/th>/gi)].map((m) =>
    decodeEntities(m[1]).replace(/\s+/g, " ").trim()
  );
  const values = [...table[0].matchAll(/tdObservacion[^>]*>\s*([\d.,]+)\s*</gi)].map(
    (m) => parseRate(m[1])
  );
  let latest: { rate: number; asOf: string } | null = null;
  for (let i = 0; i < headers.length; i++) {
    const rate = values[i];
    const asOf = monthLabelToIso(headers[i]);
    if (rate == null || !asOf) continue;
    latest = { rate, asOf };
  }
  if (!latest) throw new Error("tabla de inflación vacía");
  return [
    {
      id: "mx-inpc-annual",
      annualRatePercent: latest.rate,
      asOf: latest.asOf,
    },
  ];
}

async function fetchAforeInicial(): Promise<MarketRateQuote[]> {
  // Public dataset behind SURA's CONSAR IRN tables.
  const { text } = await fetchText(
    "https://aforeportalpublico-default-rtdb.firebaseio.com/afores.json"
  );
  const rows = JSON.parse(text) as Array<{
    name?: string;
    cierre?: string;
    fila12promedio?: string;
  }>;
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("tabla AFORE vacía");
  }
  const inicial =
    rows.find((r) => /inicial/i.test(r.name || "")) || rows[0];
  const rate = parseRate(inicial.fila12promedio || "");
  if (rate == null) throw new Error("no se encontró el IRN ponderado");

  const asOfMatch = decodeEntities(inicial.cierre || "").match(
    /cierre de ([a-zA-Záéíóúñ]+)\s+(20\d{2})/i
  );
  let asOf = mexicoDateParts().date;
  if (asOfMatch) {
    const iso = monthLabelToIso(`${asOfMatch[1]} ${asOfMatch[2]}`);
    if (iso) asOf = iso;
  }
  return [{ id: "mx-afore-inicial", annualRatePercent: rate, asOf }];
}
