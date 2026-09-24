/** 主栏目横滑：向右依次前进，页面绕纵向中轴翻面。 */
import { dragGesture } from './gesture.js';

const EASE = 'cubic-bezier(.22, .8, .22, 1)';
const MAX_DRAG_ANGLE = 80;
const SWIPE_IGNORE = 'button, a, input, textarea, select, summary, [role="button"], '
  + '[role="slider"], [contenteditable="true"], .chart-wrap, .table-wrap, .info-tip-panel';

/** 返回相邻栏目的索引；短距离慢滑、边界外滑动都不切页。 */
export function swipeDestination({ dx, velocity = 0, width, index, count, cancelled = false }) {
  if (cancelled || !Number.isFinite(dx) || !Number.isFinite(width) || width <= 0) return null;
  const enoughDistance = Math.abs(dx) >= Math.min(82, width * .22);
  const quickFlick = Math.abs(dx) >= 32 && Math.abs(velocity) >= .5;
  if (!enoughDistance && !quickFlick) return null;
  const next = index + (dx > 0 ? 1 : -1);
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
  let dragAngle = 0;
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const activeIndex = () => tabs.findIndex((tab) => tab.key === currentKey());

  function finishMotion(entry = motion) {
    if (!entry || motion !== entry) return;
    motion = null;
    entry.animations.forEach((animation) => animation.cancel());
    entry.ghost?.remove();
    view.classList.remove('tab-swipe-dragging', 'tab-swipe-transitioning');
    app.classList.remove('tab-swipe-stage');
    view.style.removeProperty('transform');
    dragAngle = 0;
    onSettled();
  }

  function cancel() {
    if (motion) finishMotion();
    else {
      view.classList.remove('tab-swipe-dragging');
      app.classList.remove('tab-swipe-stage');
      view.style.removeProperty('transform');
      dragAngle = 0;
    }
  }

  function snapBack() {
    if (!dragAngle || reduceMotion()) { cancel(); return; }
    const from = dragAngle;
    view.classList.remove('tab-swipe-dragging');
    view.classList.add('tab-swipe-transitioning');
    const animation = view.animate([
      { transform: `rotateY(${from}deg)` },
      { transform: 'rotateY(0deg)' },
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

  function navigate(key, { angle = 0 } = {}) {
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

    const direction = to > from ? 1 : -1;
    // getBoundingClientRect() 会包含拖动中的 3D 投影，定位副本须用未变形布局尺寸。
    const { offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height } = view;
    const ghost = view.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.classList.add('tab-swipe-ghost');
    Object.assign(ghost.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      transform: `rotateY(${angle}deg)`,
    });
    copyCanvasPixels(view, ghost);
    app.append(ghost);
    ghost.scrollTop = view.scrollTop;

    view.classList.remove('tab-swipe-dragging');
    view.style.removeProperty('transform');
    changeTab(key);
    app.classList.add('tab-swipe-stage');
    view.classList.add('tab-swipe-transitioning');
    const remaining = 1 - Math.min(Math.abs(angle) / 180, .45);
    const duration = Math.round(360 * remaining);
    // iOS WebKit 有时在 WAAPI 3D 动画里仍绘制背面的镜像文字；在 90° 接缝显式换面。
    const turnPoint = (90 - Math.abs(angle)) / (180 - Math.abs(angle));
    const justBeforeTurn = turnPoint - .001;
    const options = { duration, easing: EASE, fill: 'both' };
    const outgoing = ghost.animate([
      { transform: `rotateY(${angle}deg)`, opacity: 1, offset: 0 },
      { transform: `rotateY(${direction * 90}deg)`, opacity: 1, offset: justBeforeTurn },
      { transform: `rotateY(${direction * 90}deg)`, opacity: 0, offset: turnPoint },
      { transform: `rotateY(${direction * 180}deg)`, opacity: 0, offset: 1 },
    ], options);
    const incoming = view.animate([
      { transform: `rotateY(${angle - direction * 180}deg)`, opacity: 0, offset: 0 },
      { transform: `rotateY(${-direction * 90}deg)`, opacity: 0, offset: justBeforeTurn },
      { transform: `rotateY(${-direction * 90}deg)`, opacity: 1, offset: turnPoint },
      { transform: 'rotateY(0deg)', opacity: 1, offset: 1 },
    ], options);
    const entry = { animations: [outgoing, incoming], ghost };
    motion = entry;
    Promise.allSettled(entry.animations.map((animation) => animation.finished))
      .then(() => finishMotion(entry));
    app.querySelector('.topbar-context')?.animate([
      { opacity: .55 },
      { opacity: 1 },
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
      const atEdge = (dx < 0 && index === 0) || (dx > 0 && index === tabs.length - 1);
      const distance = atEdge ? Math.abs(dx) * .28 : Math.abs(dx);
      dragAngle = Math.sign(dx) * Math.min(distance / view.clientWidth * 180, MAX_DRAG_ANGLE);
      app.classList.add('tab-swipe-stage');
      view.classList.add('tab-swipe-dragging');
      view.style.transform = `rotateY(${dragAngle}deg)`;
    },
    onEnd: ({ dx, velocity, cancelled }) => {
      const destination = swipeDestination({
        dx, velocity, width: view.clientWidth, index: activeIndex(), count: tabs.length, cancelled,
      });
      if (destination == null) snapBack();
      else navigate(tabs[destination].key, { angle: dragAngle });
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
