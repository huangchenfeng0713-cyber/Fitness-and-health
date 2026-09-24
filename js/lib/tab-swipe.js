/** 主栏目横滑：向右依次前进，页面绕纵向中轴翻面。 */
import { dragGesture } from './gesture.js';

const EASE = 'cubic-bezier(.22, .8, .22, 1)';
const SWIPE_IGNORE = 'button, a, input, textarea, select, summary, [role="button"], '
  + '[role="slider"], [contenteditable="true"], .chart-wrap, .table-wrap, .info-tip-panel';

/** 一屏内留得出跨三栏的行程；每走一段，卡片恰好翻 180°。 */
export const tabTravel = (width) => Math.max(88, Math.min(120, width * .275));

/** 由手指位置决定正面是哪一页及其角度；过 90° 才换成下一页。 */
export function swipePose({ dx, width, index, count }) {
  if (!Number.isFinite(dx) || !Number.isFinite(width) || width <= 0
    || index < 0 || index >= count) return { position: index, displayIndex: index, angle: 0 };
  const direction = Math.sign(dx);
  const available = direction > 0 ? count - 1 - index : index;
  if (!direction || !available) return {
    position: index, displayIndex: index,
    angle: direction * Math.min(Math.abs(dx) / width * 40, 12),
  };
  const progress = Math.min(Math.abs(dx) / tabTravel(width), available);
  const segment = Math.min(Math.floor(progress), available - 1);
  const fraction = progress - segment;
  const source = index + direction * segment;
  return {
    position: index + direction * progress,
    displayIndex: source + (fraction >= .5 ? direction : 0),
    angle: direction * (fraction < .5 ? fraction : fraction - 1) * 180,
  };
}

/** 返回最终栏目；短距离慢滑、边界外滑动都不切页。 */
export function swipeDestination({ dx, velocity = 0, width, index, count, cancelled = false }) {
  if (cancelled || !Number.isFinite(dx) || !Number.isFinite(width) || width <= 0) return null;
  const enoughDistance = Math.abs(dx) >= tabTravel(width) / 2;
  const quickFlick = Math.abs(dx) >= 32 && Math.abs(velocity) >= .5;
  if (!enoughDistance && !quickFlick) return null;
  const steps = Math.max(1, Math.round(Math.abs(dx) / tabTravel(width)));
  const next = index + Math.sign(dx) * steps;
  const clamped = Math.max(0, Math.min(count - 1, next));
  return clamped === index ? null : clamped;
}

/**
 * 手势只装在滚动视图上，不碰日期顶栏、底部按钮、设置抽屉和弹窗。
 * 拖动中转到 90° 时才替换内容，下一页从背面继续跟手；无需提前执行页面副作用。
 */
export function installTabSwipe({
  view, app, tabs, currentKey, changeTab, previewTab, commitTab,
  blocked = () => false, onProgress = () => {}, onRelease = () => {}, onSettled = () => {},
}) {
  let motion = null;
  let dragAngle = 0;
  let gestureStartIndex = null;
  const scrollByIndex = new Map();
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const activeIndex = () => tabs.findIndex((tab) => tab.key === currentKey());

  function beginDrag() {
    if (blocked() || motion) return false;
    gestureStartIndex = activeIndex();
    scrollByIndex.clear();
    scrollByIndex.set(gestureStartIndex, view.scrollTop);
    return true;
  }

  function updateDrag(dx) {
    if (gestureStartIndex == null && !beginDrag()) return null;
    const pose = swipePose({ dx, width: view.clientWidth, index: gestureStartIndex, count: tabs.length });
    if (reduceMotion()) return pose;
    if (pose.displayIndex !== activeIndex()) {
      scrollByIndex.set(activeIndex(), view.scrollTop);
      previewTab(tabs[pose.displayIndex].key);
      view.scrollTop = scrollByIndex.get(pose.displayIndex) || 0;
    }
    dragAngle = pose.angle;
    app.classList.add('tab-swipe-stage');
    view.classList.add('tab-swipe-dragging');
    view.style.transform = `rotateY(${dragAngle}deg)`;
    onProgress(pose);
    return pose;
  }

  function finishMotion(entry = motion) {
    if (!entry || motion !== entry) return;
    motion = null;
    entry.animations.forEach((animation) => animation.cancel());
    entry.ghost?.remove();
    view.classList.remove('tab-swipe-dragging', 'tab-swipe-transitioning');
    app.classList.remove('tab-swipe-stage');
    view.style.removeProperty('transform');
    dragAngle = 0;
    gestureStartIndex = null;
    scrollByIndex.clear();
    onSettled();
  }

  function cancel() {
    if (motion) finishMotion();
    else {
      if (gestureStartIndex != null && activeIndex() !== gestureStartIndex) {
        previewTab(tabs[gestureStartIndex].key);
        view.scrollTop = scrollByIndex.get(gestureStartIndex) || 0;
      }
      view.classList.remove('tab-swipe-dragging');
      app.classList.remove('tab-swipe-stage');
      view.style.removeProperty('transform');
      dragAngle = 0;
      gestureStartIndex = null;
      scrollByIndex.clear();
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

  function endDrag({ dx, velocity = 0, cancelled = false }) {
    if (gestureStartIndex == null) return;
    if (cancelled || blocked()) { cancel(); onRelease(); return; }
    const origin = gestureStartIndex;
    const destination = swipeDestination({
      dx, velocity, width: view.clientWidth, index: origin, count: tabs.length,
    }) ?? origin;
    gestureStartIndex = null;
    scrollByIndex.clear();
    if (destination === activeIndex()) {
      if (destination !== origin) commitTab(tabs[destination].key);
      snapBack();
    } else if (destination === origin && Math.abs(dx) < tabTravel(view.clientWidth) / 2) {
      // 半圈附近退回原页，仍按同一方向完成回转，不留下临时预览的 URL。
      navigate(tabs[origin].key, { angle: dragAngle });
    } else navigate(tabs[destination].key, { angle: dragAngle });
    onRelease();
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
    onStart: () => beginDrag(),
    onMove: ({ dx }) => updateDrag(dx),
    onEnd: endDrag,
  });

  const stopOnHide = () => { if (document.hidden) cancel(); };
  document.addEventListener('visibilitychange', stopOnHide);
  return {
    navigate, beginDrag, updateDrag, endDrag,
    cancel,
    isAnimating: () => Boolean(motion),
    isDragging: () => gestureStartIndex != null,
    destroy() { removeGesture(); document.removeEventListener('visibilitychange', stopOnHide); cancel(); },
  };
}
