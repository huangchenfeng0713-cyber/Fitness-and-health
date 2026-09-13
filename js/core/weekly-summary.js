import { completeEnergyDay, presentNumber } from './energy-observation.js';
/**
 * 近 7 日速览：已结束日窗口内的记录描述，不作组织变化或全天完整性的推断。
 * 所有记录日均与配对日均分开命名；配对日期和分母供视图帮助核对。
 * 主表保留标签/数值两列，未达到样本门槛时说明缺项。
 */

import { MIN_POINTS_FOR_CLAIM } from './trend-reading.js';
import { withUnit } from './units.js';
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

const row = (key, label, value) => ({ key, label, value });

export function weeklySummary({
  endDate, dietDaily = [], healthDays = [], targets = null, days = 7, mixedTargets = false,
} = {}) {
  const dates = windowDates(endDate, days);
  if (!dates.length) return null;
  const from = dates[0];
  const to = dates[dates.length - 1];
  const inWindow = (d) => d?.date >= from && d.date <= to;

  const diet = dietDaily.filter(d => inWindow(d) && presentNumber(d.kcal) && d.kcal >= 0 && d.coverage?.kcal?.complete !== false);
  const health = healthDays.filter(inWindow);
  const rows = [];

  /*
   * 这一行排在最前面，因为它管着下面每一行的可信度：漏记的日子不在样本里，
   * 「日均摄入 1800」说的只是记了的那几天 —— 而 `2 / 7 天` 自己就把这件事说清楚了，
   * 不用再补一句「下面几行只算记了的那几天」。
   */
  rows.push(row('logged', '饮食记录', `${diet.length} / ${days} 天`));

  if (diet.length >= MIN_POINTS_FOR_CLAIM) {
    const avgKcal = round(diet.reduce((s, d) => s + (Number(d.kcal) || 0), 0) / diet.length);
    rows.push(row('kcal', '已记录日均摄入', `${avgKcal} kcal`));

    const proteinGoal = Number(targets?.protein) || 0;
    if (proteinGoal > 0 && !mixedTargets) {
      const proteinDays = diet.filter(d => presentNumber(d.protein) && Number(d.protein) >= 0 && d.coverage?.protein?.complete !== false);
      const hit = proteinDays.filter(d => Number(d.protein) >= proteinGoal).length;
      rows.push(row('protein', targets.context === '当时计划' ? '蛋白达到计划' : '蛋白·当前设置对照', `${hit} / ${proteinDays.length} 天`));
    }
  } else {
    // 为什么没有日均，正上方那行「饮食记录 N / 7 天」已经说了
    rows.push(row('kcal', '已记录日均摄入', '—'));
  }

  /*
   * 称过两次以上报首末差，只称过一次就报那一次的读数 —— 一个点算不出「变化」。
   * 「这一周在往上还是往下」是判断，归趋势卡（那儿有 4 次 / 跨 7 天的门槛）；
   * 这张卡只给数。
   */
  const weights = health.filter((d) => Number(d.weightKg) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (weights.length >= 2) {
    const delta = round(Number(weights[weights.length - 1].weightKg) - Number(weights[0].weightKg), 1);
    rows.push(row('weight', '区间体重变化', `${delta > 0 ? '+' : ''}${delta} kg`));
  } else {
    rows.push(row('weight', '最新体重', weights.length ? `${weights[0].weightKg} kg` : '—'));
  }

  const byDate = new Map(diet.map((d) => [d.date, d]));
  const hasIntake = hd => byDate.has(hd.date);
  const hasSpend = hd => Boolean(completeEnergyDay(hd));
  const paired = health.map((hd) => {
    if (!hasIntake(hd) || !hasSpend(hd)) return null;
    const intake = Number(byDate.get(hd.date).kcal);
    const spent = Number(hd.restingEnergy) + Number(hd.activeEnergy);
    return { date: hd.date, intake, spent, balance: intake - spent };
  }).filter((v) => v != null);

  if (paired.length >= MIN_POINTS_FOR_CLAIM) {
    const total = round(paired.reduce((sum, day) => sum + day.balance, 0));
    rows.push(row('pairedIntake', '配对日均摄入', `${round(paired.reduce((sum, day) => sum + day.intake, 0) / paired.length)} kcal`));
    rows.push(row('pairedSpent', '配对日均设备消耗', `${round(paired.reduce((sum, day) => sum + day.spent, 0) / paired.length)} kcal`));
    rows.push(row('balance', `已配对 ${paired.length}/${days} 日收支`, `${total >= 0 ? '盈余' : '缺口'} ${Math.abs(total)} kcal`));
  } else {
    /*
     * **这一行算不出来时要自己说清楚，不能只画一道杠。**
     *
     * 配对日要求那天既有饮食记录、又有设备记的静息与活动能量。只写「—」的话，
     * 用户不知道该去补记饮食还是去同步手表 —— 这两件事要做的动作完全不同，
     * 而上面那行「饮食记录 N / 7 天」只交代了其中一半。
     *
     * **缺的那一半有三种，不是两种。** 少数的那一档是「设备记录在，但那几天
     * 没走完」：快捷指令当天最后一次自动化跑得早（比如 22:00），
     * 之后的消耗就没人上传，这些天过不了完整日判据。它和「手表压根没同步」
     * 要做的动作完全不同 —— 一个是把最后那次自动化挪晚，一个是去连手表 ——
     * 可原先都落在 `hasSpend` 为假这一边，一律写成「缺设备记录」，
     * 而设备记录明明一天不少地躺在那儿。
     *
     * **两个计数还都数错了边**：原先是 `health.filter(...)`，
     * 手表一天都没同步时 `health` 是空的，`intakeDays` 跟着归零 ——
     * 于是「记了七天饮食、一天都没同步」这个最该点名「缺设备记录」的情况，
     * 反而落到了兜底那句「记录不齐」上。分母要按窗口里的天数各数各的。
     */
    const hasEnergy = hd => presentNumber(hd.restingEnergy) && presentNumber(hd.activeEnergy);
    const intakeDays = diet.length;
    const deviceDays = health.filter(hasEnergy).length;
    const spendDays = health.filter(hasSpend).length;
    const enough = n => n >= MIN_POINTS_FOR_CLAIM;
    rows.push(row('balance', `已配对 ${paired.length}/${days} 日收支`,
      enough(spendDays) && !enough(intakeDays) ? '缺饮食记录'
        : enough(intakeDays) && !enough(deviceDays) ? '缺设备记录'
          : enough(intakeDays) && enough(deviceDays) && !enough(spendDays) ? '同步停在半路'
            : '记录不齐'));
  }

  const avgOf = (key, digits = 0) => {
    const vals = health.filter(d => presentNumber(d[key])).map((d) => Number(d[key])).filter((v) => Number.isFinite(v) && v >= 0);
    return vals.length >= MIN_POINTS_FOR_CLAIM
      ? round(vals.reduce((a, b) => a + b, 0) / vals.length, digits)
      : null;
  };
  const exercise = avgOf('exerciseMinutes');
  if (exercise != null) rows.push(row('exercise', '日均锻炼', formatDuration(exercise)));

  const steps = avgOf('steps');
  if (steps != null) rows.push(row('steps', '日均步数', withUnit(steps, '步')));

  return { from, to, days, loggedDays: diet.length, pairedDays: paired.length,
    pairedDates: paired.map(day => day.date).sort(), rows };
}
