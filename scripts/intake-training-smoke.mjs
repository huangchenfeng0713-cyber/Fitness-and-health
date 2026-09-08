/** 两项功能的浏览器集成回归：独立上下文，测试记录只写入临时 IndexedDB。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const engine = process.env.BROWSER || 'chromium';
const browser = await pw[engine].launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', locale: 'zh-CN' });
const page = await context.newPage();
await page.clock.install({ time: new Date('2026-09-06T15:30:00+08:00') });
await page.route('https://**/*', route => route.abort());
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let checks = 0;
const check = (name, ok) => { assert.ok(ok, name); checks++; console.log('✓ ' + engine + ': ' + name); };
const tab = label => page.locator('.tab').filter({ hasText: label }).click();
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8146', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  await page.evaluate(async () => {
    const store = await import('/js/lib/store.js');
    const db = await import('/js/lib/db.js');
    await store.saveProfile({ goal: 'maintain', birthday: '1996-01-01', age: 30, weightKg: 72, heightCm: 175, sex: 'male', useAppleEnergy: false, onboarded: true, demoMode: false });
    const rows = [];
    for (let i = 1; i <= 28; i++) {
      const date = '2026-08-' + String(i).padStart(2, '0');
      for (const [meal, time, kcal] of [['breakfast', '08:00', 600], ['lunch', '13:00', 1000], ['dinner', '19:00', 800]]) rows.push({
        date, meal, time: date + 'T' + time + ':00+08:00', kcal, protein: 20, fat: 15, carb: 100, fiber: 4, sugar: 2, sodium: 300, name: '测试餐', grams: 100,
      });
    }
    rows.push({ date: '2026-09-06', meal: 'breakfast', time: '2026-09-06T08:00:00+08:00', kcal: 300, protein: 10, fat: 30, carb: 20, fiber: 2, name: '测试早餐', grams: 100 },
      { date: '2026-09-06', meal: 'lunch', time: '2026-09-06T13:00:00+08:00', kcal: 500, protein: 15, fat: 35, carb: 35, fiber: 3, name: '测试午餐', grams: 100 });
    await db.bulkPut(db.STORES.diet, rows);
    await store.reloadStoreFromDB();
  });
  await tab('今日');
  check('日内800kcal部分记录不判定全天摄入不足', await page.locator('.intake-trend[data-state="under"]').count() === 0);
  await page.evaluate(async () => (await import('/js/lib/store.js')).addEntry({
    meal: 'snack', custom: { name: '合成餐' },
    nutrients: { kcal: 3000, protein: 10, fat: 100, carb: 400, fiber: 2 },
    name: '超出预算的合成记录', grams: 100,
  }));
  await page.waitForSelector('.intake-trend[data-state="over"]');
  check('已记录摄入超出全天预算时给出餐次建议', await page.locator('.trend-action').textContent().then(s => /餐/.test(s)));
  for (const width of [320, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    check(width + 'px趋势卡无横向溢出', await page.locator('.intake-trend').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  }
  await page.setViewportSize({ width: 393, height: 852 });
  if (process.env.ARTIFACT_DIR) {
    await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
    await page.locator('.intake-trend').screenshot({ path: process.env.ARTIFACT_DIR + '/intake-trend-' + engine + '.png' });
  }
  await page.locator('.trend-go').click();
  await page.waitForSelector('.recommend-direction');
  check('纠偏入口跳到现有餐次推荐', await page.locator('.recommend-direction').textContent().then(s => /餐/.test(s)));
  const suggested = await page.evaluate(async () => (await import('/js/lib/store.js')).state.derived.advice.recommend[0].grams);
  await page.locator('.rec-row .add-btn').first().click();
  await page.waitForSelector('.sheet[role="dialog"]');
  check('推荐食物打开现有份量面板，预填建议份量与餐次', await page.locator('.sheet').evaluate((el, grams) =>
    !![...el.querySelectorAll('input')].find(i => Number(i.value) === grams) && el.querySelectorAll('.portion-meal .active').length === 1, suggested));
  await page.evaluate(async () => (await import('/js/lib/sheet.js')).closeSheet({ force: true }));
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    for (const [date, id] of [['2026-09-04', 'bench_press_bb'], ['2026-09-02', 'lat_pulldown'], ['2026-08-29', 'squat_bb']]) {
      await s.saveTraining(date, { items: [{ id, sets: [{ reps: 8, weightKg: 60 }] }] });
    }
    await s.saveTraining('2026-09-06', { items: [{ id: 'squat_bb', sets: [] }] });
  });
  await tab('健身');
  await page.getByRole('tab', { name: '训练记录', exact: true }).click();
  check('胸背腿间隔来自记录且空计划不计', await page.locator('.training-coverage').textContent().then(t => t.includes('2 天前') && t.includes('4 天前') && t.includes('8 天前')));
  for (const width of [320, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    check(width + 'px训练覆盖表无横向溢出', await page.locator('.training-coverage').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  }
  await page.setViewportSize({ width: 393, height: 852 });
  if (process.env.ARTIFACT_DIR) await page.locator('.training-coverage').screenshot({ path: process.env.ARTIFACT_DIR + '/training-coverage-' + engine + '.png' });
  await page.getByRole('tab', { name: '本次训练', exact: true }).click();
  await page.locator('.plan-row button').filter({ hasText: '记组' }).click();
  await page.getByRole('button', { name: '加第一组', exact: true }).click();
  await page.locator('.set-input[placeholder="次数"]').fill('10');
  await page.locator('.set-input[placeholder="次数"]').blur();
  await page.getByRole('tab', { name: '训练记录', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-group="leg"]').textContent.includes('今天'));
  check('填写有效训练组后覆盖立即更新', await page.locator('[data-group="leg"]').textContent().then(t => t.includes('1 次')));
  await page.getByRole('tab', { name: '本次训练', exact: true }).click();
  await page.locator('[aria-label="删除这一组"]').click();
  await page.getByRole('tab', { name: '训练记录', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-group="leg"]').textContent.includes('8 天前'));
  check('删除最后有效组恢复历史间隔', await page.locator('[data-group="leg"]').textContent().then(t => t.includes('0 次')));
  await page.evaluate(async () => (await import('/js/lib/store.js')).setDay('2026-08-01'));
  check('健身页不随饮食查看日期改变统计窗口', await page.locator('[data-group="chest"]').textContent().then(t => t.includes('2 天前')));
  await tab('今日');
  check('历史日期没有实时纠偏卡', await page.locator('.intake-trend').count() === 0);
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    const db = await import('/js/lib/db.js');
    await s.setDay('2026-09-06');
    await db.bulkPut(db.STORES.diet, [{ date: '2026-09-06', meal: 'snack', time: '2026-09-06T14:00:00+08:00', kcal: 2600, protein: 0, fat: 100, carb: 300, name: '超出测试', grams: 100 }]);
    await s.reloadStoreFromDB();
  });
  await tab('饮食');
  check('热量已超但蛋白不足仍有带热量的推荐', await page.locator('.recommend-budget').textContent().then(s => /kcal/.test(s)) && await page.locator('.rec-row').count() > 0);
  check('没有只喝水茶的旧空态提示', !/剩下时间以水和无糖茶为主/.test(await page.locator('#view').textContent()));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  await tab('健身');
  await page.getByRole('tab', { name: '训练记录', exact: true }).click();
  check('刷新后训练记录和统计保留', await page.locator('[data-group="leg"]').textContent().then(t => t.includes('8 天前')));
  check('运行时无JS错误', errors.length === 0);
  console.log(checks + '/' + checks + ' passed');
} finally { await browser.close(); }
