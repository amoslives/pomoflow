// Pomoflow service worker. The build fills in the version and file list (see vite.config.ts).
// It lets the installed app open offline and gives Android a way to show notifications.
const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const CACHE = `pomoflow-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

// A new version activates once no window uses the old one, so open pages keep their own files
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('pomoflow-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Network first, so a new deploy shows at once. The cached page matches the cached files,
    // so it is never replaced with a newer page here.
    event.respondWith(fetch(request).catch(async () => (await caches.match('/', { cacheName: CACHE })) || Response.error()));
    return;
  }
  event.respondWith(caches.match(request, { cacheName: CACHE }).then((cached) => cached || fetch(request)));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows[0]) return windows[0].focus();
    return self.clients.openWindow('/');
  })());
});
