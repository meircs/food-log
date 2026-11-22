// Offline cache for the Food log app. Bump CACHE when files change.
const CACHE = 'food-log-v42';
const TILES = 'map-tiles-v2'; // route map tiles, kept across app updates
const ASSETS = ['./', './index.html', './js/core.js', './js/sync.js', './js/food.js', './js/stats.js', './js/health.js', './js/workout.js', './js/progress.js', './js/more.js', './js/ai.js', './js/main.js', './manifest.json', './icon-180.png', './icon-512.png', './vendor/html5-qrcode.min.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).hostname === 'tile.openstreetmap.org') {
    // Map tiles: cache first, so routes you've opened show their map offline too.
    e.respondWith(caches.open(TILES).then(async c => (await c.match(e.request)) || fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; })));
    return;
  }
  if (new URL(e.request.url).origin !== location.origin) return;
  // Network first (so updates show immediately), cache when offline or slow.
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request, { cache: 'no-cache' }).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; });
    if (!hit) return net;
    const timeout = new Promise(r => setTimeout(() => r(hit), 2500));
    return Promise.race([net.catch(() => hit), timeout]);
  }));
});
