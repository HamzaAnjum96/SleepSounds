/* starlight — service worker.
 *
 * Full offline: the install step precaches the entire app — the shell, the
 * content-hashed JS/CSS (injected at build time), the self-hosted fonts and
 * icons, the audio worklets, the manifest and icons — so once installed the
 * app needs no network for anything. Generated audio and saved mixes were
 * always local; with fonts/icons/worklets bundled too, nothing reaches out.
 *
 * Strategy:
 *  - navigations: network-first (to pick up new deploys) with the cached
 *    shell as the offline fallback
 *  - everything else same-origin: cache-first (it's all precached or
 *    content-hashed and immutable), falling back to network + cache
 *
 * The cache name carries a build id (injected), so every deploy installs a
 * fresh cache and the old one is cleared on activate.
 */

const CACHE = 'starlight-__CACHE_VERSION__';
// App version baked in at build (injected). The page compares this against its
// own version to tell a real pending update from a normal online open.
const VERSION = '__APP_VERSION__';

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0] && event.ports[0].postMessage(VERSION);
  }
});

// Stable shell paths; the build injects the hashed assets, fonts and worklets.
const PRECACHE = [
  './',
  './manifest.json',
  './privacy.html',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './fonts.css',
  /*__INJECT_ASSETS__*/
];

self.addEventListener('install', (event) => {
  // Atomic precache: addAll rejects if ANY file fails, so a flaky network can't
  // leave a half-filled cache. If it fails, this worker never activates and the
  // previous (working) version keeps serving — the app is never left broken.
  // `cache: 'reload'` bypasses the HTTP cache, so a new build always precaches
  // fresh bytes — without it, stable-named files edited in place (fonts.css,
  // the icon font, worklets) could be re-cached from a stale HTTP cache.
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => (k.startsWith('starlight-') || k.startsWith('drift-away-')) && k !== CACHE).map((k) => caches.delete(k))),
      ),
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable()
        : Promise.resolve(),
    ]).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App navigations: network-first (via the preloaded response when started)
  // with the cached shell as the offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = (await event.preloadResponse) || (await fetch(req));
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        } catch {
          return (await caches.match('./')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Same-origin assets: cache-first, then network (and cache what we fetch).
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => hit),
      ),
    );
  }
});
