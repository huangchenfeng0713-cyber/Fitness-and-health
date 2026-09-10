/** 本轮交互回归使用独立浏览器与合成档案，不读取真实用户数据。 */
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
const page = await context.newPage();
await page.route('https://**/*', route => route.abort());
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const tab = label => page.locator('.tab').filter({ hasText: label }).click();
const close = async () => {
  await page.evaluate(async () => (await import('/js/lib/sheet.js')).closeSheet({ force: true }));
  await page.waitForTimeout(300);
};
const openFood = async query => {
  await page.getByLabel('搜索食物，支持中文或拼音').fill(query);
  const expected = await page.evaluate(async query => (await import('/js/data/foods.js')).searchFoods(query)[0].name, query);
  await page.getByRole('button', { name: `选择 ${expected} 的份量`, exact: true }).click();
  await page.locator('.portion-title-line strong').waitFor();
};
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8137', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.tab') && !document.querySelector('.account-data-lock'));
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    await s.saveProfile({ goal: 'maintain', birthday: '1996-01-01', weightKg: 72, heightCm: 175, sex: 'male', useAppleEnergy: false, onboarded: true, demoMode: false });
  });
  await tab('饮食');
  await openFood('炒三丁');
  await page.getByLabel('豌豆：选择或取消', { exact: true }).click();
  await page.locator('.mix-brand-select').selectOption('ham_sausage_shuanghui');
  assert.equal(await page.locator('.mix-brand-select').inputValue(), 'ham_sausage_shuanghui');
  await page.getByLabel('搜索并添加配料').fill('黄瓜');
  await page.locator('.mix-add-result').filter({ hasText: /^黄瓜$/ }).first().click();
  await page.getByLabel('黄瓜的克数', { exact: true }).fill('120');
  await page.getByLabel('黄瓜的克数', { exact: true }).blur();
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 852 });
    assert.ok(await page.locator('.mix-picker').evaluate(el => el.scrollWidth <= el.clientWidth + 1), '配料面板横向溢出');
  }
  await page.locator('.sheet-footer .primary-btn').click();
  await page.waitForFunction(async () => (await import('/js/lib/store.js')).state.dietEntries.some(e => e.foodId === 'combo_three_dice_stir'));
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    const row = s.state.dietEntries.find(e => e.foodId === 'combo_three_dice_stir');
    if (!row.composition.some(c => c.foodId === 'cucumber' && c.grams === 120)
      || !row.composition.some(c => c.foodId === 'ham_sausage_shuanghui')
      || row.composition.some(c => c.foodId === 'green_pea' || c.foodId === 'ham_sausage')) throw Error('自选配料保存错误');
    const kcal = row.kcal;
    await s.updateEntry(row.id, { grams: row.grams / 2 });
    const half = s.state.dietEntries.find(e => e.id === row.id);
    if (!half.composition.some(c => c.foodId === 'cucumber' && c.grams === 60)
      || Math.abs(half.kcal - kcal / 2) > 2) throw Error('历史配方缩放错误');
  });
  await openFood('炒三丁');
  await page.getByLabel('搜索并添加配料').fill('黄瓜');
  await page.locator('.mix-add-result').filter({ hasText: /^黄瓜$/ }).first().click();
  await page.getByRole('button', { name: '恢复常见搭配', exact: true }).click();
  assert.equal(await page.getByLabel('黄瓜的克数', { exact: true }).count(), 0);
  assert.equal(await page.locator('.mix-brand-select').inputValue(), 'ham_sausage');
  await close();
  await openFood('火腿肠');
  await page.getByRole('button', { name: '金锣', exact: true }).click();
  assert.equal(await page.locator('.portion-title-line strong').textContent(), '金锣 火腿肠');
  await close();
  for (const query of ['薯角培根披萨', '超级至尊披萨']) {
    await openFood(query);
    assert.equal(await page.locator('.qty-unit').textContent(), '片');
    await close();
  }
  await openFood('胡萝卜炒鸡蛋');
  assert.ok(await page.getByLabel('胡萝卜的克数', { exact: true }).isVisible());
  await close();
  console.log('✓ 食物品牌、自由配料、恢复默认、保存缩放与披萨单位');

  await tab('健身');
  await page.locator('.training-add').click();
  await page.getByRole('tab', { name: '腹', exact: true }).click();
  await page.getByLabel('细分训练部位').selectOption('abs_lower');
  const lower = await page.locator('.picker-normal-results .exercise-meta-tag.muscle').allTextContents();
  assert.ok(lower.length > 0 && lower.every(text => text.includes('腹直肌下部侧重')));
  await page.locator('.picker-view-switch').getByRole('tab', { name: '推荐', exact: true }).click();
  assert.ok((await page.locator('.rec-picks .exercise-meta-tag.muscle').allTextContents()).every(text => text.includes('腹直肌下部侧重')));
  await page.locator('.exercise-search-input').fill('单臂绳索下拉');
  const choice = page.getByRole('button', { name: '选择 单臂绳索下拉', exact: true });
  await choice.waitFor();
  assert.match(await page.locator('.exercise-search-results .exercise-meta').textContent(), /背阔肌/);
  await choice.click();
  await page.locator('.training-select-bar .select-bar-go').click();
  await page.waitForSelector('.plan-row');
  await page.getByRole('button', { name: '记组', exact: true }).click();
  assert.match(await page.locator('.set-editor').textContent(), /单侧/);
  assert.deepEqual(errors, []);
  console.log('✓ 健身细分筛选、推荐一致性、单臂下拉选择与记录');
} finally { await browser.close(); }
