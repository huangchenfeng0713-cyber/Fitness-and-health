/** 验证不支持新版通知协议的旧页面也能切换到最新离线外壳。 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8137';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const context = await browser.newContext({ serviceWorkers: 'allow' });
const page = await context.newPage();

try {
  await page.route('**/legacy.html*', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><meta charset="utf-8"><p>旧版页面</p><script>
      caches.open('health-diet-v3.14.1').then(() =>
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }));
    </script>`,
  }));
  await page.goto(`${base}/legacy.html`);
  await page.waitForURL(/_up=v\d+\.\d+\.\d+/, { timeout: 10_000 });
  await page.waitForSelector('.tab', { timeout: 15_000 });
  const state = await page.evaluate(async () => ({
    url: location.href,
    version: (await import('./js/core/feedback.js')).APP_VERSION,
    caches: await caches.keys(),
  }));
  assert.match(state.url, new RegExp(`_up=v${state.version.replaceAll('.', '\\.')}`));
  assert.deepEqual(state.caches.filter((key) => key.startsWith('health-diet-v')),
    [`health-diet-v${state.version}`]);
  console.log(`✓ 旧页面自动切换到 v${state.version}，只保留新版离线外壳`);
} finally {
  await browser.close();
}
