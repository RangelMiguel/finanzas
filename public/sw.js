/* MisFinanzas PWA — offline shell, static, and Next.js RSC navigation */
const CACHE_STATIC = "mf-static-v3";
const CACHE_PAGES = "mf-pages-v3";
const CACHE_RSC = "mf-rsc-v3";

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

/** App routes we want available offline after first online session / prefetch */
const APP_SHELL_PATHS = [
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
  "/tickets",
  "/import-statement",
  "/import-export",
  "/family",
  "/security",
  "/settings",
  "/allowances",
  "/marketplace",
  "/properties",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_STATIC, CACHE_PAGES, CACHE_RSC]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isApi(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2")
  );
}

/** Next.js App Router client navigations (Flight / RSC) */
function isRscRequest(req, url) {
  if (req.headers.get("RSC") === "1") return true;
  if (req.headers.get("Next-Router-Prefetch") === "1") return true;
  if (req.headers.get("Next-Router-State-Tree")) return true;
  if (url.searchParams.has("_rsc")) return true;
  return false;
}

function pageCacheKey(url) {
  // One document entry per pathname (ignore query) for offline hard navigations
  return new Request(url.origin + url.pathname, { credentials: "same-origin" });
}

function rscCacheKey(url) {
  // Group RSC by pathname so offline soft-nav can find a payload even if
  // the _rsc hash differs slightly between prefetches.
  return new Request(url.origin + url.pathname + "?__mf_rsc=1", {
    credentials: "same-origin",
  });
}

async function putCache(cacheName, request, response) {
  if (!response || !response.ok) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch (_) {
    /* quota / opaque */
  }
}

async function networkFirst(req, cacheName, keyFn) {
  const key = keyFn ? keyFn(new URL(req.url)) : req;
  try {
    const res = await fetch(req);
    if (res && res.ok) await putCache(cacheName, key, res);
    return res;
  } catch (_) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(key);
    if (cached) return cached;
    // Fallback: try original request key
    const exact = await caches.match(req);
    if (exact) return exact;
    throw new Error("offline");
  }
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) {
    // Revalidate in background
    fetch(req)
      .then((res) => {
        if (res && res.ok) putCache(cacheName, req, res);
      })
      .catch(() => undefined);
    return cached;
  }
  const res = await fetch(req);
  if (res && res.ok) await putCache(cacheName, req, res);
  return res;
}

async function offlineNavigate(url) {
  const pages = await caches.open(CACHE_PAGES);
  // Exact pathname document
  let hit = await pages.match(pageCacheKey(url));
  if (hit) return hit;
  // Any cached request for this path
  const all = await pages.keys();
  for (const key of all) {
    try {
      if (new URL(key.url).pathname === url.pathname) {
        hit = await pages.match(key);
        if (hit) return hit;
      }
    } catch (_) {
      /* ignore */
    }
  }
  // App shell (home) — better than blank; client may still recover if chunks loaded
  hit = await pages.match(pageCacheKey(new URL("/", self.location.origin)));
  if (hit) return hit;
  hit = await caches.match("/");
  if (hit) return hit;
  return new Response(
    "<!doctype html><html><body style=\"font-family:system-ui;background:#03040a;color:#eee;padding:2rem\"><h1>Sin conexión</h1><p>Abre esta pantalla una vez con internet para usarla offline.</p></body></html>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (!isSameOrigin(url)) return;

  // API: never SW-cache (IndexedDB outbox handles offline data)
  if (isApi(url)) return;

  // Static hashed assets
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req, CACHE_STATIC));
    return;
  }

  // Next.js RSC / Flight (client-side menu navigation)
  if (isRscRequest(req, url)) {
    event.respondWith(
      networkFirst(req, CACHE_RSC, rscCacheKey).catch(async () => {
        const cache = await caches.open(CACHE_RSC);
        const hit = await cache.match(rscCacheKey(url));
        if (hit) return hit;
        // Soft-nav offline without cache: empty flight breaks less than wrong page
        return new Response("", {
          status: 503,
          statusText: "Offline",
          headers: { "Content-Type": "text/x-component" },
        });
      })
    );
    return;
  }

  // Full document navigations
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            await putCache(CACHE_PAGES, pageCacheKey(url), res);
          }
          return res;
        } catch (_) {
          return offlineNavigate(url);
        }
      })()
    );
    return;
  }

  // Other same-origin GETs (HTML chunks, etc.): network-first with cache
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      networkFirst(req, CACHE_STATIC).catch(
        () =>
          new Response("", { status: 503, statusText: "Offline" })
      )
    );
  }
});

/** Warm page cache for known app routes (called from the client when online) */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "mf-warm-routes" && Array.isArray(data.paths)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_PAGES);
        for (const path of data.paths) {
          try {
            const res = await fetch(path, { credentials: "same-origin" });
            if (res && res.ok) {
              const key = pageCacheKey(new URL(path, self.location.origin));
              await cache.put(key, res.clone());
            }
          } catch (_) {
            /* offline during warm — skip */
          }
        }
      })()
    );
  }
  if (data.type === "mf-flush-outbox") {
    // Clients already handle this; no-op here
  }
});

/** Background Sync: ask clients to flush the IndexedDB outbox */
self.addEventListener("sync", (event) => {
  if (event.tag === "mf-outbox") {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
        (clientList) => {
          for (const client of clientList) {
            client.postMessage({ type: "mf-flush-outbox" });
          }
        }
      )
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {
    title: "MisFinanzas",
    body: "Nueva alerta de seguridad",
    url: "/",
    tag: "mf-security",
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    try {
      data.body = event.data ? event.data.text() : data.body;
    } catch (_) {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "MisFinanzas", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "mf-security",
      data: { url: data.url || "/" },
      renotify: true,
      requireInteraction: data.severity === "critical",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});

// Export path list for debugging (not used by browser)
self.__MF_APP_SHELL_PATHS = APP_SHELL_PATHS;
