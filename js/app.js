/** 应用入口：标签路由、首次启动引导、定时刷新 */

import { h, $, clearEl, todayKey, toast, formatDayLabel, shiftDay } from './lib/utils.js';
import { initStore, subscribe, state, recompute, saveProfile, setDay } from './lib/store.js';
import { importFromUrlHash } from './lib/importer.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDiet } from './views/diet.js';
import { renderHealth } from './views/health.js';
import { renderTraining } from './views/training.js';
import { renderSettings } from './views/settings.js';
import { APP_VERSION } from './core/feedback.js';
import { initCloud, getAccountState, subscribeAccount } from './lib/account.js';
import { pullAccountHealth, resetHealthCloudState } from './lib/health-cloud-sync.js';
import { inspectCloudConfig } from './config/cloud.js';

const TABS = [
  // dated: 该页按天查看，顶栏直接放日期导航；其余页顶栏只显示页名
  { key: 'today', label: '今日', icon: 'today', render: renderDashboard, dated: true },
  { key: 'diet', label: '饮食', icon: 'add', render: renderDiet, dated: true },
  { key: 'health', label: '数据', icon: 'data', render: renderHealth },
  { key: 'training', label: '健身', icon: 'training', render: renderTraining },
];

const TAB_ICON = {
  today: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.7 1.7"/></svg>',
  add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  data: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h3l2-6 4 11 2-5h5"/></svg>',
  training: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h6M14 7h6M4 17h9M17 17h3"/><circle cx="12" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></svg>',
};

let current = 'today';
let viewRoot = null;
let settingsOverlay = null;
let settingsRoot = null;
let settingsOpen = false;
let settingsOpener = null;
let settingsCloseTimer = null;
let accountBootstrapPending = false;

/** 设置是全局偏好，不占一个主栏目；从右侧抽屉随时打开。 */
function ensureSettingsDrawer() {
  if (settingsOverlay) return;
  settingsRoot = h('div.settings-drawer-content');
  const drawer = h('aside.settings-drawer', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'settings-drawer-title',
    onclick: (event) => event.stopPropagation(),
  },
  h('div.settings-drawer-head', null,
    h('h2#settings-drawer-title', null, '设置'),
    h('button.settings-close', { onclick: () => closeSettings(), 'aria-label': '收起设置' }, '×')),
  settingsRoot);

  drawer.addEventListener('click', (event) => {
    if (event.target.closest('a[href^="#"]')) closeSettings({ restoreHash: false });
  });
  settingsOverlay = h('div.settings-overlay', {
    hidden: true,
    'aria-hidden': 'true',
    onclick: () => closeSettings(),
  }, drawer);
  document.body.append(settingsOverlay);
}

function openSettings() {
  ensureSettingsDrawer();
  clearTimeout(settingsCloseTimer);
  settingsOpener = document.activeElement;
  renderSettings(settingsRoot);
  settingsOverlay.hidden = false;
  settingsOverlay.setAttribute('aria-hidden', 'false');
  $('#app').inert = true;
  settingsOpen = true;
  syncOnboarding();
  requestAnimationFrame(() => {
    settingsOverlay.classList.add('open');
    settingsOverlay.querySelector('.settings-close')?.focus({ preventScroll: true });
  });
}

function closeSettings({ restoreHash = true } = {}) {
  if (!settingsOverlay || !settingsOpen) return;
  settingsOverlay.classList.remove('open');
  settingsOverlay.setAttribute('aria-hidden', 'true');
  $('#app').inert = false;
  settingsOpen = false;
  syncOnboarding();
  settingsCloseTimer = setTimeout(() => { settingsOverlay.hidden = true; }, 220);
  if (restoreHash && location.hash === '#settings') {
    history.replaceState(null, '', `#${current}`);
  }
  settingsOpener?.focus?.({ preventScroll: true });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && settingsOpen) closeSettings();
});

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
  const context = h('div.topbar-context');
  const settingsButton = h('button.topbar-settings-btn', {
    onclick: openSettings,
    'aria-label': '打开设置',
    title: '设置',
  }, h('span', { html: TAB_ICON.settings }));

  if (!tab.dated) {
    const cutoff = state.day === todayKey()
      ? `今天 · ${state.day.slice(5)}`
      : formatDayLabel(state.day);
    context.classList.add('topbar-page-context');
    // 健身页不按日期统计，标「数据截至」只会让人以为动作库跟日期有关
    const noteText = tab.key === 'training'
      ? '按身体部位或动作模式挑选，记下组数与重量'
      : `数据截至 ${cutoff}`;
    context.append(
      h('h1', null, tab.label),
      h('span.topbar-context-note', null, noteText),
    );
    bar.append(context, settingsButton);
    return;
  }

  const isToday = state.day === todayKey();
  context.append(
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
  bar.append(context, settingsButton);
}

function renderTabs() {
  const nav = $('#tabbar');
  clearEl(nav);
  for (const tab of TABS) {
    nav.append(h('button', {
      class: `tab${current === tab.key ? ' active' : ''}`,
      onclick: () => switchTab(tab.key),
      'aria-current': current === tab.key ? 'page' : null,
      'aria-label': tab.label,
    }, h('span.tab-icon', { html: TAB_ICON[tab.icon] }), h('span.tab-label', null, tab.label)));
  }
}

function switchTab(key) {
  if (key === 'settings') {
    openSettings();
    return;
  }
  if (settingsOpen) closeSettings({ restoreHash: false });
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
  if (!el) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
}

/*
 * 定时器、可见性、账号轮询这几条路都记得躲开输入框，唯独 store 订阅这条没有 ——
 * 于是在饮食记录里改克数时，后台任何一次落库（五分钟一次的账号健康轮询、
 * 云端同步拉到新数据）都会把整页重绘一遍，正在编辑的那个 input 被连根换掉：
 * 焦点回到 body，iOS 收起键盘，敲了一半的数字也没了。
 *
 * 跳过不能就这么算了，否则页面会一直停在旧数据上。记一笔，等这次输入结束补上。
 */
let renderPending = false;

function renderCurrentSafely({ force = false } = {}) {
  if (!force && isEditing()) { renderPending = true; return; }
  renderPending = false;
  renderCurrent();
}

document.addEventListener('focusout', () => {
  if (!renderPending) return;
  /*
   * 等一拍再判断：在两个格子之间跳的时候，focusout 先于下一个 focusin 触发，
   * 这一刻 activeElement 还是 body，直接重绘等于把用户从第二个框里踢出去。
   */
  setTimeout(() => {
    if (renderPending && !isEditing()) renderCurrentSafely();
  }, 0);
});

function accountDataLocked(account = getAccountState()) {
  return accountBootstrapPending
    || account.ownershipPending === true
    || account.status === 'locked'
    || (account.status === 'loading' && !account.user)
    || (account.status === 'conflict' && account.conflict?.reason === 'orphan-local-data');
}

function renderAccountLock() {
  const account = getAccountState();
  if (accountBootstrapPending) {
    clearEl(viewRoot).append(h('section.card.account-data-lock', {
      role: 'status', 'aria-live': 'polite',
    },
    h('span.status-pill', null, '正在启动'),
    h('h2', null, '正在确认账号与本机记录'),
    h('p', null, '完成前暂不显示个人数据，避免账号切换时短暂出现上一份记录。网络较慢时可能需要几秒。')));
    return;
  }
  const orphan = account.conflict?.reason === 'orphan-local-data';
  const transitioning = account.ownershipPending === true && account.status !== 'locked' && !orphan;
  const signingOut = account.transitionReason === 'safe-signout';
  const preservedExit = account.transitionReason === 'preserved-signout';
  const unavailable = account.transitionReason === 'auth-unavailable';
  clearEl(viewRoot).append(h('section.card.account-data-lock', {
    role: 'alert', 'aria-live': 'assertive',
  },
  h('span.status-pill.warn', null, transitioning ? '正在保护账号数据' : '账号数据已锁定'),
  h('h2', null, transitioning
    ? (preservedExit ? '正在保留本机记录并退出'
      : signingOut ? '正在安全退出' : '正在确认账号数据归属')
    : (orphan ? '请先确认这份本机数据属于谁'
      : unavailable ? '云账号暂时不可用'
        : preservedExit ? '已退出，原账号记录已锁定保留' : '登录状态已失效')),
  h('p', null, transitioning
    ? '确认完成前不会显示或修改本机健康数据，避免账号切换期间短暂泄露上一份记录。'
    : orphan
      ? '检测到没有可靠账号归属的本机记录。为防止把上一位用户的数据上传到新账号，确认前不会显示、修改或自动上传。'
      : unavailable
        ? '本机仍有明确属于原账号的数据。账号服务恢复前会保持锁定，不会降级为访客数据展示。'
        : preservedExit
          ? '云端同步未完成，因此应用没有删除本机记录。重新登录原账号后可恢复并继续同步。'
        : '本机仍有属于原账号且尚未确认同步的数据。为防止丢失或被其他账号看到，重新验证原账号前不会显示或修改。'),
  !transitioning && h('p.empty-hint', null, orphan
    ? '在“设置 → 账号与云同步”中明确选择保留本机数据或采用云端数据。'
    : unavailable
      ? '请在站点配置或网络恢复后刷新，再用原账号继续。'
      : '请在“设置 → 账号与云同步”中用原来的邮箱或 Google 账号重新登录。'),
  !transitioning && h('div.account-actions', null,
    h('button.primary-btn', { onclick: openSettings }, '打开账号设置'))));
}

function renderCurrent() {
  if (accountDataLocked()) {
    renderAccountLock();
    return;
  }
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
  const existing = slot.querySelector('.onboard');
  // 人已经在设置抽屉填表了，横幅只会碍事
  if (state.profile.onboarded || settingsOpen || accountDataLocked()) {
    existing?.remove();
    return;
  }
  if (existing) return;
  slot.append(h('div.onboard', null,
    h('h2', null, '先花 30 秒填一下身体信息'),
    h('p', null, '热量与蛋白目标都由这些数据算出来。填完就能开始记录，之后随时能在「设置」里改。'),
    h('button.primary-btn', { onclick: openSettings }, '去填写'),
    h('button.text-btn', {
      onclick: () => saveProfile({ demoMode: true, onboarded: true }),
    }, '使用演示数据预览'),
  ));
}

function showUpdateNotice() {
  const slot = $('#banner');
  if (!slot || slot.querySelector('.update-notice')) return;
  slot.prepend(h('div.update-notice', null,
    h('div', null,
      h('strong', null, '发现新版本'),
      h('span', null, `当前页面仍是 v${APP_VERSION}，刷新后切换到最新代码。`)),
    h('button', { onclick: () => location.reload() }, '立即更新')));
}

async function registerServiceWorker({ waitForControl = false } = {}) {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  const hadController = !!navigator.serviceWorker.controller;
  if (hadController) {
    navigator.serviceWorker.addEventListener('controllerchange', showUpdateNotice, { once: true });
  }
  try {
    // 不沿用 HTTP 缓存检查 sw.js，否则 GitHub Pages 的十分钟缓存会让已部署的新版本
    // 看起来仍像旧页面。控制器切换后由用户点击刷新，避免打断正在填写的表单。
    const registration = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), {
      updateViaCache: 'none',
    });
    await registration.update().catch(() => {});
    if (waitForControl && (!navigator.serviceWorker.controller
      || registration.installing || registration.waiting)) {
      await Promise.race([
        new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })),
        new Promise((resolve) => setTimeout(resolve, 8_000)),
      ]);
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) registration.update().catch(() => {});
    });
    return registration;
  } catch (err) {
    console.warn('离线缓存注册失败', err);
    return null;
  }
}

/** 快捷指令可以直接打开 #import=<JSON> 完成同步，不用手动传文件 */
function runUrlImport() {
  if (accountDataLocked()) {
    if (/[#&]import=/.test(location.hash)) history.replaceState(null, '', `#${current}`);
    toast('账号数据已锁定，重新验证归属后才能导入', 'warn');
    return;
  }
  importFromUrlHash().then((outcome) => {
    if (!outcome) return;
    toast(outcome.ok
      ? (outcome.days ? `同步完成：已更新 ${outcome.days} 天健康数据` : 'Apple 健康快照已同步')
      : outcome.message, outcome.ok ? 'ok' : 'error');
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
  const openSettingsOnBoot = hash === 'settings';
  if (TABS.some((t) => t.key === hash)) current = hash;

  try {
    await initStore();
  } catch (err) {
    console.error(err);
    /*
     * 交给启动页自己处理。index.html 的 #boot-screen 上已经有
     * 「修复缓存并重新打开」和「不会删除记录」的说明，就是为这种情况做的。
     *
     * 之前这里先 clearEl(viewRoot) 把启动页从 DOM 里摘掉、再调 ready()：
     * showRecovery() 因为 screen.isConnected 已经是 false 直接返回，
     * 自救按钮永远不出现，用户只剩一条「IndexedDB 打不开」的提示——
     * 而能在 initStore 里失败的不只是存储，数据迁移和身体信息校验都在里面。
     */
    const storageLike = /indexeddb|quota|storage|database/i
      .test(String(err?.name || '') + String(err?.message || ''));
    window.__HEALTH_DIET_BOOT__?.fail?.(storageLike
      ? new Error(`${err.message}。如果在无痕模式下浏览，请换普通窗口再试。`)
      : err);
    return;
  }

  // 不等待网络即可先画出明确的启动状态，但必须在任何可交互 UI 出现前启动
  // 账号归属检查。initialize() 会同步把公开状态切成 loading，设置抽屉因此也
  // 使用与主视图相同的保护门，不会在这几秒里闪现旧账号的身体资料。
  accountBootstrapPending = inspectCloudConfig().configured;
  void registerServiceWorker({ waitForControl: false });
  const cloudInitialization = initCloud();
  window.addEventListener('online', () => {
    // The online event can arrive while the first attempt is still timing out.
    // Wait for that idempotent attempt, then start one fresh retry if needed.
    void initCloud().then(() => {
      const account = getAccountState();
      const authUnavailable = account.configured
        && (account.transitionReason === 'auth-unavailable' || account.status === 'local');
      return authUnavailable ? initCloud() : null;
    }).catch((error) => console.warn('云账号重新连接失败', error));
  });
  renderTabs();
  renderTopbar();
  syncOnboarding();
  renderCurrent();

  // 账号功能是可选增强：配置缺失、离线或云服务不可用时继续使用本地模式。
  try {
    await cloudInitialization;
  } catch (err) {
    console.warn('云账号初始化失败，已保留本地模式', err);
  } finally {
    accountBootstrapPending = false;
  }

  renderTabs();
  renderTopbar();
  syncOnboarding();
  renderCurrent();
  if (openSettingsOnBoot) openSettings();
  window.__HEALTH_DIET_BOOT__?.ready?.();

  runUrlImport();

  const refreshAccountHealth = async ({ minIntervalMs = 0 } = {}) => {
    if (isEditing()) return { skipped: true };
    try {
      const outcome = await pullAccountHealth({ minIntervalMs });
      // 有新健康行时 mergeHealthDays 会自己触发 store 重绘；没有新行时补一次，
      // 让数据页的设备状态和“最近读取”时间也及时更新。
      if (!outcome.skipped && !outcome.importedDays && current === 'health') renderCurrent();
      return outcome;
    } catch (error) {
      console.warn('账号健康数据读取失败', error);
      if (current === 'health') renderCurrent();
      return { skipped: false, error };
    }
  };

  subscribe(() => {
    renderTopbar();
    syncOnboarding();
    renderCurrentSafely();
    if (settingsOpen && !isEditing()) renderSettings(settingsRoot);
  });

  let healthAccountUserId = null;
  subscribeAccount((account) => {
    syncOnboarding();
    // 账号归属变为不确定时必须立即移除旧资料，即使焦点仍在体重/生日输入框里。
    // 只有普通状态刷新才为了保留键盘和草稿而跳过重绘。
    const locked = accountDataLocked(account);
    renderCurrentSafely({ force: locked });
    if (settingsOpen && (locked || !isEditing())) renderSettings(settingsRoot);
    const nextUserId = account.user?.id || null;
    if (!nextUserId) {
      healthAccountUserId = null;
      resetHealthCloudState();
      return;
    }
    const ready = !accountDataLocked(account)
      && !account.ownershipPending
      && !['loading', 'conflict', 'locked'].includes(account.status);
    if (ready && nextUserId !== healthAccountUserId) {
      resetHealthCloudState();
      healthAccountUserId = nextUserId;
      void refreshAccountHealth();
    }
  });

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
  // 网页保持打开时每五分钟看一次账号；快捷指令本身直接写云端，不依赖这个轮询。
  setInterval(() => { void refreshAccountHealth({ minIntervalMs: 4 * 60_000 }); }, 5 * 60_000);

  // 从后台切回来时刷新一次
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || isEditing()) return;
    await refreshClock();
    await refreshAccountHealth({ minIntervalMs: 60_000 });
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
    if (next === 'settings') {
      openSettings();
      return;
    }
    if (TABS.some((t) => t.key === next)) {
      if (settingsOpen) closeSettings({ restoreHash: false });
      if (next !== current) switchTab(next);
    }
  });
}

boot().catch((error) => {
  console.error('应用启动失败', error);
  window.__HEALTH_DIET_BOOT__?.fail?.(error);
});
