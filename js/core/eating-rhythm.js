/** 三餐阶段参照。餐次标签注册表保留原样，供记录和推荐使用；加餐不进入参照。 */
export const MEALS = [
  { key: 'breakfast', label: '早餐', endHour: 10.5, share: 0.25 },
  { key: 'lunch', label: '午餐', endHour: 14.5, share: 0.35 },
  { key: 'snack', label: '加餐', endHour: 17.5, share: 0.10 },
  { key: 'dinner', label: '晚餐', endHour: 21, share: 0.30 },
  { key: 'late', label: '夜宵', endHour: 24, share: 0.05 },
];


export const GUIDELINE_MEALS = Object.freeze([
  { key: 'breakfast', startHour: 6.5, endHour: 9, share: 0.30 },
  { key: 'lunch', startHour: 11.5, endHour: 14, share: 0.40 },
  { key: 'dinner', startHour: 17.5, endHour: 20, share: 0.30 },
]);
export const MIN_DAYS_FOR_PERSONAL = 7;
export const MAX_PERSONAL_DAYS = 28;
export const RHYTHM_MODES = Object.freeze([
  { key: 'guideline', label: '参照膳食', desc: '按固定三餐窗口与早 30%、午 40%、晚 30% 参照，两餐之间保持。' },
  { key: 'personal', label: '参照平常', desc: '按最近最多 28 个有效记录日的三餐时间与比例参照；不足 7 天时使用参照膳食。' },
]);
export const DEFAULT_RHYTHM_MODE = 'guideline';
export function rhythmMode(key) { return RHYTHM_MODES.find(m => m.key === key) || RHYTHM_MODES[0]; }

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const quantile = (values, p) => {
  const a = [...values].sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * p;
  const i = Math.floor(pos);
  return a[i] + ((a[i + 1] ?? a[i]) - a[i]) * (pos - i);
};
const median = values => quantile(values, 0.5);

/**
 * 向历史查找有效日，不设自然日截断；当天尚未完成，不能反过来训练自己的参照。
 * 两顿各至少 100 kcal、全日至少 800 kcal 且不低于候选日中位数的一半：
 * 这些是排除明显漏记的样本质量护栏，不是最低饮食建议，也不依赖今天的计划。
 */
export function personalMealReference(entries = [], { asOf = null } = {}) {
  const byDate = new Map();
  const keys = new Set(GUIDELINE_MEALS.map(m => m.key));
  for (const e of entries) {
    const date = String(e?.date || '');
    const kcal = Number(e?.kcal);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (asOf && date >= asOf) || !(kcal > 0) || !Number.isFinite(kcal)) continue;
    if (!byDate.has(date)) byDate.set(date, { date, total: 0, meals: new Map() });
    const day = byDate.get(date);
    day.total += kcal; // 加餐照常属于全天实际摄入。
    if (!keys.has(e.meal)) continue;
    if (!day.meals.has(e.meal)) day.meals.set(e.meal, { kcal: 0, times: [] });
    const meal = day.meals.get(e.meal);
    meal.kcal += kcal;
    const time = new Date(e.time || '');
    if (!Number.isNaN(time.getTime())) meal.times.push({ hour: time.getHours() + time.getMinutes() / 60, kcal });
  }
  const candidates = [...byDate.values()].filter(d =>
    [...d.meals.values()].filter(m => m.kcal >= 100).length >= 2 && d.total >= 800);
  const typicalTotal = median(candidates.map(d => d.total)) || 0;
  const valid = candidates.filter(d => d.total >= typicalTotal * 0.5)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_PERSONAL_DAYS);
  const info = { days: valid.length, dates: valid.map(d => d.date) };
  if (valid.length < MIN_DAYS_FOR_PERSONAL) return { ...info, meals: null };

  const meals = GUIDELINE_MEALS.map(fallback => {
    const shares = [];
    const times = [];
    for (const day of valid) {
      const meal = day.meals.get(fallback.key);
      if (!meal || meal.kcal < 100) continue; // 漏餐不当作真实的零摄入。
      shares.push(meal.kcal / day.total);
      if (meal.times.length) {
        const total = meal.times.reduce((s, t) => s + t.kcal, 0);
        times.push(meal.times.reduce((s, t) => s + t.hour * t.kcal, 0) / total);
      }
    }
    // 每天先汇总每餐，避免一餐条目多的日子获得更多统计权重。
    const center = times.length >= 3 ? median(times) : (fallback.startHour + fallback.endHour) / 2;
    const width = times.length >= 3 ? clamp(quantile(times, 0.8) - quantile(times, 0.2) + 1, 1, 3)
      : fallback.endHour - fallback.startHour;
    return { key: fallback.key, share: median(shares) ?? fallback.share, center, width };
  });
  // 主餐占全天实际摄入的典型比例最后在三餐内归一化；加餐永远不生成第四阶段。
  const sum = meals.reduce((a, m) => a + m.share, 0);
  meals.forEach((m, i) => {
    m.share /= sum;
    m.center = clamp(m.center, i ? meals[i - 1].center + 1 : 0.5, 21.5 + i);
  });
  const windows = meals.map((m, i) => ({
    key: m.key, share: m.share,
    startHour: Math.max(i ? (meals[i - 1].center + m.center) / 2 : 0, m.center - m.width / 2),
    endHour: Math.min(i < 2 ? (m.center + meals[i + 1].center) / 2 : 24, m.center + m.width / 2),
  }));
  return { ...info, meals: windows };
}

/** 窗口内 smoothstep 平滑推进；窗口外贡献恒定，无全天线性插值。 */
export function expectedShare({ mode = DEFAULT_RHYTHM_MODE, hour = 12, entries = [], asOf = null } = {}) {
  const requested = rhythmMode(mode).key;
  const personal = requested === 'personal' ? personalMealReference(entries, { asOf }) : null;
  const meals = personal?.meals || GUIDELINE_MEALS;
  const h = Number.isFinite(Number(hour)) ? Number(hour) : 0;
  const share = meals.reduce((sum, m) => {
    const t = clamp((h - m.startHour) / (m.endHour - m.startHour), 0, 1);
    return sum + m.share * t * t * (3 - 2 * t);
  }, 0);
  return {
    share: clamp(share, 0, 1), mode: personal?.meals ? 'personal' : 'guideline', requested,
    fellBack: requested === 'personal' && !personal?.meals, days: personal?.days || 0, meals,
  };
}

/*
 * 差多少才算「值得说一句」。
 *
 * 一成半以内都属于正常波动，只报个中性的「相当」。这个数不能太小：
 * 参照在餐次窗口内平滑推进，午饭吃早半小时就能差出十个点。
 */
const NOTABLE = 0.15;

/** 这套口径在界面上该怎么称呼自己 */
export function rhythmBasis(mode) {
  return mode === 'personal' ? '你平常的三餐节奏' : '膳食指南';
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
