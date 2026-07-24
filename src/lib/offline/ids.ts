/** Browser-safe cuid-like id (no Node crypto). */
export function createClientId(): string {
  const t = Date.now().toString(36);
  const r =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `c${t}${r}`.slice(0, 28);
}
