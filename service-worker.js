
// Scope-specific caches keep other GitHub Pages apps on this origin untouched.
const PREFIX = `tavalign-${encodeURIComponent(new URL(self.registration.scope).pathname)}-`;
const CACHE = `${PREFIX}v2.1.0`;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./sensor-engine.js",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(
    ASSETS.map(path => new Request(path, { cache: 'reload' }))
  )));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const known = ASSETS.some(path => new URL(path, self.registration.scope).pathname === url.pathname);
  if (url.origin !== self.location.origin || !known) return;
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(url.pathname);
      return hit || fetch(event.request);
    })
  );
});
