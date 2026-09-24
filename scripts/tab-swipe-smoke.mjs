/** 四个主栏目横滑回归；合成手势只作用于独立浏览器资料。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const engine = process.env.BROWSER || 'chromium';
const browser = await pw[engine].launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true,
  locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
});
const page = await context.newPage();
await page.route('https://**/*', (route) => route.abort());
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let checks = 0;
const check = (name, value) => {
  assert.ok(value, name);
  checks++;
  console.log(`✓ ${engine}: ${name}`);
};
const active = () => page.locator('.tab[aria-current="page"]').getAttribute('aria-label');
const settled = () => page.waitForFunction(() => !document.querySelector('.tab-swipe-ghost')
  && !document.querySelector('#view')?.getAnimations().length
  && !document.querySelector('.tab-indicator')?.getAnimations().length);
const swipe = (dx, dy = 0, selector = '#view', options = {}) => page.evaluate(({ dx, dy, selector, options }) => {
  const target = document.querySelector(selector);
  if (!target) throw new Error(`找不到手势目标：${selector}`);
  const box = target.getBoundingClientRect();
  const start = selector === '#view'
    ? { x: options.startX ?? 220, y: 380 }
    : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const send = (type, x, y) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 23,
    isPrimary: true, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y,
  }));
  send('pointerdown', start.x, start.y);
  const frames = [];
  for (const offset of options.offsets || [dx / 2, dx]) {
    send('pointermove', start.x + offset, start.y + dy * offset / dx);
    const view = document.querySelector('#view');
    frames.push({ offset, tab: document.querySelector('.tab.active')?.getAttribute('aria-label'),
      transform: view.style.transform, stage: document.querySelector('#app').classList.contains('tab-swipe-stage'),
      markerX: document.querySelector('.tab-indicator').getBoundingClientRect().left,
      hash: location.hash });
  }
  send('pointerup', start.x + dx, start.y + dy);
  return { frames, hash: location.hash };
}, { dx, dy, selector, options });

try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8137', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  check('底栏保留四个栏目按钮和连续移动的选中底片',
    await page.locator('.tab').count() === 4 && await page.locator('.tab-indicator').count() === 1);
  check('主视图允许纵向原生滚动，同时接收横向手势',
    await page.locator('#view').evaluate(el => getComputedStyle(el).touchAction === 'pan-y'));
  const header = () => page.evaluate(() => {
    const box = document.querySelector('.topbar-inner').getBoundingClientRect();
    const settings = document.querySelector('.topbar-settings-btn').getBoundingClientRect();
    return { height: box.height, settingsX: settings.x,
      fits: settings.right <= innerWidth && document.querySelector('.topbar-inner').scrollWidth <= innerWidth };
  });
  const todayHeader = await header();
  check('今日顶栏只留单行日期、切日按钮和设置',
    await page.locator('.topbar-day strong').textContent() === await page.evaluate(() => {
      const day = new Date(); return `${day.getMonth() + 1}月${day.getDate()}日`;
    }) && await page.locator('.topbar-context').getByText('今天', { exact: true }).count() === 0
      && await page.locator('.topbar-inner h1').textContent() === '今日'
      && await page.locator('.topbar-inner .nav-arrow').count() === 2 && todayHeader.fits);
  if (process.env.ARTIFACT_DIR) {
    await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/tabs-today-header-${engine}.png` });
  }

  const firstSwipe = await swipe(135, 0, '#view', { offsets: [25, 75, 135] });
  check('翻转角度跟手，越过半圈才显出背面的饮食页',
    firstSwipe.frames[0].tab === '今日' && firstSwipe.frames[0].transform.startsWith('rotateY(4')
      && firstSwipe.frames[1].tab === '饮食' && firstSwipe.frames[1].transform.startsWith('rotateY(-')
      && firstSwipe.frames.every(frame => frame.stage)
      && firstSwipe.frames[0].markerX < firstSwipe.frames[1].markerX
      && firstSwipe.frames[1].markerX < firstSwipe.frames[2].markerX
      && firstSwipe.frames[0].hash === firstSwipe.frames[1].hash);
  await settled();
  check('今日右滑进入饮食且动画清理完成', await active() === '饮食'
    && await page.locator('#view').evaluate(el => !el.style.transform && !el.closest('#app').classList.contains('tab-swipe-stage')));
  const dietHeader = await header();
  check('饮食仍共用单行日期导航，设置位置和顶栏高度不跳',
    await page.locator('.topbar-day strong').count() === 1
    && Math.abs(dietHeader.height - todayHeader.height) < 1
    && Math.abs(dietHeader.settingsX - todayHeader.settingsX) < 1);

  await swipe(-125, 0, '.search-card input');
  await settled();
  check('搜索输入框的触摸不切栏目', await active() === '饮食');
  await swipe(10, 125);
  await settled();
  check('以纵向为主的滑动不误切栏目', await active() === '饮食');

  await page.locator('.tab[aria-label="今日"]').click();
  await settled();
  const across = await swipe(330, 0, '#view', {
    startX: 40, offsets: [35, 80, 115, 160, 215, 275, 330],
  });
  check('一次右滑持续翻过饮食、数据到健身',
    ['今日', '饮食', '饮食', '饮食', '数据', '健身', '健身']
      .every((tab, index) => across.frames[index].tab === tab)
      && across.frames[0].transform.startsWith('rotateY(')
      && across.frames[5].transform.startsWith('rotateY(-')
      && across.frames.every((frame, index) => index === 0 || frame.markerX > across.frames[index - 1].markerX));
  await settled();
  check('跨三栏后只提交最终 URL', await active() === '健身'
    && await page.evaluate(() => location.hash === '#training'));
  const trainingHeader = await header();
  check('健身顶栏接住唯一一组训练视图切换，设置与日期页对齐',
    await page.locator('.topbar-inner .training-view-tabs').count() === 1
      && await page.locator('#view .training-view-tabs').count() === 0
      && Math.abs(trainingHeader.height - todayHeader.height) < 1
      && Math.abs(trainingHeader.settingsX - todayHeader.settingsX) < 1);
  await page.locator('#training-tab-history').click();
  check('顶栏切到训练记录时面板和无障碍选中态同步',
    await page.locator('#training-panel-history').count() === 1
      && await page.locator('#training-tab-history').getAttribute('aria-selected') === 'true');
  await page.locator('#training-tab-current').click();
  check('顶栏可切回本次训练', await page.locator('#training-panel-current').count() === 1);
  if (process.env.ARTIFACT_DIR) {
    await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/tabs-training-header-${engine}.png` });
  }
  const reverse = await swipe(-330, 0, '#view', {
    startX: 355, offsets: [-35, -80, -115, -160, -215, -275, -330],
  });
  check('反向同一手势可翻回今日，角度随手指反向',
    reverse.frames.some(frame => frame.tab === '数据')
      && reverse.frames.some(frame => frame.tab === '饮食')
      && reverse.frames[0].transform.startsWith('rotateY(-'));
  await settled();
  check('反向跨三栏落在今日', await active() === '今日');

  await page.locator('.tab[aria-label="饮食"]').click();
  await settled();

  await swipe(135);
  await settled();
  check('饮食右滑进入数据', await active() === '数据');
  await page.evaluate(async () => {
    const { saveHealthDay } = await import('/js/lib/store.js');
    const { todayKey } = await import('/js/lib/utils.js');
    await saveHealthDay(todayKey(), {
      steps: 1157, activeEnergy: 137, exerciseMinutes: 0, sleepMinutes: 353,
      restingHR: 61, weightKg: 61, waterCount: 2,
    });
  });
  await page.waitForSelector('.health-metrics-card .metric-cell');
  check('数据页只显示饮水次数且使用水滴图标', await page.locator('.health-metrics-card').evaluate(el => {
    const cells = [...el.querySelectorAll('.metric-cell')];
    const water = cells.find(node => node.querySelector('.metric-label')?.textContent === '饮水');
    return Boolean(water?.querySelector('.metric-icon path'))
      && !cells.some(node => node.textContent.includes('设备饮水'));
  }));
  const healthHeader = await header();
  check('数据页同步状态只在顶栏出现，四页同高且设置对齐',
    /\d{2}-\d{2} · (已同步|未同步)/.test(await page.locator('.topbar-status').textContent())
      && await page.locator('.health-metrics-card .card-tag').count() === 0
      && Math.abs(healthHeader.height - todayHeader.height) < 1
      && Math.abs(healthHeader.settingsX - todayHeader.settingsX) < 1);
  if (process.env.ARTIFACT_DIR) {
    await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/tabs-health-393-${engine}.png` });
  }
  await page.setViewportSize({ width: 320, height: 852 });
  check('320px 时健康格和底部胶囊没有横向溢出', await page.evaluate(() => {
    const view = document.querySelector('#view');
    const card = document.querySelector('.health-metrics-card').getBoundingClientRect();
    const tabbar = document.querySelector('.tabbar').getBoundingClientRect();
    return view.scrollWidth <= view.clientWidth + 1 && card.right <= innerWidth
      && tabbar.left >= 0 && tabbar.right <= innerWidth;
  }));
  await page.locator('.tab[aria-label="健身"]').click();
  await settled();
  check('320px 时训练视图切换与设置并排不溢出', await page.evaluate(() => {
    const control = document.querySelector('.topbar-inner .training-view-tabs');
    const settings = document.querySelector('.topbar-settings-btn').getBoundingClientRect();
    return control.scrollWidth <= control.clientWidth + 1
      && control.getBoundingClientRect().right < settings.left
      && settings.right <= innerWidth;
  }));
  if (process.env.ARTIFACT_DIR) {
    await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/tabs-training-header-320-${engine}.png` });
  }
  await page.locator('.tab[aria-label="数据"]').click();
  await settled();
  await page.locator('.tab[aria-label="今日"]').click();
  await settled();
  await page.locator('.topbar-inner .nav-arrow').first().click();
  await page.waitForFunction(() => Boolean(document.querySelector('.topbar-back-icon')));
  check('320px 历史日期保留可读日期和可访问的回今天入口', await page.evaluate(() => {
    const date = document.querySelector('.topbar-day');
    const settings = document.querySelector('.topbar-settings-btn').getBoundingClientRect();
    return Boolean(date?.querySelector('.topbar-back-icon'))
      && date.getAttribute('aria-label')?.includes('回到今天')
      && date.scrollWidth <= date.clientWidth + 1 && settings.right <= innerWidth;
  }));
  await page.locator('.topbar-day').click();
  await page.waitForFunction(() => !document.querySelector('.topbar-back-icon'));
  await page.locator('.tab[aria-label="数据"]').click();
  await settled();
  if (process.env.ARTIFACT_DIR) {
    await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/tabs-health-320-${engine}.png` });
  }
  await page.setViewportSize({ width: 393, height: 852 });
  await swipe(135);
  await settled();
  check('数据右滑进入健身', await active() === '健身');
  await swipe(150);
  await settled();
  check('末栏继续右滑会回弹，不越界', await active() === '健身'
    && await page.locator('#app').evaluate(el => !el.classList.contains('tab-swipe-stage')));
  const backSwipe = await swipe(-140, 0, '#view', { offsets: [-25, -75, -140] });
  check('反向左滑时翻转方向相反', backSwipe.frames[0].transform.startsWith('rotateY(-')
    && backSwipe.frames[1].transform.startsWith('rotateY('));
  await settled();
  check('左滑返回相邻栏目', await active() === '数据');
  await swipe(-120, 0, '.tab.active');
  await settled();
  check('底部主栏目本身也能滑动选择相邻页', await active() === '饮食');
  await swipe(120, 0, '.tab.active');
  await settled();
  check('底部选中底片随手势移动并落到目标页', await active() === '数据'
    && await page.locator('.tabbar').evaluate(el => {
      const marker = el.querySelector('.tab-indicator').getBoundingClientRect();
      const button = el.querySelector('.tab.active').getBoundingClientRect();
      return Math.abs(marker.left - button.left) < 1;
    }));

  await page.locator('.tab[aria-label="今日"]').click();
  await settled();
  check('点底栏跨栏目仍能切换且选中底片落在按钮下',
    await active() === '今日' && await page.locator('.tabbar').evaluate(el => {
      const marker = el.querySelector('.tab-indicator').getBoundingClientRect();
      const button = el.querySelector('.tab.active').getBoundingClientRect();
      return Math.abs(marker.left - button.left) < 1 && Math.abs(marker.width - button.width) < 1;
    }));
  await page.locator('#view').evaluate(el => { el.scrollTop = 300; });
  await page.locator('.tab.active').click();
  await page.waitForFunction(() => document.querySelector('#view').scrollTop < 1);
  check('重复点当前栏目仍可回到顶部', await active() === '今日');
  await page.locator('.topbar-inner .nav-arrow').first().click();
  await page.waitForFunction(() => document.querySelector('.topbar-back-text'));
  check('历史日期在同一行提供回今天入口',
    await page.locator('.topbar-back-text').textContent() === '回今天'
      && await page.locator('.topbar-day').getAttribute('aria-label') !== null);
  await page.locator('.topbar-day').click();
  await page.waitForFunction(() => !document.querySelector('.topbar-back-text'));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await swipe(135);
  check('减少动态效果时直接切栏目且不制造过渡副本',
    await active() === '饮食' && await page.locator('.tab-swipe-ghost').count() === 0);
  if (engine === 'chromium') {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('.tab[aria-label="数据"]').click();
    await settled();
    const box = await page.locator('.health-metrics-card .metric-grid').boundingBox();
    const x = box.x + box.width * .35;
    const y = box.y + Math.min(35, box.height / 2);
    const session = await context.newCDPSession(page);
    const touch = (type, tx, ty = y) => session.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x: tx, y: ty, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await touch('touchStart', x);
    await touch('touchMove', x + 45);
    await touch('touchMove', x + 100);
    await touch('touchMove', x + 155);
    await touch('touchEnd', x + 155);
    await settled();
    check('真实触摸事件能横滑换页', await active() === '健身');
    await page.locator('.tab[aria-label="数据"]').click();
    await settled();
    await page.locator('#view').evaluate(el => { el.scrollTop = 0; });
    await touch('touchStart', x);
    await touch('touchMove', x, y - 55);
    await touch('touchMove', x, y - 130);
    await touch('touchEnd', x, y - 130);
    await page.waitForFunction(() => document.querySelector('#view').scrollTop > 0);
    check('真实纵向触摸仍能滚动数据页，不误切栏目', await active() === '数据');
    const scroller = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'table-wrap';
      el.style.cssText = 'width:200px;height:90px;overflow-x:auto;flex:none';
      const wide = document.createElement('div');
      wide.style.cssText = 'width:700px;height:80px';
      el.append(wide);
      document.querySelector('#view').prepend(el);
      document.querySelector('#view').scrollTop = 0;
      const rect = el.getBoundingClientRect();
      return { x: rect.left + 160, y: rect.top + 45 };
    });
    await touch('touchStart', scroller.x, scroller.y);
    await touch('touchMove', scroller.x - 60, scroller.y);
    await touch('touchMove', scroller.x - 130, scroller.y);
    await touch('touchEnd', scroller.x - 130, scroller.y);
    await page.waitForFunction(() => document.querySelector('.table-wrap').scrollLeft > 0);
    check('横向滚动容器保留自身手势，不被栏目切换接管', await active() === '数据');
    const activeTabBox = await page.locator('.tab.active').boundingBox();
    const tabX = activeTabBox.x + activeTabBox.width / 2;
    const tabY = activeTabBox.y + activeTabBox.height / 2;
    await touch('touchStart', tabX, tabY);
    await touch('touchMove', tabX - 48, tabY);
    await touch('touchMove', tabX - 105, tabY);
    await touch('touchEnd', tabX - 105, tabY);
    await settled();
    check('底部胶囊的真实触摸横滑也能换页', await active() === '饮食');
  }
  check('没有页面脚本异常', errors.length === 0);
  console.log(`${checks}/${checks} passed`);
} finally {
  await browser.close();
}
