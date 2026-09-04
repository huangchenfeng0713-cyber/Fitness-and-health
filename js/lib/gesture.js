/**
 * 手势。
 *
 * 三处用得上：弹层下滑关闭、图表上拖着看某一天、顶栏左右滑翻日期。
 * 抽成一份是因为有三件事每一处都得写对：
 *
 * 1. **手指还在上面时不许整页重绘。** 这个应用的 `render*` 会被 60 秒定时器、
 *    每次落库的 emit 和账号轮询反复重跑，重绘会把正在拖的那个节点连根换掉——
 *    和输入框那道 `isEditing()` 闸门是同一件事，只是把焦点换成了手指。
 *    跳过的那次要记一笔，手指抬起来再补（`app.js` 的 pointerup）。
 * 2. **先判方向，再抢手势。** 一上来就 `preventDefault` 会把页面的纵向滚动
 *    一起吃掉。要等位移越过阈值、并且主方向确实是自己要的那个，才开始跟手；
 *    另一个方向占优就当场让开，这一次不再接管。
 * 3. **鼠标 / 触摸 / 触控笔走同一套。** Pointer Events 已经统一了这三样，
 *    别再各写一份 touch* 和 mouse*，那会在支持两种输入的设备上触发两次。
 */

let active = 0;

/** 现在有没有手指正压在某个手势上 */
export const isGesturing = () => active > 0;

/**
 * 手动占住一次手势（图表那种「按下就开始扫」的用法）。
 * @returns {() => void} 松手时调用
 */
export function holdGesture() {
  active += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    active = Math.max(0, active - 1);
  };
}

/**
 * 按住拖动。只认 `axis` 那个方向，另一个方向占优就让给页面滚动。
 *
 * @param {Element} el 手势区域
 * @param {object} opts
 *  - axis        'x' | 'y'
 *  - threshold   越过多少 px 才算开始拖（默认 10）
 *  - canStart    (event) => boolean，返回 false 就不接管这一次
 *  - onStart / onMove / onEnd  回调，参数里带 dx / dy / 速度
 * @returns {() => void} 解绑
 */
export function dragGesture(el, {
  axis = 'y', threshold = 10, canStart = null,
  onStart = null, onMove = null, onEnd = null,
} = {}) {
  if (!el) return () => {};
  let id = null;          // 正在跟的那根手指
  let startX = 0;
  let startY = 0;
  let started = false;    // 已经越过阈值、开始跟手
  let dropped = false;    // 这一次让给页面滚动了，不再接管
  let release = null;
  let lastT = 0;
  let lastV = 0;
  let last = 0;

  const primary = (dx, dy) => (axis === 'x' ? dx : dy);
  const cross = (dx, dy) => (axis === 'x' ? dy : dx);

  const finish = (dx, dy) => {
    if (release) { release(); release = null; }
    if (started && onEnd) onEnd({ dx, dy, velocity: lastV });
    id = null;
    started = false;
    dropped = false;
  };

  const down = (ev) => {
    if (id != null || !ev.isPrimary) return;
    if (canStart && !canStart(ev)) return;
    id = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
    last = primary(0, 0);
    lastT = ev.timeStamp;
    lastV = 0;
  };

  const move = (ev) => {
    if (ev.pointerId !== id || dropped) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!started) {
      const p = Math.abs(primary(dx, dy));
      const c = Math.abs(cross(dx, dy));
      if (p < threshold) return;
      // 另一个方向占优 —— 这是在滚页面，不是在做这个手势
      if (c > p) { dropped = true; return; }
      started = true;
      release = holdGesture();
      // 捕获之后手指滑出元素也还跟着，松手才结束
      try { el.setPointerCapture(id); } catch { /* 不支持就算了，逻辑不依赖它 */ }
      if (onStart) onStart({ dx, dy });
    }
    // 跟手期间才吃掉默认行为，之前不吃，免得把页面滚动一起拦下来
    if (ev.cancelable) ev.preventDefault();
    const now = primary(dx, dy);
    const dt = ev.timeStamp - lastT;
    if (dt > 0) lastV = (now - last) / dt;   // px/ms
    last = now;
    lastT = ev.timeStamp;
    if (onMove) onMove({ dx, dy });
  };

  const up = (ev) => {
    if (ev.pointerId !== id) return;
    finish(ev.clientX - startX, ev.clientY - startY);
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    if (release) release();
  };
}
