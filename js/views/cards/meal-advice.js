/**
 * 「现在吃什么 / 现在别碰 / 喝水」三张卡。
 *
 * 原先长在今日页上。但今日页要回答的是「我今天怎么样」，
 * 而这三张都是「我现在该做什么」——真要照着做的时候人已经在饮食页了，
 * 隔着一次切页反而多余。抽成卡片模块挂到饮食页，搬家只改一行 import。
 */

import { h, num, toast, runLocalAction } from '../../lib/utils.js';
import { state, addEntry, saveHealthDay } from '../../lib/store.js';
import { CATEGORIES, isEstimated } from '../../data/foods.js';
import { MEAL_LABEL } from '../../core/advisor.js';

const expanded = { recommend: false, avoid: false };

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

export function avoidCard(rerender) {
  const advice = state.derived?.advice;
  const all = advice?.avoid || [];
  if (!all.length) return null;
  const list = expanded.avoid ? all : all.slice(0, 3);
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '现在别碰'),
      h('span.card-tag', null, '按此刻的剩余预算判断')),
    h('div.avoid-list', null, list.map((item) => h('div.avoid-row', null,
      h('div.avoid-name', null, item.food.name,
        h('span.chip.chip-danger', null,
          `${item.per100.kcal} kcal/${item.food.basis === '100ml' ? '100ml' : '100g'}`)),
      h('div.avoid-reason', null, item.reason)))),
    moreToggle('avoid', all.length, 3, rerender),
  );
}

/*
 * 一键喝水。
 *
 * 白水以前只能当普通食物记一笔，或者去设置里手动补录——两条路都太重，
 * 结果「饮水参考 1700ml」这个目标从来没人对得上。这里直接点两下加杯水。
 * 落在健康数据的 waterMl 字段上，和 Apple 健康导入的饮水是同一个数。
 */
const WATER_STEPS = [
  { label: '一杯', ml: 250 },
  { label: '大杯', ml: 400 },
  { label: '一瓶', ml: 550 },
];

export function waterCard(rerender) {
  const d = state.derived;
  if (!d) return null;
  const drunk = Number(d.health?.waterMl) || 0;
  const goal = Number(d.targets?.waterMl) || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((drunk / goal) * 100)) : 0;
  const add = async (ml) => {
    const next = Math.max(0, Math.round(drunk + ml));
    await saveHealthDay(state.day, { waterMl: next, source: 'manual' });
    rerender();
  };
  return h('section.card', null,
    h('div.card-head', null,
      h('div', null,
        h('h3', null, '喝水'),
        h('p.card-desc', null, goal ? `今天 ${num(drunk)} / ${num(goal)} ml` : `今天 ${num(drunk)} ml`)),
      h('div.card-head-actions', null,
        goal ? h('span.card-tag', null, `${pct}%`) : null,
        drunk > 0 ? h('button.text-btn', {
          onclick: () => add(-WATER_STEPS[0].ml), 'aria-label': '撤销上一杯',
        }, '撤销一杯') : null)),
    goal ? h('div.water-bar', null, h('div.water-fill', { style: { width: `${pct}%` } })) : null,
    h('div.btn-row', { style: { marginTop: '10px' } },
      WATER_STEPS.map((step) => h('button.secondary-btn', {
        onclick: () => add(step.ml),
      }, `+${step.label} ${step.ml}ml`))),
    h('p.form-hint', null,
      '记在健康数据的饮水里，和 Apple 健康导入的是同一个数；导入会按更新时间覆盖手动记录。'));
}
