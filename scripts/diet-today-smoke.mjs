/** 定向回归：独立浏览器数据目录，不接触真实账号。BROWSER=webkit 可验证 WebKit。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const engine = process.env.BROWSER || 'chromium';
const base = process.argv[2] || 'http://127.0.0.1:8137';
const browser = await pw[engine].launch();
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let checks = 0;
const check = (name, ok) => { assert.ok(ok, name); checks++; console.log(`✓ ${engine}: ${name}`); };
const tab = async key => {
  await page.evaluate(key => {
    const label = { today: '今日', diet: '饮食' }[key];
    [...document.querySelectorAll('.tab')].find(el => el.textContent.includes(label)).click();
  }, key);
  await page.waitForTimeout(220);
};
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tab');
  await page.evaluate(() => document.querySelector('.onboard .text-btn, .onboard button:last-child')?.click());
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  await tab('diet');
  const results = () => page.locator('.search-card > .slot').first().textContent();
  const defaultResults = await results();
  await page.locator('.ui-search-input').fill('米饭');
  await page.waitForTimeout(220);
  check('关键词确实过滤了结果', (await results()) !== defaultResults);
  await tab('today'); await tab('diet');
  check('返回饮食页，input和结果同时恢复默认', await page.locator('.ui-search-input').inputValue() === '' && await results() === defaultResults);
  await page.evaluate(() => {
    const input = document.querySelector('.ui-search-input'); input.value = '可乐'; input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.tab').click();
  });
  await tab('diet'); await page.waitForTimeout(220);
  check('离开时尚未触发的防抖不会恢复旧过滤', await page.locator('.ui-search-input').inputValue() === '' && await results() === defaultResults);
  check('饮食页仍可记录饮水', await page.locator('[aria-label^="记录一次饮水"]').count() === 1);

  const history = await page.evaluate(async () => {
    const db = await import('/js/lib/db.js');
    const store = await import('/js/lib/store.js');
    const rhythm = await import('/js/core/eating-rhythm.js');
    const entries = [];
    for (let i = 0; i < 35; i++) {
      const date = new Date(Date.UTC(2025, 0, 1 + i * 4)).toISOString().slice(0, 10);
      for (const [meal, hour, kcal] of [['breakfast', 8, 480], ['lunch', 13, 780], ['dinner', 19, 740], ['snack', 23, 200]]) {
        entries.push({ date, meal, kcal, time: `${date}T${String(hour).padStart(2, '0')}:00:00`, name: '测试记录', grams: 100 });
      }
    }
    await db.bulkPut(db.STORES.diet, entries);
    await store.reloadStoreFromDB();
    return { retained: store.state.dietRhythm.length, result: rhythm.personalMealReference(store.state.dietRhythm, { asOf: store.state.day }) };
  });
  check('IndexedDB到参照保留餐次标签与超过28个自然日的历史', history.retained === 140 && history.result.days === 28 && history.result.meals.length === 3);

  await tab('today');
  const render = async (eaten, burned, nutrients = [18, 1636, 4]) => page.evaluate(async ({ eaten, burned, nutrients }) => {
    const { state } = await import('/js/lib/store.js');
    const { renderDashboard } = await import('/js/views/dashboard.js');
    const { judgeStatus } = await import('/js/core/advisor.js');
    state.derived.targets.kcal = 2400;
    Object.assign(state.derived.advice.gaps.kcal, { eaten, target: 2400, remaining: 2400 - eaten, pct: eaten / 24 });
    ['fiber', 'sodium', 'sugar'].forEach((k, i) => { state.derived.advice.gaps[k].eaten = nutrients[i]; });
    state.derived.liveEnergy = burned == null ? null : { burnedNow: burned };
    state.derived.advice.status = judgeStatus({ gaps: state.derived.advice.gaps, kcalLeft: 2400 - eaten,
      hour: 18, targets: state.derived.targets, budget: state.derived.advice.budget, hasIntake: eaten > 0 });
    renderDashboard(document.querySelector('#view'));
  }, { eaten, burned, nutrients });
  for (const width of [320, 375, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    await render(1730, 2414);
    const layout = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('.micro-chip')];
      const bars = chips.map(c => c.querySelector('.nutrient-scale').getBoundingClientRect());
      const bounds = chips.map(c => c.getBoundingClientRect());
      return { count: chips.length, aligned: Math.max(...bars.map(b => b.y)) - Math.min(...bars.map(b => b.y)) < 1,
        balanced: Math.max(...bars.map(b => b.width)) - Math.min(...bars.map(b => b.width)) < 8,
        fits: chips.every((c, i) => c.scrollWidth <= bounds[i].width + 1), text: chips.map(c => c.textContent).join(' '),
        ringWidth: document.querySelector('.energy-ring').getBoundingClientRect().width,
        caption: document.querySelector('.ring-caption').textContent, value: document.querySelector('.ring-value').textContent,
        legend: document.querySelector('.ring-legend').textContent,
      };
    });
    check(`${width}px 三列并排、条长均衡、无分母或状态文字`, layout.count === 3 && layout.aligned && layout.balanced && layout.fits && !/饮水|\/|不足|正常|过量/.test(layout.text));
    check(`${width}px 圆环缩小约8%，当前收支和图例正确`, Math.abs(layout.ringWidth - Math.min(232, width * .62) * .92) < .1 && layout.caption === '当前收支' && layout.value === '−684' && /1730 \/ 2400kcal/.test(layout.legend) && /2414kcal/.test(layout.legend));
    if (process.env.ARTIFACT_DIR) {
      await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
      await page.locator('.hero').screenshot({ path: `${process.env.ARTIFACT_DIR}/today-${engine}-${width}.png` });
    }
  }
  const color = () => page.locator('.ring-value').evaluate(el => getComputedStyle(el).color);
  const negativeColor = await color();
  await render(2000, 1680);
  check('正负收支文字均为同一中性色', await page.locator('.ring-value').textContent() === '+320' && await color() === negativeColor);
  await render(7000, 9000, [90, 5000, 120]);
  check('超两圈仍显示真实差值，只有原来的两条轨道', await page.locator('.ring-value').textContent() === '−2000' && await page.locator('.ring-seg-intake').count() === 2 && await page.locator('.ring-seg-burn').count() === 2);
  check('纤维高值不标红；钠糖超量标红且标记封顶', await page.locator('[data-nutrient="fiber"] .nutrient-point.plain').count() === 1 && await page.locator('.nutrient-point.over').count() === 2 && await page.locator('.nutrient-point').evaluateAll(els => els.every(el => el.style.left === '100%')));
  await render(2000, null);
  check('设备消耗缺失保持未知，不伪造零或估算黄环', await page.locator('.ring-value').textContent() === '—' && await page.locator('.ring-seg-burn').count() === 0);

  await page.setViewportSize({ width: 393, height: 852 });
  const cdp = engine === 'chromium' ? await context.newCDPSession(page) : null;
  async function drag(x, y, dy) {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / 12 }] });
        await page.waitForTimeout(30);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x, y + dy, { steps: 12 }); await page.mouse.up();
    }
    await page.waitForTimeout(350);
  }
  async function openContent(long) {
    await page.evaluate(async long => {
      const { openSheet } = await import('/js/lib/sheet.js');
      const content = document.createElement('div'); content.className = 'scroll-test-content';
      content.style.height = long ? '1400px' : '120px'; content.textContent = '滚动手势测试';
      openSheet(content);
    }, long);
    await page.waitForTimeout(750);
  }
  for (const long of [false, true]) {
    await openContent(long);
    const box = await page.locator('.sheet-scroll').boundingBox();
    const start = await page.locator('.sheet').boundingBox();
    await page.evaluate(() => {
      window.scrollSamples = []; window.collectScrollSamples = true;
      function sample() {
        const sheet = document.querySelector('.sheet'), content = document.querySelector('.scroll-test-content');
        window.scrollSamples.push([sheet.getBoundingClientRect().top, content.getBoundingClientRect().top, document.querySelector('.sheet-scroll').scrollTop]);
        if (window.collectScrollSamples) requestAnimationFrame(sample);
      }
      sample();
    });
    await drag(box.x + box.width / 2, box.y + 25, 65);
    const samples = await page.evaluate(() => { window.collectScrollSamples = false; return window.scrollSamples; });
    check(`${long ? '长' : '短'}内容顶端下拉，每帧无位移、空白或sheet拖动`, samples.every(s => s.every((v, i) => Math.abs(v - samples[0][i]) < .5)));
    const prevented = await page.evaluate(() => {
      const el = document.querySelector('.sheet-scroll');
      const event = (name, y) => {
        const e = new Event(name, { bubbles: true, cancelable: true });
        Object.defineProperty(e, 'touches', { value: [{ clientY: y }] });
        el.dispatchEvent(e); return e.defaultPrevented;
      };
      event('touchstart', 100); return event('touchmove', 110);
    });
    check('原生边界控制不拦截惯性触摸', !prevented && await page.locator('.sheet-scroll').evaluate(el => getComputedStyle(el).overscrollBehaviorY === 'none'));
    if (long && cdp) {
      await drag(box.x + box.width / 2, box.y + 230, -180);
      check('溢出内容仍能正常向上浏览', await page.locator('.sheet-scroll').evaluate(el => el.scrollTop) > 60);
      check('内容滚动不带动sheet', Math.abs((await page.locator('.sheet').boundingBox()).y - start.y) < .5);
      // 已滚动内容用同一次向下手势回到顶后继续拖，不移交给sheet。
      await page.locator('.sheet-scroll').evaluate(el => { el.scrollTop = 20; });
      await drag(box.x + box.width / 2, box.y + 25, 180);
      check('回到顶后继续下拉不接管sheet、不产生负滚动', Math.abs((await page.locator('.sheet').boundingBox()).y - start.y) < .5 && await page.locator('.sheet-scroll').evaluate(el => el.scrollTop) >= 0);
    }
    const handle = await page.locator('.sheet-handle').boundingBox();
    check('顶部热区44px，视觉横条36×4', handle.height === 44 && await page.locator('.sheet-handle').evaluate(el => getComputedStyle(el, '::before').height === '4px' && getComputedStyle(el, '::before').width === '36px'));
    await drag(handle.x + 45, handle.y + 22, 24);
    check('偏离细白条仍能拖动，短拖释放回到原位', !(await page.locator('.sheet-wrap').evaluate(el => el.hidden)) && Math.abs((await page.locator('.sheet').boundingBox()).y - start.y) < .5);
    await drag(handle.x + 45, handle.y + 22, 120);
    check('顶部热区超过阈值关闭', await page.locator('.sheet-wrap').evaluate(el => el.hidden));
  }
  await tab('diet');
  await page.locator('.ui-search-input').fill('米饭');
  await page.waitForTimeout(220);
  await page.locator('.search-item').first().click();
  await page.waitForTimeout(750);
  const foodSheet = await page.locator('.sheet').boundingBox();
  const foodContent = await page.locator('.sheet-scroll').boundingBox();
  await drag(foodContent.x + 20, foodContent.y + 15, 80);
  check('实际添加食物弹窗正文下拉不移动sheet，底栏仍可操作',
    Math.abs((await page.locator('.sheet').boundingBox()).y - foodSheet.y) < .5
    && await page.locator('.sheet-footer button').count() > 0);
  if (process.env.ARTIFACT_DIR) await page.locator('.sheet').screenshot({ path: `${process.env.ARTIFACT_DIR}/food-sheet-${engine}.png` });
  check('无浏览器脚本异常', errors.length === 0);
  console.log(`${checks}/${checks} passed`);
} finally { await browser.close(); }
