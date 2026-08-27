/**
 * 底部弹层。
 *
 * 抽成公共件是因为它有两处不好写对，而每个用到弹层的地方都得写对：
 *
 * 1. **滚动穿透**。弹层内部滚到头之后，手指继续滑就会带着背后的页面跑，
 *    看着像点不中弹层里的东西。只给 body 加 overflow:hidden 在 iOS 上不管用，
 *    得把 body 钉成 position:fixed 并记住原来的滚动位置，关的时候还回去。
 * 2. **打开时的滚动位置**。iOS 上 fixed 定位的 body 会把页面滚回顶部，
 *    关掉之后必须滚回原处，否则每关一次弹层页面就跳一次。
 *
 * 同一时刻只允许一个弹层，所以整个应用共用这一份 DOM。
 */

import { h, clearEl, mount } from './utils.js';

let wrap = null;
let panel = null;
let onClose = null;
let lockedScrollY = 0;

function build() {
  if (wrap) return;
  panel = h('div.sheet', {
    role: 'dialog', 'aria-modal': 'true',
    // 弹层里的点击不该冒到背景那层去，否则点自己就把自己关了
    onclick: (ev) => ev.stopPropagation(),
  });
  wrap = h('div.sheet-wrap', { hidden: true },
    h('div.sheet-backdrop', { onclick: () => closeSheet() }),
    panel);
  document.body.append(wrap);
  // Esc 关闭：桌面上没有「点空白处」的手感，键盘得能退出来
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !wrap.hidden) closeSheet();
  });
}

/*
 * 真正在滚的是 <main class="view">，不是 body —— 应用的内容区自己是个滚动容器。
 * 所以光把 body 钉住没用：手指还是会把内容区滑走，表现就是「点不中弹层里的
 * 东西，反倒滑到了背后的页面」。两层都得锁。
 */
const scroller = () => document.querySelector('main.view');

function lockBody() {
  const el = scroller();
  lockedScrollY = el ? el.scrollTop : (window.scrollY || 0);
  document.body.classList.add('sheet-open');
  if (el) el.style.overflow = 'hidden';
  else document.body.style.top = `-${lockedScrollY}px`;
}

function unlockBody() {
  const el = scroller();
  document.body.classList.remove('sheet-open');
  document.body.style.top = '';
  if (el) el.style.overflow = '';
  else window.scrollTo(0, lockedScrollY);
}

/*
 * 滚动位置要等 onClose 里的重绘跑完再还。
 *
 * 关掉弹层常常伴随一次内容重绘（比如清掉选中的食物、重新插推荐卡），
 * 那次重绘会把 scrollTop 归零。先还再重绘等于白还，所以放到下一帧。
 */
function restoreScroll() {
  const el = scroller();
  if (!el) return;
  requestAnimationFrame(() => { el.scrollTop = lockedScrollY; });
}

/**
 * 打开弹层。
 * @param {Node|Node[]} content 弹层内容
 * @param {object} opts
 *  - label   无障碍名称
 *  - onClose 关闭时回调（点背景、按 Esc、或调用 closeSheet 都会触发）
 */
export function openSheet(content, { label = '', onClose: close = null } = {}) {
  build();
  onClose = close;
  panel.setAttribute('aria-label', label);
  clearEl(panel);
  mount(panel, content);
  wrap.hidden = false;
  panel.scrollTop = 0;
  lockBody();
  return closeSheet;
}

export function closeSheet() {
  if (!wrap || wrap.hidden) return;
  wrap.hidden = true;
  clearEl(panel);
  unlockBody();
  const fn = onClose;
  onClose = null;
  if (fn) fn();
  restoreScroll();
}

export const sheetIsOpen = () => !!wrap && !wrap.hidden;
