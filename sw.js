// Offline support: app shell cached, latest rates network-first,
// dated history snapshots cache-first (they never change).
// Also shows rate alert pushes (see js/alerts.js and worker/).

const VERSION = 'v8';
const SHELL = `shell-${VERSION}`;
const DATA = 'data-v1';

const SHELL_FILES = [
  './',
  'index.html',
  'css/app.css',
  'js/alerts.js',
  'js/app.js',
  'js/calc.js',
  'js/chart.js',
  'js/config.js',
  'js/currencies.js',
  'js/rates.js',
  'js/send.js',
  'js/settings.js',
  'js/sound.js',
  'js/ui.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req, cacheName, init) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req, init);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Network-first so updates show up on next launch; cache when offline.
    // 'no-cache' revalidates past the browser's HTTP cache (GitHub Pages allows
    // 10 minutes), so a launch never mixes a new page with old scripts.
    event.respondWith(networkFirst(req, SHELL, { cache: 'no-cache' }));
    return;
  }

  const isDatedSnapshot = /currency-api@\d{4}-\d{2}-\d{2}\//.test(url.href)
    || /^\d{4}-\d{2}-\d{2}\.currency-api\.pages\.dev$/.test(url.hostname);
  if (isDatedSnapshot) {
    event.respondWith(cacheFirst(req, DATA));
    return;
  }

  if (/currency-api|frankfurter/.test(url.hostname + url.pathname)) {
    event.respondWith(networkFirst(req, DATA));
  }
});

// ---- Rate alerts -----------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* show the default */ }
  event.waitUntil(self.registration.showNotification(data.title ?? 'Rates', {
    body: data.body ?? '',
    tag: data.tag,
    icon: 'icons/icon-192.png',
    data: { pair: data.pair },
  }));
});

// Tapping an alert opens its chart.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const pair = event.notification.data?.pair;
  event.waitUntil((async () => {
    const [win] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (win) {
      if (pair) win.postMessage({ type: 'open-chart', pair });
      return win.focus();
    }
    return self.clients.openWindow(pair ? `./#pair=${pair}` : './');
  })());
});
