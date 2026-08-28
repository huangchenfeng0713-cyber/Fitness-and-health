/**
 * 一周小结卡。
 *
 * 数据页原先只有九张单指标趋势图，各说各的 —— 想知道「我这周整体怎么样」，
 * 要挨个点开再自己在脑子里合并。这张卡放在趋势卡上面，一屏answers完那一个问题；
 * 想看某一项怎么走，再往下翻图。
 *
 * 只做渲染：算什么、怎么措辞都在 core/weekly-summary.js。
 */

import { h, infoTip } from '../../lib/utils.js';
import { state } from '../../lib/store.js';
import { weeklySummary } from '../../core/weekly-summary.js';

export function weeklySummaryCard() {
  const s = weeklySummary({
    endDate: state.day,
    dietDaily: state.dietDaily,
    healthDays: state.healthDays,
    trainingDays: state.trainingDays,
    targets: state.derived?.targets,
  });
  if (!s) return null;

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '这一周'),
      h('div.card-head-actions', null,
        h('span.card-tag', null, `${s.from.slice(5)} – ${s.to.slice(5)}`),
        infoTip('这一周怎么算的', h('div', null,
          h('p', null, '统计所选日期往前数 7 个日历日（含当天）。'),
          h('p', null, '摄入类的分母是**有饮食记录的天数**，不是日历天数——'
            + '没记录的日子不在样本里，当成 0 kcal 会造出并不存在的结论。'),
          h('p', null, '体重只报首末差，不做拟合：一周之内点太少，'
            + '拟合出来的斜率会被单次水分波动带着走。要看趋势请往下翻体重图。'))))),
    h('div.week-rows', null, s.rows.map((r) => h(`div.week-row.${r.tone}`, null,
      h('span.week-row-label', null, r.label),
      h('div.week-row-main', null,
        h('strong.week-row-value', null, String(r.value)),
        r.note ? h('span.week-row-note', null, r.note) : null)))));
}
