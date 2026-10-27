/* AdmitQueue service worker.
 *
 * What it does (and does not do):
 *  - Caches ONLY public, static files: the app's JS/CSS/fonts (/_next/static), icons and the offline page.
 *  - NEVER caches API responses, pages, or anything behind a login (student records, admin data). Those need
 *    the server (database, authentication and the C++ engine), so while offline the app shows /offline.
 *  - Updates: a new version is installed in the background and waits. The page shows "Update available";
 *    when the user clicks Reload the page tells this worker to take over (message SKIP_WAITING).
 */
const VERSION = 'aq-sw-v1';
const STATIC_CACHE = `${VERSION}-static`;
const SHELL = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('aq-sw-') && !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isPublicStatic(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest';
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // never touch writes
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return; // private + live: network only

  if (request.mode === 'navigate') {
    // Pages are always fetched from the server (they contain personal data). Offline -> the offline page.
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match('/offline');
        return cached || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }),
    );
    return;
  }

  if (isPublicStatic(url)) {
    // hashed, immutable files: cache first
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
