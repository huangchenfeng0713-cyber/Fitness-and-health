/** 合成数据验证补记隔离、跨周编辑、草稿保留与刷新后的真实落库。 */
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('https://**/*', route => route.abort());
await page.clock.install({ time: new Date('2026-09-20T01:30:00+08:00') });
const readDay = date => page.evaluate(async date => (await import('/js/lib/store.js')).trainingFor(date), date);
const selectDate = async date => {
  await page.getByLabel('训练日期', { exact: true }).fill(date);
  await page.getByLabel('训练日期', { exact: true }).dispatchEvent('change');
};
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8080');
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    await s.saveProfile({ goal: 'maintain', birthday: '1996-01-01', weightKg: 70, heightCm: 175, sex: 'male', useAppleEnergy: false, onboarded: true, demoMode: false });
    for (const date of ['2026-09-01', '2026-09-19', '2026-09-20']) {
      await s.saveTraining(date, { items: [{ id: 'lateral_raise_db', sets: [{ reps: 10, weightKg: date === '2026-09-01' ? 6 : 8 }] }] });
    }
  });
  await page.locator('.tab').filter({ hasText: '健身' }).click();
  const original = await readDay('2026-09-20');
  await selectDate('2026-09-19');
  const row = page.locator('.plan-row-wrap').filter({ hasText: '哑铃侧平举' });
  await row.getByRole('button', { name: '记组', exact: true }).click();
  assert.match(await row.innerText(), /2026-09-01/);
  await page.getByRole('button', { name: '再加一组', exact: true }).click();
  await page.getByLabel('待确认次数', { exact: true }).fill('13');
  await selectDate('2026-09-01');
  await selectDate('2026-09-19');
  await row.getByRole('button', { name: '记组', exact: true }).click();
  assert.equal(await page.getByLabel('待确认次数', { exact: true }).inputValue(), '13');
  await page.getByRole('button', { name: '确认记录这一组', exact: true }).click();
  await page.getByText('已记录 2 组', { exact: true }).waitFor();
  assert.equal((await readDay('2026-09-19')).items[0].sets.length, 2);
  assert.deepEqual(await readDay('2026-09-20'), original);
  await selectDate('2026-09-01');
  await page.getByRole('tab', { name: '训练记录', exact: true }).click();
  assert.match(await page.locator('.training-history-card').innerText(), /2026-09-14 至 2026-09-20/);
  await page.getByRole('button', { name: '2026-09-19 有训练记录', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await page.getByLabel('训练日期', { exact: true }).inputValue(), '2026-09-19');
  await selectDate('2026-09-21');
  assert.equal(await page.getByLabel('训练日期', { exact: true }).inputValue(), '2026-09-19');
  await selectDate('2026-09-02');
  await page.getByRole('button', { name: '添加动作', exact: true }).click();
  await page.getByRole('button', { name: '选择 杠铃卧推', exact: true }).click();
  await page.getByRole('button', { name: '把已选的 1 个动作加入计划', exact: true }).click();
  await page.locator('.sheet-wrap').waitFor({ state: 'hidden' });
  assert.equal((await readDay('2026-09-02')).items.length, 1);
  await page.getByRole('button', { name: '回到今天', exact: true }).click();
  assert.equal(await page.getByLabel('训练日期', { exact: true }).inputValue(), '2026-09-20');
  await page.reload();
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  await page.locator('.tab').filter({ hasText: '健身' }).click();
  await selectDate('2026-09-19');
  assert.equal((await readDay('2026-09-19')).items[0].sets.length, 2);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.locator('.training-recording-date').evaluate(el => el.scrollWidth <= el.clientWidth));
  }
  await page.screenshot({ path: '/tmp/training-backfill.png' });
  assert.deepEqual(errors, []);
  console.log('补记日期隔离、跨周编辑、历史入口、草稿保留、未来日期拒绝、刷新持久化、窄屏布局均通过');
} finally { await browser.close(); }
