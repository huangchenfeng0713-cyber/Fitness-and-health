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
    /*
     * 两列摊平成一张表：标签靠左、数值靠右，行本身 display: contents ——
     * 网格定的宽，七行的数值才对得上一条右边线。每行各自 flex 的话，
     *「7 / 7 天」和「盈余 3130 kcal」一宽一窄，右边缘就有七个起点。
     */
    h('div.week-rows', null, s.rows.map((r) => h('div.week-row', null,
      h('span.week-row-label', null, r.label),
      h('strong.week-row-value', null, String(r.value))))));
}
