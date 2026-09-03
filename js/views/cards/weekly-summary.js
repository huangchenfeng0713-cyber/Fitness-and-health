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
     * 三列摊平成一张表：标签 / 数值 / 注释各占一列，行本身 display: contents。
     *
     * 原先数值外面还包一层 .week-row-main，每行各自按内容分宽 ——「0 / 7 天」和
     * 「—」不一样长，后面的注释就一行一个起点，七行读下来像没对齐。
     * 注释那格哪怕没有内容也要建出来，否则网格会把下一行的标签填进这一格。
     */
    h('div.week-rows', null, s.rows.map((r) => h(`div.week-row.${r.tone}`, null,
      h('span.week-row-label', null, r.label),
      h('strong.week-row-value', null, String(r.value)),
      h('span.week-row-note', null, r.note || '')))));
}
