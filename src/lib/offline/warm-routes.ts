/** Main app paths to warm into the SW page cache + Next router prefetch. */
export const APP_ROUTES_TO_WARM = [
  "/",
  "/accounts",
  "/transactions",
  "/budgets",
  "/credit-cards",
  "/recurring",
  "/debts",
  "/goals",
  "/retirement",
  "/personal",
  "/safe-to-spend",
  "/family",
  "/settings",
  "/security",
  // Online-only screens still warmed so shell opens offline with a clear empty/error state
  "/tickets",
  "/import-statement",
  "/import-export",
];

/**
 * Ask the service worker to cache full HTML documents for app routes,
 * and use Next's router.prefetch for RSC + JS chunks when available.
 */
export async function warmOfflineRoutes(prefetch?: (href: string) => void) {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;

  // Next.js soft-nav assets (RSC + chunks)
  if (prefetch) {
    for (const path of APP_ROUTES_TO_WARM) {
      try {
        prefetch(path);
      } catch {
        /* ignore */
      }
    }
  }

  // Full document cache via SW (for hard navigations / PWA restarts offline)
  try {
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage({
      type: "mf-warm-routes",
      paths: APP_ROUTES_TO_WARM,
    });
  } catch {
    /* ignore */
  }
}
