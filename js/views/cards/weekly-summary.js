/** 近 7 日速览卡：截至昨天的七个完整日。 */

import { h, infoTip, shiftDay, todayKey } from '../../lib/utils.js';
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
      h('div.card-head-actions', null,
        h('span.card-tag', null, `${s.from.slice(5)} – ${s.to.slice(5)}`),
        infoTip('近 7 日怎么算的', h('div', null,
          h('p', null, '统计截至昨天的 7 个完整日，不含今天，也不跟着「今日 / 饮食」页选的日期走。'),
          h('p', null, '摄入类只按有饮食记录的天数计算；漏记的日子不会被当成 0 kcal。'),
          h('p', null, '累计收支只算同时有饮食记录和设备消耗的日期；配对不足时直接显示数据不足。'),
          h('p', null, '「日均锻炼」来自 Apple 健康的锻炼分钟；力量训练动作和组数留在健身页查看。'))))),
    h('div.week-rows', null, s.rows.map((r) => h(`div.week-row.${r.tone}`, null,
      h('span.week-row-label', null, r.label),
      h('div.week-row-main', null,
        h('strong.week-row-value', null, String(r.value)),
        r.note ? h('span.week-row-note', null, r.note) : null)))));
}
