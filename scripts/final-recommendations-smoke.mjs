/** Batches 0/1: actual IndexedDB roundtrip, explicit draft commit, same health weight source. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('https://**/*', r => r.abort());
await page.clock.install({ time: new Date('2026-09-12T12:00:00+08:00') });
let count = 0;
const check = (label, condition) => { assert.ok(condition, label); console.log('✓ ' + label); count++; };
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8080');
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  const backup = await page.evaluate(async () => {
    const db = await import('/js/lib/db.js');
    const training = [{ date: '2026-09-10', items: [{ id: 'pushup', done: false, sets: [
      { reps: 12, weightKg: null }, { reps: 10, weightKg: 0, futureOptional: 'preserve raw field' },
    ] }] }];
    const payload = { app: 'health-diet-tracker', version: 3, health: [{ date: '2026-09-10', weightKg: 70 }],
      diet: [], customFoods: [], settings: [], training };
    await db.importAll(payload);
    const exported = await db.exportAllWithCloudMetadata();
    await db.clearAllStores();
    await db.importAll(exported.snapshot);
    const restored = await db.getAll(db.STORES.training);
    const legacy = { ...payload }; delete legacy.training;
    const legacyCounts = await db.importAll(legacy);
    const afterLegacy = await db.getAll(db.STORES.training);
    let rejected = false;
    try { await db.importAll({ ...payload, training: null }); } catch { rejected = true; }
    const afterRejected = await db.getAll(db.STORES.training);
    await db.importAll({ ...payload, training: [] });
    const explicitEmpty = await db.getAll(db.STORES.training);
    await db.importAll(payload);
    const beforeBroken = await db.exportAll();
    let invalidRejected = false;
    try { await db.importAll({ ...payload, training: [{ date: '2026-02-30', items: [] }] }); } catch { invalidRejected = true; }
    const afterBroken = await db.exportAll();
    return { training, exported: exported.snapshot, restored, legacyCounts, afterLegacy,
      rejected, afterRejected, explicitEmpty, invalidRejected,
      allIntact: ['health','diet','settings','customFoods','training'].every(k => JSON.stringify(beforeBroken[k]) === JSON.stringify(afterBroken[k])) };
  });
  check('真实导出快照含完整训练，未知可选字段不丢', JSON.stringify(backup.exported.training) === JSON.stringify(backup.training));
  check('清库后导入恢复训练全部原值', JSON.stringify(backup.restored) === JSON.stringify(backup.training));
  check('旧备份缺训练字段保留当前记录', backup.legacyCounts.trainingPreserved && JSON.stringify(backup.afterLegacy) === JSON.stringify(backup.training));
  check('训练字段 null 拒绝恢复，现有记录不受影响', backup.rejected && JSON.stringify(backup.afterRejected) === JSON.stringify(backup.training));
  check('明确空数组可删除训练', backup.explicitEmpty.length === 0);
  check('非法日期拒绝恢复，所有业务表保持原样', backup.invalidRejected && backup.allIntact);
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    await s.reloadStoreFromDB();
    await s.saveProfile({ goal: 'maintain', birthday: '1996-01-01', age: 30, weightKg: 70, heightCm: 175, sex: 'male', useAppleEnergy: false, onboarded: true, demoMode: false });
    await s.saveTraining('2026-09-12', { items: [{ id: 'pushup', sets: [] }] });
    await s.saveHealthDay('2026-09-12', { steps: 1234, source: 'manual' });
  });
  await page.locator('.tab').filter({ hasText: '健身' }).click();
  await page.getByRole('button', { name: '记组', exact: true }).click();
  check('记组位置可查看上次日期和逐组记录', await page.locator('.training-last-sets').count() === 1);
  await page.locator('.training-last-sets summary').click();
  check('逐组展示次数，零和未知重量保持区分', (await page.locator('.training-last-sets').innerText()).includes('重量未填 × 12 次') && (await page.locator('.training-last-sets').innerText()).includes('0 kg × 10 次'));
  const todayItems = () => page.evaluate(async () => (await import('/js/lib/store.js')).trainingFor('2026-09-12').items);
  await page.getByRole('button', { name: '加第一组', exact: true }).click();
  check('首组历史预填不落库、不计完成', (await todayItems())[0].sets.length === 0 && await page.getByRole('spinbutton', { name: '待确认次数', exact: true }).inputValue() === '12');
  await page.getByRole('button', { name: '确认记录这一组', exact: true }).click();
  await page.getByText('已记录 1 组', { exact: true }).waitFor();
  check('确认后保存次数，未填重量仍为 null', (await todayItems())[0].sets[0].weightKg === null);
  await page.getByRole('button', { name: '再加一组', exact: true }).click();
  check('复制上一组不额外计数', (await todayItems())[0].sets.length === 1);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  check('取消草稿不改已记录组', (await todayItems())[0].sets.length === 1);
  await page.getByRole('tab', { name: '训练记录', exact: true }).click();
  check('训练历史只展开选中日期', await page.locator('.training-date').count() === 7 && await page.locator('.training-log-day .log-row').count() === 1);
  await page.locator('.training-log-day .log-row').click();
  check('动作详情显示实际次数', (await page.locator('.log-sets').innerText()).includes('12 次'));
  await page.locator('.tab').filter({ hasText: '今日' }).click();
  check('今日页不再提供记体重入口', await page.getByRole('button', { name: '记体重', exact: true }).count() === 0);
  const weight = await page.evaluate(async () => {
    const s = await import('/js/lib/store.js'); const db = await import('/js/lib/db.js');
    await db.put(db.STORES.health, { date: '2026-09-12', weightKg: 69.8, steps: 1234, source: 'shortcut' });
    await s.reloadStoreFromDB();
    return { latest: s.latestHealthEntry('weightKg', '2026-09-12'), effective: s.state.derived.effectiveProfile.weightKg };
  });
  check('同步体重继续参与身体信息和计算', weight.latest.value === 69.8 && weight.effective === 69.8);
  // New plan evidence is a saved snapshot; later weight updates do not replace it.
  const plan = await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    const p = s.planForProfile(s.state.profile, '2026-09-12');
    return { p, before: s.planForProfile(s.state.profile, '2026-09-11') };
  });
  check('目标生效日期与基线窗口可追溯，生效前不套未来版本', plan.p.effectiveDate === '2026-09-12' && plan.p.planBasis.from === '2026-08-29' && !plan.before.versionId);
  await page.locator('.topbar-settings-btn').click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /导入与备份/ }).click();
  for (const legacy of [false, true]) {
    const file = { ...backup.exported };
    if (legacy) delete file.training;
    const dialogText = new Promise(resolve => page.once('dialog', async dialog => {
      const message = dialog.message(); await dialog.dismiss(); resolve(message);
    }));
    await page.locator('#data-manager input[type=file][accept=".json"]').setInputFiles({
      name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)),
    });
    const preview = await dialogText;
    check(legacy ? '旧文件预览说明保留训练' : '新文件预览训练天数与替换范围', legacy
      ? preview.includes('本机现有训练保留') : preview.includes('训练 1 天（替换本机训练记录）'));
  }
  check('取消恢复不改当前训练', (await todayItems())[0].sets.length === 1);
  await page.getByRole('button', { name: '收起设置', exact: true }).click();
  await page.clock.fastForward(6000); // let prior feedback expire before visual acceptance
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const tab of ['今日', '数据', '健身']) {
      await page.locator('.tab').filter({ hasText: tab }).click();
      check(`${width}px ${tab} 无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.card')].every(e => e.scrollWidth <= e.clientWidth + 1)));
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    const root = document.documentElement, style = getComputedStyle(root);
    for (const name of ['display', 'title', 'headline', 'value', 'body', 'footnote', 'caption']) {
      const key = '--fs-' + name; root.style.setProperty(key, (parseFloat(style.getPropertyValue(key)) * 2) + 'px');
    }
  });
  await page.getByRole('tab', { name: '本次训练', exact: true }).click();
  await page.getByRole('button', { name: '再加一组', exact: true }).click();
  check('320px 200% 文字的训练草稿无溢出', await page.locator('.training-set-draft').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.locator('.training-set-draft').scrollIntoViewIfNeeded();
  if (process.env.ARTIFACT_DIR) await page.screenshot({ path: process.env.ARTIFACT_DIR + '/draft-200.png' });
  await page.locator('.tab').filter({ hasText: '今日' }).click();
  await page.locator('.tab').filter({ hasText: '数据' }).click();
  check('320px 200% 文字的配对统计无溢出', await page.locator('.week-rows').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  if (process.env.ARTIFACT_DIR) {
    await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
    await page.locator('.weekly-summary-card').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.ARTIFACT_DIR + '/weekly-summary-200.png', fullPage: true });
  }
  check('运行时无 JS 错误', errors.length === 0);
  console.log(`${count} checks passed`);
} finally { await browser.close(); }
