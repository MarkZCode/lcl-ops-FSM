// LCL Ops service worker — offline page + icon caching, plus Web Push for
// urgent-outreach notifications (renewals due, new client replies).
// Next.js JS/CSS chunks are NOT cached here — Vercel CDN + content-hash
// filenames handle that. Caching chunks caused stale-chunk loops after
// redeployments (old cached files served forever).
const CACHE_VERSION = "lcl-ops-v94";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/logo-mark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // Delete ALL previous lcl-ops caches so stale chunks don't linger.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("lcl-ops-") && k !== STATIC_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: always network, fall back to offline page only.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Next.js JS/CSS chunks: always network — never cache. Vercel CDN serves
  // these with immutable headers; the browser HTTP cache handles them.
  // Caching them in the SW caused infinite reload loops after deployments.
  if (url.pathname.startsWith("/_next/")) return;

  // Icons and offline page only: cache-first.
  if (
    url.pathname.startsWith("/icon-") ||
    url.pathname.startsWith("/favicon-") ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/logo-mark.png" ||
    url.pathname === "/logo.png" ||
    url.pathname === OFFLINE_URL
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});

// ---- Web Push ----
self.addEventListener("push", (event) => {
  let payload = { title: "LCL Ops", body: "You have a new update.", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "lcl-ops-digest", // collapses repeat digests into one notification
      renotify: true,
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
