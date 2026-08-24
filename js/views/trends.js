/** 趋势：体重、热量收支、蛋白达标、活动与睡眠 */

import { h, clearEl, num, shiftDay, formatHours, formatMinutes, mount, todayKey } from '../lib/utils.js';
import { lineChart } from '../lib/charts.js';
import { state } from '../lib/store.js';
import { healthInsights, weightTrendStats } from '../core/health-insights.js';

/*
 * 区间档位。ALL 表示「全部」——覆盖到最早一条记录，并附一张逐日明细表。
 * 只留三个图表档位：7 天用来看这周、一个月看近况、六个月看长期走势。
 */
const RANGES = [
  { key: 7, label: '7 天', days: 7 },
  { key: 30, label: '近一个月', days: 30 },
  { key: 180, label: '近六个月', days: 180 },
  { key: 'all', label: '全部', days: null },
];
let range = 30;
/*
 * 选中的那一天。放在这里而不是图表内部，是为了让一次点选同时作用于全部图表——
 * 「那天吃了多少、动了多少、睡了多久」是一个问题，不该点五次才看得全。
 * 放在模块级也让它扛得住定时器触发的重绘。
 */
let selectedDay = null;

/**
 * 图表统计到哪一天为止。
 *
 * 当天不画：一天没过完，活动能量、摄入都还在累加，画出来是个必然偏低的点，
 * 看趋势时会误以为“今天掉下去了”。统一只到前一天，第二天再补上。
 */
function lastEndedDay() {
  return state.day === todayKey() ? shiftDay(state.day, -1) : state.day;
}

/** 最早一条记录的日期（健康与饮食取更早的那个） */
function earliestDay() {
  const first = [state.healthDays[0]?.date, state.dietDaily[0]?.date].filter(Boolean).sort();
  return first[0] || lastEndedDay();
}

function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.round((b - a) / 86400000) + 1;
}

function dateRange(days) {
  const out = [];
  let d = lastEndedDay();
  for (let i = 0; i < days; i += 1) { out.unshift(d); d = shiftDay(d, -1); }
  return out;
}

function series(days, pick) {
  return days.map((date) => ({ x: date, y: pick(date) })).filter((p) => p.y != null);
}

function timeline(days, pick) {
  return days.map((date) => ({ x: date, y: pick(date) }));
}

const average = (points, decimals = 0) => {
  if (!points.length) return null;
  const value = points.reduce((sum, point) => sum + Number(point.y), 0) / points.length;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
};

function rangeSwitch(rerender) {
  return h('div.range-switch', null,
    RANGES.map((r) => h('button', {
      class: `chip-btn${range === r.key ? ' active' : ''}`,
      onclick: () => { range = r.key; rerender(); },
    }, r.label)));
}

/**
 * readout: 选中某天时显示的那行数值。固定占一行，没选中时显示提示语——
 * 一来告诉用户图是可以点的，二来避免选中/取消时卡片高度跳动。
 */
function chartCard(title, tag, chart, note, readout = null) {
  return h('section.card', null,
    h('div.card-head', null, h('h3', null, title), tag && h('span.card-tag', null, tag)),
    h('div.chart-wrap', null, chart),
    readout,
    note && h('p.form-hint', null, note));
}

function readoutRow(value) {
  if (!selectedDay) {
    return h('div.chart-readout.empty', null, '点图上任意一天查看当天数值');
  }
  return h('div.chart-readout', null,
    h('span.readout-day', null, selectedDay.slice(5)),
    h('span.readout-value', null, value == null ? '没有记录' : value));
}

/*
 * 「全部」档位下的逐日明细表。
 *
 * 六个月以上的数据画成折线只剩一团毛刺，看不出单日数值；直接列表格反而好用。
 * 从最早一条记录排到最后一条已结束的日子，缺的字段留「—」而不是补 0。
 */
function fullTable(days, dietByDate) {
  const health = state.healthByDate;
  const rows = days
    .map((date) => ({ date, h: health.get(date) || null, d: dietByDate.get(date) || null }))
    .filter((r) => r.h || r.d)
    .reverse();
  if (!rows.length) {
    return h('section.card', null,
      h('div.card-head', null, h('h3', null, '逐日明细')),
      h('p.empty-hint', null, '还没有任何记录。'));
  }
  const cols = [
    ['日期', (r) => r.date],
    ['摄入', (r) => (r.d?.kcal != null ? num(r.d.kcal) : '—')],
    ['蛋白', (r) => (r.d?.protein != null ? `${num(r.d.protein)}` : '—')],
    ['步数', (r) => (r.h?.steps != null ? num(r.h.steps) : '—')],
    ['活动', (r) => (r.h?.activeEnergy != null ? num(r.h.activeEnergy) : '—')],
    ['静息', (r) => (r.h?.restingEnergy != null ? num(r.h.restingEnergy) : '—')],
    ['锻炼', (r) => (r.h?.exerciseMinutes != null ? formatMinutes(r.h.exerciseMinutes) : '—')],
    ['睡眠', (r) => (r.h?.sleepMinutes != null ? formatHours(r.h.sleepMinutes) : '—')],
    ['体重', (r) => (r.h?.weightKg != null ? num(r.h.weightKg, 1) : '—')],
  ];
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '逐日明细'),
      h('span.card-tag', null, `${rows.length} 天 · ${rows[rows.length - 1].date} 起`)),
    h('div.table-wrap.table-scroll', null, h('table.data-table', null,
      h('thead', null, h('tr', null, cols.map(([label]) => h('th', null, label)))),
      h('tbody', null, rows.map((r) => h('tr', null, cols.map(([, fmt]) => h('td', null, fmt(r)))))))),
    h('p.form-hint', null,
      '摄入与蛋白来自饮食记录，其余来自 Apple 健康；某天没有的字段显示「—」，不会当成 0。'
      + '单位：摄入 kcal、蛋白 g、活动/静息 kcal、体重 kg。'));
}

export function renderTrends(root) {
  const rerender = () => renderTrends(root);
  clearEl(root);
  const d = state.derived;
  if (!d) return;

  const endDay = lastEndedDay();
  const spanDays = range === 'all' ? daysBetween(earliestDay(), endDay) : range;
  const days = dateRange(spanDays);
  const isWeek = range === 7;
  const rangeLabel = RANGES.find((r) => r.key === range)?.label || `${spanDays} 天`;
  const health = state.healthByDate;
  const dietByDate = new Map(state.dietDaily.map((r) => [r.date, r]));
  const targets = d.targets;

  const weightSeries = series(days, (date) => {
    const v = health.get(date)?.weightKg;
    return v > 0 ? v : null;
  });
  const kcalTimeline = timeline(days, (date) => dietByDate.get(date)?.kcal ?? null);
  const proteinTimeline = timeline(days, (date) => dietByDate.get(date)?.protein ?? null);
  const kcalSeries = kcalTimeline.filter((p) => p.y != null);
  const proteinSeries = proteinTimeline.filter((p) => p.y != null);
  const activeSeries = series(days, (date) => health.get(date)?.activeEnergy ?? null);
  const sleepSeries = series(days, (date) => {
    const v = health.get(date)?.sleepMinutes;
    return v > 0 ? v / 60 : null;
  });

  // 热量收支：摄入 −（静息 + 活动）
  const balanceSeries = series(days, (date) => {
    const eaten = dietByDate.get(date)?.kcal;
    const hd = health.get(date);
    if (eaten == null || !hd) return null;
    const hasResting = Number(hd.restingEnergy) > 0;
    const hasActive = hd.activeEnergy != null
      && Number.isFinite(Number(hd.activeEnergy)) && Number(hd.activeEnergy) >= 0;
    // 历史收支不能用“今天的 BMR / 近期活动均值”替缺失字段，否则会把当前假设
    // 倒灌进过去。只接受同日静息与活动能量都齐全的点。
    if (!hasResting || !hasActive) return null;
    const burn = Number(hd.restingEnergy) + Number(hd.activeEnergy);
    return Math.round(eaten - burn);
  });

  /*
   * 区间到前一天为止（见 lastEndedDay），所以落进 days 的每一天都已经过完，
   * 不再需要单独过滤「今天」——平均、达标率、图上的点用的是同一批数据。
   */
  // 没有保存逐日目标历史；看旧日期时是把当前档案设置套到所选日数据上重算。
  // 文案必须把这一点说出来，不能伪装成当时实际保存过的目标。
  const targetContext = state.day === todayKey() ? '当前目标' : '当前设置估算目标';
  const proteinThreshold = targets.protein * 0.9;
  const proteinHit = proteinSeries.filter((p) => p.y >= proteinThreshold).length;
  const loggedDays = kcalSeries.length;
  const avgKcal = average(kcalSeries);
  const avgProtein = average(proteinSeries);
  const avgActive = average(activeSeries);
  const avgSleep = average(sleepSeries, 1);
  const weightStats = weightTrendStats(state.healthDays, spanDays, shiftDay(endDay, 1));
  // 同一页所有图共用横轴窗口：柱状图本来就画整段区间，线图不跟上就会出现
  // 「体重 08-22→08-23、活动能量 07-26→08-24」这种同页三个区间的情况。
  const axisDomain = [days[0], days[days.length - 1]];
  // 7 天视图才开逐日标注和点选：点数少、落点区间宽，手指点得准；
  // 一个月以上一个点不到 20px，点选只会选错。
  // 切换区间后旧的选中日可能已经不在窗口里，先清掉再渲染
  if (selectedDay && (!isWeek || !days.includes(selectedDay))) selectedDay = null;
  const pick = isWeek
    ? {
      showAllDates: true,
      interactive: true,
      selectedX: selectedDay,
      // 点同一天再点一次 = 取消选中
      onPick: (date) => { selectedDay = selectedDay === date ? null : date; rerender(); },
    }
    : {};
  // 每张图下方那行数值。取的是选中日在该指标上的值，没有就显示「没有记录」
  const valueAt = (fmt) => (getter) => {
    if (!selectedDay) return null;
    const v = getter(selectedDay);
    return v == null ? null : fmt(v);
  };
  const kcalAt = valueAt((v) => `${num(v)} kcal`);
  const gAt = valueAt((v) => `${num(v)} g`);
  // 所有图都只画到前一天，这句在每张图下面重复一次，免得有人以为数据丢了
  const todayNote = state.day === todayKey() ? '当天数据要等这一天过完才会出现。' : '';
  const weightNote = weightStats.kgPerWeek != null
    ? `所选区间有 ${weightStats.records} 次体重记录、覆盖 ${weightStats.spanDays} 个日历日；拟合趋势 ${weightStats.kgPerWeek > 0 ? '+' : ''}${weightStats.kgPerWeek} kg/周，目标 ${targets.rateKgPerWeek > 0 ? '+' : ''}${targets.rateKgPerWeek} kg/周。单日波动不等于脂肪变化。`
    : `已有 ${weightStats.records} 次体重记录；至少需要 4 次，且首末记录相隔 7 天，才能估算每周趋势。${isWeek ? '7 天视图本身不足以形成 7 个整日的首末间隔，请切换到「近一个月」查看。' : ''}`;

  mount(root, 
    rangeSwitch(rerender),

    h('section.card.summary-card', null,
      h('div.summary-grid', null,
        summaryItem('饮食记录', `${loggedDays}天`, rangeLabel),
        summaryItem('已结束日均摄入', avgKcal != null ? `${avgKcal}` : '—',
          avgKcal != null ? `${kcalSeries.length} 个有记录日` : '暂无已结束记录日'),
        summaryItem('已结束日均蛋白', avgProtein != null ? `${avgProtein}g` : '—',
          avgProtein != null ? `${proteinSeries.length} 个有记录日` : '暂无已结束记录日'),
        summaryItem('蛋白达标', proteinSeries.length ? `${proteinHit}/${proteinSeries.length}` : '—', `按${targetContext} 90%`),
        summaryItem(`${rangeLabel}体重趋势`, weightStats.kgPerWeek != null
          ? `${weightStats.kgPerWeek > 0 ? '+' : ''}${weightStats.kgPerWeek}` : '—',
        `kg/周 · ${weightStats.records} 次`),
        summaryItem('已结束日均活动', avgActive != null ? `${avgActive}` : '—',
          avgActive != null ? `${activeSeries.length} 个记录日` : '暂无已结束记录日'),
      )),

    (() => {
      const list = healthInsights(state.healthDays, {
        targets, dietDaily: state.dietDaily, windowDays: spanDays, asOfDate: shiftDay(endDay, 1),
      }).filter((i) => i.key !== 'nodata');
      return list.length ? h('section.card', null,
        h('div.card-head', null, h('h3', null, '这些数据说明什么'),
          h('span.card-tag', null, rangeLabel)),
        h('div.insight-list', null, list.map((i) => h(`div.insight.${i.level}`, null,
          h('div.insight-title', null, i.title),
          h('div.insight-text', null, i.text))))) : null;
    })(),

    chartCard('体重', weightSeries.length ? `最新 ${num(weightSeries[weightSeries.length - 1].y, 1)} kg` : null,
      lineChart({
        data: weightSeries, color: 'var(--accent)', decimals: 1, unit: 'kg', domain: axisDomain, ...pick,
        emptyText: weightSeries.length ? '已有 1 次体重记录，暂时无法连线' : '还没有体重记录',
      }),
      weightNote,
      isWeek ? readoutRow(valueAt((v) => `${num(v, 1)} kg`)((dd) => (health.get(dd)?.weightKg > 0 ? health.get(dd).weightKg : null))) : null),

    chartCard('每日热量摄入', avgKcal != null ? `已结束日平均 ${avgKcal} kcal` : null,
      lineChart({
        data: kcalTimeline, color: 'var(--accent)', target: targets.kcal,
        targetLabel: `${targetContext} ${Math.round(targets.kcal)}`, unit: 'kcal',
        domain: axisDomain, breakOnMissing: true, showPoints: true, minPoints: 1,
        overIsBad: true, emptyText: '还没有饮食记录', ...pick,
      }),
      `参考线使用${targetContext}，不代表区间内各历史日期当时的目标；超过 5% 的日子会标红。${todayNote}`,
      isWeek ? readoutRow(kcalAt((dd) => dietByDate.get(dd)?.kcal ?? null)) : null),

    chartCard('每日蛋白摄入', proteinSeries.length ? `达标 ${proteinHit}/${proteinSeries.length} 天` : null,
      lineChart({
        data: proteinTimeline, color: 'var(--protein)', target: proteinThreshold,
        targetLabel: `达标线 ${Math.round(proteinThreshold)}g`, unit: 'g',
        domain: axisDomain, breakOnMissing: true, showPoints: true, minPoints: 1,
        overIsBad: false, emptyText: '还没有饮食记录', ...pick,
      }),
      `达标线使用${targetContext}的 90%（${Math.round(proteinThreshold)}g）；超过这条线不会被标红。${todayNote}`,
      isWeek ? readoutRow(gAt((dd) => dietByDate.get(dd)?.protein ?? null)) : null),

    balanceSeries.length >= 2 ? chartCard('热量收支（摄入 − 消耗）', null,
      lineChart({
        data: balanceSeries, color: 'var(--warn)', target: 0, targetLabel: '收支平衡',
        unit: 'kcal', domain: axisDomain, ...pick,
      }),
      '只绘制同日饮食、静息能量和活动能量都齐全的数据；低于 0 表示摄入低于设备估算消耗。7700 kcal/kg 仅用于脂肪当量换算，不等于体重一定这样变化。',
      isWeek ? readoutRow(kcalAt((dd) => balanceSeries.find((pt) => pt.x === dd)?.y ?? null)) : null) : null,

    activeSeries.length >= 2 ? chartCard('活动能量', avgActive != null ? `已结束日平均 ${avgActive} kcal` : null,
      lineChart({
        data: activeSeries, color: 'var(--protein)', unit: 'kcal', domain: axisDomain, ...pick,
        // 活动能量没有「该达到多少」的目标，能做参考的只有自己的均值。
        // 画的是已结束日均值，和卡片右上角那个数字同源，两处必须一致。
        // 图内标签要短：右对齐画在线上方，写全「已结束日平均」会压住曲线。
        // 完整措辞放在卡片右上角的标签里，两处是同一个数。
        target: avgActive, targetLabel: avgActive != null ? `平均 ${avgActive}` : '',
      }),
      `活动能量来自设备估算。新数据导入后会调整当日预算；旧快照不会随时钟自动变化。${todayNote}`,
      isWeek ? readoutRow(kcalAt((dd) => health.get(dd)?.activeEnergy ?? null)) : null) : null,

    sleepSeries.length >= 2 ? chartCard('睡眠', avgSleep != null ? `已结束日平均 ${formatHours(avgSleep * 60)}` : null,
      lineChart({
        data: sleepSeries, color: 'var(--fiber)', target: 7, targetLabel: '7 小时',
        decimals: 1, unit: '小时', domain: axisDomain, ...pick,
      }),
      `睡眠归到醒来那天。长期睡眠不足可能影响食欲调节、注意力与恢复；这里只看时长，不代表睡眠质量。${todayNote}`,
      isWeek ? readoutRow(valueAt((v) => formatHours(v))((dd) => (health.get(dd)?.sleepMinutes > 0 ? health.get(dd).sleepMinutes : null))) : null) : null,

    range === 'all' ? fullTable(days, dietByDate) : null,
  );
}

function summaryItem(label, value, sub) {
  return h('div.summary-item', null,
    h('div.summary-value', null, value),
    h('div.summary-label', null, label),
    h('div.summary-sub', null, sub));
}
