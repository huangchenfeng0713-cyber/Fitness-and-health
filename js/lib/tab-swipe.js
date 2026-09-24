/** 主栏目横滑：方向判定与视觉过渡。所有页面仍由原来的 tab 渲染器负责。 */
import { dragGesture } from './gesture.js';

const EASE = 'cubic-bezier(.22, .8, .22, 1)';
const SWIPE_IGNORE = 'button, a, input, textarea, select, summary, [role="button"], '
  + '[role="slider"], [contenteditable="true"], .chart-wrap, .table-wrap, .info-tip-panel';

/** 返回相邻栏目的索引；短距离慢滑、边界外滑动都不切页。 */
export function swipeDestination({ dx, velocity = 0, width, index, count, cancelled = false }) {
  if (cancelled || !Number.isFinite(dx) || !Number.isFinite(width) || width <= 0) return null;
  const enoughDistance = Math.abs(dx) >= Math.min(82, width * .22);
  const quickFlick = Math.abs(dx) >= 32 && Math.abs(velocity) >= .5;
  if (!enoughDistance && !quickFlick) return null;
  const next = index + (dx < 0 ? 1 : -1);
  return next >= 0 && next < count ? next : null;
}

/**
 * 手势只装在滚动视图上，不碰日期顶栏、底部按钮、设置抽屉和弹窗。
 * 页面在松手时才重绘：先留一份只供动画使用的旧视图，避免切页瞬间空白。
 */
export function installTabSwipe({
  view, app, tabs, currentKey, changeTab, blocked = () => false, onSettled = () => {},
}) {
  let motion = null;
  let dragX = 0;
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const activeIndex = () => tabs.findIndex((tab) => tab.key === currentKey());

  function finishMotion(entry = motion) {
    if (!entry || motion !== entry) return;
    motion = null;
    entry.animations.forEach((animation) => animation.cancel());
    entry.ghost?.remove();
    view.classList.remove('tab-swipe-dragging', 'tab-swipe-transitioning');
    view.style.removeProperty('transform');
    dragX = 0;
    onSettled();
  }

  function cancel() {
    if (motion) finishMotion();
    else {
      view.classList.remove('tab-swipe-dragging');
      view.style.removeProperty('transform');
      dragX = 0;
    }
  }

  function snapBack() {
    if (!dragX || reduceMotion()) { cancel(); return; }
    const from = dragX;
    view.classList.remove('tab-swipe-dragging');
    view.style.removeProperty('transform');
    const animation = view.animate([
      { transform: `translate3d(${from}px, 0, 0)` },
      { transform: 'translate3d(0, 0, 0)' },
    ], { duration: 220, easing: EASE });
    const entry = { animations: [animation], ghost: null };
    motion = entry;
    animation.finished.then(() => finishMotion(entry), () => finishMotion(entry));
  }

  function copyCanvasPixels(source, copy) {
    const originals = source.querySelectorAll('canvas');
    const copies = copy.querySelectorAll('canvas');
    originals.forEach((canvas, index) => {
      try {
        copies[index]?.getContext('2d')?.drawImage(canvas, 0, 0);
      } catch { /* 图表的旧画面只是过渡，画布不可复制时不影响切页 */ }
    });
  }

  function navigate(key, { offset = 0 } = {}) {
    const from = activeIndex();
    const to = tabs.findIndex((tab) => tab.key === key);
    if (blocked() || to < 0) { snapBack(); return; }
    if (to === from) {
      snapBack();
      view.scrollTo({ top: 0, behavior: reduceMotion() ? 'instant' : 'smooth' });
      return;
    }
    if (motion) finishMotion();
    if (reduceMotion()) {
      cancel();
      changeTab(key);
      onSettled();
      return;
    }

    const direction = to > from ? -1 : 1;
    const rect = view.getBoundingClientRect();
    const appRect = app.getBoundingClientRect();
    const width = rect.width;
    const ghost = view.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.classList.add('tab-swipe-ghost');
    Object.assign(ghost.style, {
      left: `${rect.left - appRect.left - offset}px`,
      top: `${rect.top - appRect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transform: `translate3d(${offset}px, 0, 0)`,
    });
    copyCanvasPixels(view, ghost);
    app.append(ghost);
    ghost.scrollTop = view.scrollTop;

    view.classList.remove('tab-swipe-dragging');
    view.style.removeProperty('transform');
    changeTab(key);
    view.classList.add('tab-swipe-transitioning');
    const remaining = Math.max(.25, 1 - Math.min(Math.abs(offset) / width, .75));
    const duration = Math.round(180 + 150 * remaining);
    const options = { duration, easing: EASE };
    const outgoing = ghost.animate([
      { transform: `translate3d(${offset}px, 0, 0)` },
      { transform: `translate3d(${direction * width}px, 0, 0)` },
    ], options);
    const incoming = view.animate([
      { transform: `translate3d(${offset - direction * width}px, 0, 0)` },
      { transform: 'translate3d(0, 0, 0)' },
    ], options);
    const entry = { animations: [outgoing, incoming], ghost };
    motion = entry;
    Promise.allSettled(entry.animations.map((animation) => animation.finished))
      .then(() => finishMotion(entry));
    app.querySelector('.topbar-context')?.animate([
      { opacity: .55, transform: `translateX(${-direction * 12}px)` },
      { opacity: 1, transform: 'none' },
    ], { duration: Math.min(duration, 260), easing: EASE });
  }

  const removeGesture = dragGesture(view, {
    axis: 'x',
    threshold: 16,
    canStart: (event) => {
      if (blocked() || motion || event.target.closest?.(SWIPE_IGNORE)) return false;
      if (document.querySelector('details.info-tip[open]')) return false;
      const rect = view.getBoundingClientRect();
      // 保留 iPhone 屏幕边缘的系统返回手势。
      return event.clientX - rect.left > 24 && rect.right - event.clientX > 24;
    },
    onMove: ({ dx }) => {
      if (reduceMotion()) return;
      const index = activeIndex();
      const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === tabs.length - 1);
      dragX = atEdge ? Math.sign(dx) * Math.min(Math.abs(dx) * .28, 60) : dx;
      view.classList.add('tab-swipe-dragging');
      view.style.transform = `translate3d(${dragX}px, 0, 0)`;
    },
    onEnd: ({ dx, velocity, cancelled }) => {
      const destination = swipeDestination({
        dx, velocity, width: view.clientWidth, index: activeIndex(), count: tabs.length, cancelled,
      });
      if (destination == null) snapBack();
      else navigate(tabs[destination].key, { offset: dragX });
    },
  });

  const stopOnHide = () => { if (document.hidden) cancel(); };
  document.addEventListener('visibilitychange', stopOnHide);
  return {
    navigate,
    cancel,
    isAnimating: () => Boolean(motion),
    destroy() { removeGesture(); document.removeEventListener('visibilitychange', stopOnHide); cancel(); },
  };
}
