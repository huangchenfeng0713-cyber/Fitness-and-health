/**
 * 离线缓存：把应用外壳缓存下来，断网也能记录。
 * 用户数据在 IndexedDB 里，与这里无关。
 */
const CACHE = 'health-diet-v1.9.1';
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
  './js/core/metrics.js',
  './js/core/nutrition.js',
  './js/core/advisor.js',
  './js/core/feedback.js',
  './js/core/health.js',
  './js/core/health-insights.js',
  './js/core/trend-reading.js',
  './js/core/cloud-health.js',
  './js/lib/importer.js',
  './js/core/health-merge.js',
  './js/data/foods.js',
  './js/config/cloud.js',
  './js/views/dashboard.js',
  './js/views/diet.js',
  './js/views/health.js',
  './js/views/settings.js',
  './js/views/training.js',
  './js/core/training.js',
  './js/data/exercises.js',
  './js/views/cards/profile.js',
  './js/views/cards/health-metrics.js',
  './js/views/cards/data-manager.js',
  './js/views/cards/trend-charts.js',
  './js/views/cards/meal-advice.js',
  './js/workers/health-import.worker.js',
  './assets/icon.svg',
];
const SHELL_URLS = new Set(SHELL.map((path) => new URL(path, self.registration.scope).href));
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

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

  const navigation = e.request.mode === 'navigate';
  const shellRequest = navigation || SHELL_URLS.has(e.request.url);
  if (shellRequest) {
    /*
     * 同一版应用外壳必须一起切换。旧实现会把每个联网成功的新文件写回旧缓存，
     * 一旦中途断网，就可能出现“新 app.js + 旧 account.js”这种混搭，ES module
     * 会在首屏前直接报错。新版 SW 先在 install 阶段把整套 SHELL 写进新 CACHE；
     * 只有全部成功才激活。当前控制器始终 cache-first，绝不原地拼接两个版本。
     */
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const cacheKey = navigation ? INDEX_URL : e.request;
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
      const response = await fetch(e.request);
      if (response.ok) await cache.put(cacheKey, response.clone()).catch(() => {});
      return response;
    }).catch(() => caches.match(INDEX_URL)));
    return;
  }

  // 非应用外壳资源仍走网络优先；它们不会参与模块依赖图，不会造成跨版本混搭。
  e.respondWith(
    fetch(e.request)
      .then(async (res) => {
        if (res.ok) {
          const copy = res.clone();
          await caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))),
  );
});
