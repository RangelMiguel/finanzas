/**
 * Parse POS / grocery ticket text into line items with prices.
 * Handles Mexican & US-style receipts.
 */

export type TicketLineItem = {
  description: string;
  amount: number; // pesos
  quantity: number;
  unitPrice: number;
  raw: string;
  suggestedCategoryName: string | null;
};

export type TicketParseResult = {
  items: TicketLineItem[];
  merchant: string | null;
  total: number | null;
  date: string | null;
  rawLineCount: number;
};

const SKIP_RE =
  /^(sub\s*total|subtotal|total|iva|tax|cambio|change|efectivo|tarjeta|pago|folio|ticket|caja|cajero|rfc|fecha|hora|gracias|thank|visa|mastercard|amex|---+|===+|tel\.?|www\.|http|propina|tip|redondeo|ahorro|puntos|cliente|member|store|sucursal|atendido|operador|autoriza|aprobad|ref\.?|afiliacion|comercio)/i;

const TOTAL_RE =
  /^(?:total|importe\s*total|gran\s*total|total\s*a\s*pagar)\s*[:.]?\s*\$?\s*([\d,]+\.?\d*)/i;

const DATE_RE =
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/;

function parseMoney(s: string): number | null {
  let t = s.trim().replace(/[^\d,.\-]/g, "");
  if (!t) return null;
  // 1.234,56 European
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(t)) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (t.includes(",") && !t.includes(".")) {
    // 25,50
    t = t.replace(",", ".");
  } else {
    t = t.replace(/,/g, "");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function isNoiseLine(line: string): boolean {
  const l = line.trim();
  if (l.length < 2) return true;
  if (SKIP_RE.test(l)) return true;
  if (/^[\d\s\-\/\.:]+$/.test(l)) return true; // pure numbers/dates
  if (l.length > 80 && !/\d/.test(l)) return true;
  return false;
}

/** Extract trailing price from a line */
function splitDescriptionPrice(line: string): {
  description: string;
  amount: number;
  quantity: number;
  unitPrice: number;
} | null {
  const cleaned = line
    .replace(/\$/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Pattern: QTY x DESC PRICE  or  QTY*DESC PRICE
  const qtyMatch = cleaned.match(
    /^(\d+(?:[.,]\d+)?)\s*[x×*]\s+(.+?)\s+([\d,]+\.\d{2}|[\d]+,\d{2})$/i
  );
  if (qtyMatch) {
    const qty = parseFloat(qtyMatch[1].replace(",", ".")) || 1;
    const amount = parseMoney(qtyMatch[3]);
    if (amount != null && amount > 0 && amount < 1_000_000) {
      const desc = qtyMatch[2].trim();
      if (desc.length >= 2) {
        return {
          description: desc,
          amount,
          quantity: qty,
          unitPrice: Math.round((amount / qty) * 100) / 100,
        };
      }
    }
  }

  // Pattern: DESC ... PRICE at end — prefer prices with decimals (18.50)
  // Avoid treating store numbers (OXXO 1234) as prices
  const priceAtEnd = cleaned.match(
    /^(.+?)\s+(-?[\d]{1,3}(?:[.,]\d{3})*[.,]\d{2}|-?[\d]+[.,]\d{2})$/
  );
  if (priceAtEnd) {
    const desc = priceAtEnd[1].replace(/\s+/g, " ").trim();
    const amount = parseMoney(priceAtEnd[2]);
    if (
      amount != null &&
      amount > 0 &&
      amount < 1_000_000 &&
      desc.length >= 2 &&
      !/^\d+$/.test(desc) &&
      !SKIP_RE.test(desc)
    ) {
      // Reject if description is mostly the word total-ish
      if (/total|subtotal|iva|cambio/i.test(desc) && desc.length < 20) {
        return null;
      }
      // qty prefix: "2 PAN" 
      const q2 = desc.match(/^(\d+)\s+(.+)$/);
      if (q2 && parseInt(q2[1], 10) > 0 && parseInt(q2[1], 10) < 100) {
        const qty = parseInt(q2[1], 10);
        return {
          description: q2[2].trim(),
          amount,
          quantity: qty,
          unitPrice: Math.round((amount / qty) * 100) / 100,
        };
      }
      return {
        description: desc,
        amount,
        quantity: 1,
        unitPrice: amount,
      };
    }
  }

  return null;
}

import { suggestCategoryName } from "./categorize";

export function parseTicketText(raw: string): TicketParseResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let merchant: string | null = null;
  let total: number | null = null;
  let date: string | null = null;
  const items: TicketLineItem[] = [];

  // Merchant: first non-noise short-ish line without a clear money amount
  for (const line of lines.slice(0, 6)) {
    if (
      !isNoiseLine(line) &&
      line.length >= 3 &&
      line.length <= 48 &&
      !/\d+[.,]\d{2}/.test(line)
    ) {
      merchant = line.replace(/\s+\d{3,}$/, "").trim() || line;
      break;
    }
  }

  for (const line of lines) {
    const tm = line.match(TOTAL_RE);
    if (tm) {
      const v = parseMoney(tm[1]);
      if (v != null) total = v;
      continue;
    }
    const dm = line.match(DATE_RE);
    if (dm && !date) {
      date = normalizeDate(dm[1] || dm[2]);
    }
    if (isNoiseLine(line)) continue;
    if (TOTAL_RE.test(line)) continue;

    const parsed = splitDescriptionPrice(line);
    if (!parsed) continue;
    // skip if looks like a total line that slipped through
    if (/^total/i.test(parsed.description)) {
      total = parsed.amount;
      continue;
    }
    items.push({
      ...parsed,
      raw: line,
      suggestedCategoryName: suggestCategoryName(parsed.description),
    });
  }

  // If sum of items roughly equals total, good; if one item is the total, drop it
  if (total != null && items.length > 1) {
    const sum = items.reduce((s, i) => s + i.amount, 0);
    const last = items[items.length - 1];
    if (Math.abs(last.amount - total) < 0.02 && Math.abs(sum - total - last.amount) < 1) {
      items.pop();
    }
  }

  // Deduplicate consecutive identical lines
  const deduped: TicketLineItem[] = [];
  for (const it of items) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.description === it.description &&
      prev.amount === it.amount
    ) {
      continue;
    }
    deduped.push(it);
  }

  return {
    items: deduped,
    merchant,
    total,
    date,
    rawLineCount: lines.length,
  };
}

function normalizeDate(s: string): string | null {
  const parts = s.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  let y: string, m: string, d: string;
  if (parts[0].length === 4) {
    [y, m, d] = parts;
  } else {
    // assume dd/mm/yyyy or mm/dd/yyyy — prefer dd/mm for MX
    d = parts[0].padStart(2, "0");
    m = parts[1].padStart(2, "0");
    y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
  }
  if (+m > 12) {
    // swap
    [d, m] = [m, d];
  }
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Client-side OCR helper */
export async function ocrTicketImage(
  file: File | Blob,
  onProgress?: (pct: number) => void
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("spa+eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.(Math.round(m.progress * 100));
      }
    },
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(file);
    return text;
  } finally {
    await worker.terminate();
  }
}
