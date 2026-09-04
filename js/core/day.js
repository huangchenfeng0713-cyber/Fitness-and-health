/**
 * 日期。取「今天」、前后挪一天、以及顶栏那行字该怎么写。
 *
 * 措辞逻辑放 core 是因为它有判断：同一个日期在标题和副标题里不能各写一遍。
 * 原先大标题写「昨天」，下面又写「08-28 · 回今天」—— 上下两行说同一件事，
 * 而「回今天」在已经标出是哪天之后才有用。
 *
 * 纯函数：`today` 一律由调用方传进来，这里不读系统时钟（除了 todayKey 的默认参数）。
 */

const pad = (n) => String(n).padStart(2, '0');

/** 本地时区的 YYYY-MM-DD */
export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftDay(key, delta) {
  const [y, m, d] = String(key).split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + delta));
}

const DAY_MS = 86400000;

/** a 比 b 晚几天。解析成 UTC 零点再减，避开夏令时那一小时 */
export function dayOffset(a, b) {
  const t = (k) => Date.parse(`${k}T00:00:00Z`);
  const diff = t(a) - t(b);
  return Number.isFinite(diff) ? Math.round(diff / DAY_MS) : 0;
}

const VALID = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 顶栏日期该怎么写。
 *
 * 只有今天配「词 + 日期」，别的一律「日期 + 回今天」。
 *
 * 昨天、明天原先也走词的那一路（标题「昨天」、副标题 `09-04`），代价是
 * 副标题这一格在不同日子上说着两件不同的事：今天和昨天是「这是几号」，
 * 再远一天就变成「回今天」。而副标题是**同一个位置**，一格只该有一个职责。
 * 更要紧的是，只有今天不需要出口 —— 翻到别的任何一天都需要，昨天也不例外，
 * 而那时候「回今天」被日期挤掉了，人得自己去找那两个箭头。
 *
 * @returns {{title, sub, offset, isToday, backToToday}}
 *  - 今天：标题「今天」，副标题给出具体日期（`09-05`）
 *  - 其余任何一天：标题就是日期本身（`08月27日`，跨年补上年份），
 *    副标题只留一个回今天的出口
 */
export function dayHeading(day, today) {
  const base = VALID.test(String(today)) ? String(today) : todayKey();
  const key = VALID.test(String(day)) ? String(day) : base;
  const [y, m, d] = key.split('-');
  const offset = dayOffset(key, base);
  if (offset === 0) {
    return { title: '今天', sub: `${m}-${d}`, offset, isToday: true, backToToday: false };
  }
  // 跨年才写年份：同一年里「2026年」每天都对、每天都一样，等于没说
  const sameYear = y === base.slice(0, 4);
  /*
   * 副标题只给文字，那个返回箭头由界面画成图标。
   * 打出来的 ↩ 在不同系统上是三种字形、三种基线，和旁边的中文对不齐；
   * 而且它是文字，跟着字号走，缩放起来和图标不是一回事。
   */
  return {
    title: `${sameYear ? '' : `${y}年`}${m}月${d}日`,
    sub: '回今天',
    offset,
    isToday: false,
    backToToday: true,
  };
}

/** 一天已过去的比例，用于实时预算分配 */
export function dayFraction(now = new Date()) {
  return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
}

/**
 * 把某一天折成一个稳定的整数，给「每天换一批」这类轮换用。
 *
 * 要的是「同一天里怎么翻都一样、隔天才换」。Math.random() 做不到这件事 ——
 * 这个应用每 60 秒重绘一次，随机数会让那一列内容在人眼皮底下自己跳。
 * 直接用天数差就够：不需要散列，只需要逐日递增。
 */
export function daySeed(day = todayKey()) {
  const key = VALID.test(String(day)) ? String(day) : todayKey();
  return Math.abs(dayOffset(key, '2020-01-01'));
}
