/**
 * 点式刻度的精确读数：共用一个浮层，**挂在圆点所在的那张卡里**，跟着内容一起滚。
 *
 * 原先它挂在 body 上、`position: fixed`，打开后钉在屏幕坐标上、不跟滚动 ——
 * 手指一划，圆点走了、读数还停在原地，压到下一张卡的标题上（用户截图里那枚
 * 「0 mg」就浮在「今日提示」旁边），读的人分不清它在说哪一项。
 * 挂进卡里之后滚动是原生的：不用监听 scroll、不会慢一帧；滚出可视区时被滚动容器
 * 自然裁掉，而不是夹在屏幕边上。卡片是 `position: relative`，是这枚浮层的定位原点。
 */
import { h } from './utils.js';

const readings = new WeakMap();
let active = null;
const INSET = 8;   // 浮层离卡片左右边缘至少这么远，和卡片内边距的阶梯同一档
const GAP = 8;     // 浮层底边到圆点顶边

function select(trigger, selected) {
  trigger.classList.toggle('is-value-open', selected);
  trigger.setAttribute('aria-expanded', String(selected));
  if (selected) trigger.setAttribute('aria-describedby', 'point-value-tip');
  else trigger.removeAttribute('aria-describedby');
}

function close() {
  if (!active) return;
  select(active.trigger, false);
  active.events.abort();
  active.observer.disconnect();
  active.panel.remove();
  active = null;
}

function place() {
  if (!active) return;
  const { trigger, panel, arrow } = active;
  const point = trigger.querySelector('.split-bar-point');
  const card = trigger.closest('.card');
  if (!point || !card) return close();
  // 卡片会被整块重建（60 秒时钟、同步、记账），浮层要跟着搬进新的那张
  if (panel.parentElement !== card) card.append(panel);
  const dot = point.getBoundingClientRect();
  const box = card.getBoundingClientRect();
  // absolute 的原点在卡片 padding box 的左上角
  const originLeft = box.left + card.clientLeft;
  const originTop = box.top + card.clientTop;
  const width = card.clientWidth;
  panel.style.maxWidth = `${Math.max(0, width - INSET * 2)}px`;
  const size = panel.getBoundingClientRect();
  const center = dot.left + dot.width / 2 - originLeft;
  const left = Math.max(INSET, Math.min(center - size.width / 2, width - INSET - size.width));
  // 不取整：卡片自己可能停在半像素上，取整会让同一张卡重建前后差出 1px
  panel.style.left = `${left}px`;
  panel.style.top = `${dot.top - originTop - GAP - size.height}px`;
  arrow.style.left = `${center - left}px`;
  panel.style.visibility = 'visible';
}

function open(trigger) {
  if (active?.trigger === trigger) return close();
  close();
  const reading = readings.get(trigger);
  if (reading.value == null) return;
  const text = h('span', null, reading.value);
  const arrow = h('span.point-value-arrow', { 'aria-hidden': 'true' });
  const panel = h('div.point-value-tip', {
    id: 'point-value-tip', role: 'tooltip', style: { visibility: 'hidden' },
  }, text, arrow);
  const events = new AbortController();
  // 时钟与同步会重建主卡；同一天同一指标继续显示，切页或翻日期才清理。
  const observer = new MutationObserver(() => {
    if (!active) return;
    if (!active.trigger.isConnected) {
      const next = [...document.querySelectorAll('.point-value-trigger')]
        .find(el => readings.get(el)?.key === reading.key);
      if (!next || readings.get(next).value == null) return close();
      select(active.trigger, false);
      active.trigger = next;
      select(next, true);
    }
    const value = readings.get(active.trigger).value;
    if (text.textContent !== value) text.textContent = value;
    /*
     * 每次都重新摆一遍：卡片换了一张、数值变长了、上面多出一行提示把圆点往下推了，
     * 都会让它对不上。place() 只在浮层不在新卡里时才动 DOM，
     * 不会自己再触发一轮（观察的只是 childList）。
     */
    place();
  });
  active = { trigger, panel, arrow, events, observer };
  place();
  select(trigger, true);
  const outside = target => !active.trigger.contains(target) && !panel.contains(target);
  document.addEventListener('click', event => {
    if (outside(event.target)) close();
  }, { capture: true, signal: events.signal });
  // WebKit 不一定给无控件的空白处补派 click；只接收完整轻点，滑动/取消不收场。
  let touch = null;
  const touchOptions = { capture: true, passive: true, signal: events.signal };
  document.addEventListener('pointerdown', event => {
    touch = event.isPrimary && event.pointerType !== 'mouse' && outside(event.target)
      ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  }, touchOptions);
  document.addEventListener('pointermove', event => {
    if (touch?.id === event.pointerId
      && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 8) touch = null;
  }, touchOptions);
  document.addEventListener('pointercancel', () => { touch = null; }, touchOptions);
  document.addEventListener('pointerup', event => {
    const tapped = touch?.id === event.pointerId && outside(event.target)
      && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) <= 8;
    touch = null;
    if (tapped) close();
  }, touchOptions);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  }, { signal: events.signal });
  window.addEventListener('resize', () => place(), { signal: events.signal });
  window.visualViewport?.addEventListener('resize', () => place(), { signal: events.signal });
  // 不监听 scroll：浮层在卡片里，滚动时和圆点一起走；滚动手势也不会误触关闭。
  observer.observe(document.body, { childList: true, subtree: true });
}

/** 保留细刻度的外观，把整条轨道的触控高度扩到 44px。 */
export function pointValueTrack({ key, label, value, track }) {
  track.setAttribute('aria-hidden', 'true');
  const trigger = h('button.point-value-trigger', {
    type: 'button', disabled: value == null,
    'aria-label': value == null ? `${label}暂无记录` : `查看${label}精确值`,
    'aria-expanded': 'false',
    onclick: () => open(trigger),
  }, track);
  readings.set(trigger, { key, value });
  return trigger;
}
