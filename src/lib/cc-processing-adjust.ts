/**
 * Suggest which card charges likely posted after the cut-off.
 * Used when the bank statement is lower than the app cycle total.
 */

export type AdjustableLine = {
  key: string;
  kind: "purchase" | "msi";
  transactionId?: string;
  planId?: string;
  date: string;
  amountCents: number;
  label: string;
};

export type SubsetSuggestion = {
  keys: string[];
  amountCents: number;
  remainderCents: number;
};

export function lineKey(line: {
  kind: "purchase" | "msi";
  transactionId?: string;
  planId?: string;
  date: string;
}): string {
  if (line.kind === "msi" && line.planId) {
    return `msi:${line.planId}:${line.date}`;
  }
  return `purchase:${line.transactionId || line.date}`;
}

/**
 * Find subsets of charges that sum to (or just under) the processing gap.
 * Prefers later dates (closest to the cut-off), then fewer items, then exact match.
 */
export function suggestProcessingMatches(
  lines: AdjustableLine[],
  targetCents: number,
  opts?: { maxSize?: number; maxResults?: number }
): SubsetSuggestion[] {
  if (targetCents <= 0) return [];
  const maxSize = opts?.maxSize ?? 6;
  const maxResults = opts?.maxResults ?? 8;

  const items = lines
    .filter((l) => l.amountCents > 0 && l.amountCents <= targetCents)
    .sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return b.amountCents - a.amountCents;
    });

  if (items.length === 0) return [];

  const comboPool = items.slice(0, 20);
  const exact: SubsetSuggestion[] = [];
  const close: SubsetSuggestion[] = [];

  function consider(keys: string[], sum: number) {
    const rem = targetCents - sum;
    const s: SubsetSuggestion = { keys, amountCents: sum, remainderCents: rem };
    if (rem === 0) exact.push(s);
    else if (rem > 0) close.push(s);
  }

  for (const it of items) {
    consider([it.key], it.amountCents);
  }

  function dfs(start: number, chosen: string[], sum: number) {
    if (chosen.length >= maxSize) return;
    if (exact.length >= maxResults * 3) return;
    for (let i = start; i < comboPool.length; i++) {
      const it = comboPool[i];
      const nextSum = sum + it.amountCents;
      if (nextSum > targetCents) continue;
      const nextKeys = [...chosen, it.key];
      if (nextKeys.length >= 2) consider(nextKeys, nextSum);
      if (nextSum < targetCents) dfs(i + 1, nextKeys, nextSum);
    }
  }
  dfs(0, [], 0);

  const uniq = (arr: SubsetSuggestion[]) => {
    const seen = new Set<string>();
    return arr.filter((s) => {
      const k = [...s.keys].sort().join("|");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const exactU = uniq(exact).sort((a, b) => {
    const n = a.keys.length - b.keys.length;
    if (n !== 0) return n;
    return b.amountCents - a.amountCents;
  });
  if (exactU.length > 0) return exactU.slice(0, maxResults);

  return uniq(close)
    .sort((a, b) => {
      const r = a.remainderCents - b.remainderCents;
      if (r !== 0) return r;
      return a.keys.length - b.keys.length;
    })
    .slice(0, maxResults);
}
