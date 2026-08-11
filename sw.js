import { APP_VERSION } from "./src/version.js";

const CACHE_NAME = "notepad-shell-" + APP_VERSION;
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/styles.css",
  "./src/app.js",
  "./src/version.js",
  "./src/storage/db.js",
  "./src/serialize.js",
  "./src/backup.js",
  "./src/backup/github.js",
  "./src/settings-panel.js",
  "./src/editor.js",
  "./src/table.js",
  "./src/diagram.js",
  "./src/download.js",
  "./vendor/eruda/eruda.js",
  "./vendor/mermaid/mermaid.min.js",
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
  // Only the app shell is ours to cache. Without this guard the cache-first
  // branch below also swallowed cross-origin GETs -- including the GitHub API
  // read that fetches snapshot.json's current sha. That response got cached on
  // the first backup and replayed on every backup after it, so every PUT sent
  // a sha that was stale the moment the previous push landed, and GitHub
  // rejected it with a 409. The request's own `cache: "no-store"` did not
  // help: that governs the browser's HTTP cache, not a service worker
  // answering from Cache Storage ahead of it. Nor did the 409 retry loop,
  // since all three attempts re-read the same cached response.
  if (new URL(event.request.url).origin !== self.location.origin) {
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
