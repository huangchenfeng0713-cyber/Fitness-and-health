/**
 * 离线缓存：把应用外壳缓存下来，断网也能记录。
 * 用户数据在 IndexedDB 里，与这里无关。
 */
const CACHE = 'health-diet-v1.3.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/lib/db.js',
  './js/lib/store.js',
  './js/lib/utils.js',
  './js/lib/charts.js',
  './js/core/nutrition.js',
  './js/core/advisor.js',
  './js/core/feedback.js',
  './js/core/health.js',
  './js/core/health-insights.js',
  './js/lib/importer.js',
  './js/core/health-merge.js',
  './js/data/foods.js',
  './js/views/dashboard.js',
  './js/views/diet.js',
  './js/views/health.js',
  './js/views/trends.js',
  './js/views/settings.js',
  './js/workers/health-import.worker.js',
  './assets/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  // 网络优先、回落缓存：既能拿到最新代码，断网时也能打开
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
  );
});
