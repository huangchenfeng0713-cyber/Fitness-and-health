import { planForProfile } from '../../lib/store.js';
/** 近 7 日速览卡：截至昨天的七个完整日。 */

import { h, shiftDay, todayKey } from '../../lib/utils.js';
import { state } from '../../lib/store.js';
import { weeklySummary } from '../../core/weekly-summary.js';
import { infoTip } from '../../lib/ui.js';

export function weeklySummaryCard() {
  const endDate = shiftDay(todayKey(), -1);
  const s = weeklySummary({
    endDate,
    dietDaily: state.dietDaily,
    healthDays: state.healthDays,
    targets: planForProfile(state.profile, endDate),
    mixedTargets: (state.profile.targetVersions || []).some(v => v.effectiveDate > shiftDay(endDate, -6) && v.effectiveDate <= endDate),
  });
  if (!s) return null;

  return h('section.card.weekly-summary-card', null,
    h('div.card-head', null,
      h('h3', null, '近 7 日速览'),
      // 样本与窗口可在帮助中核对，主表仍只保留标签和值。
      h('div.card-head-actions', null,
        h('span.card-tag', null, `${s.from.slice(5)} – ${s.to.slice(5)}`),
        infoTip('查看七日统计样本',
          h('p', null, `统计窗口：${s.from} 至 ${s.to}。已记录日均摄入按 ${s.loggedDays} 个饮食记录日计算。`),
          h('p', null, `配对 ${s.pairedDays}/${s.days} 日：${s.pairedDates.join('、') || '暂无'}。配对日均摄入、设备消耗和累计收支使用这些相同日期。`),
          h('p', null, '设备静息与活动能量均须覆盖完整日。饮食有记录不保证全天无漏记；记录收支不等于实际组织变化，也不自动改变每日计划。')))),
    /*
     * 两列摊平成一张表：标签靠左、数值靠右，行本身 display: contents ——
     * 网格定的宽，七行的数值才对得上一条右边线。每行各自 flex 的话，
     *「7 / 7 天」和「盈余 3130 kcal」一宽一窄，右边缘就有七个起点。
     */
    h('div.week-rows', null, s.rows.map((r) => h('div.week-row', null,
      h('span.week-row-label', null, r.label),
      h('strong.week-row-value', null, String(r.value))))));
}
