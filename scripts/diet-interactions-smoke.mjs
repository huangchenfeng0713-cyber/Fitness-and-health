/** 饮水、共用食物弹窗与历史回顾回归。独立 IndexedDB，不接触用户数据。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const engine = process.env.BROWSER || 'chromium';
const browser = await pw[engine].launch();
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-09-06T18:00:00+08:00'));
await page.route('https://**/*', route => route.abort());
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let checks = 0;
const check = (name, ok) => { assert.ok(ok, name); checks++; console.log('✓ ' + engine + ': ' + name); };
const tab = label => page.locator('.tab').filter({ hasText: label }).click();
const close = async () => {
  await page.evaluate(async () => (await import('/js/lib/sheet.js')).closeSheet({ force: true }));
  await page.waitForTimeout(300);
};
const waitCount = value => page.waitForFunction(value => Number(window.dietTestStore.state.healthByDate.get('2026-09-06')?.waterCount) === value, value);
const formField = name => page.locator('.custom-form label').filter({ has: page.locator('span', { hasText: new RegExp('^' + name + '$') }) }).locator('input');
const custom = async () => {
  await page.locator('.search-card .text-btn').first().click();
  await page.waitForTimeout(750);
};
const screenshot = async (selector, name) => {
  if (!process.env.ARTIFACT_DIR) return;
  await page.waitForFunction(() => !document.querySelector('.toast.show'));
  await page.waitForTimeout(350);
  await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
  await page.locator(selector).screenshot({ path: process.env.ARTIFACT_DIR + '/' + name + '-' + engine + '.png' });
};
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8146', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js');
    window.dietTestStore = s;
    await s.saveProfile({ goal: 'maintain', birthDate: '1996-01-01', weightKg: 72, heightCm: 175, sex: 'male', useAppleEnergy: false, onboarded: true, demoMode: false });
  });
  await tab('饮食');
  check('整条记录区是单个完整宽度按钮，Plus无独立按钮', await page.locator('.water-card').evaluate(el => {
    const b = el.querySelector('.water-pill');
    return b.tagName === 'BUTTON' && !el.querySelector('.water-add') && !b.querySelector('button')
      && Math.abs(b.clientWidth - (el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight))) < 2;
  }));
  await page.evaluate(() => {
    window.waterButton = document.querySelector('.water-pill');
    window.waterLoops = [...document.querySelectorAll('.water-flow')].map(el => el.getAnimations()[0]);
    window.waterTimes = window.waterLoops.map(a => a.currentTime);
    window.waterBottom = getComputedStyle(document.querySelector('.water-surface')).bottom;
  });
  await page.locator('.water-pill').tap({ position: { x: 15, y: 15 } });
  await page.waitForTimeout(100);
  check('单次点击产生清晰的波面起伏与加速，不需要连点才能看见', await page.locator('.water-surface').evaluate(el =>
    new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 < -9
    && el.getAnimations({ subtree: true }).every(a => a.playbackRate > 3)));
  await waitCount(1);
  await page.evaluate(() => { for (let i = 0; i < 10; i++) document.querySelector('.water-pill').click(); });
  await waitCount(11);
  check('连点十次全部保存且立即显示次数', await page.locator('.water-count').textContent() === '11');
  check('连点保留按钮与循环动画实例，相位持续向前', await page.evaluate(() =>
    window.waterButton === document.querySelector('.water-pill')
    && window.waterLoops.every((a, i) => a === document.querySelectorAll('.water-flow')[i].getAnimations()[0] && a.currentTime > window.waterTimes[i])));
  await page.waitForTimeout(3200);
  check('波面自然恢复固定基线，不随次数累计升高', await page.locator('.water-surface').evaluate(el =>
    getComputedStyle(el).bottom === window.waterBottom && Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42) < .1));
  await screenshot('.water-card', 'water-card');
  await page.locator('.water-undo').click();
  await waitCount(0);
  check('撤销整串连点并恢复记录', await page.locator('.water-count').textContent() === '0');
  await page.evaluate(async () => {
    document.querySelector('.water-pill').click(); document.querySelector('.water-pill').click();
    await (await import('/js/lib/store.js')).setDay('2026-09-05');
  });
  await waitCount(2);
  check('保存队列固定原日期，切日不串记录', await page.locator('.water-count').textContent() === '0');
  await page.evaluate(async () => (await import('/js/lib/store.js')).setDay('2026-09-06'));
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'health') { IDBObjectStore.prototype.put = put; throw new DOMException('test', 'QuotaExceededError'); }
      return put.apply(this, args);
    };
    document.querySelector('.water-pill').click(); document.querySelector('.water-pill').click();
  });
  await waitCount(3);
  await page.waitForFunction(() => document.querySelector('.water-count')?.textContent === '3');
  check('一次存储失败后队列继续，计数回退到真实保存值', await page.locator('.water-count').textContent() === '3');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.water-pill').tap();
  await waitCount(4);
  check('减少动态效果时静态波面仍可记录', await page.locator('.water-flow').first().evaluate(el => el.getAnimations().length === 0));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) document.querySelector('.water-pill').click();
    await window.dietTestStore.setDay('2026-09-05');
    await window.dietTestStore.setDay('2026-09-06');
    document.querySelector('.water-pill').click();
    document.querySelector('.water-pill').click();
  });
  await waitCount(16);
  check('队列未完成时往返日期再点击，仍共用同日队列', await page.locator('.water-count').textContent() === '16');

  await custom();
  check('自定义食物使用同一弹窗、滚动区与固定底栏', await page.locator('.sheet .custom-form').count() === 1 && await page.locator('.sheet-footer .primary-btn').isVisible());
  check('新建所有输入和分类为空，无饮品复选框或示例占位', await page.locator('.custom-form').evaluate(el =>
    [...el.querySelectorAll('input,select')].every(e => e.value === '' && !e.placeholder) && !el.querySelector('[type=checkbox]')));
  check('字段名称符合要求，说明跟随每100g口径', /食物名称[\s\S]*常用分量单位[\s\S]*每份克重\/体积/.test(await page.locator('.custom-form').textContent()));
  check('每个输入都有可见边框', await page.locator('.custom-form').evaluate(el => [...el.querySelectorAll('input')].every(e => {
    const c = getComputedStyle(e); return parseFloat(c.borderTopWidth) >= 1 && c.borderTopColor !== 'rgba(0, 0, 0, 0)';
  })));
  await screenshot('.sheet', 'custom-food-blank');
  await formField('食物名称').fill('测试奶');
  await page.locator('.sheet-footer .primary-btn').click();
  check('空能量不会被保存成0', await page.evaluate(async () => (await import('/js/lib/store.js')).state.customFoods.length === 0));
  await formField('能量').fill('100');
  await page.getByRole('button', { name: '切换能量单位', exact: true }).click();
  check('kcal/kJ切换保留换算逻辑', await formField('能量').inputValue() === '418.4');
  await page.getByRole('button', { name: '切换克重或体积单位', exact: true }).click();
  check('g/ml切换不预填数字，并同步营养基准', await formField('每份克重/体积').inputValue() === '' && /每 100 ml/.test(await page.locator('.custom-form .form-hint').first().textContent()));
  await formField('常用分量单位').fill('一杯');
  await formField('每份克重/体积').fill('250');
  await formField('蛋白 g').fill('3');
  await formField('碳水 g').fill('5');
  await page.evaluate(async () => (await import('/js/lib/store.js')).saveHealthDay('2026-09-06', { waterCount: 5 }));
  check('后台刷新保留未保存输入和单位', await formField('食物名称').inputValue() === '测试奶' && await formField('能量').inputValue() === '418.4');
  for (const width of [320, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    check(width + 'px自定义表单无横向溢出', await page.locator('.custom-form').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await screenshot('.sheet', 'custom-food-sheet');
  await page.locator('.sheet-footer .primary-btn').click();
  await page.waitForTimeout(750);
  const food = await page.evaluate(async () => (await import('/js/lib/store.js')).state.customFoods[0]);
  check('保存毫升口径与分量，复用添加食物份量弹窗', food.basis === '100ml' && food.n[0] === 100 && food.s[0][1] === 250 && await page.locator('.sheet').getAttribute('aria-label') === '选择份量');
  await page.evaluate(async food => (await import('/js/lib/store.js')).addEntry({ foodId: food.id, grams: 250, meal: 'dinner' }), food);
  await close();
  await custom();
  await page.getByRole('button', { name: '修改 测试奶', exact: true }).click();
  check('编辑回填已有数据与ml单位', await formField('食物名称').inputValue() === '测试奶' && await page.getByRole('button', { name: '切换克重或体积单位', exact: true }).textContent() === 'ml');
  await formField('食物名称').fill('修改后的食物');
  await formField('能量').fill('90');
  await page.getByRole('button', { name: '切换克重或体积单位', exact: true }).click();
  await page.locator('.sheet-footer .primary-btn').click();
  await page.waitForTimeout(320);
  check('编辑沿用同一ID，ml改g且旧饮食数值保持', await page.evaluate(async id => {
    const s = (await import('/js/lib/store.js')).state;
    return s.customFoods.length === 1 && s.customFoods[0].id === id && s.customFoods[0].basis !== '100ml'
      && s.dietEntries.find(e => e.foodId === id)?.kcal === 250;
  }, food.id));
  await page.locator('.ui-search-input').fill('宫保鸡丁');
  await page.waitForTimeout(220);
  await page.locator('.search-item').first().click();
  await page.waitForTimeout(750);
  for (const [width, height] of [[320, 852], [375, 852], [393, 852], [430, 852], [740, 440]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.sheet-scroll').evaluate(el => { el.scrollTop = 0; });
    const tip = page.locator('.sheet .info-tip').first();
    await tip.locator('summary').click();
    await page.waitForTimeout(100);
    check(width + 'px说明框紧邻图标且位于弹窗与视口内', await tip.evaluate(el => {
      const a = el.querySelector('summary').getBoundingClientRect(), p = el.querySelector('.info-tip-panel').getBoundingClientRect();
      const s = el.closest('.sheet').getBoundingClientRect();
      const gap = p.top >= a.bottom ? p.top - a.bottom : a.top - p.bottom;
      return el.open && gap >= 6 && gap <= 10 && p.left >= Math.max(0, s.left) + 10
        && p.right <= Math.min(innerWidth, s.right) - 10 && p.top >= s.top && p.bottom <= Math.min(innerHeight, s.bottom);
    }));
    await tip.locator('summary').click();
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await page.locator('.sheet .info-tip summary').first().click();
  await page.waitForTimeout(100);
  await screenshot('.sheet', 'anchored-food-tip');
  await close();
  await page.evaluate(async () => {
    const s = await import('/js/lib/store.js'), db = await import('/js/lib/db.js');
    await db.bulkPut(db.STORES.diet, [{ date: '2026-09-05', time: '2026-09-05T12:00:00+08:00', meal: 'lunch', grams: 100,
      name: '历史测试餐', kcal: 2400, protein: 30, fat: 100, carb: 150, fiber: 5, sugar: 80, sodium: 3000 }]);
    await s.reloadStoreFromDB();
    await s.setDay('2026-09-05');
  });
  await tab('今日');
  await page.waitForSelector('.hero');
  check('历史日期仅展示当日回顾，不出现行动入口', await page.locator('#view').textContent().then(t => /当日回顾/.test(t) && !/今日提示|下一餐|后续餐次|晚餐建议|接下来|蛋白还差/.test(t))
    && await page.locator('.insight-actionable,.intake-trend,.insight-go').count() === 0);
  check('碳水比例统一冒号，移除进度条下参考文字，保留克数与条', await page.locator('.split-row').evaluate(el =>
    el.querySelector('.metric-row-label').textContent === '碳水:脂肪' && /^\d+:\d+$/.test(el.querySelector('.metric-row-value').textContent)
    && !el.querySelector('.split-grams-plan') && !el.textContent.includes('碳水参考') && el.querySelectorAll('.split-end').length === 2 && !!el.querySelector('.split-bar-point')));
  const review = await page.locator('.insight-list').textContent();
  await page.clock.setFixedTime(new Date('2026-09-06T23:00:00+08:00'));
  await page.evaluate(async () => (await import('/js/lib/store.js')).reloadStoreFromDB());
  check('晚间重新查看同一历史日，回顾内容不随当前时间变化', await page.locator('.insight-list').textContent() === review);
  await screenshot('#view', 'historical-review');
  await page.evaluate(async () => (await import('/js/lib/store.js')).setDay('2026-09-06'));
  check('返回当天仍保留实时提示和食物入口', await page.locator('#view').textContent().then(t => t.includes('今日提示')) && await page.locator('.insight-actionable').count() > 0);
  check('浏览器无脚本异常', errors.length === 0);
  console.log(checks + '/' + checks + ' passed');
} finally { await browser.close(); }
