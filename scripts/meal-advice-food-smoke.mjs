/** 晚间热量建议与同义组合菜回归；只使用独立浏览器中的合成数据。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const engine = process.env.BROWSER || 'chromium';
const browser = await pw[engine].launch();
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let checks = 0;
const check = (label, ok) => { assert.ok(ok, label); checks++; console.log('✓ ' + engine + ': ' + label); };
const tab = label => page.locator('.tab').filter({ hasText: label }).click();
const shot = async (selector, name) => {
  if (!process.env.ARTIFACT_DIR) return;
  await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
  await page.locator(selector).screenshot({ path: `${process.env.ARTIFACT_DIR}/${name}-${engine}.png` });
};
try {
  await page.clock.setFixedTime(new Date('2026-09-06T23:00:00+08:00'));
  await page.route('https://**/*', route => route.abort());
  await page.goto(process.argv[2] || 'http://127.0.0.1:8137', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    await s.saveProfile({ goal: 'maintain', birthday: '1996-01-01', weightKg: 72, heightCm: 175, sex: 'male', useAppleEnergy: true, onboarded: true, demoMode: false });
    await s.saveProfile({ goal: 'cut', rateKgPerWeek: (2162 - s.state.derived.targets.tdee) * 7 / 7700 });
    const db = await import('/js/lib/db.js');
    await db.put(db.STORES.health, { date: '2026-09-06', restingEnergy: 1450, activeEnergy: 224, energyObservedAt: new Date().toISOString(), source: 'apple' });
    await s.reloadStoreFromDB();
    await s.addEntry({ foodId: 'rice_white', grams: 100, meal: 'dinner', name: '测试全天摄入',
      nutrients: { kcal: 2359, protein: 87, carb: 362, fat: 60, fiber: 11, sugar: 58, sodium: 2039 } });
  });
  await tab('今日');
  check('2359/2162 的深夜主卡指向明天，当前收支仍为 +685', await page.locator('.hero').evaluate(el =>
    el.querySelector('h2').textContent === '明天照常安排三餐'
    && /2359 kcal.*2162 kcal.*197 kcal/.test(el.querySelector('.hero-detail').textContent)
    && el.querySelector('.ring-value').textContent === '+685'));
  check('当晚主卡和提示没有虚构下一餐', !/下一餐|后续餐|余下餐/.test(await page.locator('main').innerText()));
  await shot('.hero', 'late-over-plan');
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    await s.removeEntry(s.state.dietEntries[0].id);
    await s.addEntry({ foodId: 'rice_white', grams: 100, meal: 'dinner', name: '测试全天摄入',
      nutrients: { kcal: 1900, protein: 87, carb: 250, fat: 60, fiber: 11, sugar: 20, sodium: 1500 } });
  });
  check('未达计划但覆盖当前消耗时，主卡不催补且仍展示计划差额', await page.locator('.hero').evaluate(el =>
    el.querySelector('h2').textContent === '今天不必再追齐数字'
    && /当前设备记录消耗 1674 kcal/.test(el.textContent)
    && el.querySelector('.ring-value').textContent === '+226'));
  for (const width of [320, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    check(`${width}px 主卡无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await shot('.hero', 'late-current-covered');
  await tab('饮食');
  check('当天结束后的推荐明确按饥饿感选择，没有再分配晚餐义务', /按需少量选择/.test(await page.locator('.recommend-card').innerText()));
  for (const query of ['青椒炒鸡蛋', '尖椒炒蛋', '辣椒炒蛋', '鸡蛋炒青椒']) {
    await page.locator('.ui-search-input').fill(query);
    await page.waitForFunction(() => document.querySelector('.search-item')?.textContent.includes('辣椒炒鸡蛋'));
    check(`${query} 首条命中固定菜，搜索中没有重复组合`, await page.locator('.search-item').first().innerText().then(t => t.includes('辣椒炒鸡蛋'))
      && !/青椒炒鸡蛋/.test(await page.locator('.search-item').allTextContents().then(a => a.join(''))));
  }
  await page.locator('.ui-search-input').fill('火腿炒鸡蛋');
  await page.waitForFunction(() => document.querySelector('.search-item')?.textContent.includes('火腿肠炒鸡蛋'));
  await page.locator('.search-item').first().click();
  await page.waitForSelector('.sheet-wrap.is-ready .sheet');
  check('火腿炒蛋可打开份量面板，列出鸡蛋、火腿肠和炒菜油', /火腿肠/.test(await page.locator('.sheet').innerText())
    && /鸡蛋/.test(await page.locator('.sheet').innerText()) && /炒菜油/.test(await page.locator('.sheet').innerText()));
  await shot('.sheet', 'ham-egg-portion');
  await page.evaluate(async () => (await import('/js/lib/sheet.js')).closeSheet({ force: true }));
  await page.waitForTimeout(350);
  await shot('.water-card', 'water-idle');
  await page.locator('.water-pill').tap();
  await page.waitForTimeout(100);
  await shot('.water-card', 'water-tap');
  check('无浏览器脚本异常', errors.length === 0);
  console.log(`${checks}/${checks} passed`);
} finally { await browser.close(); }
