/**
 * 浏览器冒烟测试：起得来、四个栏目都能开、IndexedDB 能写能读、Service Worker 能接管。
 *
 * 为什么单独做这一层：单元测试全绿的情况下，浏览器集成层还是连着出过问题——
 * 启动失败吞掉自救按钮、身体信息不合格白屏、推荐份量漏出浮点数，
 * 三个都不是计算函数的错，node --test 一个都拦不住。
 *
 * 不进 npm test：那一套必须保持零依赖。这个脚本只在 CI 里跑，
 * playwright 用 --no-save 装，不写进 package.json。
 *
 *   node scripts/smoke.mjs [http://127.0.0.1:8137]
 */

const BASE = process.argv[2] || 'http://127.0.0.1:8137';

/*
 * CI 里用 `npm i --no-save playwright` 装到 ./node_modules，import 'playwright' 就能解析；
 * 本地想用系统全局那份时，把路径放进 PLAYWRIGHT_PATH 即可（ESM 不认 NODE_PATH）。
 */
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
/*
 * 只把「未捕获的 JS 异常」算失败。
 * 资源加载失败（net::ERR_*）是网络层的事：CI 机器连不连得上云端 CDN
 * 不该决定这次提交能不能合，否则冒烟测试会变成随机红叉、很快没人看。
 */
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  const text = m.text();
  if (m.type() !== 'error') return;
  if (/Failed to load resource|net::ERR_|favicon/.test(text)) return;
  errors.push(`console: ${text}`);
});

try {
  // ---- 起得来 ----
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tab', { timeout: 15000 });
  await page.evaluate(() => document.querySelector('.onboard .text-btn, .onboard button:last-child')?.click());
  await page.waitForTimeout(400);
  const tabs = await page.$$eval('.tab', (t) => t.map((x) => x.textContent.trim()));
  check('启动并渲染底部栏目', tabs.length === 4, tabs.join(' / '));

  // ---- 四个栏目都能开，且没有脏值 ----
  for (let i = 0; i < tabs.length; i += 1) {
    await page.evaluate((n) => document.querySelectorAll('.tab')[n]?.click(), i);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const text = document.querySelector('#view')?.innerText || '';
      return {
        empty: text.trim().length < 20,
        dirty: ['undefined', 'NaN', '[object', 'Infinity'].filter((s) => text.includes(s)),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    check(`栏目「${tabs[i]}」`, !r.empty && !r.dirty.length && !r.overflow,
      [r.empty && '内容为空', r.dirty.length && `脏值 ${r.dirty}`, r.overflow && '横向溢出']
        .filter(Boolean).join('，'));
  }

  /*
   * 健康数据的格子排布。
   *
   * 有几项完全看当天同步上来了什么，1~8 项都可能。列数算错的话末行会只剩一个，
   * 孤零零吊在中间。而且这里用的是 CSS 自定义属性——h() 早先用
   * Object.assign(el.style, ...) 写它，不报错也不生效，排版看着"没变"而已，
   * 单元测试一个都拦不住。
   */
  const FIELDS = {
    steps: 8432, activeEnergy: 312, exerciseMinutes: 25, sleepMinutes: 402,
    restingHR: 58, weightKg: 62.4, bodyFatPct: 18.1, waterMl: 1250,
  };
  const badLayouts = [];
  for (let n = 1; n <= 8; n += 1) {
    await page.evaluate(async (keep) => {
      const { saveHealthDay } = await import('./js/lib/store.js');
      const day = new Date().toLocaleDateString('sv-SE');
      const blank = Object.fromEntries(Object.keys(keep.all).map((k) => [k, null]));
      await saveHealthDay(day, { ...blank, source: 'manual' });
      await saveHealthDay(day, { ...keep.patch, source: 'manual' });
    }, { all: FIELDS, patch: Object.fromEntries(Object.entries(FIELDS).slice(0, n)) });
    await page.evaluate(() => [...document.querySelectorAll('.tab')]
      .find((x) => x.textContent.includes('数据'))?.click());
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const grid = document.querySelector('.metric-grid');
      if (!grid) return null;
      const cells = [...grid.querySelectorAll('.metric-cell')];
      const tops = [...new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top)))];
      const rows = tops.map((t) => cells.filter((c) => Math.round(c.getBoundingClientRect().top) === t).length);
      return { rows, cut: cells.some((c) => c.scrollWidth > c.clientWidth + 1) };
    });
    if (!r) badLayouts.push(`${n} 项没渲染出格子`);
    else if (r.cut) badLayouts.push(`${n} 项有格子被撑破`);
    else if (r.rows.length > 1 && r.rows[r.rows.length - 1] === 1) badLayouts.push(`${n} 项排成 ${r.rows.join('+')}，末行只剩一个`);
  }
  check('健康数据 1~8 项都排得平整', badLayouts.length === 0, badLayouts.join('；'));

  // ---- 设置抽屉 ----
  await page.evaluate(() => document.querySelector('.topbar-settings-btn')?.click());
  await page.waitForTimeout(700);
  const drawer = await page.$$eval('.settings-drawer .card h3', (h) => h.map((x) => x.textContent.trim()));
  check('设置抽屉能打开', drawer.length >= 4, drawer.join(' / '));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // ---- IndexedDB 真的落库：写一条、重新加载、还在 ----
  const wrote = await page.evaluate(async () => {
    const { addEntry, state } = await import('./js/lib/store.js');
    await addEntry({ foodId: 'rice_white', grams: 123 });
    return state.dietEntries.length;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.tab', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const persisted = await page.evaluate(async () => {
    const { state } = await import('./js/lib/store.js');
    return state.dietEntries.filter((e) => e.grams === 123).length;
  });
  check('IndexedDB 写入后刷新仍在', wrote > 0 && persisted > 0, `写入 ${wrote} 条，刷新后命中 ${persisted} 条`);

  // ---- Service Worker 注册并接管 ----
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { supported: true, registered: false };
    await navigator.serviceWorker.ready;
    return { supported: true, registered: true, controlled: !!navigator.serviceWorker.controller };
  });
  check('Service Worker 注册成功', sw.registered === true, JSON.stringify(sw));

  // ---- 离线外壳：清单里的模块都能从缓存拿到 ----
  const cached = await page.evaluate(async () => {
    if (!('caches' in window)) return null;
    const keys = await caches.keys();
    const shell = keys.find((k) => k.startsWith('health-diet-') && !k.includes('supabase'));
    if (!shell) return { shell: null };
    const cache = await caches.open(shell);
    const entries = await cache.keys();
    return { shell, count: entries.length };
  });
  check('离线外壳已缓存', (cached?.count || 0) > 20, JSON.stringify(cached));

  check('运行期无 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.error(`冒烟测试失败：${failed.map((f) => f.name).join('、')}`);
  process.exit(1);
}
