/** 应用入口：标签路由、首次启动引导、定时刷新 */

import { h, $, clearEl, todayKey, toast, formatDayLabel, shiftDay } from './lib/utils.js';
import { initStore, subscribe, state, recompute, saveProfile, setDay } from './lib/store.js';
import { importFromUrlHash } from './lib/importer.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDiet } from './views/diet.js';
import { renderHealth } from './views/health.js';
import { renderTrends } from './views/trends.js';
import { renderSettings } from './views/settings.js';

const TABS = [
  // dated: 该页按天查看，顶栏直接放日期导航；其余页顶栏只显示页名
  { key: 'today', label: '今日', icon: '◎', render: renderDashboard, dated: true },
  { key: 'diet', label: '记录', icon: '＋', render: renderDiet, dated: true },
  { key: 'health', label: '健康', icon: '♡', render: renderHealth },
  { key: 'trends', label: '趋势', icon: '◫', render: renderTrends },
  { key: 'settings', label: '设置', icon: '⚙', render: renderSettings },
];

let current = 'today';
let viewRoot = null;

/**
 * 顶栏。
 *
 * 原本是「应用名 + 副标题」一整行，下面再压一张独立的日期卡 ——
 * 两者都是「当前上下文」，加起来吃掉首屏 23% 的高度。合成一行：
 * 按天看的页面直接把日期切换放这儿，其余页面显示页名。
 */
function renderTopbar() {
  const bar = $('#topbar-inner');
  if (!bar) return;
  clearEl(bar);
  const tab = TABS.find((t) => t.key === current) || TABS[0];

  if (!tab.dated) {
    bar.append(h('h1', null, tab.label));
    return;
  }

  const isToday = state.day === todayKey();
  bar.append(
    h('button.nav-arrow', {
      onclick: () => setDay(shiftDay(state.day, -1)),
      'aria-label': '前一天',
    }, '‹'),
    h('button.topbar-day', {
      onclick: () => !isToday && setDay(todayKey()),
      title: isToday ? '' : '回到今天',
    },
    h('strong', null, formatDayLabel(state.day)),
    h('span.topbar-date', null, isToday ? state.day.slice(5) : `${state.day.slice(5)} · 回今天`)),
    h('button.nav-arrow', {
      onclick: () => setDay(shiftDay(state.day, 1)),
      disabled: isToday,
      'aria-label': '后一天',
    }, '›'),
  );
}

function renderTabs() {
  const nav = $('#tabbar');
  clearEl(nav);
  for (const tab of TABS) {
    nav.append(h('button', {
      class: `tab${current === tab.key ? ' active' : ''}`,
      onclick: () => switchTab(tab.key),
    }, h('span.tab-icon', null, tab.icon), h('span.tab-label', null, tab.label)));
  }
}

function switchTab(key) {
  current = key;
  location.hash = key;
  renderTabs();
  renderTopbar();
  syncOnboarding();
  renderCurrent();

  runUrlImport();
  viewRoot?.scrollTo({ top: 0, behavior: 'instant' });   // 滚动容器是 #view，不是 window
}

/** 焦点在输入控件里时不要重绘：DOM 一换，iOS 会收起键盘、日期选择器会被当场提交 */
function isEditing() {
  const el = document.activeElement;
  if (!el || !viewRoot?.contains(el)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
}

function renderCurrent() {
  const tab = TABS.find((t) => t.key === current) || TABS[0];
  try {
    tab.render(viewRoot);
  } catch (err) {
    console.error(err);
    clearEl(viewRoot).append(h('section.card', null,
      h('h3.card-title', null, '这个页面出错了'),
      h('p.empty-hint', null, String(err?.message || err))));
  }
}

/**
 * 首次使用时的引导横幅。
 *
 * 必须渲染进顶栏之后的插槽：早先直接 prepend 到 #app，横幅就排在
 * 顶栏之前，而安全区内边距只加在顶栏上 —— 加到主屏幕全屏运行时，
 * 横幅整个跑到状态栏底下，顶部内容看不全。
 */
function syncOnboarding() {
  const slot = $('#banner');
  if (!slot) return;
  // 人已经在设置页填表了，横幅只会碍事
  if (state.profile.onboarded || current === 'settings') {
    clearEl(slot);
    return;
  }
  if (slot.firstChild) return;
  slot.append(h('div.onboard', null,
    h('h2', null, '先花 30 秒填一下身体信息'),
    h('p', null, '热量与蛋白目标都由这些数据算出来。填完就能开始记录，之后随时能在「设置」里改。'),
    h('button.primary-btn', { onclick: () => switchTab('settings') }, '去填写'),
    h('button.text-btn', {
      onclick: () => saveProfile({ demoMode: true, onboarded: true }),
    }, '使用演示数据预览'),
  ));
}

/** 快捷指令可以直接打开 #import=<JSON> 完成同步，不用手动传文件 */
function runUrlImport() {
  importFromUrlHash().then((outcome) => {
    if (!outcome) return;
    toast(outcome.message, outcome.ok ? 'ok' : 'error');
    if (outcome.ok) renderCurrent();
  }).catch((err) => {
    console.error('URL 导入失败', err);
    toast('导入失败，请检查链接里的数据格式', 'error');
  });
}

/*
 * 安全区（刘海 / 状态栏 / 底部横条）不能只交给 CSS 的 env() 算一次。
 *
 * iOS 上把网页加到主屏幕独立运行时，env(safe-area-inset-*) 在首帧经常还是 0，
 * 要等一次重排才会给出真值。用户看到的就是：顶栏一开始压在状态栏底下，标题被
 * 状态栏那层半透明糊住；随手在页面上双击一下（双击本身触发了重排），整页内容
 * 才「哐」地下移一个状态栏的高度，毛玻璃也跟着没了。反复改 CSS 治不好，因为
 * CSS 只在样式重算时才会重新读 env()，而那次重算迟迟不来。
 *
 * 这里的做法：每个可能重排的时机都拿探针重新量一遍 env()，量到多少就写多少到
 * <html> 上。写变量这个动作本身会触发重绘，等于把用户手动双击的那一下替我们做了。
 */
const STATUS_BAR_FALLBACK = 44;   // 兜底用的状态栏高度（pt），只在确认网页盖住状态栏却量到 0 时才用

function readEnvInsets() {
  // 自定义属性在 getComputedStyle 里拿到的是 env(...) 这段文本本身，不是算出来的长度，
  // 所以得插一个真实元素、把值落到 padding 上，再读它的计算值。
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;'
    + 'padding:var(--env-top) var(--env-right) var(--env-bottom) var(--env-left);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const px = (v) => Math.max(0, Math.round(parseFloat(v) || 0));
  const out = {
    top: px(cs.paddingTop), bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft), right: px(cs.paddingRight),
  };
  probe.remove();
  return out;
}

/** 是否以「添加到主屏幕」的独立窗口在跑 */
function isStandalone() {
  return navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches;
}

function applySafeInsets() {
  const env = readEnvInsets();
  /*
   * 只有「独立运行 + 窗口正好铺满整块屏幕」才说明网页真的伸到了状态栏底下，
   * 这时量到 0 一定是没算出来，得兜一个状态栏的高度。状态栏样式是 default 时
   * 系统会把窗口顶下来，innerHeight 比屏幕矮一截，就不该再补——补了就是白留一条。
   */
  const coversStatusBar = isStandalone() && window.innerHeight >= (window.screen?.height ?? 0) - 1;
  const top = coversStatusBar ? Math.max(env.top, STATUS_BAR_FALLBACK) : env.top;
  const root = document.documentElement;
  const set = (name, v) => {
    if (root.style.getPropertyValue(name) !== `${v}px`) root.style.setProperty(name, `${v}px`);
  };
  set('--safe-top', top);
  set('--safe-bottom', env.bottom);
  set('--safe-left', env.left);
  set('--safe-right', env.right);
}

function watchSafeInsets() {
  applySafeInsets();
  // iOS 那个真值可能晚几帧才到，多补几次；之后就只靠事件驱动。
  requestAnimationFrame(applySafeInsets);
  [120, 400, 1200].forEach((ms) => setTimeout(applySafeInsets, ms));
  ['resize', 'orientationchange', 'pageshow', 'focus'].forEach((evt) =>
    window.addEventListener(evt, applySafeInsets));
  window.visualViewport?.addEventListener('resize', applySafeInsets);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) applySafeInsets(); });
}

async function boot() {
  watchSafeInsets();
  viewRoot = $('#view');
  const hash = location.hash.replace('#', '');
  if (TABS.some((t) => t.key === hash)) current = hash;

  try {
    await initStore();
  } catch (err) {
    console.error(err);
    clearEl(viewRoot).append(h('section.card', null,
      h('h3.card-title', null, '本地存储不可用'),
      h('p.empty-hint', null, '浏览器的 IndexedDB 打不开。如果在无痕模式下浏览，请换普通窗口再试。')));
    return;
  }

  renderTabs();
  renderTopbar();
  syncOnboarding();
  renderCurrent();

  runUrlImport();

  subscribe(() => { renderTopbar(); syncOnboarding(); renderCurrent(); });

  // 时间在走，“下一餐”仍要刷新；热量外推使用健康快照时间，不再跟当前时钟漂移。
  // 只在用户原本跟随“今天”时自动跨日，避免把正在查看历史日期的人强行拉走。
  let clockDay = todayKey();
  const refreshClock = async () => {
    if (isEditing()) return;
    const nextDay = todayKey();
    const wasFollowingToday = state.day === clockDay;
    if (nextDay !== clockDay) {
      clockDay = nextDay;
      if (wasFollowingToday) {
        await setDay(nextDay);
        return;
      }
    }
    if (state.day !== nextDay) return;
    recompute();
    if (current === 'today' || current === 'diet') renderCurrent();
  };
  setInterval(refreshClock, 60_000);

  // 从后台切回来时刷新一次
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || isEditing()) return;
    await refreshClock();
    if (current !== 'today' && current !== 'diet') renderCurrent();
  });

  window.addEventListener('hashchange', () => {
    // App 已经开着时再打开一个 #import= 链接属于同文档跳转，页面不会重新加载，
    // 得在这里补一次导入，否则快捷指令的「打开 URL」只在冷启动时有效。
    if (/[#&]import=/.test(location.hash)) {
      runUrlImport();
      return;
    }
    const next = location.hash.replace('#', '');
    if (TABS.some((t) => t.key === next) && next !== current) switchTab(next);
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
  }
}

boot();
