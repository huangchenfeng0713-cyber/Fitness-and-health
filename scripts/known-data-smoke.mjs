/** 合成数据复现历史日只同步到 22:30 与营养素部分缺失。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai', locale: 'zh-CN', serviceWorkers: 'block' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('https://**/*', route => route.abort());
await page.clock.install({ time: new Date('2026-09-20T01:30:00+08:00') });
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8080');
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    await s.saveProfile({ goal: 'maintain', birthday: '1996-01-01', weightKg: 70, heightCm: 175, sex: 'male', useAppleEnergy: false, onboarded: true, demoMode: false });
    await s.setDay('2026-09-19');
    const { computeGaps, sumNutrients } = await import('/js/core/nutrition.js');
    const { energyObservation } = await import('/js/core/energy-observation.js');
    const d = s.state.derived;
    d.targets.kcal = 2119;
    d.advice.gaps = computeGaps(d.targets, sumNutrients([
      { kcal: 2000, protein: 84, carb: 180, fat: 60, fiber: 12, sodium: 2100, sugar: null },
      { kcal: 254, protein: null, carb: 20, fat: null, fiber: null, sodium: null, sugar: null },
    ]));
    d.energyData = energyObservation({ date: '2026-09-19', restingEnergy: 1400, activeEnergy: 350,
      energyObservedAt: '2026-09-19T22:30:00+08:00', energyCoverage: { status: 'partial' } }, '2026-09-19', new Date());
    (await import('/js/views/dashboard.js')).renderDashboard(document.querySelector('#view'));
  });
  assert.equal(await page.locator('.ring-caption').innerText(), '较计划');
  assert.equal(await page.locator('.ring-value').innerText(), '+135');
  assert.match(await page.locator('.ring-legend').innerText(), /已知消耗[\s\S]*1750/);
  assert.match(await page.locator('.split-known-values').innerText(), /碳水 200 g · 脂肪 60 g/);
  assert.equal(await page.locator('[data-nutrient="fiber"] .nutrient-point').evaluate(el => parseFloat(el.style.left)), 24);
  assert.equal(await page.locator('[data-nutrient="sugar"] .nutrient-point').count(), 0);
  assert.match(await page.locator('[data-nutrient="sugar"]').innerText(), /未提供/);
  await page.locator('[data-nutrient="fiber"] .point-value-trigger').click();
  assert.match(await page.locator('.point-value-tip').innerText(), /12 g · 已知部分/);
  await page.keyboard.press('Escape');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.locator('.hero').evaluate(el => el.scrollWidth <= el.clientWidth));
  }
  if (process.env.ARTIFACT_DIR) {
    await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/known-data.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('部分日消耗、计划差额、营养素真实点位、未知无零点、窄屏布局均通过');
} finally { await browser.close(); }
