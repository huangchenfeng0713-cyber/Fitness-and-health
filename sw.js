/**
 * 离线缓存：把应用外壳缓存下来，断网也能记录。
 * 用户数据在 IndexedDB 里，与这里无关。
 */
const CACHE = 'health-diet-v3.17.3';
const SDK_CACHE = 'health-diet-supabase-sdk-2.112.4';
const CACHE_PREFIX = 'health-diet-';
const UPDATE_READY = 'health-diet-update-ready';
const UPDATE_NOTICE_READY = 'health-diet-update-notice-ready';
const updateAwareClients = new Set();
// 根模块及其固定版本依赖只在账号功能首次成功加载后按需缓存；不为本地模式访客预下载。
const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/+esm';
const JSDELIVR_ORIGIN = 'https://cdn.jsdelivr.net';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/bootstrap.js',
  './js/app.js',
  './js/lib/db.js',
  './js/lib/sheet.js',
  './js/lib/modal-focus.js',
  './js/lib/store.js',
  './js/lib/account.js',
  './js/lib/cloud-auth.js',
  './js/lib/cloud-sync.js',
  './js/lib/health-cloud-sync.js',
  './js/lib/utils.js',
  './js/lib/gesture.js',
  './js/lib/icons.js',
  './js/lib/ui.js',
  './js/lib/point-value-tip.js',
  './js/lib/charts.js',
  './js/lib/energy-ring-chart.js',
  './js/lib/select-bar.js',
  './js/lib/nav.js',
  './js/core/day.js',
  './js/core/duration.js',
  './js/core/health-card.js',
  './js/core/metrics.js',
  './js/core/portion.js',
  './js/core/nutrition.js',
  './js/core/pinyin.js',
  './js/core/units.js',
  './js/core/diet-log.js',
  './js/core/advisor.js',
  './js/core/intake-trend.js',
  './js/core/eating-rhythm.js',
  './js/core/energy-ring.js',
  './js/core/feedback.js',
  './js/core/health.js',
  './js/core/energy-observation.js',
  './js/core/source-intervals.js',
  './js/core/health-insights.js',
  './js/core/trend-reading.js',
  './js/core/weekly-summary.js',
  './js/core/cloud-health.js',
  './js/lib/importer.js',
  './js/core/health-merge.js',
  './js/data/foods.js',
  './js/data/food-extras.js',
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
  './js/views/cards/weekly-summary.js',
  './js/views/cards/data-manager.js',
  './js/views/cards/trend-charts.js',
  './js/views/cards/food-estimate.js',
  './js/views/cards/meal-advice.js',
  './js/workers/health-import.worker.js',
  './assets/icon.svg',
];
const SHELL_URLS = new Set(SHELL.map((path) => new URL(path, self.registration.scope).href));
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

async function fetchFresh(request) {
  const res = await fetch(request, { cache: 'reload' });
  if (!res.ok) throw new Error(`${request.url} ${res.status}`);
  return res;
}

self.addEventListener('install', (e) => {
  /*
   * 必须绕开 HTTP 缓存去拉外壳。GitHub Pages 给每个文件 max-age=600，
   * cache.addAll 会把十分钟内的旧 app.js 写进新版本的 Cache Storage ——
   * 缓存名已经是 v3.9.12，里面跑的还是上一版，点「立即更新」也换不掉。
   */
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (path) => {
      const req = new Request(new URL(path, self.registration.scope), { cache: 'reload' });
      await cache.put(req, await fetchFresh(req));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const oldShells = keys.filter((k) => k.startsWith(CACHE_PREFIX)
      && k !== CACHE && k !== SDK_CACHE);
    await Promise.all(oldShells.map((k) => caches.delete(k)));
    await self.clients.claim();
    if (!oldShells.length) return;

    /*
     * 浏览器可能在旧页面挂上 controllerchange 监听之前就完成接管。先通知已经支持
     * 新协议的页面显示更新横幅；旧页面不会回应，短暂等待后只替它重新导航一次。
     */
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((client) => client.postMessage({ type: UPDATE_READY, cache: CACHE }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    windows.filter((client) => !updateAwareClients.has(client.id)).forEach((client) => {
      const url = new URL(client.url);
      url.searchParams.set('_up', CACHE.slice(CACHE_PREFIX.length));
      // navigate 会等激活完成；这里不能 await，否则激活与导航会互相等待。
      client.navigate(url.href).catch(() => {});
    });
  })());
});

self.addEventListener('message', (e) => {
  if (e.data?.type === UPDATE_NOTICE_READY && e.source?.id) updateAwareClients.add(e.source.id);
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
      const response = await fetch(e.request, { cache: 'reload' });
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
