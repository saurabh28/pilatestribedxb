/* Minimal offline app-shell cache. Caches only this app's own static files
   (HTML/CSS/JS/icons) plus the pinned CDN library URLs — never Supabase API
   calls, which always go straight to the network so data is never served
   stale or offline-cached by accident. */
var CACHE_NAME = "cst-shell-v2";
var SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./data.js",
  "./icons.js",
  "./ui.js",
  "./charts.js",
  "./app.js",
  "./manifest.json",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js",
];
var SHELL_URL_SET = null;
function shellUrlSet() {
  if (!SHELL_URL_SET) {
    SHELL_URL_SET = new Set(SHELL_FILES.map(function (f) { return new URL(f, self.location.href).href; }));
  }
  return SHELL_URL_SET;
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES).catch(function () {
        // A CDN fetch failing offline-first shouldn't block install.
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  // Only intercept the app's own shell files. Everything else (Supabase
  // auth/data calls, anything else) goes straight to the network untouched.
  if (!shellUrlSet().has(event.request.url)) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var networkFetch = fetch(event.request)
        .then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
          }
          return response;
        })
        .catch(function () { return cached; });
      return cached || networkFetch;
    })
  );
});
