/**
 * 统计图下方那行字：读这张图，而不是解释这张图是怎么画的。
 *
 * 「归到醒来那天」「当天不计入」这类口径说明属于方法论，放在卡片的信息按钮里；
 * 图底下最显眼的位置应该回答「我该拿这条曲线怎么办」。
 *
 * 纯函数，不碰 DOM，可在 Node 中单测。所有结论只从这段数据本身得出，
 * 样本不够就说样本不够，不硬凑一句像模像样的建议。
 */

const round = (v, d = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

/** 样本太少时不下结论——三个点连不出趋势 */
export const MIN_POINTS_FOR_TREND = 4;
/** 少于 3 天不做「长期如何」「每周相当于多少」这类外推 */
export const MIN_POINTS_FOR_CLAIM = 3;

/**
 * 一条序列的基本形状。
 * drift 用前后两半的均值差，比最小二乘更抗单点异常，也更容易讲清楚。
 */
export function analyzeSeries(points = [], decimals = 0) {
  // 先剔掉 null/undefined 再转数字：Number(null) 是 0，
  // 漏记的那天会被当成「吃了 0 kcal」拉低平均（这个口径全应用一致）
  const ys = points
    .filter((p) => p != null && p.y != null && p.y !== '')
    .map((p) => Number(p.y))
    .filter(Number.isFinite);
  if (!ys.length) return null;
  const avg = ys.reduce((a, b) => a + b, 0) / ys.length;
  const half = Math.ceil(ys.length / 2);
  const early = ys.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const lateCount = ys.length - half;
  const late = lateCount ? ys.slice(half).reduce((a, b) => a + b, 0) / lateCount : early;
  return {
    n: ys.length,
    avg: round(avg, decimals),
    min: round(Math.min(...ys), decimals),
    max: round(Math.max(...ys), decimals),
    spread: round(Math.max(...ys) - Math.min(...ys), decimals),
    drift: round(late - early, decimals),
    enoughForTrend: ys.length >= MIN_POINTS_FOR_TREND,
  };
}

const join = (parts) => parts.filter(Boolean).join('');

/** 热量摄入：离目标多远、超标几天、在往哪个方向走 */
function readKcal(points, { target }) {
  const s = analyzeSeries(points);
  if (!s) return '这段时间还没有饮食记录，记满几天就能看出摄入的稳定程度。';
  const over = points.filter((p) => target > 0 && Number(p.y) > target * 1.05).length;
  const under = points.filter((p) => target > 0 && Number(p.y) < target * 0.75).length;
  const gap = target > 0 ? round(s.avg - target) : null;
  return join([
    `有记录的 ${s.n} 天里日均 ${s.avg} kcal`,
    gap == null ? '。' : gap > 0 ? `，比目标高 ${gap} kcal。` : gap < 0 ? `，比目标低 ${Math.abs(gap)} kcal。` : '，正好贴着目标。',
    over ? `其中 ${over} 天超出目标 5% 以上。` : '',
    under >= MIN_POINTS_FOR_CLAIM
      ? `另有 ${under} 天不到目标的四分之三，长期这样会掉基础代谢和肌肉。`
      : under ? `另有 ${under} 天不到目标的四分之三。` : '',
    s.enoughForTrend && Math.abs(s.drift) >= Math.max(120, target * 0.06)
      ? (s.drift > 0 ? `后半段比前半段多吃约 ${Math.abs(s.drift)} kcal/天，注意别继续往上走。`
        : `后半段比前半段少吃约 ${Math.abs(s.drift)} kcal/天，掉得太快就把缺口收小一点。`)
      : '',
    s.n >= 3 && s.spread >= Math.max(600, target * 0.35)
      ? `最多和最少差 ${s.spread} kcal，起伏偏大——固定几餐的主食份量能明显稳住。` : '',
  ]);
}

/** 蛋白：达标率是关键，平均值会被个别高值拉高 */
function readProtein(points, { target, threshold }) {
  const s = analyzeSeries(points);
  if (!s) return '这段时间还没有饮食记录，记满几天才能看出蛋白是否吃够。';
  const hit = points.filter((p) => Number(p.y) >= threshold).length;
  const rate = s.n ? hit / s.n : 0;
  return join([
    `有记录的 ${s.n} 天里达标 ${hit} 天，日均 ${s.avg} g（目标 ${Math.round(target)} g）。`,
    rate >= 0.8 ? '执行得不错，保持住。'
      : rate >= 0.5 ? '一半多的日子够了，差的那几天通常是早餐和加餐没安排到蛋白。'
        : '达标率偏低。把高蛋白食物固定安排进早餐和加餐，比每天临时想吃什么更容易坚持。',
    s.enoughForTrend && s.drift <= -Math.max(10, target * 0.08)
      ? `后半段比前半段少了约 ${Math.abs(s.drift)} g/天，别让它继续掉。` : '',
    s.enoughForTrend && s.drift >= Math.max(10, target * 0.08)
      ? `后半段比前半段多了约 ${s.drift} g/天，方向是对的。` : '',
  ]);
}

/** 体重：只看趋势不看单点，且要和目标速率对照 */
function readWeight(points, { kgPerWeek, goalRate, records, spanDays }) {
  const s = analyzeSeries(points, 1);
  if (!s) return '这段时间还没有体重记录。每周固定同一时间称一次，趋势才看得出来。';
  if (kgPerWeek == null) {
    return join([
      `所选区间有 ${records} 次记录，最新 ${round(Number(points[points.length - 1].y), 1)} kg。`,
      '至少需要 4 次、且首末相隔 7 天才能估算每周趋势——固定早晨空腹称，两周就能看出方向。',
    ]);
  }
  /*
   * 「快 / 慢」要按目标方向算，不能带符号直接相减。
   * 目标 -0.5、实际 -0.9 是掉得更快，可 -0.9 − (-0.5) = -0.4 会被说成「比目标慢」——
   * 减脂的人本来就最容易掉太快，这句说反了会把人推向更大的缺口。
   */
  const dir = goalRate ? Math.sign(goalRate) : 0;
  const progress = dir ? round(kgPerWeek * dir, 2) : null;
  const diff = progress == null ? null : round(progress - Math.abs(goalRate), 2);
  const latest = Number(points[points.length - 1].y);
  const fast = latest > 0 && Math.abs(kgPerWeek) / latest > 0.01;
  return join([
    `覆盖 ${spanDays} 个日历日、${records} 次称重，拟合趋势 ${kgPerWeek > 0 ? '+' : ''}${kgPerWeek} kg/周`,
    goalRate != null ? `（目标 ${goalRate > 0 ? '+' : ''}${goalRate}）。` : '。',
    diff == null
      // 目标是维持：偏离哪个方向都要说，但不存在快慢
      ? (Math.abs(kgPerWeek) < 0.1 ? '目标是维持，目前基本稳住了。'
        : `目标是维持，但每周${kgPerWeek > 0 ? '涨' : '掉'}了 ${Math.abs(kgPerWeek)} kg。`)
      : progress < 0 ? `方向反了：目标是${goalRate > 0 ? '增重' : '减重'}，实际在往另一边走。`
        : Math.abs(diff) < 0.1 ? '和目标基本一致，照现在的吃法继续。'
          : diff > 0 ? `比目标快 ${Math.abs(diff)} kg/周。` : `比目标慢 ${Math.abs(diff)} kg/周。`,
    fast && kgPerWeek < 0 ? '每周变化超过体重的 1% 时，掉的往往不只是脂肪，把热量缺口收小一些更划算。' : '',
    s.spread >= 2 ? `区间内最高最低差 ${s.spread} kg，多半是水分和排空差异，看趋势线不要看单日数字。` : '',
  ]);
}

/** 活动能量：设备估算，重点在稳定性而不是绝对值 */
function readActive(points) {
  const s = analyzeSeries(points);
  if (!s) return '这段时间还没有活动能量记录。';
  const cv = s.avg > 0 ? s.spread / s.avg : 0;
  return join([
    `日均 ${s.avg} kcal，区间内 ${s.min} ~ ${s.max} kcal。`,
    cv >= 1.2 ? '训练日和休息日差出好几倍——用固定热量目标就会一天吃不够、一天吃超，让预算跟着当天消耗走更合适。'
      : cv >= 0.6 ? '起伏中等，属于有训练日和休息日的正常节奏。'
        : '每天比较接近，作息稳定。',
    s.enoughForTrend && Math.abs(s.drift) >= Math.max(60, s.avg * 0.15)
      ? (s.drift > 0 ? `后半段比前半段多消耗约 ${Math.abs(s.drift)} kcal/天。`
        : `后半段比前半段少消耗约 ${Math.abs(s.drift)} kcal/天，活动量在下滑。`)
      : '',
  ]);
}

/** 睡眠：时长、稳定性、方向 */
function readSleep(points) {
  const s = analyzeSeries(points, 1);
  if (!s) return '这段时间还没有睡眠记录。';
  const short = points.filter((p) => Number(p.y) < 6.5).length;
  return join([
    s.avg < 6.5 ? `日均 ${s.avg} 小时，明显低于成人 7~9 小时的常见建议。`
      : s.avg < 7 ? `日均 ${s.avg} 小时，离 7 小时还差一点。`
        : `日均 ${s.avg} 小时，落在常见建议区间里。`,
    short ? `其中 ${short} 天不足 6.5 小时。` : '',
    s.spread >= 2.5 ? `最长和最短差 ${s.spread} 小时，作息不太稳定——固定起床时间通常比固定入睡时间更容易做到。`
      : s.enoughForTrend ? '曲线比较平稳，作息基本规律。' : '',
    s.enoughForTrend && Math.abs(s.drift) >= 0.6
      ? (s.drift > 0 ? `后半段比前半段多睡约 ${Math.abs(s.drift)} 小时，在往好的方向走。`
        : `后半段比前半段少睡约 ${Math.abs(s.drift)} 小时，注意别继续往下掉。`)
      : '',
    s.avg < 7 ? '先把每晚的睡眠机会稳定增加 30 分钟，比周末补觉更有用。' : '',
  ]);
}

/** 静息心率：绝对值 + 变化方向，上升是需要留意的信号 */
function readRestingHR(points) {
  const s = analyzeSeries(points);
  if (!s) return '这段时间还没有静息心率记录。它需要手表在睡眠时佩戴才会自动产生。';
  return join([
    `日均 ${s.avg} bpm，区间内 ${s.min} ~ ${s.max} bpm。`,
    s.avg > 80 ? '成人常见范围是 60~100，长期高于 80 与心血管风险上升相关；规律有氧是最有效的降低手段。'
      : s.avg < 50 ? '偏低。经常训练的人属于正常，但若同时有头晕乏力，建议就医评估。'
        : '处在成人常见参考范围内。',
    s.enoughForTrend && s.drift >= 3
      ? `后半段比前半段高了约 ${s.drift} bpm——持续上升常见于训练过量、睡眠不足、压力大或正在感冒，先检查这几项。`
      : '',
    s.enoughForTrend && s.drift <= -3
      ? `后半段比前半段低了约 ${Math.abs(s.drift)} bpm，通常说明有氧能力在改善。` : '',
  ]);
}

/** 热量收支：只有同日摄入与消耗都齐全才画得出来 */
function readBalance(points) {
  const s = analyzeSeries(points);
  if (!s) return '需要同一天既有饮食记录、又有设备的静息与活动能量，才能算收支。';
  const deficit = points.filter((p) => Number(p.y) < 0).length;
  const head = `${s.n} 天里日均 ${s.avg > 0 ? '+' : ''}${s.avg} kcal，其中 ${deficit} 天为负（摄入低于消耗）。`;
  // 一两天就换算成「每周掉几公斤」是最容易造出假结论的地方，样本不够就只报数
  if (s.n < MIN_POINTS_FOR_CLAIM) {
    return `${head}只有 ${s.n} 天同时具备饮食与设备能量数据，还不足以换算成每周的体重变化。`;
  }
  const weekly = round((Math.abs(s.avg) * 7) / 7700, 2);
  return join([
    head,
    `按 7700 kcal/kg 的脂肪当量换算，相当于每周 ${weekly} kg 的${s.avg > 0 ? '盈余' : '赤字'}——`,
    '这只是能量换算，不等于体重一定这样变，实际还要看体重曲线。',
    Math.abs(s.avg) > 900 ? '日均偏差偏大，先确认饮食记得全不全，再决定要不要调目标。' : '',
  ]);
}

const READERS = {
  kcal: readKcal, protein: readProtein, weight: readWeight,
  active: readActive, sleep: readSleep, restingHR: readRestingHR, balance: readBalance,
};

/** 统一入口：metric 决定用哪套说法 */
export function trendReading(metric, points = [], opts = {}) {
  const reader = READERS[metric];
  if (!reader) return '';
  return reader(points, opts);
}
