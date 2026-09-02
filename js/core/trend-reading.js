/**
 * 统计图下方那行字：读这张图，而不是解释这张图是怎么画的。
 *
 * 「归到醒来那天」「当天不计入」这类口径说明属于方法论，放在卡片的信息按钮里；
 * 图底下最显眼的位置应该回答「我该拿这条曲线怎么办」。
 *
 * 纯函数，不碰 DOM，可在 Node 中单测。所有结论只从这段数据本身得出，
 * 样本不够就说样本不够，不硬凑一句像模像样的建议。
 */

import { MAX_LOSS_RATE_PCT, MAX_GAIN_RATE_PCT } from './nutrition.js';
import { withUnit } from './units.js';
import { formatDuration } from './duration.js';

const round = (v, d = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

/** 样本太少时不下结论——三个点连不出趋势 */
export const MIN_POINTS_FOR_TREND = 4;
/** 少于 3 天不做「长期如何」「每周相当于多少」这类外推 */
export const MIN_POINTS_FOR_CLAIM = 3;
/** 记录不够时只显示这一句；补数据的方法收进趋势卡右上角的说明里。 */
export const INSUFFICIENT_DATA_TEXT = '数据不足';

/**
 * 一条序列的基本形状。
 * drift 用前后两半的均值差，比最小二乘更抗单点异常，也更容易讲清楚。
 */
/**
 * 取出这段序列里真正有数的那些值。
 *
 * 先剔掉 null/undefined 再转数字：`Number(null)` 是 0，
 * 漏记的那天会被当成「吃了 0 kcal」拉低平均（这个口径全应用一致）。
 * 传进来不是数组时（调用方还没准备好数据）当空序列处理，别把整张卡炸掉。
 */
function seriesValues(points) {
  return (Array.isArray(points) ? points : [])
    .filter((p) => p != null && p.y != null && p.y !== '')
    .map((p) => Number(p.y))
    .filter(Number.isFinite);
}

/**
 * 数「有几天满足某个条件」。
 *
 * 必须和 analyzeSeries 走同一套过滤。直接 `points.filter((p) => Number(p.y) < X)`
 * 会把没记录的那天算进去 —— 14 天里只有 3 天有记录、而且都贴着目标，
 * 卡片却写「另有 11 天不到目标的四分之三」，睡眠写「11 天不足 6.5 小时」，
 * 步数写「11 天不到 4000 步」。分母是有记录的天数，分子也得是同一批天。
 */
function countDays(points, pred) {
  return seriesValues(points).filter(pred).length;
}

export function analyzeSeries(points = [], decimals = 0) {
  const ys = seriesValues(points);
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
  if (!s) return INSUFFICIENT_DATA_TEXT;
  /*
   * 一两天的均值不是「日均摄入」。以前这句话在今日提示里也说一遍，那边有这道门槛；
   * 现在摄入结论只剩这一处，门槛得跟着搬过来，否则记了一天就会看到
   * 「日均 1287 kcal，比目标低 700」——那只是那一天，不是平均。
   */
  if (s.n < MIN_POINTS_FOR_CLAIM) {
    return INSUFFICIENT_DATA_TEXT;
  }
  const over = target > 0 ? countDays(points, (y) => y > target * 1.05) : 0;
  const under = target > 0 ? countDays(points, (y) => y < target * 0.75) : 0;
  const gap = target > 0 ? round(s.avg - target) : null;
  return join([
    `有记录的 ${s.n} 天里日均 ${s.avg} kcal`,
    gap == null ? '。' : gap > 0 ? `，比目标高 ${gap} kcal。` : gap < 0 ? `，比目标低 ${Math.abs(gap)} kcal。` : '，正好贴着目标。',
    over ? `其中 ${over} 天超出目标 5% 以上。` : '',
    under >= MIN_POINTS_FOR_CLAIM
      ? `另有 ${under} 天不到目标的四分之三；若记录完整且持续如此，可能增加恢复不足和瘦体重流失风险。`
      : under ? `另有 ${under} 天不到目标的四分之三。` : '',
    s.enoughForTrend && Math.abs(s.drift) >= Math.max(120, target * 0.06)
      ? (s.drift > 0 ? `后半段比前半段多记录约 ${Math.abs(s.drift)} kcal/天。`
        : `后半段比前半段少记录约 ${Math.abs(s.drift)} kcal/天；先确认是否漏记，再结合多周体重趋势判断是否需要缩小缺口。`)
      : '',
    s.n >= 3 && s.spread >= Math.max(600, target * 0.35)
      ? `最多和最少差 ${s.spread} kcal；先检查漏记、外食估算和训练日差异，再决定是否需要调整餐次安排。` : '',
  ]);
}

/** 蛋白：达标率是关键，平均值会被个别高值拉高 */
function readProtein(points, { target, threshold }) {
  const s = analyzeSeries(points);
  if (!s) return INSUFFICIENT_DATA_TEXT;
  const hit = countDays(points, (y) => y >= threshold);
  // 同上：两天里达标一天不叫「达标率 50%」
  if (s.n < MIN_POINTS_FOR_CLAIM) {
    return INSUFFICIENT_DATA_TEXT;
  }
  const rate = s.n ? hit / s.n : 0;
  return join([
    `有记录的 ${s.n} 天里达标 ${hit} 天，日均 ${s.avg} g（目标 ${Math.round(target)} g）。`,
    rate >= 0.8 ? '多数记录日达到当前目标，继续保持。'
      : rate >= 0.5 ? '部分记录日低于目标；可以把全天蛋白更均匀地分到各餐。'
        : '多数记录日低于目标；先确认饮食是否记全，再为常吃的餐次预留稳定蛋白来源。',
    s.enoughForTrend && s.drift <= -Math.max(10, target * 0.08)
      ? `后半段比前半段少记录约 ${Math.abs(s.drift)} g/天；结合达标天数并先确认记录完整。` : '',
    s.enoughForTrend && s.drift >= Math.max(10, target * 0.08)
      ? `后半段比前半段多记录约 ${s.drift} g/天；是否更接近目标请结合达标天数判断。` : '',
  ]);
}

/** 体重：只看趋势不看单点，且要和目标速率对照 */
function readWeight(points, { kgPerWeek, goalRate, records, spanDays }) {
  const s = analyzeSeries(points, 1);
  if (!s) return INSUFFICIENT_DATA_TEXT;
  // 调用方没给次数时用序列自己的点数，别把「undefined 次记录」印到卡片上
  const n = Number.isFinite(Number(records)) ? records : s.n;
  if (kgPerWeek == null) {
    return INSUFFICIENT_DATA_TEXT;
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
  /*
   * 「偏快」的门槛按方向分开：减重 1%/周，增重 0.5%/周。
   * 超过参考范围只提示风险，不从体重数据断言组织成分；短期水分会显著干扰。
   */
  const pct = latest > 0 ? Math.abs(kgPerWeek) / latest : 0;
  const tooFastLoss = kgPerWeek < 0 && pct > MAX_LOSS_RATE_PCT;
  const tooFastGain = kgPerWeek > 0 && pct > MAX_GAIN_RATE_PCT;
  return join([
    `覆盖 ${spanDays} 个日历日、${n} 次称重，拟合趋势 ${kgPerWeek > 0 ? '+' : ''}${kgPerWeek} kg/周`,
    goalRate != null ? `（目标 ${goalRate > 0 ? '+' : ''}${goalRate}）。` : '。',
    diff == null
      // 目标是维持：偏离哪个方向都要说，但不存在快慢
      ? (Math.abs(kgPerWeek) < 0.1 ? '目标是维持，目前基本稳住了。'
        : `目标是维持，但每周${kgPerWeek > 0 ? '涨' : '掉'}了 ${Math.abs(kgPerWeek)} kg。`)
      : progress < 0 ? `方向反了：目标是${goalRate > 0 ? '增重' : '减重'}，实际在往另一边走。`
        : Math.abs(diff) < 0.1 ? '和目标基本一致，照现在的吃法继续。'
          : diff > 0 ? `比目标快 ${Math.abs(diff)} kg/周。` : `比目标慢 ${Math.abs(diff)} kg/周。`,
    tooFastLoss ? '变化超过体重的 1%/周；持续过快减重会增加瘦体重流失风险，但短期水分变化也可能放大数值，先复核连续几周趋势。' : '',
    tooFastGain ? '高于增肌期常用的 0.25%–0.5% 体重/周参考范围；更快增重可能提高脂肪增加比例，但体重数据本身不能区分脂肪、肌肉与水分。' : '',
    s.spread >= 2 ? `区间内最高最低差 ${s.spread} kg，水分、糖原和消化道内容物都可能影响单次称重；优先看同条件下的多周趋势。` : '',
  ]);
}

/** 活动能量：设备估算，重点在稳定性而不是绝对值 */
function readActive(points) {
  const s = analyzeSeries(points);
  if (!s) return INSUFFICIENT_DATA_TEXT;
  const cv = s.avg > 0 ? s.spread / s.avg : 0;
  return join([
    `日均 ${s.avg} kcal，区间内 ${s.min} ~ ${s.max} kcal。`,
    '活动能量是设备估算值，适合比较同一设备下的相对变化，不应视为精确消耗。',
    cv >= 1.2 ? '记录日差异很大；先核对设备佩戴和同步是否一致，再结合训练安排解释。'
      : cv >= 0.6 ? '记录日存在一定差异，可能同时受活动安排和设备估算误差影响。'
        : '记录值相对接近，但这不能单独说明作息或活动模式稳定。',
    s.enoughForTrend && Math.abs(s.drift) >= Math.max(60, s.avg * 0.15)
      ? (s.drift > 0 ? `后半段设备记录值比前半段高约 ${Math.abs(s.drift)} kcal/天。`
        : `后半段设备记录值比前半段低约 ${Math.abs(s.drift)} kcal/天；先核对佩戴与同步，再结合实际活动安排解释。`)
      : '',
  ]);
}

/** 睡眠：时长、稳定性、方向 */
function readSleep(points) {
  const s = analyzeSeries(points, 1);
  if (!s) return INSUFFICIENT_DATA_TEXT;
  const short = countDays(points, (y) => y < 6.5);
  // AASM / SRS 共识的可核对结论是成年人应规律睡够至少 7 小时；设备时长不等于睡眠质量。
  const hm = (hours) => formatDuration(hours * 60);
  return join([
    s.avg < 6.5 ? `日均 ${hm(s.avg)}，低于成年人规律睡够至少 7 小时的建议。`
      : s.avg < 7 ? `日均 ${hm(s.avg)}，离 7 小时还差一点。`
        : s.avg <= 9 ? `日均 ${hm(s.avg)}，达到至少 7 小时的时长参考。`
          : `日均 ${hm(s.avg)}，记录时长超过 9 小时；年轻人、补偿睡眠或疾病恢复期可能需要更久，不能只凭时长判定异常。`,
    short ? `其中 ${short} 天不足 6.5 小时。` : '',
    s.spread >= 2.5 ? `最长和最短差 ${hm(s.spread)}，说明睡眠时长波动较大；仅凭时长不能判断入睡和起床是否规律。`
      : s.enoughForTrend ? '睡眠时长波动较小；这仍不能替代对白天困倦和睡眠质量的观察。' : '',
    s.enoughForTrend && Math.abs(s.drift) >= 0.6
      ? (s.drift > 0 ? `后半段记录时长比前半段多约 ${hm(Math.abs(s.drift))}。`
        : `后半段记录时长比前半段少约 ${hm(Math.abs(s.drift))}；结合总时长和白天状态判断是否需要调整。`)
      : '',
    s.avg < 7 ? '可以先逐步增加可用于睡眠的时间，并结合白天困倦、恢复和连续多日记录观察。'
      : s.avg > 9 ? '若长期如此且伴随白天困倦或精神状态变化，可复核设备记录并咨询医生。' : '',
  ]);
}

/** 静息心率：以成人常见范围和个人基线为参照，不从短趋势推断原因。 */
function readRestingHR(points) {
  const s = analyzeSeries(points);
  if (!s) return INSUFFICIENT_DATA_TEXT;
  return join([
    `日均 ${s.avg} bpm，区间内 ${s.min} ~ ${s.max} bpm。`,
    s.avg > 100 ? '高于多数成人静息时常见的 60–100 bpm 范围；若复测仍高，或伴有胸痛、气短、晕厥等不适，应及时就医。'
      : s.avg < 50 ? '低于 50 bpm；训练者可能出现较低读数，但若伴有头晕、乏力或晕厥，应就医评估。'
        : '处在成人常见参考范围内。',
    s.enoughForTrend && s.drift >= 3
      ? `后半段比前半段高了约 ${s.drift} bpm；压力、感染、药物、训练负荷和测量条件都可能影响读数，单凭这条趋势不能确定原因。`
      : '',
    s.enoughForTrend && s.drift <= -3
      ? `后半段比前半段低了约 ${Math.abs(s.drift)} bpm；这也可能受测量条件影响，不能单凭下降判断有氧能力改善。` : '',
  ]);
}

/** 热量收支：只有同日摄入与消耗都齐全才画得出来 */
function readBalance(points) {
  const s = analyzeSeries(points);
  if (!s) return INSUFFICIENT_DATA_TEXT;
  const deficit = countDays(points, (y) => y < 0);
  const head = `${s.n} 天里日均 ${s.avg > 0 ? '+' : ''}${s.avg} kcal，其中 ${deficit} 天为负（摄入低于消耗）。`;
  // 一两天就换算成「每周掉几公斤」是最容易造出假结论的地方，样本不够就只报数
  if (s.n < MIN_POINTS_FOR_CLAIM) {
    return INSUFFICIENT_DATA_TEXT;
  }
  const weekly = round((Math.abs(s.avg) * 7) / 7700, 2);
  return join([
    head,
    `按 7700 kcal/kg 的脂肪当量换算，相当于每周 ${weekly} kg 的${s.avg > 0 ? '盈余' : '赤字'}——`,
    '这只是能量换算，不等于体重一定这样变，实际还要看体重曲线。',
    Math.abs(s.avg) > 900 ? '日均偏差偏大，先确认饮食记得全不全，再决定要不要调目标。' : '',
  ]);
}

/** 步数：绝对值 + 稳定性，参考分档见 docs/算法依据.md */
function readSteps(points) {
  const s = analyzeSeries(points);
  if (!s) return INSUFFICIENT_DATA_TEXT;
  const low = countDays(points, (y) => y < 4000);
  return join([
    `日均 ${withUnit(s.avg, '步')}，区间内 ${s.min} ~ ${withUnit(s.max, '步')}。`,
    s.avg < 5000 ? '处在较低参考区间；没有适用于所有人的统一步数目标，可先在当前基础上逐步增加 500–1000 步/天。'
      : s.avg < 7500 ? '处在中间参考区间；若身体状况允许，可先在当前基础上逐步增加 500–1000 步/天，并根据耐受调整。'
        : '处在较高参考区间；是否继续增加应结合运动强度、久坐时间、症状和个人目标。',
    low >= MIN_POINTS_FOR_CLAIM ? `其中 ${low} 天不到 4000 步。` : '',
    s.enoughForTrend && Math.abs(s.drift) >= Math.max(800, s.avg * 0.15)
      ? (s.drift > 0 ? `后半段比前半段多走约 ${Math.abs(s.drift)} 步/天。`
        : `后半段比前半段少走约 ${Math.abs(s.drift)} 步/天。`)
      : '',
    '步数只反映走动量，替代不了运动强度和久坐时间的判断。',
  ]);
}

/** 锻炼时间：设备没有可靠强度字段，因此只能做有条件的 WHO 对照。 */
function readExercise(points) {
  const s = analyzeSeries(points);
  if (!s) return INSUFFICIENT_DATA_TEXT;
  const weekly = Math.round((s.avg * 7));
  const zero = countDays(points, (y) => y <= 0);
  return join([
    `日均 ${s.avg} 分钟，按这个节奏一周约 ${weekly} 分钟。`,
    weekly >= 150
      ? '若这些分钟主要达到中等强度，则时长达到 WHO 每周至少 150 分钟的下限；当前数据不能确认强度。'
      : `若这些分钟主要达到中等强度，则距 WHO 每周至少 150 分钟的下限约 ${150 - weekly} 分钟；当前数据不能确认强度。`,
    zero ? `其中 ${zero} 天没有记录到锻炼。` : '',
    'WHO 另建议成人每周至少 2 天进行肌肉强化活动；这里只统计设备时长，不能据此判断是否完成力量训练。',
  ]);
}

const READERS = {
  kcal: readKcal, protein: readProtein, weight: readWeight,
  active: readActive, sleep: readSleep, restingHR: readRestingHR, balance: readBalance,
  steps: readSteps, exercise: readExercise,
};

/** 统一入口：metric 决定用哪套说法 */
export function trendReading(metric, points = [], opts = {}) {
  const reader = READERS[metric];
  if (!reader) return '';
  const summary = analyzeSeries(points);
  /*
   * 一两个点能报出一个“平均”，却不能代表趋势。卡片空态统一只写“数据不足”；
   * 需要补几天、体重为什么还要拉开 7 天，放进右上角的方法说明，避免同一张
   * 空图下面再常驻一大段教程。
   */
  if (!summary || summary.n < MIN_POINTS_FOR_CLAIM) return INSUFFICIENT_DATA_TEXT;
  if (metric === 'weight' && opts.kgPerWeek == null) return INSUFFICIENT_DATA_TEXT;
  return reader(points, opts);
}
