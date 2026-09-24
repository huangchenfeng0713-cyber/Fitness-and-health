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
  && !document.querySelector('#view')?.getAnimations().length);
const swipe = (dx, dy = 0, selector = '#view', freeze = false) => page.evaluate(({ dx, dy, selector, freeze }) => {
  const target = document.querySelector(selector);
  if (!target) throw new Error(`找不到手势目标：${selector}`);
  const box = target.getBoundingClientRect();
  const start = selector === '#view'
    ? { x: 220, y: 380 }
    : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const send = (type, x, y) => target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 23,
    isPrimary: true, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y,
  }));
  send('pointerdown', start.x, start.y);
  send('pointermove', start.x + dx / 2, start.y + dy / 2);
  send('pointermove', start.x + dx, start.y + dy);
  const drag = document.querySelector('#view').style.transform;
  send('pointerup', start.x + dx, start.y + dy);
  const ghost = document.querySelector('.tab-swipe-ghost');
  const incoming = document.querySelector('#view.tab-swipe-transitioning');
  if (freeze) {
    for (const animation of [...(ghost?.getAnimations() || []), ...(incoming?.getAnimations() || [])]) {
      animation.pause();
      animation.currentTime = 0;
    }
  }
  return {
    ghost: Boolean(ghost), incoming: Boolean(incoming), drag,
    stage: document.querySelector('#app').classList.contains('tab-swipe-stage'),
    outgoingEnd: ghost?.getAnimations()[0]?.effect?.getKeyframes().at(-1)?.transform,
    incomingStart: incoming?.getAnimations()[0]?.effect?.getKeyframes()[0]?.transform,
    faceSwap: Boolean(ghost?.getAnimations()[0]?.effect?.getKeyframes().some(frame =>
      frame.transform === `rotateY(${dx > 0 ? 90 : -90}deg)` && Number(frame.opacity) === 0))
      && Boolean(incoming?.getAnimations()[0]?.effect?.getKeyframes().some(frame =>
        frame.transform === `rotateY(${dx > 0 ? -90 : 90}deg)` && Number(frame.opacity) === 1)),
    backface: ghost && getComputedStyle(ghost).backfaceVisibility,
  };
}, { dx, dy, selector, freeze });

try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:8137', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tab');
  await page.waitForFunction(() => !document.querySelector('.account-data-lock'));
  check('底栏保留四个栏目按钮和连续移动的选中底片',
    await page.locator('.tab').count() === 4 && await page.locator('.tab-indicator').count() === 1);
  check('主视图允许纵向原生滚动，同时接收横向手势',
    await page.locator('#view').evaluate(el => getComputedStyle(el).touchAction === 'pan-y'));

  const firstSwipe = await swipe(135, 0, '#view', Boolean(process.env.ARTIFACT_DIR));
  check('右滑时页面沿纵向中轴旋转，正反面同时在场',
    firstSwipe.ghost && firstSwipe.incoming && firstSwipe.stage
      && firstSwipe.drag.startsWith('rotateY(') && firstSwipe.outgoingEnd === 'rotateY(180deg)'
      && firstSwipe.incomingStart?.startsWith('rotateY(-') && firstSwipe.backface === 'hidden'
      && firstSwipe.faceSwap);
  if (process.env.ARTIFACT_DIR) {
    await fs.mkdir(process.env.ARTIFACT_DIR, { recursive: true });
    for (const percent of [25, 50, 75]) {
      await page.evaluate((progress) => {
        for (const selector of ['.tab-swipe-ghost', '#view.tab-swipe-transitioning']) {
          for (const animation of document.querySelector(selector)?.getAnimations() || []) {
            animation.currentTime = animation.effect.getTiming().duration * progress / 100;
          }
        }
      }, percent);
      await page.screenshot({ path: `${process.env.ARTIFACT_DIR}/tabs-flip-${percent}-${engine}.png` });
    }
    await page.evaluate(() => {
      for (const selector of ['.tab-swipe-ghost', '#view.tab-swipe-transitioning']) {
        for (const animation of document.querySelector(selector)?.getAnimations() || []) animation.play();
      }
    });
  }
  await settled();
  check('今日右滑进入饮食且动画清理完成', await active() === '饮食'
    && await page.locator('#view').evaluate(el => !el.style.transform && !el.closest('#app').classList.contains('tab-swipe-stage')));

  await swipe(-125, 0, '.search-card input');
  await settled();
  check('搜索输入框的触摸不切栏目', await active() === '饮食');
  await swipe(10, 125);
  await settled();
  check('以纵向为主的滑动不误切栏目', await active() === '饮食');

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
  const backSwipe = await swipe(-140);
  check('反向左滑时翻转方向相反', backSwipe.outgoingEnd === 'rotateY(-180deg)'
    && backSwipe.incomingStart?.startsWith('rotateY(1'));
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
