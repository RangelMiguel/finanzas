import { completeWithUserSettings, type AiSettings } from "../ai/complete";
import { parseJsonFromLlm } from "./client";

export type StatementMsiItem = {
  description: string;
  totalAmount: number;
  months: number;
  monthlyAmount: number;
  selected: boolean;
};

export type StatementParseResult = {
  items: StatementMsiItem[];
  engine: "llm" | "rules";
  provider?: string;
  model?: string;
};

const SYSTEM = `You extract installment purchases (MSI / meses sin intereses / interest-free plans)
from Mexican bank or credit-card statement text (Banamex, BBVA, Santander, etc.).
Return ONLY valid JSON:
{
  "items": [
    {
      "description": string,
      "totalAmount": number,
      "months": number,
      "monthlyAmount": number
    }
  ]
}
Rules:
- totalAmount and monthlyAmount are currency decimals (not cents)
- months is integer plan length (e.g. 6, 12, 18)
- if monthly missing, monthlyAmount = totalAmount / months
- if total missing, totalAmount = monthlyAmount * months
- ignore minimum payments, interest charges, fees unless they are MSI purchases
- do not invent entries`;

export async function extractStatementWithLlm(
  text: string,
  settings: AiSettings
): Promise<StatementParseResult> {
  const { text: out, provider, model } = await completeWithUserSettings(
    settings,
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Extract MSI / installment purchases from this statement:\n\n${text.slice(0, 14000)}`,
      },
    ],
    { temperature: 0.05 }
  );

  const data = parseJsonFromLlm<{
    items?: {
      description?: string;
      totalAmount?: number;
      months?: number;
      monthlyAmount?: number;
    }[];
  }>(out);

  const items: StatementMsiItem[] = [];
  for (const raw of data.items || []) {
    const description = String(raw.description || "").trim();
    let months = Math.round(Number(raw.months) || 0);
    let total = Number(raw.totalAmount);
    let monthly = Number(raw.monthlyAmount);
    if (!description) continue;
    if ((!Number.isFinite(total) || total <= 0) && Number.isFinite(monthly) && months > 0) {
      total = monthly * months;
    }
    if ((!Number.isFinite(monthly) || monthly <= 0) && Number.isFinite(total) && months > 0) {
      monthly = total / months;
    }
    if (!Number.isFinite(total) || total <= 0 || months < 2 || months > 48) continue;
    if (!Number.isFinite(monthly) || monthly <= 0) {
      monthly = total / months;
    }
    items.push({
      description: description.slice(0, 120),
      totalAmount: Math.round(total * 100) / 100,
      months,
      monthlyAmount: Math.round(monthly * 100) / 100,
      selected: true,
    });
  }

  return { items, engine: "llm", provider, model };
}
