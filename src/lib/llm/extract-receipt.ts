import type { TicketParseResult, TicketLineItem } from "../ticket-parse";
import { suggestCategoryName } from "../categorize";
import { completeWithUserSettings, type AiSettings } from "../ai/complete";
import { parseJsonFromLlm } from "./client";

type LlmReceiptJson = {
  merchant?: string | null;
  date?: string | null; // YYYY-MM-DD
  total?: number | null;
  items?: {
    description?: string;
    amount?: number;
    quantity?: number;
    unitPrice?: number;
  }[];
};

const SYSTEM = `You extract line items from retail/POS receipt text (Mexico and international).
Return ONLY valid JSON with this shape:
{
  "merchant": string|null,
  "date": "YYYY-MM-DD"|null,
  "total": number|null,
  "items": [
    { "description": string, "amount": number, "quantity": number, "unitPrice": number }
  ]
}
Rules:
- amounts are decimal numbers in local currency (e.g. 18.50), not cents
- skip subtotal, tax/IVA, change, payment method lines
- quantity defaults to 1
- unitPrice = amount / quantity when missing
- description should be the product name, not store boilerplate
- if unsure about a field use null
- do not invent items that are not on the receipt`;

export async function extractReceiptWithLlm(
  text: string,
  settings: AiSettings
): Promise<TicketParseResult & { engine: "llm"; provider: string; model: string }> {
  const { text: out, provider, model } = await completeWithUserSettings(
    settings,
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Extract products and prices from this receipt text:\n\n${text.slice(0, 12000)}`,
      },
    ],
    { temperature: 0.05 }
  );

  const data = parseJsonFromLlm<LlmReceiptJson>(out);
  const items: TicketLineItem[] = [];

  for (const raw of data.items || []) {
    const description = String(raw.description || "").trim();
    const amount = Number(raw.amount);
    if (!description || !Number.isFinite(amount) || amount <= 0) continue;
    const quantity =
      Number(raw.quantity) > 0 ? Number(raw.quantity) : 1;
    const unitPrice =
      Number(raw.unitPrice) > 0
        ? Number(raw.unitPrice)
        : Math.round((amount / quantity) * 100) / 100;
    items.push({
      description,
      amount: Math.round(amount * 100) / 100,
      quantity,
      unitPrice,
      raw: description,
      suggestedCategoryName: suggestCategoryName(description),
    });
  }

  return {
    items,
    merchant: data.merchant ? String(data.merchant) : null,
    total:
      data.total != null && Number.isFinite(Number(data.total))
        ? Math.round(Number(data.total) * 100) / 100
        : null,
    date: data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null,
    rawLineCount: text.split(/\n/).length,
    engine: "llm",
    provider,
    model,
  };
}
