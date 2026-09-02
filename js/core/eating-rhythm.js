/**
 * 进食节奏：这个钟点，按计划应该吃到多少了。
 *
 * 主卡上「还有 900 kcal 没吃」只说了总量，没说这个数在这个钟点算不算正常。
 * 早上 8 点差 900 是理所当然，晚上 9 点差 900 才值得说一句。
 *
 * 两种口径，用户在设置里自己选（`profile.rhythmMode`）：
 *
 *  - **guideline（膳食指南）**：按《中国居民膳食指南》的三餐供能比
 *    （早 25~30%、午 30~40%、晚 30~35%）折算成一条随钟点上升的曲线。
 *    适合「我想按科学的方式吃」。
 *  - **personal（按我平常）**：用这个人近 14 天自己的记录算出真实分布。
 *    多数人不按指南吃 —— 有人 60% 的热量落在 18 点之后，对他来说
 *    下午 4 点只吃了 30% 完全正常，用指南去比会天天说他"慢了"。
 *
 * **都不是匀速直线。** 原先 judgeStatus 里的 `(hour-6)/16` 是匀速的，
 * 那等于假设人从早到晚均匀地吃，没有一个人是这样的。
 *
 * 样本不足时 personal 自动退回 guideline，并在返回值里说出来 ——
 * 三天记录算出来的"我平常"不是我平常。
 */

/** 餐次定义：时间窗 + 该餐在全天热量中的默认占比 */
export const MEALS = [
  { key: 'breakfast', label: '早餐', endHour: 10.5, share: 0.25 },
  { key: 'lunch', label: '午餐', endHour: 14.5, share: 0.35 },
  { key: 'snack', label: '加餐', endHour: 17.5, share: 0.10 },
  { key: 'dinner', label: '晚餐', endHour: 21, share: 0.30 },
  { key: 'late', label: '夜宵', endHour: 24, share: 0.05 },
];

/** 少于这么多天有记录，就谈不上「我平常」 */
export const MIN_DAYS_FOR_PERSONAL = 7;

export const RHYTHM_MODES = Object.freeze([
  {
    key: 'guideline',
    label: '按膳食指南',
    desc: '早 25~30%、午 30~40%、晚 30~35%，出自《中国居民膳食指南》的三餐供能比。',
  },
  {
    key: 'personal',
    label: '按我平常',
    desc: '用近 14 天你自己的记录算出真实分布；记录不足 7 天时自动回到膳食指南。',
  },
]);

export const DEFAULT_RHYTHM_MODE = 'guideline';

export function rhythmMode(key) {
  return RHYTHM_MODES.find((m) => m.key === key) || RHYTHM_MODES[0];
}

/* 一天从这个钟点开始算；再早的记录都归到起点上 */
const DAY_START = 5;

/**
 * 膳食指南那条曲线。
 *
 * MEALS 里每一餐带着 `endHour` 和 `share`，把它们累起来就是「到这个钟点为止
 * 应该吃到全天的百分之几」。餐次之间线性插值 —— 不是说人在两餐之间匀速吃，
 * 而是「上一餐吃完到下一餐吃完」这段时间里，完成度确实是从 A 走到 B。
 */
function guidelineCurve() {
  const points = [{ hour: DAY_START, share: 0 }];
  let acc = 0;
  for (const meal of MEALS) {
    acc += meal.share;
    points.push({ hour: meal.endHour, share: Math.min(1, acc) });
  }
  return points;
}

/** 在一条 [{hour, share}] 曲线上取某个钟点对应的完成度 */
function shareAt(points, hour) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return null;
  if (h <= points[0].hour) return 0;
  const last = points[points.length - 1];
  if (h >= last.hour) return last.share;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (h > b.hour) continue;
    const span = b.hour - a.hour;
    const t = span > 0 ? (h - a.hour) / span : 1;
    return a.share + (b.share - a.share) * t;
  }
  return last.share;
}

/**
 * 这个人自己的曲线：近 N 天每一笔记录按钟点累加，算出平均分布。
 *
 * 用「有记录的天数」当分母，不是日历天数 —— 没记的日子不在样本里。
 * 每一天各自归一化再平均：不能把吃得多的那天的绝对千卡直接加进来，
 * 否则一顿火锅就能把整条曲线拽偏。
 */
function personalCurve(entries = [], { days = 14, asOf = null } = {}) {
  const byDate = new Map();
  const cutoff = asOf ? String(asOf) : null;
  for (const entry of entries) {
    const date = String(entry?.date || '');
    if (!date || (cutoff && date > cutoff)) continue;
    const kcal = Number(entry?.kcal);
    const time = new Date(entry?.time || '');
    if (!(kcal > 0) || Number.isNaN(time.getTime())) continue;
    const hour = time.getHours() + time.getMinutes() / 60;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ hour: hour < DAY_START ? 24 + hour : hour, kcal });
  }
  const dates = [...byDate.keys()].sort().slice(-days);
  if (dates.length < MIN_DAYS_FOR_PERSONAL) return null;

  /* 每半小时一个采样点，够画一条平滑的线，也不至于让数组太长 */
  const steps = [];
  for (let h = DAY_START; h <= 24; h += 0.5) steps.push(h);
  const sums = new Array(steps.length).fill(0);
  let usedDays = 0;
  for (const date of dates) {
    const rows = byDate.get(date);
    const total = rows.reduce((a, r) => a + r.kcal, 0);
    if (!(total > 0)) continue;
    usedDays += 1;
    for (let i = 0; i < steps.length; i += 1) {
      const eaten = rows.reduce((a, r) => a + (r.hour <= steps[i] ? r.kcal : 0), 0);
      sums[i] += eaten / total;
    }
  }
  if (usedDays < MIN_DAYS_FOR_PERSONAL) return null;
  return steps.map((hour, i) => ({ hour, share: sums[i] / usedDays }));
}

/**
 * 这个钟点应该吃到多少。
 *
 * @param {object} opts
 *   mode     'guideline' | 'personal'
 *   hour     现在几点（小数小时）
 *   entries  近期饮食记录（personal 模式才用）
 *   asOf     只统计这个日期之前的记录（看历史日期时要钉住）
 * @returns {{ share, mode, requested, fellBack, days }}
 *   share     0~1，到这个钟点为止应该吃到全天的几成
 *   mode      实际用的口径
 *   fellBack  想用 personal 但样本不够，退回了 guideline
 */
export function expectedShare({
  mode = DEFAULT_RHYTHM_MODE, hour = 12, entries = [], days = 14, asOf = null,
} = {}) {
  const requested = rhythmMode(mode).key;
  const curve = requested === 'personal'
    ? personalCurve(entries, { days, asOf })
    : null;
  const points = curve || guidelineCurve();
  const sampleDays = curve
    ? new Set(entries.map((e) => e?.date).filter(Boolean)).size
    : 0;
  return {
    share: Math.max(0, Math.min(1, shareAt(points, hour) ?? 0)),
    mode: curve ? 'personal' : 'guideline',
    requested,
    fellBack: requested === 'personal' && !curve,
    days: sampleDays,
  };
}

/*
 * 差多少才算「值得说一句」。
 *
 * 一成半以内都属于正常波动，只报个中性的「相当」。这个数不能太小：
 * 曲线本身就是分段折线，午饭吃早半小时就能差出十个点。
 */
const NOTABLE = 0.15;

/** 这套口径在界面上该怎么称呼自己 */
export function rhythmBasis(mode) {
  return mode === 'personal' ? '你近两周的节奏' : '膳食指南';
}

/**
 * 主卡第一段里那半句「这个钟点该吃到多少了」。
 *
 * 只有一处产出这句话：judgeStatus 从这里取，界面别再拼第二份 ——
 * 同一件事两套措辞，用户会以为是两个不同的判断。
 *
 * 不评价进食速度（程序没有进餐时长数据），也不催人吃。晚上 9 点之后
 * 不再说「少了」：那时候催人补热量，等于劝人睡前大吃一顿。
 */
export function paceNote({
  mode = DEFAULT_RHYTHM_MODE, hour = 12, eatenPct = 0, entries = [], asOf = null,
} = {}) {
  const expected = expectedShare({ mode, hour, entries, asOf });
  const should = Math.round(expected.share * 100);
  const actual = Math.round(Number(eatenPct) || 0);
  const gap = (actual - should) / 100;
  const basis = rhythmBasis(expected.mode);
  const info = { ...expected, should, basis };
  /* 天还没亮时 should 是 0%，拿它比较只是把一个必然成立的算术结果念一遍 */
  if (expected.share < 0.05) {
    return { ...info, tone: 'early', text: '一天才刚开始，按平时的节奏吃就行' };
  }
  if (Math.abs(gap) < NOTABLE) {
    return { ...info, tone: 'onTrack', text: `与${basis}在这个钟点的 ${should}% 相当` };
  }
  /*
   * 说「多了 / 少了」，不说「快了 / 慢了」。
   * 后者听起来像在评价进食速度，而这个程序根本没有进餐时长数据 ——
   * 「吃得慢一些」当年就是这么混进来的。这里说的是全天的分布。
   */
  if (gap > 0) {
    return {
      ...info,
      tone: 'ahead',
      text: `高于${basis}在这个钟点的 ${should}%，后面餐次按剩余量安排即可`,
    };
  }
  if (hour >= 21) {
    return {
      ...info,
      tone: 'late',
      text: `低于${basis}在这个钟点的 ${should}%，夜里不必一次补完，明天回到正常节奏即可`,
    };
  }
  return {
    ...info,
    tone: 'behind',
    text: `低于${basis}在这个钟点的 ${should}%，先确认是否漏记，别把缺口全留到晚上`,
  };
}
