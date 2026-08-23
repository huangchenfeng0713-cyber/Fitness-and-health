/** 趋势：体重、热量收支、蛋白达标、活动与睡眠 */

import { h, clearEl, num, shiftDay, formatMinutes, mount } from '../lib/utils.js';
import { lineChart, barChart } from '../lib/charts.js';
import { state } from '../lib/store.js';
import { healthInsights } from '../core/health-insights.js';

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
  const kcalSeries = series(days, (date) => dietByDate.get(date)?.kcal ?? null);
  const proteinSeries = series(days, (date) => dietByDate.get(date)?.protein ?? null);
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
    const burn = (Number(hd.restingEnergy) || d.bmr) + (Number(hd.activeEnergy) || 0);
    return Math.round(eaten - burn);
  });

  const proteinHit = proteinSeries.filter((p) => p.y >= targets.protein * 0.9).length;
  const loggedDays = kcalSeries.length;
  const avgKcal = loggedDays ? Math.round(kcalSeries.reduce((a, p) => a + p.y, 0) / loggedDays) : null;
  const avgProtein = loggedDays ? Math.round(proteinSeries.reduce((a, p) => a + p.y, 0) / Math.max(proteinSeries.length, 1)) : null;
  const baseline = d.baseline;

  mount(root, 
    rangeSwitch(rerender),

    h('section.card.summary-card', null,
      h('div.summary-grid', null,
        summaryItem('记录天数', `${loggedDays}`, `近 ${range} 天`),
        summaryItem('平均摄入', avgKcal != null ? `${avgKcal}` : '—', `目标 ${targets.kcal} kcal`),
        summaryItem('平均蛋白', avgProtein != null ? `${avgProtein}g` : '—', `目标 ${targets.protein} g`),
        summaryItem('蛋白达标', `${proteinHit}/${loggedDays || 0}`, '天'),
        summaryItem('体重趋势', baseline.weightTrend != null ? `${baseline.weightTrend > 0 ? '+' : ''}${baseline.weightTrend}` : '—', 'kg/周'),
        summaryItem('平均活动', baseline.activeEnergy != null ? `${Math.round(baseline.activeEnergy)}` : '—', 'kcal/天'),
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
      lineChart({ data: weightSeries, color: 'var(--accent)', decimals: 1, unit: 'kg' }),
      baseline.weightTrend != null
        ? `拟合趋势 ${baseline.weightTrend > 0 ? '+' : ''}${baseline.weightTrend} kg/周，目标 ${targets.rateKgPerWeek > 0 ? '+' : ''}${targets.rateKgPerWeek} kg/周。体重每天波动 1kg 很正常，看趋势线而不是单点。`
        : '至少需要 4 次体重记录才能算出趋势。'),

    chartCard('每日热量摄入', avgKcal != null ? `平均 ${avgKcal} kcal` : null,
      barChart({ data: kcalSeries, target: targets.kcal, unit: ' kcal' }),
      '超过目标 5% 的日子会标红，明显偏低的日子会变淡。'),

    chartCard('每日蛋白摄入', `达标 ${proteinHit} 天`,
      barChart({ data: proteinSeries, target: targets.protein, unit: ' g' }),
      `达标线按目标的 90%（${Math.round(targets.protein * 0.9)}g）计算。`),

    balanceSeries.length >= 2 ? chartCard('热量收支（摄入 − 消耗）', null,
      lineChart({ data: balanceSeries, color: 'var(--warn)', target: 0, targetLabel: '收支平衡', unit: 'kcal' }),
      '低于 0 表示当天处于赤字。累计约 7700 kcal 赤字对应减掉 1kg 脂肪。') : null,

    activeSeries.length >= 2 ? chartCard('活动能量', baseline.activeEnergy != null ? `平均 ${Math.round(baseline.activeEnergy)} kcal` : null,
      lineChart({ data: activeSeries, color: 'var(--protein)', unit: 'kcal' }),
      '这条线直接决定每天的热量预算：活动多的日子预算会自动上调。') : null,

    sleepSeries.length >= 2 ? chartCard('睡眠', baseline.sleepMinutes ? `平均 ${formatMinutes(baseline.sleepMinutes)}` : null,
      lineChart({ data: sleepSeries, color: 'var(--fiber)', target: 7, targetLabel: '7 小时', decimals: 1, unit: '小时' }),
      '长期睡眠不足会升高食欲激素，减脂期尤其明显。') : null,
  );
}

function summaryItem(label, value, sub) {
  return h('div.summary-item', null,
    h('div.summary-value', null, value),
    h('div.summary-label', null, label),
    h('div.summary-sub', null, sub));
}
