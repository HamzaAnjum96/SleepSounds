/* drift away — service worker.
 *
 * Strategy (no version juggling needed):
 *  - navigations: network-first, falling back to the cached shell, so the app
 *    opens with no signal but deploys are picked up on the next online visit
 *  - /assets/ (content-hashed by Vite): cache-first, immutable
 *  - other same-origin files (icons, manifest, worklets): stale-while-revalidate
 *  - cross-origin (Google Fonts): stale-while-revalidate
 */

const CACHE = 'drift-away-v1';
const SHELL = ['./', './manifest.json', './favicon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('drift-away-') && k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App navigations: network-first with shell fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  // Hashed build assets: immutable, cache-first.
  if (url.origin === location.origin && url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })),
    );
    return;
  }

  // Everything else we care about (same-origin statics, fonts): SWR.
  const isFont = url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com');
  if (url.origin === location.origin || isFont) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const refresh = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      }),
    );
  }
});
