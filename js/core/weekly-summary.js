/**
 * 近 7 日速览：截至昨天的七个完整日。
 *
 * **只有标签和数值两列，数值靠右，一色黑。**
 *
 * 第三列前后长过两茬东西，两茬都删了。头一茬是口径（「按有记录的天算」
 * 「依据 4 个完整日」「08-29 → 09-04，共 5 次称重」）—— 那是维护这个库的人要的。
 * 换成结论（「基本贴着目标」「这一周在往下走」）之后仍然不该留：结论在同一页的
 * 趋势卡下面本来就各有一段，说得比一句话细，而这张卡叫「速览」，
 * 要的是七个数扫一眼就走。留着第三列只会把每一行拉宽，数值悬在中间够不着两边。
 *
 * 数值也不上色。绿色说的是「这一项做到了」，那同样是判断、同样在图下面说过一次；
 * 一列数字里挑两个染绿，读出来是「这两行更要紧」，可它们并不是。
 *
 * 剩下唯一还要交代的是**算不出来的时候为什么算不出来**（说明层明写的例外：
 * 数据不够时要说清还差什么）。现在写进数值本身，不额外开一列：
 * 累计收支配不上对时直接写「缺饮食记录」，不摆一个哑巴「—」。
 * 别的行不用：日均摄入那个「—」的原因正上方那行「饮食记录 2 / 7 天」就是，
 * 体重那个「—」就是没称过。
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

  /*
   * 这一行排在最前面，因为它管着下面每一行的可信度：漏记的日子不在样本里，
   * 「日均摄入 1800」说的只是记了的那几天 —— 而 `2 / 7 天` 自己就把这件事说清楚了，
   * 不用再补一句「下面几行只算记了的那几天」。
   */
  rows.push(row('logged', '饮食记录', `${diet.length} / ${days} 天`));

  if (diet.length >= MIN_POINTS_FOR_CLAIM) {
    const avgKcal = round(diet.reduce((s, d) => s + (Number(d.kcal) || 0), 0) / diet.length);
    rows.push(row('kcal', '日均摄入', `${avgKcal} kcal`));

    const proteinGoal = Number(targets?.protein) || 0;
    if (proteinGoal > 0) {
      const hit = diet.filter((d) => (Number(d.protein) || 0) >= proteinGoal * 0.9).length;
      rows.push(row('protein', '蛋白达标', `${hit} / ${diet.length} 天`));
    }
  } else {
    // 为什么没有日均，正上方那行「饮食记录 N / 7 天」已经说了
    rows.push(row('kcal', '日均摄入', '—'));
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
    rows.push(row('weight', '体重', `${delta > 0 ? '+' : ''}${delta} kg`));
  } else {
    rows.push(row('weight', '体重', weights.length ? `${weights[0].weightKg} kg` : '—'));
  }

  const byDate = new Map(diet.map((d) => [d.date, d]));
  const hasIntake = (hd) => Number(byDate.get(hd.date)?.kcal) > 0;
  const hasSpend = (hd) => Number(hd.restingEnergy) > 0
    && Number.isFinite(Number(hd.activeEnergy)) && Number(hd.activeEnergy) >= 0;
  const paired = health.map((hd) => {
    if (!hasIntake(hd) || !hasSpend(hd)) return null;
    return Number(byDate.get(hd.date).kcal) - (Number(hd.restingEnergy) + Number(hd.activeEnergy));
  }).filter((v) => v != null);

  if (paired.length >= MIN_POINTS_FOR_CLAIM) {
    const total = round(paired.reduce((a, b) => a + b, 0));
    rows.push(row('balance', '累计收支', `${total >= 0 ? '盈余' : '缺口'} ${Math.abs(total)} kcal`));
  } else {
    /*
     * **这一行算不出来时要自己说清楚，不能只画一道杠。**
     *
     * 配对日要求那天既有饮食记录、又有设备记的静息与活动能量。只写「—」的话，
     * 用户不知道该去补记饮食还是去同步手表 —— 这两件事要做的动作完全不同，
     * 而上面那行「饮食记录 N / 7 天」只交代了其中一半。
     */
    const intakeDays = health.filter(hasIntake).length;
    const spendDays = health.filter(hasSpend).length;
    rows.push(row('balance', '累计收支',
      spendDays >= MIN_POINTS_FOR_CLAIM && intakeDays < MIN_POINTS_FOR_CLAIM ? '缺饮食记录'
        : intakeDays >= MIN_POINTS_FOR_CLAIM && spendDays < MIN_POINTS_FOR_CLAIM ? '缺设备记录'
          : '记录不齐'));
  }

  const avgOf = (key, digits = 0) => {
    const vals = health.map((d) => Number(d[key])).filter((v) => Number.isFinite(v) && v >= 0);
    return vals.length >= MIN_POINTS_FOR_CLAIM
      ? round(vals.reduce((a, b) => a + b, 0) / vals.length, digits)
      : null;
  };
  const exercise = avgOf('exerciseMinutes');
  if (exercise != null) rows.push(row('exercise', '日均锻炼', formatDuration(exercise)));

  const steps = avgOf('steps');
  if (steps != null) rows.push(row('steps', '日均步数', withUnit(steps, '步')));

  return { from, to, days, loggedDays: diet.length, pairedDays: paired.length, rows };
}
