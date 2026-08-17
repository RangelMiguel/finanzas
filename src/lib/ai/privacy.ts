/** Outbound-only PII scrubber. Never send names, contacts, or payment identifiers to a model. */

export type PrivacyBook = {
  replacements: { from: string; to: string }[];
};

const STOP = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "el",
  "y",
  "e",
  "o",
  "u",
  "of",
  "the",
  "and",
  "da",
  "di",
  "van",
  "von",
  "jr",
  "sr",
  "ii",
  "iii",
  "san",
  "santa",
  "casa",
  "home",
  "family",
  "familia",
]);

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_USER = /\bhttps?:\/\/[^\s/:]+:[^\s@]+@[^\s]+/gi;
const PHONE =
  /(?:\+?\d{1,3}[\s.-]*)?(?:\(?\d{2,4}\)?[\s.-]*)\d{3,4}[\s.-]*\d{3,4}(?:\s*(?:ext|x|ramal)\.?\s*\d{2,6})?/gi;
const CARD = /\b(?:\d[ -]*?){13,19}\b/g;
const CLABE = /\b\d{18}\b/g;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CURP = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/gi;
const RFC = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const API_KEY =
  /\b(?:sk-|pk-|xai-|rk-|AIza|ghp_|github_pat_|mfmeat_|Bearer\s+)[A-Za-z0-9._\-\/=]{8,}\b/gi;
const LAST4 = /\b(?:xxxx|\*{4}|x{4}|ending in|terminad[ao]s? en|últimos|last\s*4)\s*[:#-]?\s*\d{4}\b/gi;
const POSTAL = /\b(?:C\.?\s*P\.?|codigo postal|zip(?:\s*code)?)\s*:?\s*\d{4,6}\b/gi;
const STREET =
  /\b(?:calle|avda?\.?|avenida|blvd\.?|boulevard|privada|cerrada|andador|calzada)\s+[^,\n]{3,60}/gi;

export function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

export function nameTokens(...values: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of values) {
    const value = (raw || "").trim();
    if (value.length < 2) continue;
    out.add(value);
    const parts = value.split(/[\s,./_\-@]+/).filter(Boolean);
    for (const part of parts) {
      if (part.length < 2) continue;
      if (STOP.has(fold(part))) continue;
      if (/^\d+$/.test(part)) continue;
      out.add(part);
    }
    for (let i = 0; i < parts.length - 1; i += 1) {
      const pair = `${parts[i]} ${parts[i + 1]}`;
      if (pair.trim().length >= 3) out.add(pair);
    }
  }
  return [...out];
}

export function buildPrivacyBook(
  phrases: { from: string; to?: string }[]
): PrivacyBook {
  const seen = new Set<string>();
  const replacements: { from: string; to: string }[] = [];
  for (const item of phrases) {
    const from = item.from.trim();
    if (from.length < 2) continue;
    const key = fold(from);
    if (seen.has(key) || STOP.has(key)) continue;
    seen.add(key);
    replacements.push({ from, to: item.to || "[name]" });
  }
  replacements.sort((a, b) => b.from.length - a.from.length);
  return { replacements };
}

export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(URL_USER, "[url]")
    .replace(EMAIL, "[email]")
    .replace(JWT, "[key]")
    .replace(API_KEY, "[key]")
    .replace(IBAN, "[account]")
    .replace(CURP, "[id]")
    .replace(RFC, "[id]")
    .replace(SSN, "[id]")
    .replace(CLABE, "[account]")
    .replace(CARD, "[card]")
    .replace(LAST4, "[card]")
    .replace(STREET, "[address]")
    .replace(POSTAL, "[postal]")
    .replace(PHONE, "[phone]");
}

export function redactNames(text: string, book?: PrivacyBook): string {
  if (!text || !book?.replacements.length) return text;
  let out = text;
  for (const { from, to } of book.replacements) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, to);
  }
  return out;
}

export function redactForModel(text: string, book?: PrivacyBook): string {
  return redactNames(redactSecrets(text), book);
}

export function redactValue(value: unknown, book?: PrivacyBook): unknown {
  if (typeof value === "string") return redactForModel(value, book);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, book));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        /email|phone|tel|mobile|password|secret|token|apikey|api_key|lastfour|last_four|cardnumber|accountnumber|clabe|iban|curp|rfc/.test(
          lower
        )
      ) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactValue(item, book);
    }
    return out;
  }
  return value;
}

export type EntityAlias = {
  id: string;
  alias: string;
  names: string[];
};

export function aliasList(
  rows: { id: string; names: string[] }[],
  prefix: string
): EntityAlias[] {
  return rows.map((row, index) => ({
    id: row.id,
    alias: `${prefix} ${index + 1}`,
    names: row.names.filter(Boolean),
  }));
}

export function resolveAlias(hint: string | undefined, rows: EntityAlias[]): string | undefined {
  if (!hint) return undefined;
  const folded = fold(hint);
  const byId = rows.find((row) => row.id === hint);
  if (byId) return byId.id;
  const byAlias = rows.find((row) => fold(row.alias) === folded);
  if (byAlias) return byAlias.id;
  return undefined;
}
