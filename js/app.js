/** 应用入口：标签路由、首次启动引导、定时刷新 */

import { h, $, clearEl, todayKey } from './lib/utils.js';
import { initStore, subscribe, state, recompute, saveProfile } from './lib/store.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDiet } from './views/diet.js';
import { renderHealth } from './views/health.js';
import { renderTrends } from './views/trends.js';
import { renderSettings } from './views/settings.js';

const TABS = [
  { key: 'today', label: '今日', icon: '◎', render: renderDashboard },
  { key: 'diet', label: '记录', icon: '＋', render: renderDiet },
  { key: 'health', label: '健康', icon: '♡', render: renderHealth },
  { key: 'trends', label: '趋势', icon: '◫', render: renderTrends },
  { key: 'settings', label: '设置', icon: '⚙', render: renderSettings },
];

let current = 'today';
let viewRoot = null;

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
  syncOnboarding();
  renderCurrent();
  window.scrollTo({ top: 0, behavior: 'instant' });
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
    h('button.text-btn', { onclick: () => saveProfile({}) }, '先看看再说'),
  ));
}

async function boot() {
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
  syncOnboarding();
  renderCurrent();

  subscribe(() => { syncOnboarding(); renderCurrent(); });

  // 时间在走，剩余预算和"下一餐"也要跟着变
  setInterval(() => {
    if (state.day !== todayKey() || isEditing()) return;
    recompute();
    if (current === 'today' || current === 'diet') renderCurrent();
  }, 60_000);

  // 从后台切回来时刷新一次
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || isEditing()) return;
    recompute();
    renderCurrent();
  });

  window.addEventListener('hashchange', () => {
    const next = location.hash.replace('#', '');
    if (TABS.some((t) => t.key === next) && next !== current) switchTab(next);
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
  }
}

boot();
