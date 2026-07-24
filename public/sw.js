/* MisFinanzas PWA + Web Push service worker */
const CACHE = "mf-static-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Network-first for navigations; don't break Next.js
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((r) => r || caches.match("/"))
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
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
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
