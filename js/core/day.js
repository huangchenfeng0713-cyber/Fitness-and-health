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
 * @returns {{title, sub, offset, isToday, backToToday}}
 *  - 今天 / 昨天 / 明天：标题是那个词，副标题给出具体日期（`08-28`）
 *  - 更远的日期：标题就是日期本身（`08月27日`，跨年补上年份），
 *    副标题不再重复它，只留一个回今天的出口
 */
export function dayHeading(day, today) {
  const base = VALID.test(String(today)) ? String(today) : todayKey();
  const key = VALID.test(String(day)) ? String(day) : base;
  const [y, m, d] = key.split('-');
  const offset = dayOffset(key, base);
  const word = { 0: '今天', '-1': '昨天', 1: '明天' }[String(offset)];
  if (word) {
    return { title: word, sub: `${m}-${d}`, offset, isToday: offset === 0, backToToday: false };
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
