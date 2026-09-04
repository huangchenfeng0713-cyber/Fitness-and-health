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

/*
 * 「正在做手势」这件事必须能自己恢复。
 *
 * 原先它是个裸计数器：holdGesture() 加一、返回的函数减一。漏掉一次减一，
 * isGesturing() 就**永久**为真 —— 而 app.js 的 busy() 拿它闸着全应用的重绘，
 * 于是每一次落库都只是记一笔 renderPending，然后在下一次 pointerup 补跑。
 * 表现就是「点哪儿哪儿重绘」：正在打字的输入框被连根换掉、键盘收起、
 * 刚打开的弹层弹走，而且不重开应用就好不了。一个丢失的 pointerup 换来整个
 * 应用不可用，这个代价和它防的那件事完全不成比例。
 *
 * 所以改成「手势必须有手指按着」：
 * 1. 每一次占用都记着是哪根手指（pointerId）和什么时候开始的；
 * 2. 那根手指在**文档任何地方**抬起或被取消，就把它的占用清掉 ——
 *    用捕获阶段，中途有人 stopPropagation 也拦不住；
 * 3. 再加一道时限：手指不可能在一个拖动手势上按住 8 秒。
 * 两道兜底都不依赖调用方记得释放。
 */
const holds = new Set();
const STALE_MS = 8000;
const now = () => (typeof performance === 'object' ? performance.now() : Date.now());

function sweep() {
  const t = now();
  for (const hold of holds) if (t - hold.at > STALE_MS) holds.delete(hold);
}

/** 现在有没有手指正压在某个手势上 */
export const isGesturing = () => {
  sweep();
  return holds.size > 0;
};

/**
 * 手动占住一次手势（图表那种「按下就开始扫」的用法）。
 * @param {number|null} pointerId 哪根手指。传了的话，它一抬起来占用就自动作废
 * @returns {() => void} 松手时调用
 */
export function holdGesture(pointerId = null) {
  const hold = { pointerId, at: now() };
  holds.add(hold);
  return () => { holds.delete(hold); };
}

if (typeof document !== 'undefined') {
  /* 屏幕上还按着的手指。全抬起来了就不可能还有人在做手势 —— 这条不看 pointerId 对不对得上 */
  const down = new Set();
  document.addEventListener('pointerdown', (ev) => down.add(ev.pointerId), true);
  const drop = (ev) => {
    down.delete(ev.pointerId);
    for (const hold of holds) {
      if (hold.pointerId == null || hold.pointerId === ev.pointerId) holds.delete(hold);
    }
    if (!down.size) holds.clear();
  };
  document.addEventListener('pointerup', drop, true);
  document.addEventListener('pointercancel', drop, true);
  // 切走再回来时手指肯定已经不在屏幕上了
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { down.clear(); holds.clear(); }
  });
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
      release = holdGesture(id);
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
  /*
   * 兜底：那根手指在文档任何地方抬起来都算结束。
   *
   * 元素上的 pointerup 不保证送得到 —— 指针捕获会在被捕获的节点隐藏或
   * 离开文档时失效（弹层退场、重绘换节点都会），那一下就落到别的元素上。
   * 收不到的话 id 一直占着，这个手势之后再也起不来。
   */
  const lost = (ev) => { if (ev.pointerId === id) up(ev); };
  document.addEventListener('pointerup', lost, true);
  document.addEventListener('pointercancel', lost, true);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    document.removeEventListener('pointerup', lost, true);
    document.removeEventListener('pointercancel', lost, true);
    if (release) release();
  };
}
