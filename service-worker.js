/* =========================================================
   LifePath RPG — Service Worker
   Offline-first caching for GitHub Pages deployment
   ========================================================= */

const CACHE_NAME = "lifepath-cache-v1";

const ASSETS = [
  "./",
  "index.html",
  "css/styles.css",
  "js/bootstrap.js",
  "js/core.state.js",
  "js/core.theme.js",
  "js/core.sync.js",
  "js/core.api.js",
  "js/ui.tabs.js",
  "js/ui.paths.js",
  "js/ui.quests.js",
  "js/ui.community.js",
  "js/ui.avatar.js",
  "js/ui.store.js",
  "js/ui.player.js",
  "js/ai.chat.js",
  "manifest.json"
];

/* =========================================================
   INSTALL — cache des assets essentiels
   ========================================================= */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

/* =========================================================
   ACTIVATE — nettoie anciens caches
   ========================================================= */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* =========================================================
   FETCH — stratégie offline-first
   ========================================================= */
self.addEventListener("fetch", event => {

  // On ignore les requêtes non-GET
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(networkResp => {
          // Mise en cache opportuniste
          caches.open(CACHE_NAME).then(cache =>
            cache.put(event.request, networkResp.clone())
          );
          return networkResp;
        })
        .catch(() => {
          // Fallback offline pour les pages HTML
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("index.html");
          }
        });
    })
  );
});
