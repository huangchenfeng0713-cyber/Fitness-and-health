/**
 * 「把数据变成建议」那三块的浏览器冒烟：本次目标（双重渐进）、周组数对照、每周复盘。
 *
 * 合成一个增肌用户的四周：卧推上次三组都做满 12 次，体重每周只涨 0.07kg、饮食基本按目标吃。
 * 单元测试覆盖了每条规则；这里量的是它们真的落到了屏幕上、按下去真的写对了库 ——
 * 「采用：每天多吃 150」存完目标反而少了 150、撤销后目标回不到原来，这两个都是
 * 单元测试全绿时在浏览器里才看得见的。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
const page = await context.newPage();
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
await page.route('https://**/*', (route) => route.abort());
await page.clock.install({ time: new Date('2026-09-29T19:30:00+08:00') });
let checks = 0;
const check = (message, value) => { assert.ok(value, message); console.log('✓ ' + message); checks++; };
const output = process.env.ARTIFACT_DIR || '/tmp/coach-smoke';
await fs.mkdir(output, { recursive: true });
const screenshot = (name) => page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' });
const tab = async (label) => { await page.locator('.tab').filter({ hasText: label }).click(); await page.waitForTimeout(300); };
const store = (fn) => page.evaluate(fn);
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8080');
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    const u = await import('/js/lib/utils.js');
    const db = await import('/js/lib/db.js');
    const today = u.todayKey();
    await s.saveProfile({ goal: 'bulk', birthday: '1996-03-02', weightKg: 70, heightCm: 175, sex: 'male', activity: 'moderate', rateKgPerWeek: 0.25, useAppleEnergy: true, onboarded: true, demoMode: false });
    // 档案那次保存挪到六周前：不然复盘会以为「今天刚改过计划」
    const old = `${u.shiftDay(today, -40)}T08:00:00.000Z`;
    const profile = { ...s.state.profile, targetVersions: s.state.profile.targetVersions.map((v) => ({ ...v, effectiveDate: u.shiftDay(today, -40), savedAt: old, id: old })) };
    await db.setSetting('profile', profile);
    s.state.profile = profile;
    const rows = [];
    for (let i = 30; i >= 0; i -= 1) {
      const date = u.shiftDay(today, -i);
      const row = { date, steps: 8000 };
      if (i % 2 === 0) row.weightKg = Math.round((70 + ((30 - i) / 7) * 0.07 + Math.sin(i * 1.3) * 0.15) * 10) / 10;
      if (i > 0) { row.activeEnergy = 540; row.restingEnergy = 1670; row.energyObservedAt = `${u.shiftDay(date, 1)}T00:00:00+08:00`; }
      rows.push(row);
    }
    await s.mergeHealthDays(rows, { sourceFormat: 'json', fullSnapshot: false });
    for (let i = 27; i >= 1; i -= 1) {
      if (i % 6 === 0) continue;
      const date = u.shiftDay(today, -i);
      await s.setDay(date);
      await s.addEntry({ foodId: 'chicken_breast', grams: 250, meal: 'lunch' });
      await s.addEntry({ foodId: 'egg_whole', grams: 150, meal: 'breakfast' });
      const plan = s.planForProfile(s.state.profile, date).kcal;
      const eaten = s.state.dietEntries.reduce((sum, e) => sum + (Number(e.kcal) || 0), 0);
      await s.addEntry({ foodId: 'rice_white', grams: Math.round((plan - eaten) / 1.16), meal: 'dinner' });
    }
    await s.setDay(today);
    const set = (w, r, extra = {}) => ({ reps: r, weightKg: w, completed: true, setType: 'work', loadMode: 'external', loadConvention: 'total', ...extra });
    for (let wk = 0; wk < 4; wk += 1) {
      const d = 27 - wk * 7;
      const reps = [[10, 10, 9], [11, 10, 10], [12, 11, 11], [12, 12, 12]][wk];
      await s.saveTraining(u.shiftDay(today, -d), { items: [
        { id: 'bench_press_bb', done: true, sets: [set(40, 10, { setType: 'warmup' }), ...reps.map((r) => set(60, r))] },
        { id: 'triceps_pushdown', done: true, sets: [set(25, 12), set(25, 12)] }] });
      await s.saveTraining(u.shiftDay(today, -(d - 2)), { items: [
        { id: 'lat_pulldown', done: true, sets: [set(50 + wk * 2.5, 10), set(50 + wk * 2.5, 9)] }] });
      await s.saveTraining(u.shiftDay(today, -(d - 4)), { items: [
        { id: 'squat_bb', done: true, sets: [set(80 + wk * 2.5, 8), set(80 + wk * 2.5, 8)] }] });
    }
    await s.saveTraining(today, { items: [{ id: 'bench_press_bb', sets: [] }, { id: 'lateral_raise_db', sets: [] }] });
  });

  /* ------------------------------------------------ 本次目标 ------------- */
  await tab('健身');
  const bench = page.locator('.plan-row-wrap').filter({ hasText: '杠铃卧推' });
  check('收起的那一行就写着本次目标', (await bench.locator('.plan-target').textContent()) === '目标62.5kg · 每组至少 8次');
  check('没练过的动作不编目标', await page.locator('.plan-row-wrap').filter({ hasText: '哑铃侧平举' }).locator('.plan-target').count() === 0);
  await bench.getByRole('button', { name: '记组', exact: true }).click();
  const block = page.locator('.progression');
  check('依据写出上次每组都到了区间上限', /上次 09-23 · 60kg × 12,12,12，都到了 12次（8–12 的上限），加 2\.5kg/.test(await block.textContent()));
  check('力量趋势按估算 1RM 报起止', /近 3 周力量在涨 · 估算 1RM \d+ → \d+kg（\+\d+%）/.test((await block.locator('.progression-trend').textContent()).replace(/\s+/g, ' ')));
  await page.getByRole('button', { name: '加第一组', exact: true }).click();
  const weightInput = page.getByLabel('待确认重量（kg）', { exact: true });
  const repsInput = page.getByLabel('待确认次数', { exact: true });
  check('第一组草稿预填本次目标', await weightInput.inputValue() === '62.5' && await repsInput.inputValue() === '8');
  await repsInput.fill('9');
  await page.getByRole('button', { name: '确认记录这一组', exact: true }).click();
  await page.waitForTimeout(300);
  const saved = await store(async () => (await import('/js/lib/store.js')).trainingFor((await import('/js/lib/utils.js')).todayKey()).items.find((i) => i.id === 'bench_press_bb').sets);
  check('确认后才写库，写的是改过的数', saved.length === 1 && saved[0].weightKg === 62.5 && saved[0].reps === 9 && saved[0].setType === 'work');
  await page.getByRole('button', { name: '再加一组', exact: true }).click();
  check('下一组沿用今天的重量', await weightInput.inputValue() === '62.5');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await screenshot('target');

  // 在「设置」里换次数区间，目标跟着换
  await page.getByRole('button', { name: '杠铃卧推 记录设置', exact: true }).click();
  await page.getByLabel('目标次数区间', { exact: true }).selectOption('6-10');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await page.waitForTimeout(400);
  check('次数区间改成 6–10 后，目标按新区间给', /每组至少 6次/.test(await bench.locator('.plan-target').textContent()));

  /* ------------------------------------------------ 周组数 ------------- */
  const advice = page.locator('.training-advice');
  const tipTitle = await advice.locator('.insight-title').first().textContent();
  check('训练建议先说这周哪儿练得少', /^今天可以补一下/.test(tipTitle));
  const addButton = advice.locator('.tip-action', { hasText: '加入：' }).first();
  const before = await store(async () => (await import('/js/lib/store.js')).trainingFor((await import('/js/lib/utils.js')).todayKey()).items.length);
  await addButton.click();
  await page.waitForTimeout(400);
  const after = await store(async () => (await import('/js/lib/store.js')).trainingFor((await import('/js/lib/utils.js')).todayKey()).items.length);
  check('「加入」直接进本次训练', after === before + 1);
  await page.locator('.toast button', { hasText: '撤销' }).click();
  await page.waitForTimeout(400);
  check('加入可以撤销', await store(async () => (await import('/js/lib/store.js')).trainingFor((await import('/js/lib/utils.js')).todayKey()).items.length) === before);

  await page.getByRole('tab', { name: '训练记录', exact: true }).click();
  await page.waitForTimeout(300);
  const rows = page.locator('.volume-row[data-status]');
  check('组数一栏按十个肌群对照参考', await rows.count() === 10);
  check('协同算半组：三头有 .5', /\d+(\.5)? 组/.test(await rows.filter({ hasText: '三头' }).locator('.volume-value').textContent()));
  const inside = await page.locator('.volume-bar').evaluateAll((bars) => bars.every((bar) => {
    const dot = bar.querySelector('.volume-dot').getBoundingClientRect();
    const box = bar.getBoundingClientRect();
    return dot.left >= box.left - 0.5 && dot.right <= box.right + 0.5;
  }));
  check('圆点都收在轨道里（0 组不探出去）', inside);
  await screenshot('volume');

  /* ------------------------------------------------ 每周复盘 ------------- */
  await tab('数据');
  const review = page.locator('.weekly-review-card');
  const first = review.locator('.review-item').first();
  check('复盘第一条：按目标吃了却涨得慢，建议多吃 150', (await first.locator('.insight-title').textContent()) === '每天多吃 150 kcal');
  check('依据写出体重速度和饮食执行', /近 \d 周体重 \+0\.\d+ ± [\d.]+ kg\/周，计划 \+0\.25，涨得比计划慢；有记录的 \d+ 天里/.test(await first.textContent()));
  const target = () => store(async () => {
    const s = await import('/js/lib/store.js'); const u = await import('/js/lib/utils.js');
    return { kcal: s.planForProfile(s.state.profile, u.todayKey()).kcal, versions: s.state.profile.targetVersions.length, adjust: s.state.profile.tdeeAdjustKcal };
  });
  const start = await target();
  await first.locator('.review-apply').click();
  await page.waitForTimeout(500);
  const adopted = await target();
  check('采用后今天的目标正好多 150（旧计划存得早也不跑偏）', adopted.kcal - start.kcal === 150 && adopted.versions === start.versions + 1);
  check('采用完这一条换成「照新目标再吃」', (await review.locator('.review-item').first().locator('.insight-title').textContent()) === '照新目标再吃 14 天');
  await screenshot('review');
  await page.locator('.toast button', { hasText: '撤销' }).click();
  await page.waitForTimeout(500);
  const undone = await target();
  check('撤销把整份档案放回去：目标、版本、校正都回到原样', undone.kcal === start.kcal && undone.versions === start.versions && undone.adjust === start.adjust);

  // 身体信息里看得见、清得掉
  await first.locator('.review-apply').click();
  await page.waitForTimeout(400);
  await page.locator('.topbar-settings-btn').click();
  await page.waitForTimeout(300);
  await page.locator('.settings-row, .set-row, button').filter({ hasText: '身体与目标' }).first().click();
  await page.waitForTimeout(300);
  check('身体信息里写着消耗校正的来历', /消耗校正 \+\d+ kcal\/天 · 来自每周复盘/.test(await page.locator('.tdee-adjust-row').textContent()));

  check('无浏览器运行错误', errors.length === 0);
  console.log(`\n${checks} 项通过`);
} catch (error) {
  await screenshot('failure');
  console.error(errors);
  throw error;
} finally { await browser.close(); }
