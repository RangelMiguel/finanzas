import type { StatementMsiItem, StatementParseResult } from "./llm/extract-statement";

export function parseStatementRules(text: string): StatementParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const found: StatementMsiItem[] = [];
  const re =
    /(.+?)\s+(?:msi\s*)?(\d{1,2})\s*(?:\/|meses?|m)\s+\$?\s*([\d,]+\.?\d*)/i;
  const re2 =
    /(.+?)\s+\$?\s*([\d,]+\.?\d*)\s+(?:a\s+)?(\d{1,2})\s*(?:meses|msi)/i;

  for (const line of lines) {
    let m = line.match(re);
    if (m) {
      const months = parseInt(m[2], 10);
      const total = parseFloat(m[3].replace(/,/g, ""));
      if (months >= 2 && total > 0) {
        found.push({
          description: m[1].trim().slice(0, 120),
          totalAmount: total,
          months,
          monthlyAmount: Math.round((total / months) * 100) / 100,
          selected: true,
        });
      }
      continue;
    }
    m = line.match(re2);
    if (m) {
      const total = parseFloat(m[2].replace(/,/g, ""));
      const months = parseInt(m[3], 10);
      if (months >= 2 && total > 0) {
        found.push({
          description: m[1].trim().slice(0, 120),
          totalAmount: total,
          months,
          monthlyAmount: Math.round((total / months) * 100) / 100,
          selected: true,
        });
      }
    }
  }

  return { items: found, engine: "rules" };
}
