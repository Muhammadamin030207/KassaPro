/* KassaPro Service Worker — PWA standalone uchun.
 * Navigatsiyalar: network-first (serverdan so'raydi, ishlamasa cache'dan).
 * Assetlar: stale-while-revalidate. /api/ hech qachon cache'lanmaydi.
 */
const CACHE = "kassapro-v2";
const PRECACHE = ["/", "/index.html", "/manifest.json", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // API so'rovlarini skay qilamiz — doim tarmoqdan.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api")) {
    return;
  }

  // Navigatsiya (sahifa ochilishi) — network-first, fallback cache'dan "/"
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() =>
          caches
            .match("/index.html")
            .catch(() => caches.match("/"))
        )
    );
    return;
  }

  // Hash'li assetlar / rasmlar — stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});