/** 隔离的合成数据：验证实际保存、练法并存、日期选择与手机文字可读性。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.route('https://**/*', route => route.abort());
await page.clock.install({ time: new Date('2026-09-13T14:00:00+08:00') });
let checks = 0;
const check = (message, value) => { assert.ok(value, message); console.log('✓ ' + message); checks++; };
const output = process.env.ARTIFACT_DIR || '/tmp/training-simple';
await fs.mkdir(output, { recursive: true });
const screenshot = name => page.screenshot({ path: `${output}/${process.env.BROWSER || 'chromium'}-${name}.png`, fullPage: true, animations: 'disabled' });
const items = () => page.evaluate(async () => (await import('/js/lib/store.js')).trainingFor('2026-09-13').items);
const readableValues = () => page.locator('.training-value-cell input').evaluateAll(inputs => inputs.every(input => {
  const style = getComputedStyle(input), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return ctx.measureText(input.value).width <= input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) + 1;
}));
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8080');
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js'), t = await import('/js/core/training.js');
    await s.saveProfile({ goal: 'maintain', birthday: '1996-01-01', weightKg: 70, heightCm: 175, sex: 'male', useAppleEnergy: false, onboarded: true, demoMode: false });
    await s.saveTraining('2026-09-12', { items: [{ id: 'back_extension', sets: [{ reps: 10, weightKg: null }] }] });
    await s.saveTraining('2026-09-13', { items: ['lateral_raise_db','back_extension'].map(id => t.newTrainingItem(id, [], '2026-09-13')) });
  });
  await page.locator('.tab').filter({ hasText: '健身' }).click();
  const lateral = page.locator('.plan-row-wrap').filter({ hasText: '哑铃侧平举' });
  await lateral.getByRole('button', { name: '记组', exact: true }).click();
  await page.getByRole('button', { name: '加第一组', exact: true }).click();
  await page.getByLabel('待确认重量（kg）', { exact: true }).fill('8');
  await page.getByLabel('待确认次数', { exact: true }).fill('12');
  await page.getByLabel('本次记录组数', { exact: true }).selectOption('3');
  check('选择多组仍然只是草稿', (await items())[0].sets.length === 0);
  await page.getByRole('button', { name: '确认记录 3 组', exact: true }).click();
  await page.getByText('已记录 3 组', { exact: true }).waitFor();
  check('一次确认三组独立记录并采用动作重量口径', (await items())[0].sets.every(s => s.reps === 12 && s.weightKg === 8 && s.loadConvention === 'single' && s.setType === 'work'));
  await page.getByRole('button', { name: '再加一组', exact: true }).click();
  check('下一组沿用重量与次数', await page.getByLabel('待确认重量（kg）', { exact: true }).inputValue() === '8' && await page.getByLabel('待确认次数', { exact: true }).inputValue() === '12');
  await screenshot('sets-390');
  await page.getByRole('button', { name: '哑铃侧平举 记录设置', exact: true }).click();
  await page.getByLabel('重量单位与口径', { exact: true }).selectOption('total');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  /*
   * 「保存设置」的 onclick 是 async：click() 把事件派出去就返回，落库、改草稿、
   * 关弹层、重绘全排在它后面。紧接着断言草稿里的重量已经清空，就是在跟 IndexedDB
   * 赛跑 —— 本地连跑八次红两次，CI 上同一份代码前一个提交是绿的。
   * 关弹层是这段处理的最后一步（closeSheet 之后紧跟 rerenderTraining），
   * 所以等弹层消失就等到了重绘。下面那两处 selectOption 之后的按钮各自只在
   * 重绘后才存在，Playwright 自己会等，不用再加闸。
   */
  await page.locator('.sheet-wrap').waitFor({ state: 'hidden' });
  check('更改口径只影响后续草稿，旧组保持原值', (await items())[0].sets.every(s => s.loadConvention === 'single') && await page.getByLabel('待确认重量（kg）', { exact: true }).inputValue() === '');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('.plan-row-wrap').filter({ hasText: '山羊挺身' }).getByRole('button', { name: '记组', exact: true }).click();
  await page.getByRole('button', { name: '加第一组', exact: true }).click();
  await page.getByLabel('待确认次数', { exact: true }).fill('10');
  await page.getByRole('button', { name: '确认记录这一组', exact: true }).click();
  await page.getByText('已记录 1 组', { exact: true }).waitFor();
  await page.getByRole('button', { name: '山羊挺身 记录设置', exact: true }).click();
  await page.getByLabel('练法', { exact: true }).selectOption('back_extension_hip');
  await screenshot('variant-settings');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await page.getByRole('button', { name: '加第一组', exact: true }).click();
  await page.getByLabel('待确认次数', { exact: true }).fill('12');
  await page.getByLabel('本次记录组数', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '确认记录 2 组', exact: true }).click();
  await page.getByText('已记录 2 组', { exact: true }).waitFor();
  const saved = await items();
  check('同日不同练法分别保留，原记录不被替换', saved.find(i => i.id === 'back_extension').sets.length === 1 && saved.find(i => i.id === 'back_extension_hip').sets.length === 2);

  /*
   * 「已录负荷量」那个 ⓘ 贴在卡片最底下，它的说明层必须落在**看得见**的地方。
   *
   * placeInfoTip 原先只按视口底边夹，而应用外壳底下钉着四栏导航 —— 面板会滑到
   * 它后面：实测面板 755–816，底栏顶在 779，最后 37px 一个字都读不到。
   * 这条量的是「和底栏、顶栏都不重叠」，不是「在视口里」，后者当时也是真的。
   */
  // 必须把它滚到底栏跟前才复现得出那个几何：卡片短的时候面板落在半空中，
  // 修不修都是绿的（第一版就是这么写的，撤掉修复照样过）。
  await page.locator('.training-load-note').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const view = document.querySelector('.view');
    const note = document.querySelector('.training-load-note').getBoundingClientRect();
    const barTop = document.querySelector('.tabbar').getBoundingClientRect().top;
    view.scrollTop += note.bottom - (barTop - 24);
  });
  await page.waitForTimeout(200);
  await page.locator('.training-load-note .info-tip > summary').click();
  await page.waitForTimeout(300);
  const tipBox = await page.evaluate(() => {
    const p = document.querySelector('.training-load-note .info-tip-panel').getBoundingClientRect();
    const bar = document.querySelector('.tabbar')?.getBoundingClientRect();
    const head = document.querySelector('.topbar')?.getBoundingClientRect();
    return { top: Math.round(p.top), bottom: Math.round(p.bottom), left: Math.round(p.left), right: Math.round(p.right),
      barTop: bar ? Math.round(bar.top) : null, headBottom: head ? Math.round(head.bottom) : null,
      vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight };
  });
  check(`底部那条说明不躲到横条后面（面板 ${tipBox.top}–${tipBox.bottom}，底栏顶 ${tipBox.barTop}）`,
    tipBox.bottom <= tipBox.barTop && tipBox.top >= tipBox.headBottom
    && tipBox.left >= 0 && tipBox.right <= tipBox.vw && tipBox.top >= 0);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: '训练记录', exact: true }).click();
  check('七个日期只展开当天', await page.locator('.training-date').count() === 7 && await page.locator('.training-log-day').count() === 1 && await page.locator('.log-row').count() === 3);
  await screenshot('history-390');
  await page.getByRole('button', { name: '2026-09-12 有训练记录', exact: true }).click();
  check('切换日期只显示该日动作', await page.locator('.log-row').count() === 1);
  await page.getByRole('button', { name: '2026-09-11 暂无记录', exact: true }).click();
  check('空日期明确显示暂无记录', await page.getByText('这一天暂无训练记录。', { exact: true }).isVisible());
  await page.getByRole('button', { name: '查看腿训练详情', exact: true }).click();
  check('部位详情列出肌群和真实动作来源', await page.locator('.training-area-sheet').getByText('臀大肌', { exact: true }).isVisible() && await page.locator('.training-area-sheet').getByText('山羊挺身（臀腿侧重）', { exact: true }).isVisible());
  await screenshot('area-detail');
  // 公共弹层保留 700ms 防误触关闭窗口，与真实用户看完详情再关闭一致。
  await page.waitForTimeout(800);
  /*
   * 弹层头上那枚关闭叉已经撤掉（下滑、点背景、Esc 三条路都在）。
   * 这里改按 Esc，顺带把「撤掉叉之后还出得来」这件事本身钉住 ——
   * 一个关不掉的弹层会把整个应用堵死。
   */
  check('弹层头上没有关闭叉', await page.locator('.sheet').getByRole('button', { name: /关闭|取消/ }).count() === 0);
  await page.keyboard.press('Escape');
  await page.locator('.sheet-wrap').waitFor({ state: 'hidden' });
  check('撤掉关闭叉之后 Esc 仍然关得掉弹层', true);
  await page.getByRole('button', { name: '间隔', exact: true }).click();
  check('臀腿练法参与腿部训练间隔', (await page.locator('[data-group="leg"]').innerText()).includes('今天'));
  const roundtrip = await page.evaluate(async () => {
    const db = await import('/js/lib/db.js'), s = await import('/js/lib/store.js');
    const before = await db.exportAll(); await db.clearAllStores(); await db.importAll(before); await s.reloadStoreFromDB();
    return JSON.stringify(before.training) === JSON.stringify((await db.exportAll()).training);
  });
  check('新设置、练法快照和旧未知记录经真实备份恢复不变', roundtrip);
  await page.locator('.tab').filter({ hasText: '今日' }).click();
  check('今日页没有记体重卡片', await page.locator('.quick-weight-card').count() === 0);
  await page.locator('.tab').filter({ hasText: '数据' }).click();
  check('数据页不提供手动记体重', await page.getByRole('button', { name: '记体重', exact: true }).count() === 0);
  await page.locator('.tab').filter({ hasText: '健身' }).click();
  await page.getByRole('tab', { name: '本次训练', exact: true }).click();
  await lateral.getByRole('button', { name: '记组', exact: true }).click();
  await page.getByRole('button', { name: '再加一组', exact: true }).click();
  await page.getByLabel('待确认重量（kg）', { exact: true }).fill('120.5');
  await page.getByLabel('待确认次数', { exact: true }).fill('120');
  for (const width of [320,390,430]) {
    await page.setViewportSize({ width, height: 844 });
    check(`${width}px 组表与输入框没有横向溢出`, await page.locator('.training-sets-table').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    check(`${width}px 重量和次数文字完整显示`, await readableValues());
    await page.locator('.training-set-draft').scrollIntoViewIfNeeded();
    await screenshot(`sets-${width}`);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    const root = document.documentElement, style = getComputedStyle(root);
    for (const key of ['display','title','headline','value','body','footnote','caption']) {
      const prop = '--fs-' + key; root.style.setProperty(prop, parseFloat(style.getPropertyValue(prop)) * 2 + 'px');
    }
  });
  check('200% 字号组表保持可操作', await page.locator('.training-sets-table').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.locator('.training-set-draft').scrollIntoViewIfNeeded();
  check('200% 字号重量和次数文字完整显示', await readableValues());
  await screenshot('sets-200');
  await page.getByRole('tab', { name: '训练记录', exact: true }).click();
  check('200% 字号日期与统计没有横向溢出', await page.evaluate(() => [...document.querySelectorAll('.training-date-strip,.training-week-groups')].every(el => el.scrollWidth <= el.clientWidth + 1)));
  await screenshot('history-200');
  check('无浏览器运行错误', errors.length === 0);
  console.log(`\n${checks} 项通过`);
} catch (error) {
  await screenshot('failure');
  console.error(errors);
  throw error;
} finally { await browser.close(); }
