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

/*
 * 一条记忆现在是 `{ grams, sugarLevel, meal }`，早先是一个裸的克数。
 *
 * 老数据不迁移：读的时候把数字当成 `{ grams }` 就行，写的时候自然会补全。
 * 迁移脚本要么在启动时跑（拖慢启动），要么在同步时跑（两台设备格式不一致），
 * 而这里读一次的成本是一个 typeof。
 */
function entryOf(memory, foodId) {
  const v = memory?.[foodId];
  if (v == null) return null;
  return typeof v === 'object' ? v : { grams: v };
}

/** 读一条份量记忆；没有、为 0、是脏数据都返回 null */
export function rememberedPortion(memory, foodId) {
  const v = Number(entryOf(memory, foodId)?.grams);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * 这个食物上次是怎么记的：多少克、什么糖度、记到哪一餐。
 *
 * 糖度和餐次跟克数是同一件事的三个面 —— 同一杯奶茶这个人一直点三分糖，
 * 同一样早餐食物他一直记到早餐。只记克数，另外两个每次都要重选。
 * 没记过的返回全 null，调用方各自兜底（餐次回到按钟点猜）。
 */
export function rememberedChoice(memory, foodId) {
  const row = entryOf(memory, foodId);
  return {
    grams: rememberedPortion(memory, foodId),
    sugarLevel: typeof row?.sugarLevel === 'string' && row.sugarLevel ? row.sugarLevel : null,
    meal: typeof row?.meal === 'string' && row.meal ? row.meal : null,
  };
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
export function nextPortionMemory(memory, food, grams, choice = {}, limit = PORTION_MEMORY_LIMIT) {
  const g = Number(grams);
  if (!food?.id || !Number.isFinite(g) || g <= 0) return null;
  const known = rememberedChoice(memory, food.id);
  const sugarLevel = typeof choice.sugarLevel === 'string' && choice.sugarLevel
    ? choice.sugarLevel : null;
  const meal = typeof choice.meal === 'string' && choice.meal ? choice.meal : null;
  const gramsUnchanged = known.grams != null && Math.abs(known.grams - g) < 0.5;
  const firstTimeDefault = isPresetPortion(food, g) && known.grams == null;
  // 克数没什么可记的时候，糖度或餐次变了仍然值得记一笔
  if ((firstTimeDefault || gramsUnchanged)
    && sugarLevel === known.sugarLevel && meal === known.meal) return null;
  const row = { grams: firstTimeDefault ? null : g, sugarLevel, meal };
  if (row.grams == null) delete row.grams;
  if (row.grams == null && known.grams != null) row.grams = known.grams;
  const next = { ...memory, [food.id]: row };
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
  const choice = rememberedChoice(memory, food?.id);
  const remembered = choice.grams;
  const base = { sugarLevel: choice.sugarLevel, meal: choice.meal };
  if (remembered == null) {
    return { unitIdx: 0, grams: servings[0]?.[1] || 100, qty: 1, remembered: null, ...base };
  }
  const matched = servings.findIndex(([, w]) => Math.abs(Number(w) - remembered) < 0.5);
  const gramMode = matched < 0;
  return {
    unitIdx: gramMode ? servings.length : matched,
    grams: remembered,
    qty: gramMode ? remembered : 1,
    remembered,
    ...base,
  };
}
