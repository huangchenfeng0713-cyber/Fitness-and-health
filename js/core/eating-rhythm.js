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
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** 窗口内 smoothstep 平滑推进；窗口外贡献恒定，无全天线性插值。 */
export function expectedShare({ hour = 12 } = {}) {
  const meals = GUIDELINE_MEALS;
  const h = Number.isFinite(Number(hour)) ? Number(hour) : 0;
  const share = meals.reduce((sum, m) => {
    const t = clamp((h - m.startHour) / (m.endHour - m.startHour), 0, 1);
    return sum + m.share * t * t * (3 - 2 * t);
  }, 0);
  return { share: clamp(share, 0, 1), meals };
}

/*
 * 差多少才算「值得说一句」。
 *
 * 一成半以内都属于正常波动，只报个中性的「相当」。这个数不能太小：
 * 参照在餐次窗口内平滑推进，午饭吃早半小时就能差出十个点。
 */
const NOTABLE = 0.15;

/**
 * 主卡第一段里那半句「这个钟点该吃到多少了」。
 *
 * 只有一处产出这句话：judgeStatus 从这里取，界面别再拼第二份 ——
 * 同一件事两套措辞，用户会以为是两个不同的判断。
 *
 * 不评价进食速度（程序没有进餐时长数据），也不催人吃。晚上 9 点之后
 * 不再说「少了」：那时候催人补热量，等于劝人睡前大吃一顿。
 */
export function paceNote({ hour = 12, eatenPct = 0 } = {}) {
  const expected = expectedShare({ hour });
  const should = Math.round(expected.share * 100);
  const actual = Math.round(Number(eatenPct) || 0);
  const gap = (actual - should) / 100;
  const basis = '膳食指南';
  const info = { ...expected, should, basis };
  /* 天还没亮时 should 是 0%，拿它比较只是把一个必然成立的算术结果念一遍 */
  if (expected.share < 0.05) {
    return { ...info, tone: 'early', text: '一天才刚开始，三餐照常安排' };
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
