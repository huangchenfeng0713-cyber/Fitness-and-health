/** 应用入口：标签路由、首次启动引导、定时刷新 */

import { h, $, clearEl, todayKey, toast, dayHeading, shiftDay, copyText } from './lib/utils.js';
import { initStore, subscribe, state, recompute, saveProfile, setDay } from './lib/store.js';
import { importFromUrlHash } from './lib/importer.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDiet } from './views/diet.js';
import { renderHealth } from './views/health.js';
import { renderTraining } from './views/training.js';
import { renderSettings, resetSettingsView } from './views/settings.js';
import { APP_VERSION, buildDiagnostics, formatDiagnostics } from './core/feedback.js';
import {
  initCloud, getAccountState, subscribeAccount,
  accountSessionMayExist, accountOwnershipUncertain,
} from './lib/account.js';
import { pullAccountHealth, resetHealthCloudState } from './lib/health-cloud-sync.js';
import { inspectCloudConfig } from './config/cloud.js';
import { iconSvg } from './lib/icons.js';

const TABS = [
  { key: 'today', label: '今日', icon: 'today', render: renderDashboard, dated: true },
  { key: 'diet', label: '饮食', icon: 'diet', render: renderDiet, dated: true },
  { key: 'health', label: '数据', icon: 'pulse', render: renderHealth },
  { key: 'training', label: '健身', icon: 'training', render: renderTraining },
];

let current = 'today';
let viewRoot = null;
let settingsOverlay = null;
let settingsRoot = null;
let settingsOpen = false;
let settingsOpener = null;
let settingsCloseTimer = null;
let accountBootstrapPending = false;

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
    h('button.settings-close', { onclick: () => closeSettings(), 'aria-label': '收起设置' },
      h('span', { html: iconSvg('close') }))),
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
  try { resetSettingsView(); } catch (_) {}
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
