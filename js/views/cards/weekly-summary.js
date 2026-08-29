/**
 * 近 7 日速览卡。
 *
 * 数据页原先只有九张单指标趋势图，各说各的 —— 想知道「我这周整体怎么样」，
 * 要挨个点开再自己在脑子里合并。这张卡放在趋势卡上面，一屏回答完那一个问题；
 * 想看某一项怎么走，再往下翻图。
 *
 * 窗口**截至昨天**，而且不跟今日 / 饮食页选的日期走：
 * 把今天算进来，早上八点看到的「日均摄入」会被一个才吃了早饭的半天拉低。
 *
 * 只做渲染：算什么、怎么措辞都在 core/weekly-summary.js。
 */

import { h, infoTip, shiftDay, todayKey } from '../../lib/utils.js';
import { state } from '../../lib/store.js';
import { weeklySummary } from '../../core/weekly-summary.js';

export function weeklySummaryCard() {
  const s = weeklySummary({
    endDate: shiftDay(todayKey(), -1),
    dietDaily: state.dietDaily,
    healthDays: state.healthDays,
    trainingDays: state.trainingDays,
    targets: state.derived?.targets,
  });
  if (!s) return null;

  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '近 7 日速览'),
      h('div.card-head-actions', null,
        h('span.card-tag', null, `${s.from.slice(5)} – ${s.to.slice(5)}`),
        infoTip('近 7 日怎么算的', h('div', null,
          h('p', null, '统计截至昨天的 7 个完整日，不含今天，也不跟着「今日 / 饮食」页选的日期走。'
            + '今天还没过完，把它算进来会把日均拉低。'),
          h('p', null, '摄入类的分母是', h('strong', null, '有饮食记录的天数'),
            '，不是日历天数——没记录的日子不在样本里，当成 0 kcal 会造出并不存在的结论。'),
          h('p', null, '累计收支只算', h('strong', null, '同时有饮食记录和设备消耗'),
            '的日子。少了任何一半都算不出那一天的盈亏，配对不足时就直说不足。'),
          h('p', null, '「日均锻炼」是 Apple 健康的锻炼分钟；'
            + '「力量训练」是你在健身页记下的次数，两个不是一回事。'),
          h('p', null, '体重只报首末差，不做拟合：一周之内点太少，'
            + '拟合出来的斜率会被单次水分波动带着走。要看趋势请往下翻体重图。'))))),
    h('div.week-rows', null, s.rows.map((r) => h(`div.week-row.${r.tone}`, null,
      h('span.week-row-label', null, r.label),
      h('div.week-row-main', null,
        h('strong.week-row-value', null, String(r.value)),
        r.note ? h('span.week-row-note', null, r.note) : null)))));
}
