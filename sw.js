const CACHE_NAME = "notepad-shell-v4";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/styles.css",
  "./src/app.js",
  "./src/storage/db.js",
  "./src/backup.js",
  "./src/backup/github.js",
  "./src/settings-panel.js",
  "./vendor/eruda/eruda.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        SHELL_ASSETS.map((url) =>
          fetch(url, { cache: "reload" }).then((response) => {
            if (response.ok) {
              return cache.put(url, response);
            }
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
