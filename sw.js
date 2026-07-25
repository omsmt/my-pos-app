const CACHE_NAME = 'pos-v4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// Cross-origin barcode-scanning polyfill (needed for iOS/Safari camera scan).
// Cached separately since cache.addAll() fails the whole install if any
// no-cors opaque response looks like an error, and these are third-party.
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.9.15/dist/index.js',
  'https://cdn.jsdelivr.net/npm/@undecaf/barcode-detector-polyfill@0.9.21/dist/index.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).then(() =>
        Promise.all(CDN_ASSETS.map(url =>
          fetch(url, { mode: 'no-cors' })
            .then(res => cache.put(url, res))
            .catch(() => {}) // don't block install if offline on first run
        ))
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for inventory.json so updates are picked up when online
  if (url.pathname.endsWith('inventory.json')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./inventory.json', clone));
          return response;
        })
        .catch(() => caches.match('./inventory.json'))
    );
    return;
  }

  // Cache-first for local assets and the pinned CDN scripts above
  if (url.origin === location.origin || CDN_ASSETS.includes(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
