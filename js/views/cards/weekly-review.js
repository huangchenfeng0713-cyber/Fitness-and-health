/**
 * 每周复盘卡：这几周的体重、饮食、训练读成下周的一到三件事。
 *
 * 判断全在 core/weekly-review.js，这里只负责画和「采用」那一下。
 * 采用走 saveProfile：和改身体信息是同一条路，从今天起生效、留一个目标版本，
 * 趋势图那句「目标从 X 改成 Y」也就自然对得上。撤销是再存一次原值。
 */

import { h, shiftDay, todayKey, toast, runLocalAction } from '../../lib/utils.js';
import { state, planForProfile, planStepsIn, planIfSaved, saveProfile, restoreProfile } from '../../lib/store.js';
import { infoTip, cardTitle } from '../../lib/ui.js';
import { weeklyReviewFromRecords, REVIEW_WINDOW_DAYS } from '../../core/weekly-review.js';

const TONE = { good: 'good', warn: 'warn', info: 'info' };

function applyLabel(apply) {
  return apply.kind === 'adjust'
    ? `采用：每天${apply.delta > 0 ? '多' : '少'}吃 ${Math.abs(apply.delta)} kcal`
    : `采用：计划速度 ${apply.value} kg/周`;
}

/*
 * 撤销是把整份档案放回去（含目标版本），不是再存一次旧值 —— 后者会按今天的数据
 * 重算计划，撤销完目标和原来的对不上。这几秒里要是别处又存过档案，就只把这一项改回去。
 */
async function adopt(apply, button) {
  const key = apply.kind === 'adjust' ? 'tdeeAdjustKcal' : 'rateKgPerWeek';
  const snapshot = JSON.parse(JSON.stringify(state.profile));
  const versions = (profile) => (Array.isArray(profile?.targetVersions) ? profile.targetVersions.length : 0);
  const result = await runLocalAction(button, () => saveProfile({ [key]: apply.value }), '采用建议');
  if (!result.ok) return;
  toast(`已${applyLabel(apply)}，从今天起生效`, 'ok', {
    label: '撤销', onClick: () => runLocalAction(null, () => (versions(state.profile) === versions(snapshot) + 1
      ? restoreProfile(snapshot)
      : saveProfile({ [key]: snapshot[key] ?? (apply.kind === 'adjust' ? 0 : null) })), '撤销'),
  });
}

function reviewItem(item) {
  return h(`div.insight.${TONE[item.level] || 'info'}.review-item`, { 'data-review': item.key },
    h('div.insight-title', null, item.title),
    h('div.review-basis', null, item.basis),
    h('div.review-action', null, item.action),
    item.apply || item.link ? h('div.tip-actions', null,
      item.apply ? h('button.secondary-btn.compact.review-apply', {
        type: 'button', onclick: (event) => adopt(item.apply, event.currentTarget),
      }, applyLabel(item.apply)) : null,
      item.link ? h('button.chip-btn.tip-action', {
        type: 'button', onclick: () => { location.hash = item.link; },
      }, '去健身页') : null) : null);
}

export function weeklyReviewCard() {
  const today = todayKey();
  const endDate = shiftDay(today, -1);
  const profile = state.profile;
  const review = weeklyReviewFromRecords({
    today, endDate, goal: profile.goal, adjust: Number(profile.tdeeAdjustKcal) || 0,
    plan: planForProfile(profile, endDate),
    fresh: planIfSaved(),
    planSteps: planStepsIn(profile, shiftDay(endDate, -(REVIEW_WINDOW_DAYS - 1)), today),
    healthDays: state.healthDays, dietDaily: state.dietDaily, trainingDays: state.trainingDays,
  });
  if (!review.items.length) return null;
  return h('section.card.weekly-review-card', null,
    h('div.card-head', null,
      cardTitle('每周复盘', 'spark'),
      h('div.card-head-actions', null,
        h('span.card-tag', null, `截至 ${endDate.slice(5)}`),
        infoTip('每周复盘怎么判断',
          h('p', null, '体重速度用最近最多 4 周的称重拟合（从最近一次改计划那天算起），和计划速度比；差值盖不过拟合误差时不下结论。'),
          h('p', null, '「按目标吃了没有」只看有饮食记录的日子，记录不到一半时不判断 —— 分不清是吃少了还是计划有偏差。'),
          h('p', null, '照目标吃了、体重却走得和计划不一样，说明实际消耗和估算的有差距，这时才建议调目标（消耗校正）。每次最多调 150 kcal，调完至少等两周再看，累计不超过 ±500 kcal，可在「身体信息」里清除。7700 kcal/kg 只是换算近似，增肌期长的不全是脂肪，所以每一步都留得保守。'),
          h('p', null, '训练组数只统计已记录的正式组，未记录不代表没练；力量按每次最好的一组估算，只用来看自己前后的变化。')))),
    h('div.insight-list', null, review.items.map(reviewItem)));
}
