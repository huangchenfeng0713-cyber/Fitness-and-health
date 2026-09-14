/** Synthetic local contexts only: disclosure lifecycle, set contract, diet confirmation, budgets. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await (process.env.BROWSER === 'webkit' ? webkit : chromium).launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai', locale: 'zh-CN', serviceWorkers: 'block' });
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.route('https://**/*', route => route.abort());
await page.clock.install({ time: new Date('2026-09-13T14:12:00+08:00') });
let checks = 0;
const check = (name, value) => { assert.ok(value, name); console.log('✓ ' + name); checks++; };
const tab = name => page.locator('.tab').filter({ hasText: name }).click();
const saved = () => page.evaluate(async () => (await import('/js/lib/store.js')).trainingFor('2026-09-13').items[0].sets);
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8080'); await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    await s.saveProfile({ goal: 'maintain', birthday: '1996-01-01', weightKg: 70, heightCm: 175, sex: 'male', useAppleEnergy: false, onboarded: true, demoMode: false });
    await s.saveTraining('2026-09-10', { items: [{ id: 'dip_chest', sets: Array.from({ length: 4 }, () => ({ reps: 10, weightKg: 0 })) }] });
    await s.saveTraining('2026-09-13', { items: [{ id: 'dip_chest', sets: [] }] });
  });
  await tab('健身'); await page.getByRole('button', { name: '记组', exact: true }).click();
  const last = page.locator('.training-last-sets');
  await last.locator('summary').click();
  await page.evaluate(async () => { await (await import('/js/lib/store.js')).saveHealthDay('2026-09-13', { steps: 120 }); });
  check('上次逐组展开后，数据更新重绘保持展开', await last.evaluate(el => el.open));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  check('页面恢复触发重绘仍保持展开', await last.evaluate(el => el.open));
  await last.locator('summary').click();
  await page.evaluate(async () => { await (await import('/js/lib/store.js')).saveHealthDay('2026-09-13', { steps: 121 }); });
  check('主动收起后重绘不擅自展开', !(await last.evaluate(el => el.open)));
  if (process.env.ARTIFACT_DIR) {
    await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
    await last.locator('summary').click();
    await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/training-compact.png`, fullPage: true });
  }
  await page.getByRole('button', { name: '加第一组', exact: true }).click();
  const draft = page.locator('.training-set-draft');
  check('新组只显示主要输入，未确认不写记录', await draft.getByLabel('组类型', { exact: true }).count() === 0 && (await saved()).length === 0);
  await draft.getByLabel('待确认次数', { exact: true }).fill('10');
  await page.getByRole('button', { name: '确认记录这一组', exact: true }).click();
  await page.getByText('已记录 1 组', { exact: true }).waitFor();
  const first = (await saved())[0];
  check('新确认记录默认正式组，保留自重与完成状态', first.completed && first.setType === 'work' && first.loadMode === 'bodyweight' && first.weightKg === null);
  await page.getByRole('button', { name: '再加一组', exact: true }).click();
  await page.getByRole('button', { name: /记录设置$/ }).click();
  await page.getByLabel('记录方式', { exact: true }).selectOption('time');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await draft.getByLabel('待确认时长（秒）', { exact: true }).fill('45');
  await draft.getByRole('button', { name: '正式组', exact: true }).click();
  await page.getByRole('button', { name: '确认记录这一组', exact: true }).click();
  await page.getByText('已记录 2 组', { exact: true }).waitFor();
  check('只填计时可确认，不污染已记录组', (await saved())[1].reps === null && (await saved())[1].durationSeconds === 45 && (await saved())[0].reps === 10);
  await page.getByRole('tab', { name: '训练记录', exact: true }).click();
  const week = page.locator('.training-week-groups');
  check('周回顾不重复铺陈性质未知', !(await week.innerText()).includes('性质未知') && await week.locator('.training-area-details').count() === 0);
  check('肩、臂分开显示', await week.getByText('肩', { exact: true }).count() === 1 && await week.getByText('臂', { exact: true }).count() === 1);
  const results = await page.evaluate(async () => {
    const s = await import('/js/lib/store.js'), db = await import('/js/lib/db.js');
    await s.setDay('2026-09-13');
    const entry = await s.addEntry({ foodId: 'egg_whole', grams: 50, meal: 'breakfast' });
    await s.confirmDietLog(s.state.day, 'complete');
    const confirmed = s.dietQualityFor().status;
    const snapshot = await db.exportAll();
    const originalTraining = snapshot.training;
    await db.clearAllStores(); await db.importAll(snapshot); await s.reloadStoreFromDB();
    const roundtrip = JSON.stringify((await db.exportAll()).training) === JSON.stringify(originalTraining);
    const restoredStatus = s.dietQualityFor().status;
    await s.updateEntry(entry.id, { grams: 60 }); const afterEdit = s.dietQualityFor().status;
    await s.confirmDietLog(s.state.day, 'partial'); const partial = s.dietQualityFor().status;
    await s.confirmDietLog(s.state.day, 'complete'); await s.removeEntry(entry.id); const afterDelete = s.dietQualityFor();
    await s.restoreEntry(entry); const afterUndo = s.dietQualityFor().status;
    await s.confirmDietLog(s.state.day, 'complete'); await s.copyDay('2026-09-13'); const afterCopy = s.dietQualityFor().status;
    const before = await db.exportAll(); let rejected = false;
    try { await db.importAll({ ...before, training: [{ date: '2026-09-13', items: [{ id: 'dip_chest', sets: [{ reps: 10, completed: true, rir: -1 }] }] }] }); } catch { rejected = true; }
    const intact = JSON.stringify((await db.exportAll()).training) === JSON.stringify(before.training);
    return { confirmed, roundtrip, restoredStatus, afterEdit, partial, afterDelete, afterUndo, afterCopy, rejected, intact };
  });
  check('新增训练字段经保存、清库、JSON 恢复不丢', results.roundtrip);
  check('完整确认随备份往返，仍绑定原日期条目', results.confirmed === 'complete' && results.restoredStatus === 'complete');
  check('改量、删除、撤销、复制都要求重新确认全天完整度', results.afterEdit === 'unknown' && results.afterDelete.label === '没有记录' && results.afterUndo === 'unknown' && results.afterCopy === 'unknown');
  check('明确部分记录独立保存', results.partial === 'partial');
  check('非法训练扩展字段拒绝恢复且原记录未改', results.rejected && results.intact);
  await tab('饮食');
  await page.getByLabel('全天饮食记录完整度').selectOption('partial');
  await page.getByText('已更新记录完整度', { exact: true }).waitFor();
  check('饮食页可修改日级完整度', await page.evaluate(async () => (await import('/js/lib/store.js')).dietQualityFor().status) === 'partial');
  await tab('健身'); await page.getByRole('tab', { name: '本次训练', exact: true }).click();
  await page.getByRole('button', { name: '添加动作', exact: true }).click();
  await page.getByRole('tab', { name: '推荐', exact: true }).click();
  await page.getByLabel('本次组数预算', { exact: true }).selectOption('3');
  check('已安排动作占预算，不继续机械补推荐', await page.locator('.rec-picks .ex-name').count() === 0);
  await page.getByLabel('本次组数预算', { exact: true }).selectOption('9');
  check('增加预算后可查看有理由的候选', await page.locator('.rec-reason').count() > 0);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    check(`${width}px 推荐预算与候选无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.training-budget,.rec-picks')].every(el => el.scrollWidth <= el.clientWidth + 1)));
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    const root = document.documentElement, style = getComputedStyle(root);
    const names = ['--fs-caption','--fs-footnote','--fs-subhead','--fs-body','--fs-headline','--fs-title','--fs-display'];
    const sizes = names.map(name => [name, parseFloat(style.getPropertyValue(name))]);
    sizes.forEach(([name, size]) => { if (Number.isFinite(size)) root.style.setProperty(name, `${size * 2}px`); });
  });
  check('200% 字号推荐预算表单无横向溢出', await page.locator('.training-budget').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  const output = process.env.ARTIFACT_DIR;
  if (output) { await fs.mkdir(output, { recursive: true }); await page.screenshot({ path: `${output}/recommend-200.png`, fullPage: true }); }
  await page.evaluate(async () => (await import('/js/lib/sheet.js')).closeSheet({ force: true }));
  await page.getByRole('button', { name: '再加一组', exact: true }).click();
  await draft.getByLabel('待确认时长（秒）', { exact: true }).scrollIntoViewIfNeeded();
  check('200% 字号记组表无横向溢出', await draft.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  if (output) await page.screenshot({ path: `${output}/training-200.png`, fullPage: true });
  const cleared = await page.evaluate(async () => {
    const s = await import('/js/lib/store.js'); await s.clearAllData();
    return s.state.trainingDays.length === 0 && s.state.dietRawEntries.length === 0 && s.state.dietLogStatuses.size === 0;
  });
  check('清空数据同时清理训练与饮食完整度内存，不残留旧记录', cleared);
  await page.evaluate(async () => (await import('/js/lib/store.js')).saveTraining('2026-09-13', { items: [{ id: 'dip_chest', sets: [] }] }));
  check('清空后重新安排同一动作不会带回旧草稿', await page.locator('.training-set-draft').count() === 0);
  check('运行时无 JS 错误', errors.length === 0);
  console.log(`${checks} checks passed`);
} finally { await browser.close(); }
