/**
 * 趋势图区块。作为卡片模块挂在「数据」页——数据和趋势本来就是一件事，
 * 分成两个栏目要来回切才能把「现在怎么样」和「在往哪走」对上。
 *
 * 一次只画一张图：七张图叠在一页要滑很久，而且每张都想被认真看时反而都没被看。
 * 上面一排按钮选看哪一张，选中的那张给出走势解读。
 */

import { h, num, shiftDay, formatHours, formatMinutes, todayKey, infoTip } from '../../lib/utils.js';
import { lineChart } from '../../lib/charts.js';
import { state } from '../../lib/store.js';
import { weightTrendStats } from '../../core/health-insights.js';
import { trendReading } from '../../core/trend-reading.js';


/*
 * 区间档位。ALL 表示「全部」——覆盖到最早一条记录，并附一张逐日明细表。
 * 只留三个图表档位：7 天用来看这周、一个月看近况、六个月看长期走势。
 */
const RANGES = [
  { key: 7, label: '近 7 日', days: 7 },
  { key: 30, label: '近 30 日', days: 30 },
  { key: 90, label: '近 90 日', days: 90 },
  { key: 'all', label: '全部', days: null },
];
// 默认看这一周；更长的区间另外选
let range = 7;
/*
 * 选中的那一天。放在这里而不是图表内部，是为了让一次点选同时作用于全部图表——
 * 「那天吃了多少、动了多少、睡了多久」是一个问题，不该点五次才看得全。
 * 放在模块级也让它扛得住定时器触发的重绘。
 */
let selectedDay = null;

/**
 * 图表统计到哪一天为止：**永远是昨天**。
 *
 * 当天不画：一天没过完，活动能量、摄入都还在累加，画出来是个必然偏低的点，
 * 看趋势时会误以为「今天掉下去了」。
 *
 * 也不跟今日 / 饮食页选的日期走。那两页翻回前几天是为了补记饮食，
 * 趋势图跟着翻只会让「近 7 日」这个说法在不同页面上指不同的七天。
 */
function lastEndedDay() {
  return shiftDay(todayKey(), -1);
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

/*
 * 区间和图表都用原生 <select>。
 *
 * 之前是两排按钮：九张图加四个区间铺开就占掉大半屏，而每次只看其中一个，
 * 剩下的全是噪音。原生下拉在 iOS 上是系统滚轮，比自绘的列表更顺手，
 * 也不用自己处理键盘和无障碍。
 */
function picker({ label, value, options, onPick }) {
  const select = h('select.trend-select', {
    'aria-label': label,
    onchange: (ev) => onPick(ev.target.value),
  }, options.map((o) => h('option', { value: String(o.key) }, o.label)));
  /*
   * 选中值建完再赋，不要靠 option 的 selected 属性：
   * h() 把 `selected: ''` 当成假值跳过，结果一个选项都没被标记，
   * select 会默默落到第一项——下拉显示「热量摄入」而图画的是体重。
   */
  select.value = String(value);
  /*
   * 「看什么」「时间段」这两行字不写在界面上：下拉里第一项就写着「热量摄入」
   * 和「7 天」，标签只是把同一件事再说一遍。aria-label 保留，读屏仍念得出来。
   */
  return h('div.trend-picker-field', null,
    h('div.trend-select-wrap', null, select, h('span.trend-select-caret', { 'aria-hidden': 'true' }, '⌄')));
}

/*
 * 选中某天时才出现这行；没选中就整行不渲染。
 * 早先这里常驻一句可点提示占位，读起来纯属噪音——图能点，点一下就知道了。
 */
function readoutRow(value) {
  if (!selectedDay) return null;
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

/* ------------------------------------------------- 图表清单 ------------- */

/**
 * 一次只展示一张。key 用来记住上次看的是哪张，available 决定这张图有没有数据可画。
 * 顺序按「最常看」排：吃了多少 → 蛋白够不够 → 体重 → 动了多少 → 睡得够不够 → 心率 → 收支。
 */
const CHARTS = [
  { key: 'kcal', label: '热量摄入' },
  { key: 'protein', label: '蛋白摄入' },
  { key: 'weight', label: '体重' },
  { key: 'steps', label: '步数' },
  { key: 'active', label: '活动能量' },
  { key: 'exercise', label: '锻炼时间' },
  { key: 'sleep', label: '睡眠' },
  { key: 'restingHR', label: '静息心率' },
  { key: 'balance', label: '热量收支' },
];
let activeChart = 'kcal';
/*
 * 只在用户没点过时才自动跳到有数据的那张图。
 * 点了没数据的那张却被弹回别处，看起来像按钮坏了——那张图自己会说明缺什么。
 */
let chartPicked = false;



export function trendCharts(rerender) {
  const d = state.derived;
  if (!d) return null;

  const endDay = lastEndedDay();
  const spanDays = range === 'all' ? daysBetween(earliestDay(), endDay) : range;
  const days = dateRange(spanDays);
  const isWeek = range === 7;
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
  const stepsSeries = series(days, (date) => health.get(date)?.steps ?? null);
  const exerciseSeries = series(days, (date) => health.get(date)?.exerciseMinutes ?? null);
  const hrSeries = series(days, (date) => {
    const v = health.get(date)?.restingHR;
    return v > 0 ? v : null;
  });
  const sleepSeries = series(days, (date) => {
    const v = health.get(date)?.sleepMinutes;
    return v > 0 ? v / 60 : null;
  });
  const balanceSeries = series(days, (date) => {
    const eaten = dietByDate.get(date)?.kcal;
    const hd = health.get(date);
    if (eaten == null || !hd) return null;
    const hasResting = Number(hd.restingEnergy) > 0;
    const hasActive = hd.activeEnergy != null
      && Number.isFinite(Number(hd.activeEnergy)) && Number(hd.activeEnergy) >= 0;
    // 历史收支不能用「今天的 BMR / 近期活动均值」替缺失字段，否则会把当前假设倒灌进过去
    if (!hasResting || !hasActive) return null;
    return Math.round(eaten - (Number(hd.restingEnergy) + Number(hd.activeEnergy)));
  });

  // 图上的目标线画的是**现在这套设置**算出来的目标，历史那几天当时未必是这个数
  const targetContext = '当前目标';
  const proteinThreshold = targets.protein * 0.9;
  const proteinHit = proteinSeries.filter((p) => p.y >= proteinThreshold).length;
  const avgKcal = average(kcalSeries);
  const avgActive = average(activeSeries);
  const avgSteps = average(stepsSeries);
  const avgExercise = average(exerciseSeries);
  const avgSleep = average(sleepSeries, 1);
  const avgHR = average(hrSeries);
  const weightStats = weightTrendStats(state.healthDays, spanDays, shiftDay(endDay, 1));
  const axisDomain = [days[0], days[days.length - 1]];

  if (selectedDay && (!isWeek || !days.includes(selectedDay))) selectedDay = null;
  const pick = isWeek
    ? {
      showAllDates: true,
      interactive: true,
      selectedX: selectedDay,
      onPick: (date) => { selectedDay = selectedDay === date ? null : date; rerender(); },
    }
    : {};
  const valueAt = (fmt) => (getter) => {
    if (!selectedDay) return null;
    const v = getter(selectedDay);
    return v == null ? null : fmt(v);
  };
  const kcalAt = valueAt((v) => `${num(v)} kcal`);

  const availability = {
    kcal: kcalSeries.length > 0, protein: proteinSeries.length > 0,
    weight: weightSeries.length > 0, active: activeSeries.length > 0,
    sleep: sleepSeries.length > 0, restingHR: hrSeries.length > 0,
    balance: balanceSeries.length > 0,
    steps: stepsSeries.length > 0, exercise: exerciseSeries.length > 0,
  };

  const SPEC = {
    kcal: () => ({
      title: '每日热量摄入',
      tag: avgKcal != null ? `已结束日平均 ${avgKcal} kcal` : null,
      chart: lineChart({
        data: kcalTimeline, color: 'var(--accent)', target: targets.kcal,
        targetLabel: `${targetContext} ${Math.round(targets.kcal)}`, unit: 'kcal',
        domain: axisDomain, breakOnMissing: true, showPoints: true, minPoints: 1,
        overIsBad: true, emptyText: '还没有饮食记录', ...pick,
      }),
      note: trendReading('kcal', kcalSeries, { target: targets.kcal }),
      readout: readoutRow(kcalAt((dd) => dietByDate.get(dd)?.kcal ?? null)),
      tip: `参考线使用${targetContext}，不代表区间内各历史日期当时的目标；超过 5% 的日子会标红。`,
    }),
    protein: () => ({
      title: '每日蛋白摄入',
      tag: proteinSeries.length ? `达标 ${proteinHit}/${proteinSeries.length} 天` : null,
      chart: lineChart({
        data: proteinTimeline, color: 'var(--protein)', target: proteinThreshold,
        targetLabel: `达标线 ${Math.round(proteinThreshold)}g`, unit: 'g',
        domain: axisDomain, breakOnMissing: true, showPoints: true, minPoints: 1,
        overIsBad: false, emptyText: '还没有饮食记录', ...pick,
      }),
      note: trendReading('protein', proteinSeries, { target: targets.protein, threshold: proteinThreshold }),
      readout: readoutRow(valueAt((v) => `${num(v)} g`)((dd) => dietByDate.get(dd)?.protein ?? null)),
      tip: `达标线使用${targetContext}的 90%（${Math.round(proteinThreshold)}g）；超过这条线不会被标红。`,
    }),
    weight: () => ({
      title: '体重',
      tag: weightSeries.length ? `最新 ${num(weightSeries[weightSeries.length - 1].y, 1)} kg` : null,
      chart: lineChart({
        data: weightSeries, color: 'var(--accent)', decimals: 1, unit: 'kg', domain: axisDomain, ...pick,
        emptyText: weightSeries.length ? '已有 1 次体重记录，暂时无法连线' : '还没有体重记录',
      }),
      note: trendReading('weight', weightSeries, {
        kgPerWeek: weightStats.kgPerWeek, goalRate: targets.rateKgPerWeek,
        records: weightStats.records, spanDays: weightStats.spanDays,
      }),
      readout: readoutRow(valueAt((v) => `${num(v, 1)} kg`)((dd) => (health.get(dd)?.weightKg > 0 ? health.get(dd).weightKg : null))),
      tip: '拟合趋势按所选区间内的全部称重估算；单日波动主要是水分与排空差异。',
    }),
    steps: () => ({
      title: '步数',
      tag: avgSteps != null ? `已结束日平均 ${num(avgSteps)} 步` : null,
      chart: lineChart({
        data: stepsSeries, color: 'var(--accent)', unit: '步', domain: axisDomain, ...pick,
        target: avgSteps, targetLabel: avgSteps != null ? `平均 ${num(avgSteps)}` : '',
        emptyText: '还没有步数记录',
      }),
      note: trendReading('steps', stepsSeries, {}),
      readout: readoutRow(valueAt((v) => `${num(v)} 步`)((dd) => health.get(dd)?.steps ?? null)),
      tip: '步数来自手机或手表的计步器。多设备同时佩戴时按来源取较大值，不做累加。',
    }),
    exercise: () => ({
      title: '锻炼时间',
      tag: avgExercise != null ? `已结束日平均 ${formatMinutes(avgExercise)}` : null,
      chart: lineChart({
        data: exerciseSeries, color: 'var(--accent)', unit: '分钟', domain: axisDomain, ...pick,
        target: 150 / 7, targetLabel: '建议 每周 150 分钟',
        emptyText: '还没有锻炼记录',
      }),
      note: trendReading('exercise', exerciseSeries, {}),
      readout: readoutRow(valueAt((v) => formatMinutes(v))((dd) => health.get(dd)?.exerciseMinutes ?? null)),
      tip: '参考线是 WHO 每周 150 分钟中等强度活动折算到每天（约 21 分钟）。只统计设备记录到的时长。',
    }),
    active: () => ({
      title: '活动能量',
      tag: avgActive != null ? `已结束日平均 ${avgActive} kcal` : null,
      chart: lineChart({
        data: activeSeries, color: 'var(--protein)', unit: 'kcal', domain: axisDomain, ...pick,
        target: avgActive, targetLabel: avgActive != null ? `平均 ${avgActive}` : '',
      }),
      note: trendReading('active', activeSeries, {}),
      readout: readoutRow(kcalAt((dd) => health.get(dd)?.activeEnergy ?? null)),
      tip: '活动能量来自设备估算。新数据导入后会调整当日预算；旧快照不会随时钟自动变化。',
    }),
    sleep: () => ({
      title: '睡眠',
      tag: avgSleep != null ? `已结束日平均 ${formatHours(avgSleep * 60)}` : null,
      chart: lineChart({
        data: sleepSeries, color: 'var(--protein)', target: 7, targetLabel: '建议 7 小时',
        decimals: 1, unit: '小时', domain: axisDomain, ...pick,
      }),
      note: trendReading('sleep', sleepSeries, {}),
      readout: readoutRow(valueAt((v) => formatHours(v * 60))((dd) => (health.get(dd)?.sleepMinutes > 0 ? health.get(dd).sleepMinutes / 60 : null))),
      tip: '虚线是成人 7~9 小时建议区间的下沿，不是这段时间的平均——平均写在卡片右上角。'
        + '睡眠归到醒来那天，只统计真正入睡的片段；这里只看时长，不代表睡眠质量。',
    }),
    restingHR: () => ({
      title: '静息心率',
      tag: avgHR != null ? `已结束日平均 ${avgHR} bpm` : null,
      chart: lineChart({
        data: hrSeries, color: 'var(--danger)', unit: 'bpm', domain: axisDomain, ...pick,
        target: avgHR, targetLabel: avgHR != null ? `平均 ${avgHR}` : '',
        emptyText: '还没有静息心率记录',
      }),
      note: trendReading('restingHR', hrSeries, {}),
      readout: readoutRow(valueAt((v) => `${num(v)} bpm`)((dd) => (health.get(dd)?.restingHR > 0 ? health.get(dd).restingHR : null))),
      tip: '静息心率由手表在佩戴睡眠时自动记录，手动补录不会产生这项。',
    }),
    balance: () => ({
      title: '热量收支（摄入 − 消耗）',
      tag: null,
      chart: lineChart({
        data: balanceSeries, color: 'var(--warn)', target: 0, targetLabel: '收支平衡',
        unit: 'kcal', domain: axisDomain, ...pick,
        emptyText: '需要同日的饮食记录与设备能量数据',
      }),
      note: trendReading('balance', balanceSeries, {}),
      readout: readoutRow(kcalAt((dd) => balanceSeries.find((pt) => pt.x === dd)?.y ?? null)),
      tip: '只绘制同日饮食、静息能量和活动能量都齐全的数据；低于 0 表示摄入低于设备估算消耗。',
    }),
  };

  if (!chartPicked && !availability[activeChart]) {
    const firstReady = CHARTS.find((c) => availability[c.key]);
    if (firstReady) activeChart = firstReady.key;
  }
  /*
   * activeChart 认不出来时退回第一张，别让整张卡凭空消失。
   *
   * 它是模块级状态，活得比一次渲染长：删掉某个图、改了 key、或者别处误写一个值
   * 进来，SPEC[activeChart] 就是 undefined —— 直接调用会抛在渲染中途，
   * 结果是数据页少了一整张卡，控制台里什么都没有，最难查的那种。
   */
  if (typeof SPEC[activeChart] !== 'function') activeChart = CHARTS[0].key;
  const spec = SPEC[activeChart]();
  const todayNote = '统计到昨天为止：当天数据要等这一天过完才会出现。';

  return [
    // 选择器和图合成一张卡：它们本来就是一件事，分成两块只是多一道分隔线
    h('section.card.trend-card', null,
      h('div.card-head', null,
        /*
         * 标题固定。原先它跟着下拉一起变（「每日热量摄入」→「体重」），
         * 于是同一张卡的名字每切一次就换一个，找不到锚点；
         * 而下拉第一项本来就写着当前看的是什么，标题再说一遍是重复。
         */
        h('h3', null, '健康趋势图'),
        h('div.card-head-actions', null,
          spec.tag ? h('span.card-tag', null, spec.tag) : null,
          infoTip('查看这张图的统计口径',
            h('p', null, spec.tip),
            h('p', null, `统计到 ${endDay} 为止；${todayNote || '所选日期当天不计入。'}`)))),

      h('div.trend-pickers', null,
        picker({
          label: '看什么',
          value: activeChart,
          options: CHARTS.map((c) => ({
            key: c.key,
            // 没数据的仍然能选：点进去会说明缺什么，比直接藏起来好找
            // 后缀要短：下拉宽度只有半屏，「（暂无数据）」会把名字挤没
            label: availability[c.key] ? c.label : `${c.label} · 无数据`,
          })),
          onPick: (key) => { activeChart = key; chartPicked = true; rerender(); },
        }),
        picker({
          label: '时间段',
          value: range,
          options: RANGES.map((r) => ({ key: r.key, label: r.label })),
          onPick: (key) => { range = key === 'all' ? 'all' : Number(key); rerender(); },
        })),

      h('div.chart-wrap', null, spec.chart),
      spec.readout,
      h('p.chart-note', null, spec.note)),

    range === 'all' ? fullTable(days, dietByDate) : null,
  ];
}
