// Offline support: app shell cached, latest rates network-first,
// dated history snapshots cache-first (they never change).

const VERSION = 'v2';
const SHELL = `shell-${VERSION}`;
const DATA = 'data-v1';

const SHELL_FILES = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/calc.js',
  'js/chart.js',
  'js/currencies.js',
  'js/rates.js',
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

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
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
    event.respondWith(networkFirst(req, SHELL));
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
