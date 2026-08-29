/**
 * 近 7 日速览：把「我这一周做得怎么样」压成一屏能看完的几行。
 *
 * 数据页有九张单指标趋势图，各说各的 —— 想知道这一周整体如何，
 * 要挨个点开再自己在脑子里合并。这里只回答那一个问题。
 *
 * **窗口截至昨天，是七个完整日**。把今天算进来，早上八点看到的
 * 「日均摄入」会被一个才吃了早饭的半天拉低，而那不是这一周的水平。
 *
 * 纯函数，不碰 DOM。口径和全应用一致：
 * **摄入类的分母是「有饮食记录的天数」，不是日历天数**，
 * 没记录的日子不在样本里，当成 0 kcal 会造出并不存在的结论。
 * 样本不够就说样本不够，不硬凑一句像模像样的评价。
 */

import { MIN_POINTS_FOR_CLAIM } from './trend-reading.js';

const round = (v, d = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

const DAY_MS = 86400000;

/** end 往前数 days 天的日期串（含 end） */
export function windowDates(endDate, days = 7) {
  const end = Date.parse(`${String(endDate || '')}T00:00:00Z`);
  if (!Number.isFinite(end)) return [];
  const n = Math.max(1, Math.floor(days));
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * DAY_MS)
    .toISOString().slice(0, 10));
}

/*
 * 一条小结的形状：{ key, label, value, note, tone }
 *
 * tone 只有三档，和指标卡那套颜色语义对齐：
 *   good  做到了     plain 中性、只是报数     warn 该留意
 * 没有 bad —— 一周小结不是体检报告，写成红色只会让人不想看。
 */
function row(key, label, value, note, tone = 'plain') {
  return { key, label, value, note, tone };
}

/**
 * @param {object} input
 * @param {string} input.endDate      窗口最后一天（通常是所选日期）
 * @param {Array}  input.dietDaily    每日饮食汇总 [{ date, kcal, protein, ... }]
 * @param {Array}  input.healthDays   每日健康数据 [{ date, weightKg, steps, ... }]
 * @param {Array}  input.trainingDays 每日训练记录 [{ date, items }]
 * @param {object} input.targets      当前目标（热量、蛋白、速率）
 * @param {number} [input.days]       窗口长度，默认 7
 */
export function weeklySummary({
  endDate, dietDaily = [], healthDays = [], trainingDays = [], targets = null, days = 7,
} = {}) {
  const dates = windowDates(endDate, days);
  if (!dates.length) return null;
  const from = dates[0];
  const to = dates[dates.length - 1];
  const inWindow = (d) => d?.date >= from && d.date <= to;

  const diet = dietDaily.filter(inWindow);
  const health = healthDays.filter(inWindow);
  const training = trainingDays.filter(inWindow);
  const rows = [];

  /*
   * 记录天数放第一条：后面每一条的可信度都取决于它。
   * 七天里只记了两天，「日均摄入」就不是日均，是那两天。
   */
  rows.push(row('logged', '饮食记录', `${diet.length} / ${days} 天`,
    diet.length >= days ? '一天没落' : `有 ${days - diet.length} 天没记`,
    diet.length >= days - 1 ? 'good' : diet.length >= MIN_POINTS_FOR_CLAIM ? 'plain' : 'warn'));

  // 热量与蛋白：分母是有记录的天数
  if (diet.length >= MIN_POINTS_FOR_CLAIM) {
    const avgKcal = round(diet.reduce((s, d) => s + (Number(d.kcal) || 0), 0) / diet.length);
    const goal = Number(targets?.kcal) || 0;
    const gap = goal > 0 ? avgKcal - goal : null;
    rows.push(row('kcal', '日均摄入', `${avgKcal} kcal`,
      gap == null ? `按 ${diet.length} 天算`
        : Math.abs(gap) <= goal * 0.05 ? '基本贴着目标'
          : `比目标${gap > 0 ? '高' : '低'} ${Math.abs(round(gap))} kcal`,
      gap != null && Math.abs(gap) <= goal * 0.05 ? 'good' : 'plain'));

    const proteinGoal = Number(targets?.protein) || 0;
    if (proteinGoal > 0) {
      // 达标按九成算：刚好差一两克说成没达标太苛刻
      const hit = diet.filter((d) => (Number(d.protein) || 0) >= proteinGoal * 0.9).length;
      rows.push(row('protein', '蛋白达标', `${hit} / ${diet.length} 天`,
        `目标 ${Math.round(proteinGoal)}g，按有记录的天算`,
        hit >= diet.length * 0.8 ? 'good' : hit >= diet.length * 0.5 ? 'plain' : 'warn'));
    }
  } else {
    rows.push(row('kcal', '日均摄入', '—',
      `再记满 ${MIN_POINTS_FOR_CLAIM - diet.length} 天才谈得上日均`, 'plain'));
  }

  /*
   * 体重：只报首末差，不做拟合。
   * 一周之内点太少，拟合出来的斜率会被单次水分波动带着走 ——
   * 真要看趋势去数据页的体重图，那里有至少 4 点、跨 7 天的门槛。
   */
  const weights = health.filter((d) => Number(d.weightKg) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (weights.length >= 2) {
    const delta = round(Number(weights[weights.length - 1].weightKg) - Number(weights[0].weightKg), 1);
    rows.push(row('weight', '体重', `${delta > 0 ? '+' : ''}${delta} kg`,
      `${weights[0].date.slice(5)} → ${weights[weights.length - 1].date.slice(5)}，共 ${weights.length} 次称重`,
      'plain'));
  } else {
    rows.push(row('weight', '体重', weights.length ? `${weights[0].weightKg} kg` : '—',
      weights.length ? '这一周只称了一次，看不出方向' : '这一周没有称重记录', 'plain'));
  }

  /*
   * 累计热量收支只算「配对日」：那一天既有饮食记录，又有设备记录的消耗。
   *
   * 少了任何一半都算不出这一天的盈亏。把漏记的日子当成 0 kcal 摄入，
   * 会造出「近 7 日累计缺口 12000 kcal」这种并不存在的结论；
   * 反过来，缺设备消耗的日子拿公式 TDEE 顶上，等于把今天的假设倒灌进过去。
   */
  const byDate = new Map(diet.map((d) => [d.date, d]));
  const paired = health.map((hd) => {
    const eaten = Number(byDate.get(hd.date)?.kcal);
    const resting = Number(hd.restingEnergy);
    const active = Number(hd.activeEnergy);
    if (!(eaten > 0) || !(resting > 0) || !Number.isFinite(active) || active < 0) return null;
    return eaten - (resting + active);
  }).filter((v) => v != null);

  if (paired.length >= MIN_POINTS_FOR_CLAIM) {
    const total = round(paired.reduce((a, b) => a + b, 0));
    rows.push(row('balance', '累计收支',
      `${total >= 0 ? '盈余' : '缺口'} ${Math.abs(total)} kcal`,
      `依据 ${paired.length} 个完整日`, 'plain'));
  } else {
    rows.push(row('balance', '累计收支', '—',
      paired.length
        ? `只有 ${paired.length} 天同时有摄入和消耗记录，配对数据不足`
        : '没有同时记到摄入和消耗的日子，配对数据不足',
      'plain'));
  }

  /*
   * 日均锻炼取的是 Apple 健康的锻炼分钟，不是力量训练做了几次 ——
   * 那两个数完全不是一回事，练了 40 分钟和「训练 1 次」说的不是同一件事。
   */
  const avgOf = (key, digits = 0) => {
    const vals = health.map((d) => Number(d[key])).filter((v) => Number.isFinite(v) && v >= 0);
    return vals.length >= MIN_POINTS_FOR_CLAIM
      ? { value: round(vals.reduce((a, b) => a + b, 0) / vals.length, digits), n: vals.length }
      : null;
  };
  const exercise = avgOf('exerciseMinutes');
  if (exercise) {
    rows.push(row('exercise', '日均锻炼', `${exercise.value} 分钟`,
      `Apple 健康记录，按有数据的 ${exercise.n} 天算`, 'plain'));
  }

  const steps = avgOf('steps');
  if (steps) {
    rows.push(row('steps', '日均步数', `${steps.value} 步`, `按有记录的 ${steps.n} 天算`, 'plain'));
  }

  // 力量训练：只报做了几次、几组，不给「每周该练几组」的结论
  const sessions = training.filter((t) => (t.items || []).length);
  const sets = sessions.reduce((s, t) => s
    + (t.items || []).reduce((n, i) => n + (i.sets || []).length, 0), 0);
  rows.push(row('training', '力量训练', `${sessions.length} 次`,
    sessions.length ? `共记下 ${sets} 组` : '这一周没有训练记录',
    sessions.length ? 'good' : 'plain'));

  return { from, to, days, loggedDays: diet.length, pairedDays: paired.length, rows };
}
