/** 近 7 日速览：截至昨天的七个完整日。 */

import { MIN_POINTS_FOR_CLAIM } from './trend-reading.js';
import { formatDuration } from './duration.js';

const round = (v, d = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};
const DAY_MS = 86400000;

export function windowDates(endDate, days = 7) {
  const end = Date.parse(`${String(endDate || '')}T00:00:00Z`);
  if (!Number.isFinite(end)) return [];
  const n = Math.max(1, Math.floor(days));
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * DAY_MS)
    .toISOString().slice(0, 10));
}

function row(key, label, value, note, tone = 'plain') {
  return { key, label, value, note, tone };
}

export function weeklySummary({
  endDate, dietDaily = [], healthDays = [], targets = null, days = 7,
} = {}) {
  const dates = windowDates(endDate, days);
  if (!dates.length) return null;
  const from = dates[0];
  const to = dates[dates.length - 1];
  const inWindow = (d) => d?.date >= from && d.date <= to;

  const diet = dietDaily.filter(inWindow);
  const health = healthDays.filter(inWindow);
  const rows = [];

  rows.push(row('logged', '饮食记录', `${diet.length} / ${days} 天`,
    diet.length >= days ? '一天没落' : `有 ${days - diet.length} 天没记`,
    diet.length >= days - 1 ? 'good' : diet.length >= MIN_POINTS_FOR_CLAIM ? 'plain' : 'warn'));

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
      const hit = diet.filter((d) => (Number(d.protein) || 0) >= proteinGoal * 0.9).length;
      rows.push(row('protein', '蛋白达标', `${hit} / ${diet.length} 天`,
        `目标 ${Math.round(proteinGoal)}g，按有记录的天算`,
        hit >= diet.length * 0.8 ? 'good' : hit >= diet.length * 0.5 ? 'plain' : 'warn'));
    }
  } else {
    rows.push(row('kcal', '日均摄入', '—',
      `再记满 ${MIN_POINTS_FOR_CLAIM - diet.length} 天才谈得上日均`, 'plain'));
  }

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

  const avgOf = (key, digits = 0) => {
    const vals = health.map((d) => Number(d[key])).filter((v) => Number.isFinite(v) && v >= 0);
    return vals.length >= MIN_POINTS_FOR_CLAIM
      ? { value: round(vals.reduce((a, b) => a + b, 0) / vals.length, digits), n: vals.length }
      : null;
  };
  const exercise = avgOf('exerciseMinutes');
  if (exercise) {
    rows.push(row('exercise', '日均锻炼', formatDuration(exercise.value),
      `Apple 健康记录，按有数据的 ${exercise.n} 天算`, 'plain'));
  }

  const steps = avgOf('steps');
  if (steps) {
    rows.push(row('steps', '日均步数', `${steps.value} 步`, `按有记录的 ${steps.n} 天算`, 'plain'));
  }

  return { from, to, days, loggedDays: diet.length, pairedDays: paired.length, rows };
}
