/**
 * 「当前饮食推荐 / 喝水」两张卡。
 *
 * 原先长在今日页上。但今日页要回答的是「我今天怎么样」，
 * 而这三张都是「我现在该做什么」——真要照着做的时候人已经在饮食页了，
 * 隔着一次切页反而多余。抽成卡片模块挂到饮食页，搬家只改一行 import。
 */

import { h, num, toast } from '../../lib/utils.js';
import { icon } from '../../lib/icons.js';
import { infoTip, listRow } from '../../lib/ui.js';
import { state, saveHealthDay } from '../../lib/store.js';
import { MEAL_LABEL } from '../../core/advisor.js';
import { estimateTag, estimateGroupInfoTip } from './food-estimate.js';

const expanded = { recommend: false };

function moreToggle(key, total, shown, rerender) {
  if (total <= shown) return null;
  return h('button.more-btn', {
    onclick: () => { expanded[key] = !expanded[key]; rerender(); },
  }, expanded[key] ? '收起' : `展开其余 ${total - shown} 项`);
}

/*
 * 推荐行的 ＋ 和搜索结果里的 ＋ 走同一条路：**先开份量面板**。
 *
 * 原先它直接按推荐的克数落库。可推荐给的克数是「按剩余预算算出来的一份」，
 * 不是这个人自己的份量 —— 而克数是乘数，差一倍热量就差一倍。
 * 落库那一步交给份量面板，`addEntry` 在饮食页仍然只出现一次。
 *
 * **只有 ＋ 能加，点行本身不算**（健身页那两列同一条规矩）。
 * 整行可点会把「读一读这条推荐为什么给我」和「把它记下来」并成同一下，
 * 而这一行里有食物名、份量、两条理由和三个数字，全是拿来读的。
 */
function recRow(item, meal, onPick) {
  const f = item.food;
  return listRow({ className: 'rec-row' },
    h('div.rec-info', null,
      h('div.rec-name', null, f.name, estimateTag(f)),
      h('div.rec-portion', null, item.portionLabel),
      h('div.rec-reasons', null, item.reasons.slice(0, 2).map((r) => h('span.reason', null, r)))),
    h('div.rec-nums', null,
      h('span.rec-kcal', null, `${item.nutrients.kcal}`),
      h('span.rec-unit', null, 'kcal'),
      h('span.rec-prot', null, `蛋白 ${item.nutrients.protein}g`)),
    h('button.add-btn', {
      type: 'button',
      'aria-label': `选择 ${f.name} 的份量`,
      onclick: () => onPick?.(f, { meal, grams: item.grams }),
    }, icon('plus')));
}

export function recommendCard(rerender, onPick) {
  const advice = state.derived?.advice;
  if (!advice) return null;
  const meal = advice.budget.meal.key;
  const all = advice.recommend;
  const list = expanded.recommend ? all : all.slice(0, 3);
  return h('section.card.recommend-card', null,
    h('div.card-head.recommend-card-head', null,
      h('h3', null, '当前饮食推荐'),
      h('div.card-head-actions', null,
        estimateGroupInfoTip(all.map((item) => item.food), '查看推荐中的估算说明'))),
    advice.correction?.action ? h('p.recommend-direction', null, advice.correction.action) : null,
    advice.correction?.active || advice.budget.optional ? h('p.recommend-choice-note', null, advice.budget.optional
      ? '以下按需任选一份，不要求补齐全天蛋白。' : '以下为可选食物，选合适的搭配，不需要全部吃。') : null,
    h('div.recommend-budget', { 'aria-label': '当前餐次预算' },
      h('span', null, advice.budget.optional ? '可选少量蛋白食物' : MEAL_LABEL[meal]),
      h('span', null, `${num(advice.budget.kcal)} kcal`),
      h('span', null, advice.budget.optional ? '仍有热量，按需选择' : advice.budget.proteinFeasible
        ? `蛋白 ${num(advice.budget.protein, 0)}g`
        : `蛋白≤${num(advice.budget.maxProteinByKcal, 1)}g`)),
    all.length
      ? [
        h('div.rec-list', null, list.map((item) => recRow(item, meal, onPick))),
        moreToggle('recommend', all.length, 3, rerender),
      ]
      : h('p.empty-hint', null, '暂无适合当前条件的推荐。后续餐次照常安排，按饥饿感决定份量；也可搜索记录实际吃的食物，不必为数字跳餐。'),
  );
}

/*
 * 喝水：一行就够。
 *
 * 记的是「主动喝了几次」，不是毫升。饮料、汤、粥、水果和饭菜里的水分同样
 * 被人体吸收，单算白水没法代表全天水分够不够 ——「125 / 1700 ml」那根条
 * 会被读成「今天只完成了 7%」，而那个人可能刚喝完两碗汤。
 *
 * 撤销不常驻。它一天里最多用上一次（误触），却要一直占着一个控件和四个字；
 * 改成刚点完那几秒钟内出现，过了就收起来。
 */
const MAX_WATER_TAPS = 40;
const UNDO_WINDOW_MS = 5000;
const BURST_GAP_MS = 1500;
const clampWater = (n) => Math.max(0, Math.min(MAX_WATER_TAPS, Math.round(n)));
const savedWater = (day) => clampWater(Number(state.healthByDate.get(day)?.waterCount) || 0);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let waterView = null;
const pendingWaterViews = new Map();

function waterWaves() {
  const layer = h('span.water-surface', { 'aria-hidden': 'true' });
  for (let i = 0; i < 2; i++) {
    const wave = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wave.setAttribute('viewBox', '0 0 720 48');
    wave.setAttribute('preserveAspectRatio', 'none');
    wave.setAttribute('class', 'water-flow');
    const path = document.createElementNS(wave.namespaceURI, 'path');
    path.setAttribute('d', 'M0 18 Q90 0 180 18 T360 18 T540 18 T720 18 V48 H0Z');
    wave.append(path);
    layer.append(wave);
  }
  return layer;
}

// 点击只增加一个短暂脉冲；循环动画的节点、currentTime 和水位基线始终不变。
function stirWater(view) {
  if (reducedMotion()) return;
  view.impulse = Math.min(1, view.impulse + .65);
  if (view.frame) return;
  let previous = performance.now();
  const tick = (now) => {
    const dt = Math.min(64, now - previous);
    previous = now;
    const target = view.impulse;
    view.lift += (target - view.lift) * (1 - Math.exp(-dt / 110));
    view.impulse *= Math.exp(-dt / 420);
    if (!view.card.isConnected || reducedMotion() || (view.lift < .002 && view.impulse < .002)) {
      view.lift = 0;
      view.impulse = 0;
    }
    view.surface.style.transform = `translateY(${-view.lift * 5}px) scaleY(${1 + view.lift * .16})`;
    for (const animation of view.surface.getAnimations({ subtree: true })) {
      animation.updatePlaybackRate(1 + view.lift * 1.6);
    }
    view.frame = view.lift || view.impulse ? requestAnimationFrame(tick) : 0;
  };
  view.frame = requestAnimationFrame(tick);
}

function updateWater(view) {
  const text = String(view.value);
  if (view.count.textContent !== text) {
    const from = getComputedStyle(view.count).transform;
    view.count.getAnimations?.().forEach((animation) => animation.cancel());
    view.count.textContent = text;
    if (!reducedMotion() && view.count.animate) {
      view.count.animate([{ transform: from }, { transform: 'translateY(-2px) scale(1.04)', offset: .35 },
        { transform: 'none' }], { duration: 260, easing: 'ease-out' });
    }
  }
  view.button.setAttribute('aria-label', `记录一次饮水，当前 ${view.value} 次`);
  view.undo.hidden = view.undoBaseline == null;
}

// 串行落库，连续点击立即反馈。队列固定日期，切日不会把未完成的写入记到另一日。
async function writeWater(view, change) {
  view.queue.push(change);
  view.value = clampWater(change(view.value));
  updateWater(view);
  if (view.saving) return;
  view.saving = true;
  pendingWaterViews.set(view.day, view);
  while (view.queue.length) {
    try {
      const next = clampWater(view.queue[0](savedWater(view.day)));
      await saveHealthDay(view.day, { waterCount: next, source: 'manual' });
    } catch {
      toast('饮水记录未保存，请重试', 'warn');
      view.undoBaseline = null;
    }
    view.queue.shift();
    view.value = view.queue.reduce((value, apply) => clampWater(apply(value)), savedWater(view.day));
    updateWater(view);
  }
  view.saving = false;
  pendingWaterViews.delete(view.day);
}

function createWaterCard(day) {
  const view = { day, value: savedWater(day), queue: [], saving: false,
    undoBaseline: null, lastTapAt: 0, timer: 0, impulse: 0, lift: 0, frame: 0 };
  view.count = h('b.water-count', null, String(view.value));
  view.surface = waterWaves();
  view.undo = h('button.water-undo', {
    type: 'button', hidden: true,
    onclick: () => {
      const back = view.undoBaseline;
      if (back == null) return;
      view.undoBaseline = null;
      clearTimeout(view.timer);
      void writeWater(view, () => back);
    },
  }, '撤销');
  view.button = h('button.water-pill', {
    type: 'button',
    onclick: () => {
      if (view.value >= MAX_WATER_TAPS) { toast('当天已记录 40 次饮水'); return; }
      const now = Date.now();
      if (view.undoBaseline == null || now - view.lastTapAt > BURST_GAP_MS) view.undoBaseline = view.value;
      view.lastTapAt = now;
      clearTimeout(view.timer);
      view.timer = setTimeout(() => { view.undoBaseline = null; updateWater(view); }, UNDO_WINDOW_MS);
      stirWater(view);
      void writeWater(view, (value) => value + 1);
    },
  }, view.surface, icon('waterMl', 'water-drop'),
  h('span.water-label', { 'aria-live': 'polite', 'aria-atomic': 'true' }, '已记录 ', view.count, ' 次饮水'),
  icon('plus', 'water-plus'));
  view.deviceNote = h('p');
  view.card = h('section.card.water-card', null,
    h('div.card-head', null,
      h('h3', null, '喝水'),
      h('div.water-tools', null, view.undo,
        infoTip('查看饮水说明',
          h('p', null, '这里只数「主动喝了几次水」，不记毫升。汤、粥、水果和饭菜里的水分同样算数，次数不代表全天水分是否充足。'),
          view.deviceNote))),
    view.button);
  return view;
}

export function waterCard() {
  if (!waterView || waterView.day !== state.day) {
    waterView = pendingWaterViews.get(state.day) || createWaterCard(state.day);
  }
  if (!waterView.saving) waterView.value = savedWater(state.day);
  const deviceMl = Number(state.derived?.health?.waterMl) || 0;
  waterView.deviceNote.hidden = deviceMl <= 0;
  waterView.deviceNote.textContent = deviceMl > 0
    ? `Apple 健康这一天还同步了 ${num(deviceMl)} ml 饮水，在「数据」页能看到。` : '';
  updateWater(waterView);
  return waterView.card;
}
