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
import { dragGesture } from './gesture.js';

let wrap = null;
let panel = null;
let scrollArea = null;
let footer = null;
let onClose = null;
let lockedScrollY = 0;

function build() {
  if (wrap) return;
  panel = h('div.sheet', {
    role: 'dialog', 'aria-modal': 'true',
    // 弹层里的点击不该冒到背景那层去，否则点自己就把自己关了
    onclick: (ev) => ev.stopPropagation(),
  },
  scrollArea = h('div.sheet-scroll'),
  footer = h('div.sheet-footer', { hidden: true }));
  wrap = h('div.sheet-wrap', { hidden: true },
    h('div.sheet-backdrop', { onclick: () => closeSheet() }),
    panel);
  document.body.append(wrap);
  attachDragToClose();
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
  clearEl(scrollArea);
  clearEl(footer);
  footer.hidden = true;
  panel.classList.remove('has-footer');
  mount(scrollArea, content);
  wrap.hidden = false;
  scrollArea.scrollTop = 0;
  lockBody();
  return closeSheet;
}

/**
 * 把主操作放进弹层自己的固定底栏，而不是让正文里的 sticky 元素假装吸底。
 *
 * sticky 元素仍会在普通文档流里占位置：长份量面板中，它会提前浮到视口底部，
 * 同时把原位置留成一大块白边，甚至盖住后面的「记到哪一餐」。正文和底栏分开后，
 * 两边各自只有一种布局职责，也只需在底栏计算一次 iPhone 安全区。
 */
export function setSheetFooter(content) {
  build();
  clearEl(footer);
  if (content) {
    mount(footer, content);
    footer.hidden = false;
    panel.classList.add('has-footer');
  } else {
    footer.hidden = true;
    panel.classList.remove('has-footer');
  }
}

export function closeSheet() {
  if (!wrap || wrap.hidden) return;
  wrap.hidden = true;
  // 跟手时写在行内的位移和遮罩透明度要清掉，否则下次打开是歪的、背景还是透的
  panel.style.transform = '';
  panel.style.transition = '';
  const backdrop = wrap.querySelector('.sheet-backdrop');
  if (backdrop) backdrop.style.opacity = '';
  clearEl(scrollArea);
  clearEl(footer);
  footer.hidden = true;
  panel.classList.remove('has-footer');
  unlockBody();
  const fn = onClose;
  onClose = null;
  if (fn) fn();
  restoreScroll();
}

export const sheetIsOpen = () => !!wrap && !wrap.hidden;

/*
 * 往下滑关掉弹层。
 *
 * iOS 上人人都会试这一下，而这个弹层原先只能点背景关 —— 而背景那圈在
 * 份量面板打开时只剩顶上一条。
 *
 * 两件事得写对：
 *
 * 1. **内容还能往上滚的时候不接管。** 手指在 .sheet-scroll 里往下拖，
 *    如果那块内容没滚到顶，那一下是在滚内容，不是在关弹层。
 *    只有滚到顶（scrollTop <= 0）才让位移变成关闭手势。
 * 2. **关不掉就得弹回去。** 松手时位移不够、甩速也不够，要把 transform 收回 0；
 *    收回的过程走 Web Animations，别留一个歪着的弹层。
 */
const CLOSE_DISTANCE = 96;     // 拖过这么远就算要关
const CLOSE_VELOCITY = 0.5;    // 或者甩得够快（px/ms）

function attachDragToClose() {
  let height = 0;
  dragGesture(panel, {
    axis: 'y',
    threshold: 8,
    canStart: (ev) => {
      // 手指落在还能往上滚的内容里，这一下归内容
      const scroller = ev.target instanceof Element ? ev.target.closest('.sheet-scroll') : null;
      return !scroller || scroller.scrollTop <= 0;
    },
    onStart: () => {
      height = panel.getBoundingClientRect().height || 1;
      panel.style.transition = 'none';
    },
    onMove: ({ dy }) => {
      // 只跟着往下走；往上拖时给一点阻尼，让人知道到头了
      const offset = dy >= 0 ? dy : dy / 6;
      panel.style.transform = `translateY(${offset}px)`;
      const backdrop = wrap.querySelector('.sheet-backdrop');
      if (backdrop) backdrop.style.opacity = String(Math.max(0, 1 - (Math.max(0, dy) / height) * 1.2));
    },
    onEnd: ({ dy, velocity }) => {
      const backdrop = wrap.querySelector('.sheet-backdrop');
      const leaving = dy > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY;
      if (leaving) {
        closeSheet();
        panel.style.transform = '';
        if (backdrop) backdrop.style.opacity = '';
        return;
      }
      // 不够，弹回去
      const from = panel.style.transform || 'translateY(0px)';
      panel.style.transform = '';
      if (backdrop) backdrop.style.opacity = '';
      if (typeof panel.animate === 'function') {
        panel.animate([{ transform: from }, { transform: 'translateY(0px)' }],
          { duration: 240, easing: 'cubic-bezier(.32,.72,0,1)' });
      }
    },
  });
}
