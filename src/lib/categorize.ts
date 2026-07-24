import { CATEGORY_KEYWORDS } from "./seeds";

export function suggestCategoryName(description: string): string | null {
  const d = description.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
  if (!d) return null;
  // longer keys first for better matches
  const keys = Object.keys(CATEGORY_KEYWORDS).sort((a, b) => b.length - a.length);
  for (const kw of keys) {
    const k = kw.normalize("NFD").replace(/\p{M}/gu, "");
    if (d.includes(k)) return CATEGORY_KEYWORDS[kw];
  }
  return null;
}

export function resolveCategoryId(
  description: string,
  categories: { id: string; name: string; type: string }[],
  type: "expense" | "income" = "expense"
): string | null {
  const name = suggestCategoryName(description);
  if (name) {
    const hit = categories.find(
      (c) => c.type === type && c.name.toLowerCase() === name.toLowerCase()
    );
    if (hit) return hit.id;
  }
  const other = categories.find(
    (c) =>
      c.type === type &&
      (c.name.toLowerCase().includes("otros") ||
        c.name.toLowerCase().includes("other"))
  );
  return other?.id ?? categories.find((c) => c.type === type)?.id ?? null;
}
