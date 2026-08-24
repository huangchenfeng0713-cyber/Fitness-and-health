/** 趋势：体重、热量收支、蛋白达标、活动与睡眠 */

import { h, clearEl, num, shiftDay, formatHours, mount, todayKey } from '../lib/utils.js';
import { lineChart, barChart } from '../lib/charts.js';
import { state } from '../lib/store.js';
import { healthInsights, weightTrendStats } from '../core/health-insights.js';

let range = 30;

function dateRange(days) {
  const out = [];
  let d = state.day;
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
    [7, 30, 90, 180].map((n) => h('button', {
      class: `chip-btn${range === n ? ' active' : ''}`,
      onclick: () => { range = n; rerender(); },
    }, `${n} 天`)));
}

function chartCard(title, tag, chart, note) {
  return h('section.card', null,
    h('div.card-head', null, h('h3', null, title), tag && h('span.card-tag', null, tag)),
    h('div.chart-wrap', null, chart),
    note && h('p.form-hint', null, note));
}

export function renderTrends(root) {
  const rerender = () => renderTrends(root);
  clearEl(root);
  const d = state.derived;
  if (!d) return;

  const days = dateRange(range);
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

  // 今天仍在进行，当前累计值可以画出来，但不能混进“每日平均”和达标率。
  // 否则上午只记了一餐，就会把整个 30 天均值无端拉低。
  const viewingToday = state.day === todayKey();
  // 没有保存逐日目标历史；看旧日期时是把当前档案设置套到所选日数据上重算。
  // 文案必须把这一点说出来，不能伪装成当时实际保存过的目标。
  const targetContext = viewingToday ? '当前目标' : '当前设置估算目标';
  const ended = (points) => viewingToday ? points.filter((p) => p.x < state.day) : points;
  const endedKcal = ended(kcalSeries);
  const endedProtein = ended(proteinSeries);
  const endedActive = ended(activeSeries);
  const proteinThreshold = targets.protein * 0.9;
  const proteinHit = endedProtein.filter((p) => p.y >= proteinThreshold).length;
  const loggedDays = kcalSeries.length;
  const avgKcal = average(endedKcal);
  const avgProtein = average(endedProtein);
  const avgActive = average(endedActive);
  const avgSleep = average(sleepSeries, 1);
  const weightStats = weightTrendStats(state.healthDays, range, state.day);
  const todayHasDiet = viewingToday && kcalSeries.some((p) => p.x === state.day);
  const weightNote = weightStats.kgPerWeek != null
    ? `所选区间有 ${weightStats.records} 次体重记录、覆盖 ${weightStats.spanDays} 个日历日；拟合趋势 ${weightStats.kgPerWeek > 0 ? '+' : ''}${weightStats.kgPerWeek} kg/周，目标 ${targets.rateKgPerWeek > 0 ? '+' : ''}${targets.rateKgPerWeek} kg/周。单日波动不等于脂肪变化。`
    : `已有 ${weightStats.records} 次体重记录；至少需要 4 次，且首末记录相隔 7 天，才能估算每周趋势。${range === 7 ? '7 天视图本身不足以形成 7 个整日的首末间隔，请切换到 30 天查看。' : ''}`;

  mount(root, 
    rangeSwitch(rerender),

    h('section.card.summary-card', null,
      h('div.summary-grid', null,
        summaryItem('饮食记录', `${loggedDays}天`, `近 ${range} 天`),
        summaryItem('已结束日均摄入', avgKcal != null ? `${avgKcal}` : '—',
          avgKcal != null ? `${endedKcal.length} 个有记录日` : '暂无已结束记录日'),
        summaryItem('已结束日均蛋白', avgProtein != null ? `${avgProtein}g` : '—',
          avgProtein != null ? `${endedProtein.length} 个有记录日` : '暂无已结束记录日'),
        summaryItem('蛋白达标', endedProtein.length ? `${proteinHit}/${endedProtein.length}` : '—', `按${targetContext} 90%`),
        summaryItem(`${range}日体重趋势`, weightStats.kgPerWeek != null
          ? `${weightStats.kgPerWeek > 0 ? '+' : ''}${weightStats.kgPerWeek}` : '—',
        `kg/周 · ${weightStats.records} 次`),
        summaryItem('已结束日均活动', avgActive != null ? `${avgActive}` : '—',
          avgActive != null ? `${endedActive.length} 个记录日` : '暂无已结束记录日'),
      )),

    (() => {
      const list = healthInsights(state.healthDays, {
        targets, dietDaily: state.dietDaily, windowDays: range, asOfDate: state.day,
      }).filter((i) => i.key !== 'nodata');
      return list.length ? h('section.card', null,
        h('div.card-head', null, h('h3', null, '这些数据说明什么'),
          h('span.card-tag', null, `近 ${range} 天`)),
        h('div.insight-list', null, list.map((i) => h(`div.insight.${i.level}`, null,
          h('div.insight-title', null, i.title),
          h('div.insight-text', null, i.text))))) : null;
    })(),

    chartCard('体重', weightSeries.length ? `最新 ${num(weightSeries[weightSeries.length - 1].y, 1)} kg` : null,
      lineChart({
        data: weightSeries, color: 'var(--accent)', decimals: 1, unit: 'kg',
        emptyText: weightSeries.length ? '已有 1 次体重记录，暂时无法连线' : '还没有体重记录',
      }),
      weightNote),

    chartCard('每日热量摄入', avgKcal != null ? `已结束日平均 ${avgKcal} kcal` : null,
      barChart({
        data: kcalTimeline, target: targets.kcal, targetLabel: targetContext, unit: ' kcal',
        partialX: viewingToday ? state.day : null,
      }),
      `参考线使用${targetContext}，不代表区间内各历史日期当时的目标；超过 5% 的完整日会标红。${todayHasDiet ? '今天的浅色柱只是当前累计，不计入上方平均。' : ''}`),

    chartCard('每日蛋白摄入', endedProtein.length ? `达标 ${proteinHit}/${endedProtein.length} 天` : null,
      barChart({
        data: proteinTimeline, target: proteinThreshold, targetLabel: '达标线', unit: ' g',
        overIsBad: false, partialX: viewingToday ? state.day : null,
      }),
      `达标线使用${targetContext}的 90%（${Math.round(proteinThreshold)}g）；超过这条线不会被标红。${todayHasDiet ? '今天只显示当前累计，不计入达标率。' : ''}`),

    ended(balanceSeries).length >= 2 ? chartCard('热量收支（摄入 − 消耗）', null,
      lineChart({ data: ended(balanceSeries), color: 'var(--warn)', target: 0, targetLabel: '收支平衡', unit: 'kcal' }),
      '只绘制同日饮食、静息能量和活动能量都齐全的数据；低于 0 表示摄入低于设备估算消耗。7700 kcal/kg 仅用于脂肪当量换算，不等于体重一定这样变化。') : null,

    activeSeries.length >= 2 ? chartCard('活动能量', avgActive != null ? `已结束日平均 ${avgActive} kcal` : null,
      lineChart({ data: activeSeries, color: 'var(--protein)', unit: 'kcal' }),
      `活动能量来自设备估算。新数据导入后会调整当日预算；旧快照不会随时钟自动变化。${viewingToday && activeSeries.some((p) => p.x === state.day) ? '今天的点是当前累计，不计入平均。' : ''}`) : null,

    sleepSeries.length >= 2 ? chartCard('睡眠', avgSleep != null ? `平均 ${formatHours(avgSleep * 60)}` : null,
      lineChart({ data: sleepSeries, color: 'var(--fiber)', target: 7, targetLabel: '7 小时', decimals: 1, unit: '小时' }),
      '长期睡眠不足可能影响食欲调节、注意力与恢复；这里只看时长，不代表睡眠质量。') : null,
  );
}

function summaryItem(label, value, sub) {
  return h('div.summary-item', null,
    h('div.summary-value', null, value),
    h('div.summary-label', null, label),
    h('div.summary-sub', null, sub));
}
