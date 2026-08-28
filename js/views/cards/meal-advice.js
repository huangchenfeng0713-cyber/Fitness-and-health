/**
 * 「当前饮食推荐 / 喝水」两张卡。
 *
 * 原先长在今日页上。但今日页要回答的是「我今天怎么样」，
 * 而这三张都是「我现在该做什么」——真要照着做的时候人已经在饮食页了，
 * 隔着一次切页反而多余。抽成卡片模块挂到饮食页，搬家只改一行 import。
 */

import { h, num, toast, runLocalAction, infoTip } from '../../lib/utils.js';
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
const MAX_WATER_TAPS = 40;

/** 今天点了几次。旧记录没有这个字段时按 0 起算 */
const waterTaps = () => Math.max(0, Math.round(Number(state.derived?.health?.waterCount) || 0));

async function bumpWater(delta) {
  const next = Math.max(0, Math.min(MAX_WATER_TAPS, waterTaps() + delta));
  if (next === waterTaps()) return;
  await saveHealthDay(state.day, { waterCount: next, source: 'manual' });
}

const dropletIcon = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'water-drop');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M12 3.2c3.4 4 5.4 6.7 5.4 9.2a5.4 5.4 0 0 1-10.8 0c0-2.5 2-5.2 5.4-9.2Z');
  svg.append(path);
  return svg;
};

export function waterCard(rerender) {
  const d = state.derived;
  if (!d) return null;
  const taps = waterTaps();
  const goal = Number(d.targets?.waterMl) || 0;
  const deviceMl = Number(d.health?.waterMl) || 0;

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '喝水'),
      h('div.card-head-actions', null,
        h('span.card-tag', null, `已记录 ${taps} 次`),
        infoTip('查看饮水说明',
          h('p', null, '这里只数「主动喝了几次水」，不记毫升 —— '
            + '饮料、汤、粥、水果和饭菜里的水分同样被人体吸收，'
            + '单算白水没法代表全天水分够不够。'),
          h('p', null, `一般成人每天**直接饮水**参考约 ${goal || 1700} ml（女性约 1500 ml），`
            + '把食物和汤水算进去，全天总水分约 2700–3000 ml。运动、高温和出汗会明显改变需要量。'),
          h('p', null, '真正好用的判断是口渴感、尿色和一天下来的整体状态，'
            + '不是有没有恰好喝满某个数字。'),
          deviceMl > 0
            ? h('p', null, `Apple 健康这一天还同步了 ${num(deviceMl)} ml 饮水，在「数据」页能看到。`)
            : null))),
    h('div.water-tap-row', null,
      // 一个大点击区：点一下就是「刚喝了一次」，不问多少
      h('button.water-tap', {
        type: 'button', 'aria-label': `记录一次饮水，当前 ${taps} 次`,
        onclick: async (ev) => {
          const r = await runLocalAction(ev.currentTarget, () => bumpWater(1), '记录饮水');
          if (r.ok) rerender();
        },
      }, dropletIcon(), h('span.water-tap-label', null, '记一次')),
      h('div.water-count', null,
        h('strong', null, String(taps)),
        h('span', null, '次')),
      // 误触之后总得有办法改回来
      taps > 0 ? h('button.text-btn.water-undo', {
        type: 'button',
        onclick: async (ev) => {
          const r = await runLocalAction(ev.currentTarget, () => bumpWater(-1), '撤销');
          if (r.ok) rerender();
        },
      }, '撤销一次') : null));
}
