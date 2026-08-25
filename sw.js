/**
 * 离线缓存：把应用外壳缓存下来，断网也能记录。
 * 用户数据在 IndexedDB 里，与这里无关。
 */
const CACHE = 'health-diet-v1.6.0';
const SDK_CACHE = 'health-diet-supabase-sdk-2.112.4';
const CACHE_PREFIX = 'health-diet-';
// 根模块及其固定版本依赖只在账号功能首次成功加载后按需缓存；不为本地模式访客预下载。
const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/+esm';
const JSDELIVR_ORIGIN = 'https://cdn.jsdelivr.net';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/lib/db.js',
  './js/lib/store.js',
  './js/lib/account.js',
  './js/lib/cloud-auth.js',
  './js/lib/cloud-sync.js',
  './js/lib/health-cloud-sync.js',
  './js/lib/utils.js',
  './js/lib/charts.js',
  './js/core/nutrition.js',
  './js/core/advisor.js',
  './js/core/feedback.js',
  './js/core/health.js',
  './js/core/health-insights.js',
  './js/core/cloud-health.js',
  './js/lib/importer.js',
  './js/core/health-merge.js',
  './js/data/foods.js',
  './js/config/cloud.js',
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
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE && k !== SDK_CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const requestUrl = new URL(e.request.url);
  const sdkModule = e.request.url === SUPABASE_SDK || (
    requestUrl.origin === JSDELIVR_ORIGIN
    && requestUrl.pathname.startsWith('/npm/')
    && e.request.destination === 'script'
  );
  if (sdkModule) {
    e.respondWith(caches.open(SDK_CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      if (cached) return cached;
      const res = await fetch(e.request);
      const mime = res.headers.get('content-type') || '';
      if (res.ok && res.type !== 'opaque' && /(?:java|ecma)script/i.test(mime)) {
        await cache.put(e.request, res.clone());
      }
      return res;
    }));
    return;
  }
  if (!e.request.url.startsWith(self.location.origin)) return;
  const authCallback = ['code', 'error', 'error_code', 'error_description']
    .some((key) => requestUrl.searchParams.has(key));
  // 网络优先、回落缓存：既能拿到最新代码，断网时也能打开
  e.respondWith(
    fetch(e.request)
      .then(async (res) => {
        if (!authCallback && res.ok) {
          const copy = res.clone();
          await caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
  );
});
