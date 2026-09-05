/**
 * 近 7 日速览：截至昨天的七个完整日。
 *
 * **第三列写结论，不写口径。**
 *
 * 原先那一列全是程序怎么算出来的：「按有记录的天算」「依据 4 个完整日」
 * 「Apple 健康记录，按有数据的 6 天算」「08-29 → 09-04，共 5 次称重」。
 * 那些是维护这个库的人要的，照着吃饭的人拿它做不出任何决定 ——
 * 卡头上那个说明按钮当初就是因为同样的毛病整个删掉的，同一批话又从这儿冒了出来。
 *
 * 现在的标准和说明层一样：**删掉这句，用户会不会做出不同的决定？不会就删。**
 * 剩下的三种写法各有各的用处：
 *  - 结论（「基本贴着目标」「多数日子没吃够」「这一周在往下走」）；
 *  - 可信度（记漏了几天，下面几行就只代表记了的那几天）；
 *  - 数据不够时还差什么（这一条是说明层明写的例外，用户能动手补）。
 * 都不占的行就空着 —— 日均锻炼和日均步数现在都没有注释：
 * 一周 150 分钟那个结论在同一页的趋势卡里已经说过一次，步数按 `docs/算法依据.md`
 * 本来就不设达标线。
 */

import { MIN_POINTS_FOR_CLAIM } from './trend-reading.js';
import { withUnit } from './units.js';
import { formatDuration } from './duration.js';

const round = (v, d = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};
const DAY_MS = 86400000;
/*
 * 敢说体重方向的门槛。全应用统一的是「至少 4 次称重、隔开 7 天」，
 * 这里的窗口本来就是 7 天，所以只卡次数。
 */
const WEIGHT_POINTS_FOR_DIRECTION = 4;
/** 一周之内这个幅度以内算持平 —— 早晚水分差一斤是常事 */
const WEIGHT_FLAT_KG = 0.3;

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

  /*
   * 这一行的注释管着下面每一行的可信度：漏记的日子不在样本里，
   * 「日均摄入 1800」说的只是记了的那几天。所以它写的不是「有几天没记」
   * （左边 `5 / 7 天` 已经说了），而是这件事对下面几行意味着什么。
   */
  rows.push(row('logged', '饮食记录', `${diet.length} / ${days} 天`,
    diet.length >= days ? '一天没落'
      : diet.length >= MIN_POINTS_FOR_CLAIM ? '下面几行只算记了的那几天'
        : '记得太少，这一周看不出什么',
    diet.length >= days - 1 ? 'good' : diet.length >= MIN_POINTS_FOR_CLAIM ? 'plain' : 'warn'));

  if (diet.length >= MIN_POINTS_FOR_CLAIM) {
    const avgKcal = round(diet.reduce((s, d) => s + (Number(d.kcal) || 0), 0) / diet.length);
    const goal = Number(targets?.kcal) || 0;
    const gap = goal > 0 ? avgKcal - goal : null;
    rows.push(row('kcal', '日均摄入', `${avgKcal} kcal`,
      gap == null ? ''
        : Math.abs(gap) <= goal * 0.05 ? '基本贴着目标'
          : `比目标${gap > 0 ? '高' : '低'} ${Math.abs(round(gap))} kcal`,
      gap != null && Math.abs(gap) <= goal * 0.05 ? 'good' : 'plain'));

    const proteinGoal = Number(targets?.protein) || 0;
    if (proteinGoal > 0) {
      const hit = diet.filter((d) => (Number(d.protein) || 0) >= proteinGoal * 0.9).length;
      rows.push(row('protein', '蛋白达标', `${hit} / ${diet.length} 天`,
        hit >= diet.length * 0.8 ? '基本都吃够了'
          : hit >= diet.length * 0.5 ? '有一半的日子没吃够' : '多数日子没吃够',
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
    /*
     * 敢不敢说方向，看称了几次。
     *
     * 两三次称重之间隔着的多半是水分：早晚差一斤是常事。全应用的门槛是
     * 「至少 4 次、隔开 7 天」（见趋势卡的说明），这里的窗口本来就是 7 天，
     * 所以只卡次数。不够就直说看不准 —— 那比写「共 3 次称重」有用：
     * 后者要用户自己去想 3 次够不够。
     */
    rows.push(row('weight', '体重', `${delta > 0 ? '+' : ''}${delta} kg`,
      weights.length < WEIGHT_POINTS_FOR_DIRECTION ? '称得太少，方向还看不准'
        : Math.abs(delta) <= WEIGHT_FLAT_KG ? '这一周基本持平'
          : delta > 0 ? '这一周在往上走' : '这一周在往下走',
      'plain'));
  } else {
    rows.push(row('weight', '体重', weights.length ? `${weights[0].weightKg} kg` : '—',
      weights.length ? '只称了一次，看不出方向' : '这一周没有称重记录', 'plain'));
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
    /*
     * 折成日均，不写「依据 N 个完整日」。
     *
     * 「盈余 1200 kcal」是几天攒出来的总数，人排饭是按天排的，
     * 这一步换算原先要用户自己做（还得先猜分母是几天）。分母写在这儿就成了口径，
     * 直接给结果才有用。措辞要短到能在一行里放下 —— 实测「相当于日均缺口 715 kcal」
     * 在 393px 上会折行，而且正好断在 715 和 kcal 之间，数字和单位被拆到了两行。
     */
    rows.push(row('balance', '累计收支',
      `${total >= 0 ? '盈余' : '缺口'} ${Math.abs(total)} kcal`,
      `日均${total >= 0 ? '盈余' : '缺口'} ${Math.abs(round(total / paired.length))} kcal`,
      'plain'));
  } else {
    /*
     * 「配对数据不足」得说清缺的是哪一半。
     *
     * 配对日要求那天既有饮食记录、又有设备记的静息与活动能量。只说「不足」，
     * 用户不知道该去补记饮食，还是该去同步手表 —— 这两件事要做的动作完全不同。
     * 缺的是哪一半才是用户能动手的部分；几天几天那串数是口径，说了也改不了什么。
     */
    const intakeDays = health.filter(hasIntake).length;
    const spendDays = health.filter(hasSpend).length;
    const short = spendDays >= MIN_POINTS_FOR_CLAIM && intakeDays < MIN_POINTS_FOR_CLAIM ? '多数日子缺饮食记录'
      : intakeDays >= MIN_POINTS_FOR_CLAIM && spendDays < MIN_POINTS_FOR_CLAIM ? '多数日子缺设备记录'
        : '饮食和设备记录都不齐';
    rows.push(row('balance', '累计收支', '—',
      `配对数据不足：${short}`, 'plain'));
  }

  const avgOf = (key, digits = 0) => {
    const vals = health.map((d) => Number(d[key])).filter((v) => Number.isFinite(v) && v >= 0);
    return vals.length >= MIN_POINTS_FOR_CLAIM
      ? { value: round(vals.reduce((a, b) => a + b, 0) / vals.length, digits), n: vals.length }
      : null;
  };
  /*
   * 这两行不写注释。
   *
   * 「一周 150 分钟」那个结论同一页的趋势卡里已经说过一次（core/trend-reading.js），
   * 在这儿再说一遍就是同一屏说两遍；步数按 `docs/算法依据.md` 本来就只作观察性参考，
   * 不设达标线，没有结论可下。剩下能写的只有「按有数据的 6 天算」那类口径。
   */
  const exercise = avgOf('exerciseMinutes');
  if (exercise) rows.push(row('exercise', '日均锻炼', formatDuration(exercise.value), '', 'plain'));

  const steps = avgOf('steps');
  if (steps) rows.push(row('steps', '日均步数', withUnit(steps.value, '步'), '', 'plain'));

  return { from, to, days, loggedDays: diet.length, pairedDays: paired.length, rows };
}
