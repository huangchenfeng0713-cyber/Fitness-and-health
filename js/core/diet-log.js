/**
 * 饮食记录的合并口径。
 *
 * 一天里同一样东西记了三次，只读的列表里就是三行 —— 午餐吃两碗饭占两行，
 * 一杯水一样的奶茶喝两次占两行。核对「今天吃了什么」的时候，
 * 重复的行只是把真正不同的那几样往下挤。
 *
 * 只在**只读态**合并。编辑态必须一条是一条：删的、改克数的、换餐次的
 * 都是某一条具体记录，合起来就没法单独动它了。
 *
 * 合并的判据是「这是不是同一笔」：同一餐、同一个食物、同一个糖度、同一个单位。
 * 糖度不同不能合（全糖和三分糖差一百多千卡）；单位不同更不能合（150g 和 150ml）。
 * 克数和营养逐项相加，不取平均 —— 吃了两碗就是两碗。
 */

/** 合并后每一组的稳定标识；只用来分组，不落库 */
function groupKey(entry) {
  return [
    entry.meal || 'snack',
    entry.foodId || `name:${entry.name || ''}`,
    entry.sugarLevel || '',
    entry.unit || '',
    // 复合食物每次的配料可能不同，配料不一样的两笔不是同一笔
    entry.composition ? JSON.stringify(entry.composition) : '',
  ].join('|');
}

const SUMMED = ['grams', 'kcal', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium'];

/**
 * 把一组记录按「是不是同一笔」合并。
 *
 * @param {Array} entries 已经排好序的一餐记录
 * @returns {Array<{key, entries, count, name, ...合计的营养}>}
 *   count 为 1 的组也照样返回，调用方不用分两种情况处理。
 */
export function mergeSameEntries(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    if (!entry) continue;
    const key = groupKey(entry);
    const hit = groups.get(key);
    if (hit) {
      hit.entries.push(entry);
      for (const field of SUMMED) hit[field] += Number(entry[field]) || 0;
      continue;
    }
    const row = { key, entries: [entry], name: entry.name, unit: entry.unit || 'g' };
    for (const field of SUMMED) row[field] = Number(entry[field]) || 0;
    groups.set(key, row);
  }
  return [...groups.values()].map((row) => ({ ...row, count: row.entries.length }));
}
