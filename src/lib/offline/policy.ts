/** Paths that must never be queued for offline replay. */
const ONLINE_ONLY_PREFIXES = [
  "/api/auth/",
  "/api/invites/",
  "/api/settings/wipe",
  "/api/import",
  "/api/export",
  "/api/statements/",
  "/api/tickets/",
  "/api/push/",
  "/api/ai/",
];

export function isWriteMethod(method: string | undefined): boolean {
  const m = (method || "GET").toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

export function isOnlineOnlyPath(path: string): boolean {
  const p = path.split("?")[0];
  return ONLINE_ONLY_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(prefix)
  );
}

/** True if this request may be stored offline and replayed later. */
export function isQueueableMutation(path: string, method: string | undefined): boolean {
  if (!isWriteMethod(method)) return false;
  if (!path.startsWith("/api/")) return false;
  if (isOnlineOnlyPath(path)) return false;
  return true;
}

/** GET responses we should not persist (sensitive / large / one-shot). */
export function isCacheableGet(path: string): boolean {
  if (!path.startsWith("/api/")) return false;
  if (isOnlineOnlyPath(path)) return false;
  if (path.startsWith("/api/export")) return false;
  return true;
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch failed
  if (err instanceof DOMException && err.name === "NetworkError") return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network") ||
      msg.includes("offline") ||
      msg.includes("load failed")
    );
  }
  return false;
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
