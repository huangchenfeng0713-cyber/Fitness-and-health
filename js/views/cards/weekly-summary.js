/** 近 7 日速览卡：截至昨天的七个完整日。 */

import { h, shiftDay, todayKey } from '../../lib/utils.js';
import { state } from '../../lib/store.js';
import { weeklySummary } from '../../core/weekly-summary.js';

export function weeklySummaryCard() {
  const s = weeklySummary({
    endDate: shiftDay(todayKey(), -1),
    dietDaily: state.dietDaily,
    healthDays: state.healthDays,
    targets: state.derived?.targets,
  });
  if (!s) return null;

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '近 7 日速览'),
      /*
       * 这儿原先挂着一个说明，四段全在讲程序怎么算：统计窗口、分母用哪个、
       * 配对日的定义、锻炼分钟取自哪儿。那些是实现，不是用户拿来判断的东西。
       * 覆盖的是哪七天，右边这个日期标签已经写着了。
       */
      h('span.card-tag', null, `${s.from.slice(5)} – ${s.to.slice(5)}`)),
    h('div.week-rows', null, s.rows.map((r) => h(`div.week-row.${r.tone}`, null,
      h('span.week-row-label', null, r.label),
      h('div.week-row-main', null,
        h('strong.week-row-value', null, String(r.value)),
        r.note ? h('span.week-row-note', null, r.note) : null)))));
}
