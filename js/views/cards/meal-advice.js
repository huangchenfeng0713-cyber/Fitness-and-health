/**
 * 「当前饮食推荐 / 喝水」两张卡。
 *
 * 原先长在今日页上。但今日页要回答的是「我今天怎么样」，
 * 而这三张都是「我现在该做什么」——真要照着做的时候人已经在饮食页了，
 * 隔着一次切页反而多余。抽成卡片模块挂到饮食页，搬家只改一行 import。
 */

import { h, num, toast, runLocalAction, clearEl, mount, infoTip } from '../../lib/utils.js';
import { openSheet, closeSheet } from '../../lib/sheet.js';
import { ring } from '../../lib/charts.js';
import { state, addEntry, saveHealthDay } from '../../lib/store.js';
import { CATEGORIES, isEstimated } from '../../data/foods.js';
import { MEAL_LABEL } from '../../core/advisor.js';

const expanded = { recommend: false };

function moreToggle(key, total, shown, rerender) {
  if (total <= shown) return null;
  return h('button.more-btn', {
    onclick: () => { expanded[key] = !expanded[key]; rerender(); },
  }, expanded[key] ? '收起' : `展开其余 ${total - shown} 项`);
}

function recRow(item, meal) {
  const f = item.food;
  const unit = f.basis === '100ml' ? 'ml' : 'g';
  return h('div.rec-row', null,
    h('div.rec-info', null,
      h('div.rec-name', null, f.name,
        isEstimated(f) && h('span.chip.chip-est', null, '估算'),
        h('span.chip', null, CATEGORIES[f.cat] || '自定义')),
      h('div.rec-portion', null, item.portionLabel),
      h('div.rec-reasons', null, item.reasons.slice(0, 2).map((r) => h('span.reason', null, r)))),
    h('div.rec-nums', null,
      h('span.rec-kcal', null, `${item.nutrients.kcal}`),
      h('span.rec-unit', null, 'kcal'),
      h('span.rec-prot', null, `蛋白 ${item.nutrients.protein}g`)),
    h('button.add-btn', {
      'aria-label': `记录 ${f.name}`,
      onclick: async (ev) => {
        const result = await runLocalAction(ev.currentTarget,
          () => addEntry({ foodId: f.id, grams: item.grams, meal }), '记录食物');
        if (!result.ok) return;
        toast(`已记录 ${f.name} ${item.grams}${unit}`, 'ok');
      },
    }, '＋'),
  );
}

export function recommendCard(rerender) {
  const advice = state.derived?.advice;
  if (!advice) return null;
  const meal = advice.budget.meal.key;
  const all = advice.recommend;
  const list = expanded.recommend ? all : all.slice(0, 3);
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '当前饮食推荐'),
      h('span.card-tag', null, advice.budget.proteinFeasible
        ? `${MEAL_LABEL[meal]}时段 · ${num(advice.budget.kcal)} kcal / ${num(advice.budget.protein, 0)}g 蛋白`
        : `${MEAL_LABEL[meal]}时段 · ${num(advice.budget.kcal)} kcal / 蛋白最多约 ${num(advice.budget.maxProteinByKcal, 1)}g`)),
    all.length
      ? [
        h('div.rec-list', null, list.map((item) => recRow(item, meal))),
        moreToggle('recommend', all.length, 3, rerender),
      ]
      : h('p.empty-hint', null, '今天的热量预算已经吃满了。剩下时间以水和无糖茶为主，明天回到正常预算即可。'),
  );
}

/*
 * 一键喝水。
 *
 * 卡面上只有四个杯量按钮，点哪个都先弹一层确认：里面画着「记到多少」，
 * 按下「记录喝水」才真的落库。原先是点一下直接就记，口袋里误触一次
 * 就多出 250ml，而且这个数会连着覆盖 Apple 健康那边的饮水。
 *
 * 落在健康数据的 waterMl 字段上，和 Apple 健康导入的饮水是同一个数。
 */
const WATER_STEPS = [
  { label: '一小杯', ml: 125 },
  { label: '中杯', ml: 250 },
  { label: '大杯', ml: 550 },
];

const MAX_ONE_TIME_ML = 3000;

function waterSheet(step, drunk, goal, rerender) {
  const custom = step == null;
  const input = h('input.set-input', {
    type: 'number', inputmode: 'numeric', step: '10', min: 1, max: MAX_ONE_TIME_ML,
    placeholder: '毫升', 'aria-label': '饮水量（毫升）',
    value: custom ? '' : String(step.ml),
    oninput: () => refresh(),
  });
  const ringSlot = h('div.water-ring');
  const summary = h('p.sheet-summary');
  const okBtn = h('button.primary-btn');

  const amount = () => Math.round(Number(input.value) || 0);

  function refresh() {
    const ml = amount();
    const next = Math.max(0, drunk + ml);
    const pct = goal > 0 ? Math.round((next / goal) * 100) : 0;
    clearEl(ringSlot);
    mount(ringSlot, ring({
      pct, size: 108, stroke: 10, color: 'var(--water)',
      label: num(next), sub: goal ? `/ ${num(goal)} ml` : 'ml',
    }));
    summary.textContent = ml > 0
      ? `现在 ${num(drunk)} ml，记完 ${num(next)} ml`
      : `现在 ${num(drunk)} ml`;
    okBtn.textContent = ml > 0 ? `记录喝水 ${num(ml)} ml` : '记录喝水';
    okBtn.disabled = ml <= 0 || ml > MAX_ONE_TIME_ML;
  }

  okBtn.onclick = async () => {
    const ml = amount();
    if (ml <= 0) { toast('请输入一个大于 0 的毫升数', 'warn'); return; }
    if (ml > MAX_ONE_TIME_ML) { toast(`单次超过 ${MAX_ONE_TIME_ML} ml 不太可能，请核对`, 'warn'); return; }
    await saveHealthDay(state.day, { waterMl: Math.max(0, drunk + ml), source: 'manual' });
    closeSheet();
    rerender();
  };
  refresh();

  return h('div.water-sheet', null,
    h('h3.sheet-title', null, custom ? '自定义水量' : step.label),
    ringSlot,
    summary,
    custom || true ? h('div.water-custom', null, input, h('span.set-unit', null, 'ml')) : null,
    h('div.sheet-action', null, okBtn));
}

export function waterCard(rerender) {
  const d = state.derived;
  if (!d) return null;
  const drunk = Number(d.health?.waterMl) || 0;
  const goal = Number(d.targets?.waterMl) || 0;
  const open = (step) => openSheet(waterSheet(step, drunk, goal, rerender), { label: '记录喝水' });

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '喝水'),
      h('div.card-head-actions', null,
        h('span.card-tag', null, goal ? `${num(drunk)} / ${num(goal)} ml` : `${num(drunk)} ml`),
        infoTip('查看饮水说明',
          h('p', null, '记在健康数据的饮水里，和 Apple 健康导入的是同一个数；导入会按更新时间覆盖手动记录。'),
          h('p', null, `参考量按温和气候、低身体活动的成人估算${goal ? `（${num(goal)} ml）` : ''}；运动或炎热天气需要额外补充。`)))),
    h('div.water-actions', null,
      WATER_STEPS.map((step) => h('button.secondary-btn', {
        onclick: () => open(step),
      }, `${step.label} ${step.ml}`)),
      h('button.secondary-btn', { onclick: () => open(null) }, '自定义')));
}
