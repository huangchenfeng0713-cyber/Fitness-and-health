/** 点式刻度的精确读数：共用一个浮层，打开后保留屏幕坐标。 */
import { h } from './utils.js';

const readings = new WeakMap();
let active = null;

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

function place(keepAnchor = false) {
  if (!active) return;
  const { trigger, panel, arrow } = active;
  const point = trigger.querySelector('.split-bar-point');
  const card = trigger.closest('.card');
  if (!point || !card) return close();
  const dot = keepAnchor && active.anchor ? active.anchor : point.getBoundingClientRect();
  active.anchor = dot;
  const bounds = card.getBoundingClientRect();
  const viewport = window.visualViewport;
  const leftEdge = Math.max(bounds.left, viewport?.offsetLeft || 0) + 8;
  const rightEdge = Math.min(bounds.right,
    (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth)) - 8;
  const center = dot.left + dot.width / 2;
  panel.style.maxWidth = `${Math.max(0, rightEdge - leftEdge)}px`;
  const size = panel.getBoundingClientRect();
  const left = Math.max(leftEdge, Math.min(center - size.width / 2, rightEdge - size.width));
  panel.style.left = `${left}px`;
  const topEdge = (viewport?.offsetTop || 0) + 8;
  const bottomEdge = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - 8;
  const above = dot.top - 8 - size.height;
  panel.style.top = `${Math.max(topEdge, Math.min(above < topEdge ? dot.bottom + 8 : above, bottomEdge - size.height))}px`;
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
    if (!active.trigger.isConnected) {
      const next = [...document.querySelectorAll('.point-value-trigger')]
        .find(el => readings.get(el)?.key === reading.key);
      if (!next || readings.get(next).value == null) return close();
      select(active.trigger, false);
      active.trigger = next;
      select(next, true);
    }
    const value = readings.get(active.trigger).value;
    if (text.textContent !== value) {
      text.textContent = value;
      place(true);
    }
  });
  active = { trigger, panel, arrow, events, observer };
  // 挂到 body，避免内容区滚动、裁切和祖先 transform 改变 fixed 的原点。
  document.body.append(panel);
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
  // 不监听 scroll：读数停在打开时的位置，滚动手势也不会误触关闭。
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
