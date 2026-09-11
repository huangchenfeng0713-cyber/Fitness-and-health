/** Training B pilot: isolated synthetic data, recommendation lifecycle and accessible layout. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
const page = await context.newPage();
await page.clock.install({ time: new Date('2026-09-08T12:00:00+08:00') });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('https://**/*', route => route.abort());
let checks = 0;
const check = (label, value) => { assert.ok(value, label); console.log('✓ ' + label); checks++; };
const current = () => page.getByRole('tab', { name: '本次训练', exact: true }).click();
const history = () => page.getByRole('tab', { name: '训练记录', exact: true }).click();
const items = () => page.evaluate(async () => { const s = await import('/js/lib/store.js'); const u = await import('/js/lib/utils.js'); return s.trainingFor(u.todayKey()).items; });
const open = async () => { await page.locator('.training-add').click(); await page.waitForTimeout(750); };
const close = async () => { await page.getByRole('button', { name: '关闭动作选择' }).click(); await page.waitForTimeout(300); };
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8080');
  await page.waitForFunction(() => document.querySelector('.tab') && !document.querySelector('.account-data-lock'));
  await page.locator('.tab').filter({ hasText: '健身' }).click();
  check('空计划突出添加操作，无其他模块档案提示', await page.locator('.training-add').isVisible() && await page.locator('.training-coverage').count() === 0);
  await open();
  check('弹窗隔离背景并将焦点移入', await page.evaluate(() => document.querySelector('#app').inert && document.querySelector('.sheet').contains(document.activeElement)));
  await page.locator('.ex-row').first().click();
  check('点击动作行不意外选中', await page.locator('.ex-row.marked').count() === 0);
  await page.keyboard.press('Shift+Tab');
  check('倒序 Tab 焦点仍在弹窗内', await page.evaluate(() => document.querySelector('.sheet').contains(document.activeElement)));
  /*
   * 两个下拉（挑法 / 细分部位）选完之后，焦点不许被送回任何一个 `<select>`。
   *
   * 焦点对别的控件是个被动状态，对 `<select>` 是个动作：手机上 focus() 一个 select
   * 会把原生选择器再弹一次 —— 而这张卡每次重绘都是整棵树拆了重建，于是选完一个值
   * 选择器立刻又弹出来，再选一次同样的才收得掉（值没变、不触发 change、不重绘）。
   * 第二条更隐蔽：iOS 上点 `<button>` 不夺焦点，焦点会滞留在上次动过的那个 select 上，
   * 于是接着点部位、点器械、点「推荐」都会把那个下拉重新弹出来一次。
   */
  const focusedTag = () => page.evaluate(() => document.activeElement?.tagName || '');
  await page.locator('.picker-mode-select').focus();
  await page.locator('.picker-mode-select').selectOption('split');
  await page.waitForTimeout(200);
  check('改完挑法下拉，焦点没有被送回 select', await focusedTag() !== 'SELECT');
  await page.locator('.picker-target-select').focus();
  await page.evaluate(() => document.querySelector('.picker-scope-switch .chip-btn.active')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(200);
  check('焦点滞留在下拉上时，点别的控件也不会把它弹回来', await focusedTag() !== 'SELECT');
  await page.locator('.picker-view-switch').getByRole('tab', { name: '推荐', exact: true }).click();
  const batch = await page.locator('.rec-picks .ex-name').allTextContents();
  check('推荐候选按模式给出并设上限', batch.length > 0 && batch.length <= 6);
  await page.locator('.rec-picks .ex-pick').first().click();
  check('单选只加入待选且不补新候选', (await items()).length === 0 && JSON.stringify(batch) === JSON.stringify(await page.locator('.rec-picks .ex-name').allTextContents()));
  await page.getByRole('button', { name: /选择本批剩余/ }).click();
  check('全选仍保持同一批且未落库', (await items()).length === 0 && await page.locator('.rec-picks .ex-pick[aria-pressed="true"]').count() === batch.length);
  await page.evaluate(() => {
    window.originalTrainingPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (/training/i.test(this.name)) throw new DOMException('Synthetic failure', 'QuotaExceededError');
      return window.originalTrainingPut.apply(this, args);
    };
  });
  await page.locator('.training-select-bar .select-bar-go').click();
  await page.waitForTimeout(250);
  check('保存失败保留待选和弹窗，按钮可重试', (await items()).length === 0 && await page.locator('.training-select-bar .select-bar-go').isEnabled() && await page.locator('.rec-picks .ex-pick[aria-pressed="true"]').count() === batch.length);
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalTrainingPut; });
  await page.locator('.training-select-bar .select-bar-go').click();
  await page.waitForFunction(() => !document.querySelector('#app').inert);
  check('确认一次加入并返回记组页面', (await items()).length === batch.length && await page.locator('.plan-row').count() === batch.length);
  /*
   * 加错了要拿得下来，而且两条路都得通。
   *
   * 上一版两条路都堵着：动作行右边只有「记组」，移除藏在展开层的第三个按钮里；
   * 挑选弹层里已加入的那一行是一枚 `disabled` 的绿勾，点了没有任何反应 ——
   * 而「刚加错了想撤掉」正是人回到那一页最常见的理由，读出来就是
   * 「加进去的动作根本删不掉」。
   */
  const removedName = (await page.locator('.plan-row .ex-name').first().textContent()).trim();
  await page.locator('.plan-remove').first().click();
  await page.waitForTimeout(250);
  check('动作行上就能移除，不用先展开记组', (await items()).length === batch.length - 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForTimeout(250);
  check('移除可撤销，且放回原来的位置', (await items()).length === batch.length
    && (await page.locator('.plan-row .ex-name').first().textContent()).trim() === removedName);
  await open();
  await page.fill('.exercise-search-input', removedName);
  await page.waitForTimeout(200);
  const chosenPick = page.locator('.exercise-search-results .ex-row.chosen .ex-pick').first();
  check('弹层里已加入那一行的 ✓ 是能点的，不是个死勾', await chosenPick.isEnabled());
  await chosenPick.click();
  await page.waitForTimeout(300);
  check('在弹层里点 ✓ 就把它移出本次训练', (await items()).length === batch.length - 1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForTimeout(300);
  check('弹层里移出同样能撤销', (await items()).length === batch.length);
  await page.fill('.exercise-search-input', '');
  await page.waitForTimeout(200);
  await page.locator('.picker-view-switch').getByRole('tab', { name: '推荐', exact: true }).click();
  check('主动重开后，已安排模式不会自动补齐六个', await page.locator('.rec-picks .ex-row').count() === 0);
  await close();
  check('关闭选择器后焦点回到添加入口', await page.locator('.training-add').evaluate(el => el === document.activeElement));
  /*
   * 文字外框不许比字大出一截。
   *
   * v3.16.0 在样式表末尾拿一个新的 44px token 通栏压过控件高度阶梯，实测：
   * 13px 的分段控件撑成 44（全应用其余地方 36）、14px 的 ⓘ 记号被拉成 44×44
   * （其余地方 14，热区靠 ::after 撑，不靠把画出来的东西撑大）、
   * 一枚 12px 的「模式相近」躺在 44px 的盒子里，带这条提示的动作行
   * 从 65px 涨到 113px。命中尺寸和视觉体量是两件事，这里逐样量回阶梯。
   */
  // 量最高的那一个：同一类控件只要有一处被撑大就算漏了。
  // 量不到（null）也算漏 —— 那说明这一条根本没测到东西，不是「没问题」。
  const measure = () => page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const box = (sel) => {
      const all = [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length);
      return all.length ? +Math.max(...all.map((el) => el.getBoundingClientRect().height)).toFixed(1) : null;
    };
    const clash = document.querySelector('.ex-clash-slot.ex-clash');
    return {
      sm: parseFloat(root.getPropertyValue('--control-sm')),
      info: parseFloat(root.getPropertyValue('--info-size')),
      chip: box('.training-picker .picker-scope-switch .chip-btn'),
      mode: box('.picker-mode-select'),
      equip: box('.equip-filter-btn'),
      tip: box('.training-panel .info-tip > summary'),
      clash: clash && { h: +clash.getBoundingClientRect().height.toFixed(1), line: parseFloat(getComputedStyle(clash).lineHeight) },
    };
  });
  // ⓘ 在「部位训练间隔」那张卡上一定有一个；挑选器的控件要弹层开着才量得到
  await history();
  const onPage = await measure();
  await current();
  await open();
  const inSheet = await measure();
  const over = (got, limit) => got == null || got > limit;
  const tooBig = [
    over(inSheet.chip, inSheet.sm + 1) && `分段控件 ${inSheet.chip}（阶梯是 ${inSheet.sm}）`,
    over(inSheet.mode, inSheet.sm + 1) && `挑法下拉 ${inSheet.mode}`,
    // 器械档位多一圈描边和一档 padding-block，档位名换行时要撑得开
    over(inSheet.equip, inSheet.sm + 4) && `器械档位 ${inSheet.equip}`,
    over(onPage.tip, onPage.info + 1) && `ⓘ 记号 ${onPage.tip}（阶梯是 ${onPage.info}）`,
    inSheet.clash && inSheet.clash.h > inSheet.clash.line * 1.5
      && `重复提示 ${inSheet.clash.h}（一行是 ${inSheet.clash.line}）`,
  ].filter(Boolean);
  check(`健身页的控件仍在高度阶梯上，文字外框没有被撑大${tooBig.length ? '：' + tooBig.join('，') : ''}`, tooBig.length === 0);
  await close();
  // Reproduce browsers that do not enumerate a retained exit effect after hiding.
  // Explicit animation handles must release fill:forwards independently of enumeration.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.sheet, .sheet-backdrop')) {
      el.originalGetAnimations = el.getAnimations;
      el.getAnimations = () => [];
    }
  });
  await open(); await close(); await open();
  check('退场动画不可枚举时，重开仍在可见视口', await page.locator('.sheet').evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight + 1;
  }));
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.sheet, .sheet-backdrop')) el.getAnimations = el.originalGetAnimations;
  });
  await close();
  await history();
  check('零组计划不算训练记录，单独折叠', await page.locator('.training-log-day').count() === 0 && await page.locator('.training-planned').count() === 1 && !await page.locator('.training-planned').getAttribute('open'));
  await current();
  await page.locator('.plan-row button').first().click();
  await page.getByRole('button', { name: '加第一组', exact: true }).click();
  await page.locator('.set-input[placeholder="次数"]').fill('8');
  await page.locator('.set-input[placeholder="次数"]').blur();
  await page.waitForTimeout(250);
  await history();
  check('填写有效组后记录与部位间隔同步', await page.locator('.training-log-day .log-row').count() === 1 && /今天/.test(await page.locator('.training-coverage').textContent()));
  await current();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await page.waitForTimeout(150);
  check('取消清空保留原记录', (await items()).length === batch.length);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.plan-row'));
  await page.evaluate(async () => { const s = await import('/js/lib/store.js'); const u = await import('/js/lib/utils.js'); await s.saveTraining(u.todayKey(), { items: [{ id: 'squat_bb', sets: [{ reps: 5, weightKg: 30 }], done: false }] }); });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForTimeout(200);
  check('撤销清空保留期间新增动作及组数', (await items()).length === batch.length + 1 && (await items()).find(item => item.id === 'squat_bb').sets[0].weightKg === 30);
  await page.getByRole('tab', { name: '本次训练', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  check('分段控件方向键切换并保留焦点', await page.getByRole('tab', { name: '训练记录', exact: true }).getAttribute('aria-selected') === 'true' && await page.getByRole('tab', { name: '训练记录', exact: true }).evaluate(el => el === document.activeElement));
  // Record replacement requires explicit confirmation and preserves the original for undo.
  await page.evaluate(async () => { const s = await import('/js/lib/store.js'); const u = await import('/js/lib/utils.js'); await s.saveTraining(u.todayKey(), { items: [{ id: 'bench_press_bb', sets: [{ reps: 8, weightKg: 40 }], done: false }, { id: 'bench_press_db', sets: [{ reps: 10, weightKg: 20 }], done: false }] }); });
  await current();
  await page.locator('.training-advice > summary').click();
  const beforeReplacement = await items();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('.tip-action').first().click();
  check('取消替换保留所有组记录', JSON.stringify(await items()) === JSON.stringify(beforeReplacement));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.tip-action').first().click();
  await page.waitForTimeout(200);
  check('确认替换的新动作从空组开始', (await items()).some(item => !beforeReplacement.some(old => old.id === item.id) && item.sets.length === 0));
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForTimeout(200);
  check('撤销替换恢复原动作与全部组记录', JSON.stringify(await items()) === JSON.stringify(beforeReplacement));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.tip-action').first().click();
  await page.waitForTimeout(200);
  const replacementId = (await items()).find(item => !beforeReplacement.some(old => old.id === item.id)).id;
  await page.evaluate(async id => {
    const s = await import('/js/lib/store.js'); const u = await import('/js/lib/utils.js');
    await s.saveTraining(u.todayKey(), { items: s.trainingFor(u.todayKey()).items.map(item => item.id === id ? { ...item, sets: [{ reps: 6, weightKg: 55 }] } : item) });
  }, replacementId);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.waitForTimeout(150);
  check('新动作已记录时拒绝撤销覆盖', (await items()).find(item => item.id === replacementId)?.sets[0].weightKg === 55 && /未覆盖/.test(await page.locator('.toast').textContent()));
  await page.evaluate(async entries => { const s = await import('/js/lib/store.js'); const u = await import('/js/lib/utils.js'); await s.saveTraining(u.todayKey(), { items: entries }); }, beforeReplacement);
  if (process.env.ARTIFACT_DIR) await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const mode of ['current', 'history', 'picker']) {
      await current();
      if (mode === 'history') await history();
      if (mode === 'picker') await open();
      if (mode === 'picker') {
        const choice = page.locator('.ex-row:not(.chosen):not(.marked) .ex-pick').first();
        // Scroll the actual sheet, without asking older Chromium to scroll every clipped ancestor.
        // The subsequent real click still verifies visibility, hit testing and enabled state.
        await choice.evaluate(el => {
          const scroll = el.closest('.sheet-scroll');
          const rect = el.getBoundingClientRect(), bounds = scroll.getBoundingClientRect();
          scroll.scrollTop += rect.top - bounds.top - scroll.clientHeight / 2;
        });
        await choice.click();
      }
      check(`${width}px ${mode} 无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.training-panel, .sheet-scroll, .sheet-footer')].filter(el => el.getClientRects().length).every(el => el.scrollWidth <= el.clientWidth + 1)));
      if (mode === 'picker') check(`${width}px 确认按钮留在弹窗可见底栏`, await page.locator('.training-select-bar .select-bar-go').evaluate(el => { const rect = el.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth; }));
      if (width === 390 && process.env.ARTIFACT_DIR) await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/training-${mode}.png` });
      if (mode === 'picker') await close();
    }
  }
  await current();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const names = ['display', 'title', 'headline', 'value', 'body', 'footnote', 'caption'];
    for (const name of names) { const key = '--fs-' + name; document.documentElement.style.setProperty(key, (parseFloat(style.getPropertyValue(key)) * 2) + 'px'); }
  });
  for (const mode of ['current', 'history', 'picker']) {
    await current();
    if (mode === 'history') await history();
    if (mode === 'picker') await open();
    check(`320px 200% 文字 ${mode} 无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.training-panel, .sheet-scroll, .sheet-footer')].filter(el => el.getClientRects().length).every(el => el.scrollWidth <= el.clientWidth + 1)));
    if (process.env.ARTIFACT_DIR) await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/training-${mode}-200.png` });
    if (mode === 'picker') await close();
  }
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await open();
    const contrast = await page.locator('.training-select-bar .select-bar-go').evaluate(el => {
      const luminance = value => {
        const rgb = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
        return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
      };
      const style = getComputedStyle(el), a = luminance(style.color), b = luminance(style.backgroundColor);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    check(`${colorScheme} 主按钮文字对比 ≥ 4.5 (${contrast.toFixed(2)})`, contrast >= 4.5);
    if (colorScheme === 'dark' && process.env.ARTIFACT_DIR) await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/training-picker-dark-200.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(`${colorScheme} Esc 保留同日待选并返回入口`, await page.locator('.training-add').evaluate(el => el === document.activeElement && el.textContent.includes('待加入')));
  }
  await page.clock.setSystemTime(new Date('2026-09-09T12:00:00+08:00'));
  await page.evaluate(async () => (await import('/js/views/training.js')).renderTraining(document.querySelector('#view')));
  check('跨日后待选清空，昨天训练仍保留', !(await page.locator('.training-add').textContent()).includes('待加入') && (await items()).length === 0);
  await history();
  check('跨日记录窗口保留昨天记录与日期', /2026-09-08/.test(await page.locator('.training-history-card').textContent()));
  // Nested modal: close the inner sheet first, restore the settings dialog's inert state.
  await page.locator('.topbar-settings-btn').click();
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const { openSheet } = await import('/js/lib/sheet.js');
    const button = document.createElement('button'); button.textContent = '合成内层弹窗';
    openSheet(button, { label: '测试内层弹窗' });
  });
  await page.waitForTimeout(750);
  check('内层弹窗打开时设置背景隔离', await page.locator('.settings-overlay').evaluate(el => el.inert));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('关闭内层后设置仍开且焦点在设置内', await page.evaluate(() => document.querySelector('.settings-overlay.open')?.contains(document.activeElement) && document.querySelector('#app').inert));
  await page.keyboard.press('Escape');
  check('关闭设置恢复主页面交互', await page.locator('#app').evaluate(el => !el.inert));
  check('无未捕获异常', errors.length === 0);
  console.log(`${checks} checks passed`);
} catch (error) {
  console.error('Failure:', error);
  console.error('Page errors:', errors);
  console.error('Picker bounds:', await page.evaluate(() => ['.sheet', '.sheet-scroll', '.sheet-footer', '.ex-row:not(.chosen):not(.marked) .ex-pick'].map(selector => {
    const el = document.querySelector(selector), rect = el?.getBoundingClientRect();
    return { selector, rect: rect?.toJSON(), scrollTop: el?.scrollTop, scrollHeight: el?.scrollHeight };
  })));
  console.error('Overflow:', await page.evaluate(() => [...document.querySelectorAll('.training-panel *, .training-picker *, .training-select-bar *')].filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 2).map(el => ({ tag: el.className, width: el.clientWidth, scroll: el.scrollWidth }))));
  if (process.env.ARTIFACT_DIR) await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/training-failure.png` });
  console.error((await page.locator('body').innerText()).slice(-5000));
  throw error;
} finally { await browser.close(); }
