/**
 * 数据页：近期概览、健康数据解读、每日目标、趋势图与逐日记录。
 *
 * 原先「数据」和「趋势」是两个栏目，但「我最近怎么样」和「我在往哪走」是同一个问题，
 * 分开放要来回切才对得上，所以合成一页：先给汇总与解读，再给目标，最后是走势与明细。
 * 数据的维护性操作（导入 / 备份 / 补录）在设置页。
 */

import {
  h, clearEl, num, toast, formatMinutes, formatHours, mount, infoTip,
} from '../lib/utils.js';
import {
  state, countMisscaledDays, repairHealthEnergy,
  listImplausibleDays, clearImplausibleHealth,
} from '../lib/store.js';
import { healthInsights, healthSummary, weightTrendStats } from '../core/health-insights.js';
import { targetCard } from './cards/targets.js';
import { trendCharts } from './cards/trend-charts.js';

/**
 * 早期版本把 Apple 导出的 unit="Cal"（千卡）当成小卡除以了 1000，
 * 已经存进来的能量数据全部小一千倍。与其让人重新导入全部历史，
 * 不如就地乘回去 —— 判据很保守，只动量级明显不可能的那些天。
 */
function repairCard(rerender) {
  const count = countMisscaledDays();
  if (!count) return null;
  return h('section.card.card-danger', null,
    h('div.card-head', null,
      h('h3', null, '有 ' + count + ' 天的能量数据需要修正'),
      h('span.card-tag', null, '一次点击即可')),
    h('p.empty-hint', null,
      '这些天的活动能量与静息能量被记成了实际值的千分之一，'
      + '导致热量预算退化成公式估算。这是早期版本的单位换算缺陷，现已修复，'
      + '但已经存进来的历史数据需要就地修正一次。'),
    h('button.primary-btn', {
      onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        const n = await repairHealthEnergy();
        toast(`已修正 ${n} 天的能量数据`, 'ok');
        rerender();
      },
    }, `修正这 ${count} 天`),
    h('p.form-hint', null,
      '只会改动活动能量、静息能量与膳食热量三项；步数、体重、睡眠等一律不动。'
      + '重复点击不会把正确的数据再放大。'));
}

const FIELD_LABEL = {
  restingEnergy: '静息能量', activeEnergy: '活动能量', hkKcal: '膳食热量',
  steps: '步数', exerciseMinutes: '锻炼时间', sleepMinutes: '睡眠',
};

/*
 * 和上面那张修正卡不同：这里的数不是量级错了、能算回去，而是根本不可能
 * （成人静息代谢到不了 5000 kcal）。猜不出真值，只能抹掉让人重新导入，
 * 留着的话它会一路污染热量预算和之后 14 天的基线。
 */
function implausibleCard(rerender) {
  const bad = listImplausibleDays();
  if (!bad.length) return null;
  const sample = bad.slice(0, 3).map((d) => `${d.date}（${d.fields.map((f) => FIELD_LABEL[f] || f).join('、')}）`);
  return h('section.card.card-danger', null,
    h('div.card-head', null,
      h('h3', null, `有 ${bad.length} 天的数值不可能是真的`),
      h('span.card-tag', null, '建议清掉')),
    h('p.empty-hint', null,
      sample.join('；') + (bad.length > 3 ? ` 等 ${bad.length} 天` : '')),
    h('p.form-hint', { style: { margin: '4px 0 10px' } },
      '常见原因是快捷指令里的日期范围没选「今天」，把多天累加成了一天。'
      + '这种数会把热量目标顶高一大截，也会污染近 14 天的基线，'
      + '所以先抹掉、再重新导入一次更稳妥。'),
    h('button.primary-btn', {
      onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        const n = await clearImplausibleHealth();
        toast(`已清掉 ${n} 天的异常数值`, 'ok');
        rerender();
      },
    }, `清掉这 ${bad.length} 天的异常数值`),
    h('p.form-hint', null, '只抹掉超出生理上限的那几项，同一天里其余字段（体重、睡眠等）原样保留。'));
}

/*
 * 近 14 天概览。它是「我最近怎么样」的汇总，不是走势本身，所以固定 14 天窗口、
 * 排在图表之前；下方趋势图那个区间选择器只管图表，不影响这里。
 * 窗口与页尾「最近记录」表一致。
 */
const OVERVIEW_DAYS = 14;

function summaryItem(label, value, sub) {
  return h('div.summary-item', null,
    h('div.summary-value', null, value),
    h('div.summary-label', null, label),
    h('div.summary-sub', null, sub));
}

function overviewCard() {
  const summary = healthSummary(state.healthDays, OVERVIEW_DAYS, state.day);
  // 摄入类只统计已经过完的日子：今天还在累加，算进平均会无端拉低
  const endDay = state.day;
  const diet = state.dietDaily.filter((r) => r.date < endDay).slice(-OVERVIEW_DAYS);
  const avg = (key) => {
    const vals = diet.map((r) => Number(r[key])).filter(Number.isFinite);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const target = state.derived?.targets;
  const proteinHit = target?.protein > 0
    ? diet.filter((r) => Number(r.protein) >= target.protein * 0.9).length
    : null;
  const weightStats = weightTrendStats(state.healthDays, OVERVIEW_DAYS, state.day);

  const cells = [
    ['日均步数', summary.steps, '步'],
    ['日均活动', summary.activeEnergy, 'kcal'],
    ['日均锻炼', summary.exerciseMinutes, '分钟'],
    ['日均睡眠', summary.sleepHours, '小时'],
    ['静息心率', summary.restingHR, 'bpm'],
    ['平均体脂率', summary.bodyFatPct, '%'],
  ].filter(([, v]) => v != null);

  const avgKcal = avg('kcal');
  const avgProtein = avg('protein');
  const dietItems = [
    summaryItem('饮食记录', `${diet.length}天`, `近 ${OVERVIEW_DAYS} 天`),
    summaryItem('已结束日均摄入', avgKcal != null ? `${avgKcal}` : '—',
      avgKcal != null ? `${diet.length} 个有记录日` : '暂无已结束记录日'),
    summaryItem('已结束日均蛋白', avgProtein != null ? `${avgProtein}g` : '—',
      avgProtein != null ? `${diet.length} 个有记录日` : '暂无已结束记录日'),
    proteinHit != null && diet.length
      ? summaryItem('蛋白达标', `${proteinHit}/${diet.length}`, '按当前目标 90%')
      : null,
    summaryItem('体重趋势', weightStats.kgPerWeek != null
      ? `${weightStats.kgPerWeek > 0 ? '+' : ''}${weightStats.kgPerWeek}` : '—',
    `kg/周 · ${weightStats.records} 次`),
  ].filter(Boolean);

  if (!cells.length && !diet.length) return null;
  return h('section.card', null,
    h('div.card-head', null,
      h('div', null,
        h('h3', null, `近 ${OVERVIEW_DAYS} 天概览`),
        h('p.card-desc', null, '身体、活动与饮食的近期汇总。')),
      h('div.card-head-actions', null,
        summary.days ? h('span.card-tag', null, `${summary.days} 个记录日`) : null,
        infoTip('查看统计口径',
          h('p', null, `摘要按截至所选日期的最近 ${OVERVIEW_DAYS} 个日历日计算；只统计实际存在的字段，缺失不会当成 0。`),
          h('p', null, '摄入与蛋白的分母是「有饮食记录的天数」，没记录的日子不在样本里；当天还没过完，不计入平均。')))),
    cells.length ? h('div.health-strip', null, cells.map(([k, v, u]) => h('div.health-cell', null,
      h('div.health-value', null, num(v, u === '小时' || u === '%' ? 1 : 0), h('span.health-unit', null, u)),
      h('div.health-label', null, k)))) : null,
    dietItems.length ? h('div.summary-grid', { style: { marginTop: cells.length ? '14px' : '0' } }, dietItems) : null,
  );
}

/** 健康数据解读：把上面那些数字翻译成「这意味着什么、该怎么做」 */
function insightCard() {
  const list = healthInsights(state.healthDays, {
    targets: state.derived?.targets,
    dietDaily: state.dietDaily,
    windowDays: OVERVIEW_DAYS,
    asOfDate: state.day,
  });
  const hasData = state.healthDays.some((d) => d.date <= state.day);
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '健康数据解读'),
      h('span.card-tag', null, `近 ${OVERVIEW_DAYS} 天`)),
    h('div.insight-list', null,
      list.map((i) => h(`div.insight.${i.level}`, null,
        h('div.insight-title', null, i.title),
        h('div.insight-text', null, i.text)))),
    !hasData && h('p.form-hint', null, '先在设置里的「数据管理」导入健康数据，这里就会给出针对你的解读。'),
  );
}

function dataTable() {
  const eligible = state.healthDays.filter((d) => d.date <= state.day);
  const rows = eligible.slice(-14).reverse();
  if (!rows.length) return null;
  const cols = [
    ['date', '日期', (v) => v],
    ['steps', '步数', (v) => (v != null ? num(v) : '—')],
    ['activeEnergy', '活动', (v) => (v != null ? `${num(v)}` : '—')],
    ['restingEnergy', '静息', (v) => (v != null ? `${num(v)}` : '—')],
    ['exerciseMinutes', '锻炼', (v) => (v != null ? formatMinutes(v) : '—')],
    ['sleepMinutes', '睡眠', (v) => (v != null ? formatHours(v) : '—')],
    ['weightKg', '体重', (v) => (v != null ? num(v, 1) : '—')],
  ];
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '最近记录'),
      h('div.card-head-actions', null,
        h('span.card-tag', null, `最近 ${rows.length} 个记录日 / 截至所选日共 ${eligible.length} 天`),
        infoTip('查看表格说明',
          h('p', null, '每行是一天的汇总结果；活动与静息能量单位为 kcal。')))),
    h('div.table-wrap', null, h('table.data-table', null,
      h('thead', null, h('tr', null, cols.map(([, label]) => h('th', null, label)))),
      h('tbody', null, rows.map((r) => h('tr', {
        class: r.date === state.day ? 'current' : '',
      }, cols.map(([key, , fmt]) => h('td', null, fmt(r[key])))))))),
  );
}

export function renderHealth(root) {
  const rerender = () => renderHealth(root);
  clearEl(root);
  mount(root,
    repairCard(rerender),
    implausibleCard(rerender),
    overviewCard(),
    insightCard(),
    targetCard(),
    ...(trendCharts(rerender) || []),
    dataTable(),
  );
}
