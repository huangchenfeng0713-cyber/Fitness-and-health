import { completeEnergyDay } from '../../core/energy-observation.js';
import { planForProfile } from '../../lib/store.js';
/**
 * 趋势图区块。作为卡片模块挂在「数据」页——数据和趋势本来就是一件事，
 * 分成两个栏目要来回切才能把「现在怎么样」和「在往哪走」对上。
 *
 * 一次只画一张图：七张图叠在一页要滑很久，而且每张都想被认真看时反而都没被看。
 * 上面一排按钮选看哪一张，选中的那张给出走势解读。
 */

import { h, num, shiftDay, formatDuration, todayKey } from '../../lib/utils.js';
import { infoTip, selectField } from '../../lib/ui.js';
import { lineChart } from '../../lib/charts.js';
import { state } from '../../lib/store.js';
import { weightTrendStats } from '../../core/health-insights.js';
import { trendReading, planShift, planShiftNote, composeReading, INSUFFICIENT_DATA_TEXT } from '../../core/trend-reading.js';


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
  /*
   * 「看什么」「时间段」这两行字不写在界面上：下拉里第一项就写着「热量摄入」
   * 和「7 天」，标签只是把同一件事再说一遍。aria-label 保留，读屏仍念得出来。
   *
   * 下拉本身（含画出来的箭头、「建完再赋值」那个坑）全在 `lib/ui.js` 的
   * selectField 里，这儿只挑尺寸和内容。
   */
  return h('div.trend-picker-field', null,
    selectField(options.map((o) => [String(o.key), o.label]), { label, value, onPick, size: 'md' }));
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
    ['锻炼', (r) => formatDuration(r.h?.exerciseMinutes)],
    ['睡眠', (r) => formatDuration(r.h?.sleepMinutes)],
    ['体重', (r) => (r.h?.weightKg != null ? num(r.h.weightKg, 1) : '—')],
  ];
  return h('section.card', null,
    h('div.card-head', null,
      h('h3', null, '逐日明细'),
      h('span.card-tag', null, `${rows.length} 天 · ${rows[rows.length - 1].date} 起`)),
    h('div.table-wrap.table-scroll', null, h('table.data-table', null,
      h('thead', null, h('tr', null, cols.map(([label]) => h('th', null, label)))),
      h('tbody', null, rows.map((r) => h('tr', null, cols.map(([, fmt]) => h('td', null, fmt(r)))))))),
    // 「—」表示那天没有这一项，不是 0 —— 不说的话会被读成「那天一口没吃」
    h('p.form-hint', null,
      '「—」表示那天没有这一项记录。单位：摄入 kcal、蛋白 g、活动/静息 kcal、体重 kg。'));
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
  const targets = planForProfile(state.profile, endDay);
  /*
   * 区间内计划变没变，看**数字**，不看「存过几次档案」。
   *
   * 原先的判据是「区间里有没有生效日晚于起点的版本」，而 saveProfile 每保存一次
   * 就记一个版本、Apple 健康同步来的体重也会走这条路 —— 于是进过一次设置，
   * 接下来七天这张图就一直挂着「区间内计划有变更，仅展示记录」：
   * 那句话既没说变了什么，又把整段解读顶掉了（连「日均 2028 kcal」这种
   * 压根不依赖计划的话都一起没了）。绝大多数时候数字根本没动。
   */
  /*
   * 一天之内常常存好几次（改一个数存一次、体重同步再存一次）。
   * 每天只取最后生效的那份，挑法和 planForProfile 一致；不去重的话
   * 同一天里 A→B→A 会读成「目标从 2660 改成 2660（区间内改过 2 次）」。
   */
  const byDate = new Map();
  for (const v of (state.profile.targetVersions || [])) {
    if (!v?.targets || !/^\d{4}-\d{2}-\d{2}$/.test(v.effectiveDate)) continue;
    if (v.effectiveDate <= days[0] || v.effectiveDate > endDay) continue;
    const prev = byDate.get(v.effectiveDate);
    if (!prev || String(prev.savedAt || prev.id) <= String(v.savedAt || v.id)) byDate.set(v.effectiveDate, v);
  }
  const planSteps = [
    { date: days[0], ...planForProfile(state.profile, days[0]) },
    ...[...byDate.keys()].sort().map((date) => ({ date, ...byDate.get(date).targets })),
  ];
  const planUnavailable = targets.status === 'unavailable';
  const kcalShift = planUnavailable ? null : planShift(planSteps, 'kcal');
  const proteinShift = planUnavailable ? null : planShift(planSteps, 'protein');
  // 计划速率带正负、保留一位小数：0 是「维持」，−0.5 和 +0.3 是两个方向
  const rateShift = planUnavailable ? null
    : planShift(planSteps, 'rateKgPerWeek', { decimals: 1, signed: true });
  // 每张图各看各的：热量目标动了不代表蛋白目标也动了
  const mixedTargets = planUnavailable || Boolean(kcalShift);
  const noPlanNote = planUnavailable ? '当前无法生成计划，仅展示记录。' : '';

  const weightSeries = series(days, (date) => {
    const v = health.get(date)?.weightKg;
    return v > 0 ? v : null;
  });
  const kcalTimeline = timeline(days, (date) => dietByDate.get(date)?.coverage?.kcal?.complete === false ? null : dietByDate.get(date)?.kcal ?? null);
  const proteinTimeline = timeline(days, (date) => dietByDate.get(date)?.coverage?.protein?.complete === false ? null : dietByDate.get(date)?.protein ?? null);
  const kcalSeries = kcalTimeline.filter((p) => p.y != null);
  const proteinSeries = proteinTimeline.filter((p) => p.y != null);
  const activeSeries = series(days, (date) => completeEnergyDay(health.get(date))?.fields.activeEnergy.value ?? null);
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
    const observation = completeEnergyDay(hd);
    if (!observation || dietByDate.get(date)?.coverage?.kcal?.complete === false) return null;
    return Math.round(eaten - observation.burnedNow);
  });

  // 图上的目标线画的是**现在这套设置**算出来的目标，历史那几天当时未必是这个数
  const targetContext = planUnavailable ? '当前无法生成计划，仅展示记录' : targets.context;
  const proteinThreshold = planUnavailable || proteinShift ? null : targets.protein;
  const proteinHit = proteinThreshold ? proteinSeries.filter((p) => p.y >= proteinThreshold).length : null;
  const avgKcal = average(kcalSeries);
  const avgActive = average(activeSeries);
  const avgSteps = average(stepsSeries);
  const avgExercise = average(exerciseSeries);
  const avgSleep = average(sleepSeries, 1);
  const avgHR = average(hrSeries);
  const weightStats = weightTrendStats(state.healthDays, spanDays, endDay);
  const axisDomain = [days[0], days[days.length - 1]];

  if (selectedDay && (!isWeek || !days.includes(selectedDay))) selectedDay = null;
  const pick = isWeek
    ? {
      showAllDates: true,
      interactive: true,
      selectedX: selectedDay,
      /*
       * 点同一天是「取消选中」；扫过去的时候每一天都得选上 ——
       * 手指从周三划到周四再划回周三，照点击的逻辑走反而会把它取消掉。
       */
      onPick: (date, { viaDrag = false } = {}) => {
        selectedDay = !viaDrag && selectedDay === date ? null : date;
        rerender();
      },
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
        data: kcalTimeline, color: 'var(--accent)', target: mixedTargets ? null : targets.kcal,
        // 没画目标线时标签也别拼 —— targets.kcal 这时是空的，`Math.round` 给出 NaN
        targetLabel: mixedTargets ? '' : `${targetContext} ${Math.round(targets.kcal)}`, unit: 'kcal',
        domain: axisDomain, breakOnMissing: true, showPoints: true, minPoints: 1,
        overIsBad: false, emptyText: INSUFFICIENT_DATA_TEXT, ...pick,
      }),
      /*
       * 计划变过也照样解读，只是不和单一目标对照 —— 日均、波动、走向
       * 一个字都不依赖计划。变了就说清变成了什么，别只留一句「有变更」。
       */
      note: composeReading(noPlanNote, planShiftNote(kcalShift, 'kcal'),
        trendReading('kcal', kcalSeries, { target: mixedTargets ? null : targets.kcal })),
      readout: readoutRow(kcalAt((dd) => dietByDate.get(dd)?.kcal ?? null)),
      // 线都没画就别提「参考线」——那会让人在图上找一条不存在的虚线
      tip: mixedTargets
        ? '这段区间里热量目标改过，所以没画参考线；日均、波动和走向仍按实际记录算。'
        : '单日高于参考线不等于做错。判断要看多日的体重和收支趋势，一天的高低说明不了什么。',
    }),
    protein: () => ({
      title: '每日蛋白摄入',
      tag: proteinThreshold && proteinSeries.length ? `达标 ${proteinHit}/${proteinSeries.length} 天` : null,
      chart: lineChart({
        data: proteinTimeline, color: 'var(--protein)', target: proteinThreshold,
        targetLabel: proteinThreshold ? `达标线 ${Math.round(proteinThreshold)}g` : '', unit: 'g',
        domain: axisDomain, breakOnMissing: true, showPoints: true, minPoints: 1,
        overIsBad: false, emptyText: INSUFFICIENT_DATA_TEXT, ...pick,
      }),
      note: composeReading(noPlanNote, planShiftNote(proteinShift, 'g'),
        trendReading('protein', proteinSeries, { target: proteinThreshold, threshold: proteinThreshold })),
      readout: readoutRow(valueAt((v) => `${num(v)} g`)((dd) => dietByDate.get(dd)?.protein ?? null)),
      tip: proteinThreshold
        ? `虚线是${targetContext} ${Math.round(proteinThreshold)}g，并非人人适用的最低需求或上限。`
        : '这段区间里蛋白目标改过，所以没画达标线；日均和波动仍按实际记录算。',
    }),
    weight: () => ({
      title: '体重',
      tag: weightSeries.length ? `最新 ${num(weightSeries[weightSeries.length - 1].y, 1)} kg` : null,
      chart: lineChart({
        data: weightSeries, color: 'var(--text)', decimals: 1, unit: 'kg', domain: axisDomain, ...pick,
        emptyText: INSUFFICIENT_DATA_TEXT,
      }),
      note: composeReading(noPlanNote, planShiftNote(rateShift, 'kg/周', { signed: true }),
        trendReading('weight', weightSeries, {
          kgPerWeek: weightStats.kgPerWeek, stdErrKgPerWeek: weightStats.stdErrKgPerWeek,
          goalRate: planUnavailable || rateShift ? null : targets.rateKgPerWeek,
          records: weightStats.records, spanDays: weightStats.spanDays,
        })),
      readout: readoutRow(valueAt((v) => `${num(v, 1)} kg`)((dd) => (health.get(dd)?.weightKg > 0 ? health.get(dd).weightKg : null))),
      tip: '看那条趋势线，别看单日的上下：一天里的起伏主要是水分和排空，不是体脂变了。',
    }),
    steps: () => ({
      title: '步数',
      tag: avgSteps != null ? `已结束日平均 ${num(avgSteps)} 步` : null,
      chart: lineChart({
        data: stepsSeries, color: 'var(--accent)', unit: '步', domain: axisDomain, ...pick,
        target: avgSteps, targetLabel: avgSteps != null ? `平均 ${num(avgSteps)}` : '',
        emptyText: INSUFFICIENT_DATA_TEXT,
      }),
      note: trendReading('steps', stepsSeries, {}),
      readout: readoutRow(valueAt((v) => `${num(v)} 步`)((dd) => health.get(dd)?.steps ?? null)),
      tip: '步数由设备的计步器估算，不同设备和佩戴位置会有出入，适合看自己的前后变化。',
    }),
    exercise: () => ({
      title: '锻炼时间',
      tag: avgExercise != null ? `已结束日平均 ${formatDuration(avgExercise)}` : null,
      chart: lineChart({
        data: exerciseSeries, color: 'var(--carb)', unit: '分钟', domain: axisDomain, ...pick,
        target: null,
        emptyText: INSUFFICIENT_DATA_TEXT,
      }),
      note: trendReading('exercise', exerciseSeries, {}),
      readout: readoutRow(valueAt((v) => formatDuration(v))((dd) => health.get(dd)?.exerciseMinutes ?? null)),
      tip: '显示所选区间的设备记录时长。设备时长不等同于中等强度活动；缺失日期不视为零，也不据此推算整周达标。',
    }),
    active: () => ({
      title: '活动能量',
      tag: avgActive != null ? `已结束日平均 ${avgActive} kcal` : null,
      chart: lineChart({
        data: activeSeries, color: 'var(--carb)', unit: 'kcal', domain: axisDomain, ...pick,
        target: avgActive, targetLabel: avgActive != null ? `平均 ${avgActive}` : '',
      }),
      note: trendReading('active', activeSeries, {}),
      readout: readoutRow(kcalAt((dd) => completeEnergyDay(health.get(dd))?.fields.activeEnergy.value ?? null)),
      tip: '活动能量来自设备估算，适合在同一设备与相近佩戴条件下比较，不是精确消耗。'
        + '今天同步更新记录收支；每日计划参考近期完整日；长期是否合适仍应结合饮食完整度和多周体重趋势校准。',
    }),
    sleep: () => ({
      title: '睡眠',
      tag: avgSleep != null ? `已结束日平均 ${formatDuration(avgSleep * 60)}` : null,
      chart: lineChart({
        data: sleepSeries, color: 'var(--water)', target: 7, targetLabel: '建议 7 小时',
        decimals: 1, unit: '小时', domain: axisDomain, ...pick,
      }),
      note: trendReading('sleep', sleepSeries, {}),
      readout: readoutRow(valueAt((v) => formatDuration(v * 60))((dd) => (health.get(dd)?.sleepMinutes > 0 ? health.get(dd).sleepMinutes / 60 : null))),
      tip: '虚线是 AASM / SRS“成年人规律睡够至少 7 小时”的时长参考，不是这段时间的平均——平均写在卡片右上角。'
        + '睡眠归到醒来那天，只统计设备识别的入睡片段；这里只看时长，不代表睡眠质量。',
    }),
    restingHR: () => ({
      title: '静息心率',
      tag: avgHR != null ? `已结束日平均 ${avgHR} bpm` : null,
      chart: lineChart({
        data: hrSeries, color: 'var(--muted)', unit: 'bpm', domain: axisDomain, ...pick,
        target: avgHR, targetLabel: avgHR != null ? `平均 ${avgHR}` : '',
        emptyText: INSUFFICIENT_DATA_TEXT,
      }),
      note: trendReading('restingHR', hrSeries, {}),
      readout: readoutRow(valueAt((v) => `${num(v)} bpm`)((dd) => (health.get(dd)?.restingHR > 0 ? health.get(dd).restingHR : null))),
      tip: '静息心率可来自设备记录或手动补录。多数成人常见范围约为 60–100 bpm；'
        + '训练状态、压力、感染、药物和测量条件都可能影响读数，应优先和个人基线比较。',
    }),
    balance: () => ({
      title: '热量收支（摄入 − 消耗）',
      tag: null,
      chart: lineChart({
        data: balanceSeries, color: 'var(--warn)', target: 0, targetLabel: '收支平衡',
        unit: 'kcal', domain: axisDomain, ...pick,
        emptyText: INSUFFICIENT_DATA_TEXT,
      }),
      note: trendReading('balance', balanceSeries, {}),
      readout: readoutRow(kcalAt((dd) => balanceSeries.find((pt) => pt.x === dd)?.y ?? null)),
      tip: '低于 0 表示这天吃的比设备估算的消耗少。看的是一段时间的累计，不是某一天的高低。',
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
  /*
   * 数据不够时要说清「还差什么才能给结论」—— 这是用户能动手补的事，
   * 不是实现细节。其余那几句（分母怎么取、没记录的日子怎么处理）已经删掉。
   */
  const insufficient = spec.note === INSUFFICIENT_DATA_TEXT;
  const insufficientHelp = activeChart === 'weight'
    ? '还差几次称重才能看出趋势：至少 4 次，而且第一次和最后一次要隔开 7 天以上。'
    : '记录还太少，看不出趋势。再记几天就会有结论。';

  return [
    // 选择器和图合成一张卡：它们本来就是一件事，分成两块只是多一道分隔线
    h('section.card.trend-card', null,
      h('div.card-head', null,
        /*
         * 标题固定。原先它跟着下拉一起变（「每日热量摄入」→「体重」），
         * 于是同一张卡的名字每切一次就换一个，找不到锚点；
         * 而下拉第一项本来就写着当前看的是什么，标题再说一遍是重复。
         */
        h('h3', null, '趋势'),
        h('div.card-head-actions', null,
          infoTip('怎么看这张图',
            h('p', null, spec.tip),
            insufficient ? h('p', null, insufficientHelp) : null,
            h('p', null, '图上不含今天：一天没过完，画出来必然偏低。')))),

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

      spec.tag ? h('p.trend-summary', null, spec.tag) : null,

      insufficient
        ? h('div.trend-insufficient', { role: 'status' }, INSUFFICIENT_DATA_TEXT)
        : [
          h('div.chart-wrap', null, spec.chart),
          spec.readout,
          h('p.chart-note', null, spec.note),
        ]),

    range === 'all' ? fullTable(days, dietByDate) : null,
  ];
}
