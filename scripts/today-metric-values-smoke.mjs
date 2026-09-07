/** 精确值浮层回归：隔离浏览器里的合成记录，不访问真实账号。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const engine = process.env.BROWSER || 'chromium';
const browser = await pw[engine].launch();
const context = await browser.newContext({ viewport: { width: 393, height: 852 },
  hasTouch: true, isMobile: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let checks = 0;
const check = (name, ok) => { assert.ok(ok, name); checks++; console.log(`✓ ${engine}: ${name}`); };
const trigger = key => page.locator(key === 'split' ? '.split-row .point-value-trigger'
  : `[data-nutrient="${key}"] .point-value-trigger`);
const panel = () => page.locator('.point-value-tip');
const blank = async () => {
  await page.touchscreen.tap(2, 200);
  await page.waitForFunction(() => !document.querySelector('.point-value-tip'), null, { timeout: 1500 });
};
const render = async (values = {}, nextDay = false) => page.evaluate(async ({ values, nextDay }) => {
  const { state } = await import('/js/lib/store.js');
  const { renderDashboard } = await import('/js/views/dashboard.js');
  if (nextDay) state.day = '2026-09-06';
  for (const [key, eaten] of Object.entries(values)) state.derived.advice.gaps[key].eaten = eaten;
  renderDashboard(document.querySelector('#view'));
}, { values, nextDay });
const geometry = async key => {
  await page.waitForTimeout(180);
  return trigger(key).evaluate(el => {
    const tip = document.querySelector('.point-value-tip');
    const box = tip.getBoundingClientRect();
    const card = el.closest('.card').getBoundingClientRect();
    const dot = el.querySelector('.split-bar-point').getBoundingClientRect();
    const arrow = tip.querySelector('.point-value-arrow').getBoundingClientRect();
    return { fits: box.left >= card.left + 7 && box.right <= card.right - 7,
      arrow: Math.abs(arrow.x + arrow.width / 2 - dot.x - dot.width / 2) < 1,
      above: box.bottom <= dot.top, dotSize: dot.width, triggerHeight: el.getBoundingClientRect().height,
      white: getComputedStyle(tip).backgroundColor === 'rgb(255, 255, 255)',
      single: document.querySelectorAll('.point-value-tip').length === 1
        && document.querySelectorAll('.is-value-open').length === 1,
      expanded: el.getAttribute('aria-expanded') === 'true'
        && el.getAttribute('aria-describedby') === tip.id,
    };
  });
};
try {
  await page.clock.setFixedTime(new Date('2026-09-07T12:00:00+08:00'));
  await page.route('https://**/*', route => route.abort());
  await page.goto(process.argv[2] || 'http://127.0.0.1:8137', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hero');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  for (const width of [320, 375, 393, 430, 768]) {
    await page.setViewportSize({ width, height: 852 });
    await render({ carb: 182.5, fat: 30, fiber: 11, sodium: 2039, sugar: 58 });
    const proteinBefore = await page.locator('.metric-row:not(.split-row)').innerHTML();
    check(`${width}px 默认四项隐藏数字，保留蛋白质数值`, await page.locator('.split-row,.hero-micros').evaluateAll(els =>
      els.every(el => !/\d/.test(el.textContent))) && await panel().count() === 0
      && /\d+g/.test(await page.locator('.metric-row:not(.split-row) .metric-row-value').textContent()));
    check(`${width}px 轨道周围留白紧凑且保留44px点击区`, await page.locator('.split-row,.micro-chip').evaluateAll(els =>
      els.every(el => {
        const label = el.querySelector('.metric-row-top,.micro-label').getBoundingClientRect();
        const track = el.querySelector('.split-bar,.nutrient-scale').getBoundingClientRect();
        return track.top - label.bottom <= 20 && el.getBoundingClientRect().bottom - track.bottom <= 14;
      })));
    for (const [key, expected] of [['split', '碳水 73% / 脂肪 27%\n碳水 182.5 g / 脂肪 30 g'], ['fiber', '11 g'], ['sodium', '2039 mg'], ['sugar', '58 g']]) {
      // 第一项直接点圆点，其他项点远离圆点的轨道热区。
      if (key === 'split') await trigger(key).locator('.split-bar-point').tap();
      else await trigger(key).tap({ position: { x: 3, y: 22 } });
      check(`${width}px ${key} 精确值与单位`, await panel().textContent() === expected);
      const g = await geometry(key);
      check(`${width}px ${key} 单层、白底、箭头对点、卡内避让与高亮`,
        g.fits && g.arrow && g.above && g.white && g.single && g.expanded && g.dotSize > 13 && g.triggerHeight >= 44);
      if (key === 'split' && process.env.ARTIFACT_DIR) {
        await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
        await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/macro-values-${engine}-${width}.png` });
      }
    }
    if (process.env.ARTIFACT_DIR) {
      await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/metric-values-${engine}-${width}.png` });
    }
    await blank();
    check(`${width}px 空白关闭并恢复圆点，蛋白质未变`, await panel().count() === 0
      && await page.locator('.is-value-open').count() === 0
      && await page.locator('.metric-row:not(.split-row)').innerHTML() === proteinBefore);
  }

  await page.setViewportSize({ width: 320, height: 852 });
  // 用真实极端输入覆盖最左、最右圆点，长比例浮层也必须留在卡内。
  for (const values of [{ carb: 0, fat: 100, fiber: 0, sodium: 0, sugar: 0 },
    { carb: 300, fat: 0, fiber: 100, sodium: 10000, sugar: 1000 }]) {
    await render(values);
    for (const key of ['split', 'fiber', 'sodium', 'sugar']) {
      await trigger(key).tap();
      const g = await geometry(key);
      check(`320px ${key} 极端值左右避让、箭头仍对准圆点`, g.fits && g.arrow);
    }
    await blank();
  }

  await render({ carb: 182.5, fat: 30, fiber: 11, sodium: 2039, sugar: 58 });
  await trigger('fiber').focus();
  await page.keyboard.press('Enter');
  check('键盘 Enter 打开读数', await panel().textContent() === '11 g');
  await page.keyboard.press('Escape');
  check('Escape 关闭后焦点留在轨道', await panel().count() === 0 && await trigger('fiber').evaluate(el => el === document.activeElement));
  await page.keyboard.press('Space');
  check('键盘空格打开读数', await panel().textContent() === '11 g');
  await trigger('fiber').tap();
  check('再次点击当前轨道关闭', await panel().count() === 0);

  await trigger('sodium').tap();
  await page.evaluate(() => {
    const spacer = document.createElement('div'); spacer.style.height = '900px'; spacer.id = 'metric-test-spacer';
    document.querySelector('#view').append(spacer);
  });
  const beforeScroll = await panel().boundingBox();
  const scroll = await page.evaluate(() => {
    const view = document.querySelector('#view'); const before = view.scrollTop; view.scrollTop += 90;
    return view.scrollTop - before;
  });
  await page.waitForTimeout(180);
  check('内容区滚动时浮层保持屏幕原位且不关闭', scroll > 0 && await panel().count() === 1
    && JSON.stringify(await panel().boundingBox()) === JSON.stringify(beforeScroll));
  for (const cancelled of [false, true]) {
    await page.locator('#view').evaluate((el, cancelled) => {
      const options = { bubbles: true, pointerType: 'touch', pointerId: 10, isPrimary: true, clientX: 2, clientY: 200 };
      el.dispatchEvent(new PointerEvent('pointerdown', options));
      if (cancelled) el.dispatchEvent(new PointerEvent('pointercancel', options));
      else el.dispatchEvent(new PointerEvent('pointermove', { ...options, clientY: 230 }));
      el.dispatchEvent(new PointerEvent('pointerup', options));
    }, cancelled);
    check(`空白处${cancelled ? '取消的触摸' : '滑动后回到起点'}不会关闭读数`, await panel().count() === 1);
  }
  await panel().tap();
  check('点击浮层自身继续显示', await panel().count() === 1);
  await blank();
  check('滚动后点击空白仍可关闭', await panel().count() === 0);

  await render();
  await trigger('sodium').tap();
  const beforeRender = await panel().boundingBox();
  await render();
  await page.waitForTimeout(80);
  check('同日重绘保留浮层坐标与唯一高亮', JSON.stringify(await panel().boundingBox()) === JSON.stringify(beforeRender)
    && await page.locator('.is-value-open').count() === 1);
  await render({ sodium: 999999 });
  await page.waitForTimeout(80);
  check('同日数据刷新更新真实值，长读数重新避让', await panel().textContent() === '999999 mg'
    && (await panel().boundingBox()).x + (await panel().boundingBox()).width <= (await page.locator('.hero').boundingBox()).x + (await page.locator('.hero').boundingBox()).width - 7);
  await page.setViewportSize({ width: 430, height: 852 });
  const rotated = await geometry('sodium');
  check('窗口变宽后重新对准圆点并避让', rotated.fits && rotated.arrow);
  await render({}, true);
  await page.waitForTimeout(80);
  check('切换日期清理旧读数', await panel().count() === 0);
  await render({ carb: 0, fat: 0 });
  check('无记录不伪造比例或圆点', await trigger('split').isDisabled()
    && await trigger('split').locator('.split-bar-point').count() === 0
    && (await page.locator('.split-row').textContent()).includes('还没有记录'));
  await trigger('sugar').tap();
  await page.locator('.tab').filter({ hasText: '饮食' }).tap();
  check('离开今日页清理浮层', await panel().count() === 0);
  check('浏览器无脚本异常', errors.length === 0);
  console.log(`${checks}/${checks} passed`);
} finally {
  await browser.close();
}
