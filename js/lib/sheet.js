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

import { h, clearEl, mount, scrimDismiss } from './utils.js';
import { dragGesture } from './gesture.js';

let wrap = null;
let panel = null;
let scrollArea = null;
let footer = null;
let onClose = null;
let lockedScrollY = 0;
/*
 * 正在往下退场。
 *
 * 状态（onClose、解锁、还滚动位置）关的那一刻就同步做完 —— 调用方依赖这个时序，
 * 「确认」按钮先 resolve 再关就是靠它。只有**画面上那一下**留给动画，
 * 所以 sheetIsOpen() 立刻就报 false，内容也等动画跑完再清，免得半路空掉。
 */
let closing = false;
let exitAnim = null;
let inputGuardTimer = null;
let dismissGuardTimer = null;
let exitTimer = null;
/*
 * 开场有两道闸门，管的是两件事，所以时长也不一样。
 *
 * - **输入闸门**（INPUT_GUARD_MS）：刚升起来的那几帧弹层自己不接事件，
 *   iOS 把同一次触摸补派过来时，那一下落不到「记录到午餐」上。
 *   升起动画 240ms，过了就该能按 —— 两道闸门原先合成一个 700ms 的，
 *   代价是弹层已经稳稳停在那儿了，＋、克数框、记录键还有半秒钟按不动。
 * - **关闭闸门**（DISMISS_GUARD_MS）：这段时间里点背景、下滑、Esc、取消
 *   一律关不掉它。这一档要长 —— 「点开又瞬间收起」正是这个弹层踩过的坑。
 *
 * **没就绪不等于让开。** wrap 自己一直接事件（CSS 里 .sheet-wrap 不再写
 * pointer-events: none），把那几下原地吞掉。让开的话点击会穿到背后那一页上：
 * 实测能点中被弹层盖住的搜索结果，浏览器还会把紧接着的那一下当成滚动接管
 * （pointerdown 之后直接来一个 pointercancel），于是往下滑关不掉弹层 ——
 * scripts/smoke.mjs 里那条拖拽用例当场就红了。
 */
const INPUT_GUARD_MS = 300;
const DISMISS_GUARD_MS = 700;
const EXIT_MS = 280;
/** 用户现在能不能把它关掉。真正记完一笔、复制昨天那些调用传 force 绕过 */
let userCanDismiss = false;
const sheetReady = () => !!wrap && !wrap.hidden && userCanDismiss;

/*
 * iOS 给带 backdrop-filter 的节点开过洞：父级 pointer-events:none 挡不住
 * 毛玻璃弹层本身。所以 CSS 拦一层（.sheet-wrap:not(.is-ready) .sheet），
 * 这里的行内样式再拦一层。
 */
function setInputReady(on) {
  if (!wrap) return;
  wrap.classList.toggle('is-ready', on);
  if (panel) panel.style.pointerEvents = on ? '' : 'none';
  const backdrop = wrap.querySelector('.sheet-backdrop');
  if (backdrop) backdrop.style.pointerEvents = on ? '' : 'none';
}

function clearOpenGuards() {
  clearTimeout(inputGuardTimer);
  inputGuardTimer = null;
  clearTimeout(dismissGuardTimer);
  dismissGuardTimer = null;
  userCanDismiss = false;
}

function armOpenGuards() {
  clearOpenGuards();
  setInputReady(false);
  const alive = () => wrap && !wrap.hidden && !closing;
  inputGuardTimer = setTimeout(() => {
    inputGuardTimer = null;
    if (alive()) setInputReady(true);
  }, INPUT_GUARD_MS);
  dismissGuardTimer = setTimeout(() => {
    dismissGuardTimer = null;
    if (alive()) userCanDismiss = true;
  }, DISMISS_GUARD_MS);
}

function restartRise() {
  if (!panel) return;
  if (typeof panel.getAnimations === 'function') {
    for (const anim of panel.getAnimations()) anim.cancel();
  }
  const backdrop = wrap.querySelector('.sheet-backdrop');
  if (backdrop && typeof backdrop.getAnimations === 'function') {
    for (const anim of backdrop.getAnimations()) anim.cancel();
  }
  panel.style.animation = 'none';
  if (backdrop) backdrop.style.animation = 'none';
  void panel.offsetWidth;
  panel.style.animation = '';
  if (backdrop) backdrop.style.animation = '';
}

function build() {
  if (wrap) return;
  panel = h('div.sheet', {
    role: 'dialog', 'aria-modal': 'true',
    // 弹层里的点击不该冒到背景那层去，否则点自己就把自己关了
    onclick: (ev) => ev.stopPropagation(),
  },
  scrollArea = h('div.sheet-scroll'),
  footer = h('div.sheet-footer', { hidden: true }));
  const backdrop = h('div.sheet-backdrop');
  wrap = h('div.sheet-wrap', { hidden: true }, backdrop, panel);
  /*
   * 点背景关掉，但**那一下必须是按在背景上开始的**（scrimDismiss）。
   * 开场闸门只挡住最初那几百毫秒；配对挡的是「任何时候补派过来的那一下」——
   * iOS 的幽灵点击约 300ms 才到，靠时间窗拦住它就得把窗口开到用户已经能操作的时候。
   */
  scrimDismiss(backdrop, () => { if (sheetReady()) closeSheet(); });
  document.body.append(wrap);
  attachDragToClose();
  // Esc 关闭：桌面上没有「点空白处」的手感，键盘得能退出来
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && sheetReady()) closeSheet();
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
  // 上一层还在往下退场：掐掉它的收尾，否则新开的这一层会被那次 finish 清空
  closing = false;
  if (exitAnim) { exitAnim.cancel(); exitAnim = null; }
  clearTimeout(exitTimer);
  exitTimer = null;
  resetDragStyles();
  mount(scrollArea, content);
  /*
   * 弹层自己先不接事件，由整片 wrap 把这几下吞掉：Safari 把同一次触摸补派
   * 过来时，它既落不到弹层里的按钮上，也穿不到背后那一页上。上一版在 wrap 上
   * preventDefault，退场动画没结束时整页都点不了。
   */
  setInputReady(false);
  wrap.hidden = false;
  restartRise();
  armOpenGuards();
  scrollArea.scrollTop = 0;
  // 等打开那一次点击走完再钉 body。点的当下改 position:fixed，iOS 会
  // 按新布局把同一次触摸再派到手指底下刚露出来的弹层上。
  setTimeout(() => {
    if (wrap && !wrap.hidden && !closing) lockBody();
  }, 0);
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

/**
 * 关掉弹层。
 *
 * @param {object} opts
 *  - fromY 从这个位移接着往下退场（跟手关掉时传手指最后的位置）
 */
export function closeSheet({ fromY = 0, force = false } = {}) {
  if (!wrap || wrap.hidden || closing) return;
  if (!force && !userCanDismiss) return;
  closing = true;
  setInputReady(false);
  clearOpenGuards();
  // 状态同步做完：调用方依赖 onClose 就在这一刻跑（「确认」按钮先 resolve 再关）
  unlockBody();
  const fn = onClose;
  onClose = null;
  if (fn) fn();
  restoreScroll();
  playExit(fromY);
}

/*
 * 退场：往下滑出去，遮罩跟着淡掉。
 *
 * 原先是一句 `wrap.hidden = true` —— 开有 240ms 的升起动画，关一帧都没有，
 * 读出来是「一闪就不见」，而不是「被推下去了」。现在两头对称。
 */
function playExit(fromY) {
  const backdrop = wrap.querySelector('.sheet-backdrop');
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    exitAnim = null;
    clearTimeout(exitTimer);
    exitTimer = null;
    if (!closing) return;         // 动画没跑完又被重新打开了，别把新的这层收掉
    closing = false;
    setInputReady(false);
    wrap.hidden = true;
    clearEl(scrollArea);
    clearEl(footer);
    footer.hidden = true;
    panel.classList.remove('has-footer');
    resetDragStyles();
  };
  const reduce = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 动画的 finished 在 iOS 上碰到 CSS animation 抢 transform 时可能不兑现。
  // 超时必须能把 hidden 设回去，否则透明遮罩会盖住整页。
  clearTimeout(exitTimer);
  exitTimer = setTimeout(finish, EXIT_MS);
  if (reduce || typeof panel.animate !== 'function') { finish(); return; }
  /*
   * 升起动画如果还占着 transform（fill-mode 残留、没跑完都算），
   * 下面这段 Web Animation 写了也看不见，弹层会直接消失。
   * 退场前先把 CSS 动画清掉，这一下才滑得下去。
   */
  panel.style.animation = 'none';
  if (backdrop) backdrop.style.animation = 'none';
  if (typeof panel.getAnimations === 'function') {
    for (const anim of panel.getAnimations()) anim.cancel();
  }
  if (backdrop && typeof backdrop.getAnimations === 'function') {
    for (const anim of backdrop.getAnimations()) anim.cancel();
  }
  panel.style.transition = 'none';
  exitAnim = panel.animate(
    [{ transform: `translateY(${fromY}px)` }, { transform: 'translateY(100%)' }],
    { duration: 220, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' },
  );
  if (backdrop) {
    backdrop.animate([{ opacity: backdrop.style.opacity || '1' }, { opacity: '0' }],
      { duration: 220, easing: 'ease-out', fill: 'forwards' });
  }
  exitAnim.finished.then(finish).catch(finish);
}

/* 跟手时写在行内的位移和遮罩透明度：留着的话下次打开是歪的、背景还是透的 */
function resetDragStyles() {
  panel.style.transform = '';
  panel.style.transition = '';
  const backdrop = wrap?.querySelector('.sheet-backdrop');
  if (backdrop) backdrop.style.opacity = '';
}

export const sheetIsOpen = () => !!wrap && !wrap.hidden && !closing;

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
/*
 * 甩速那条路必须同时走够一段距离。
 *
 * 顶上那道小横杠是 `.sheet::before`，点它就是点弹层本身 —— 手指按下再抬起
 * 难免有几像素抖动，只看甩速的话这一下就把弹层关了，而人只是想碰一下那道杠。
 */
const MIN_FLICK = 32;

function attachDragToClose() {
  let height = 0;
  dragGesture(panel, {
    axis: 'y',
    // 12 而不是 8：点那道小横杠时的手抖不该被当成开始拖
    threshold: 12,
    canStart: (ev) => {
      if (!sheetReady()) return false;
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
      const leaving = dy > CLOSE_DISTANCE || (dy > MIN_FLICK && velocity > CLOSE_VELOCITY);
      if (leaving) {
        // 从手指松开的位置接着往下走，别从头再演一遍
        closeSheet({ fromY: Math.max(0, dy) });
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
