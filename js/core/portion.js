/*
 * 份量记忆：某样食物上次记了多少克，下次就默认多少。
 *
 * 库里那份「1 碗 = 150g」是没有更好答案时的兜底 —— 同一个人的一碗饭每次都是同一碗，
 * 而这碗是 150g 还是 250g，只有他自己知道。份量估错一倍，热量就差一倍，
 * 与其把默认值猜得更准，不如改过一次之后就按他的数来。
 *
 * 这里只放「记不记」「记完该选哪一档」的判断，落库在 lib/store.js。
 */

/** 这张表只留最近改过的那些，别让它无限长 */
export const PORTION_MEMORY_LIMIT = 200;

/** 读一条份量记忆；没有、为 0、是脏数据都返回 null */
export function rememberedPortion(memory, foodId) {
  const v = Number(memory?.[foodId]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** grams 是不是食物库里现成的某一档份量 */
export function isPresetPortion(food, grams) {
  const g = Number(grams);
  if (!Number.isFinite(g)) return false;
  return (food?.s || []).some(([, w]) => Math.abs(Number(w) - g) < 0.5);
}

/**
 * 记一次份量，返回新的记忆表；不需要改动时返回 null（调用方就不用写库）。
 *
 * 照着库里默认份量记的那些不记 —— 否则第一次随手点个「一份」就把它钉死了。
 * 但**已经改过一次的食物要继续记**：改回默认份量也是一次表态，
 * 不然「250g → 150g（默认）」这一步会被忽略，下次又跳回 250g。
 */
export function nextPortionMemory(memory, food, grams, limit = PORTION_MEMORY_LIMIT) {
  const g = Number(grams);
  if (!food?.id || !Number.isFinite(g) || g <= 0) return null;
  const known = rememberedPortion(memory, food.id);
  if (isPresetPortion(food, g) && known == null) return null;
  if (known != null && Math.abs(known - g) < 0.5) return null;   // 和上次一样，白写一次库
  const next = { ...memory, [food.id]: g };
  const keys = Object.keys(next);
  if (keys.length > limit) {
    for (const k of keys.slice(0, keys.length - limit)) delete next[k];
  }
  return next;
}

/**
 * 选中一样食物时份量面板的初始状态。
 *
 * 记住的量正好等于某个常用份量时选中那一档（显示「1 碗」比「250 克」好读），
 * 对不上就落到按克输入那一档（下标 = 份量个数）。
 *
 * qty 是「几份」：按份量档时是 1，按克输入时它本身就是克数 ——
 * 面板上那个大数字读的是 qty，不是 grams。只设 grams 不设 qty，
 * 弹层一打开大读数是一道杠，而下面的输入框里明明写着 420。
 */
export function initialPortion(food, memory) {
  const servings = food?.s || [];
  const remembered = rememberedPortion(memory, food?.id);
  if (remembered == null) {
    return { unitIdx: 0, grams: servings[0]?.[1] || 100, qty: 1, remembered: null };
  }
  const matched = servings.findIndex(([, w]) => Math.abs(Number(w) - remembered) < 0.5);
  const gramMode = matched < 0;
  return {
    unitIdx: gramMode ? servings.length : matched,
    grams: remembered,
    qty: gramMode ? remembered : 1,
    remembered,
  };
}
