// Agendario Service Worker — cache shell mínimo
// Versão bump: incrementar VERSION pra forçar atualização em todos os clients
const VERSION = "v1";
const CACHE_NAME = `agendario-${VERSION}`;

// Recursos críticos pra primeira tela offline
const PRECACHE = ["/", "/login", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("agendario-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Estratégias:
// - GET de assets estáticos (_next/static, fontes, ícones): cache-first
// - GET de páginas e API: network-first com fallback ao cache
// - POST/PUT/DELETE: nunca cachear (passthrough)
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Não interceptar webhooks, inngest ou auth callbacks
  if (
    url.pathname.startsWith("/api/webhooks") ||
    url.pathname.startsWith("/api/inngest") ||
    url.pathname.startsWith("/api/auth")
  ) {
    return;
  }

  const isStatic =
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icon") ||
    url.pathname.startsWith("/apple-icon") ||
    /\.(?:png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Network-first pra páginas/dados
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cacheia respostas 200 de same-origin GET pra fallback offline
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => undefined);
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error()))
  );
});
