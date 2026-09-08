/** 今日摄入趋势：沿用三餐参照和当天目标，只输出有条件的范围，不输出概率分。 */
import { GUIDELINE_MEALS } from './eating-rhythm.js';
import { todayKey } from './day.js';
import { macroSplit } from './metrics.js';

// 产品提醒护栏，非生理阈值或经过校准的统计置信区间。
export const TREND_POLICY = Object.freeze({ graceHours: 0.75, notableShare: 0.12, notableKcal: 250, lateHour: 21 });
const positive = n => Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0;
const label = key => ({ breakfast: '早餐', lunch: '午餐', dinner: '晚餐' })[key];

export function intakeTrend({ targets = {}, intake = {}, entries = [], now = new Date(), isToday = true, enabled = true, burnedNow = null, completedMeals = [], dayComplete = false } = {}) {
  const target = positive(targets.kcal), eaten = positive(intake.kcal);
  const date = todayKey(now), hour = now.getHours() + now.getMinutes() / 60;
  const todayEntries = entries.filter(e => e?.date === date);
  const completed = new Set(completedMeals);
  for (const e of todayEntries) if (e.mealComplete === true && new Date(e.time) <= now) completed.add(e.meal);
  const remainingMeals = GUIDELINE_MEALS.filter(m => !completed.has(m.key))
    .map(m => ({ ...m, label: label(m.key) }));
  const base = { state: 'uncertain', active: false, direction: null, range: null, source: 'guideline', basis: '固定三餐参照',
    remainingMeals, target, eaten, burnedNow, currentCovered: false, dayComplete: isToday && dayComplete === true };
  if (!isToday) return { ...base, remainingMeals: [], state: 'historical', reason: '仅展示所选日期记录。' };
  if (!enabled || !target) return { ...base, reason: '先完善身体资料，再判断今日摄入。' };
  if (todayEntries.some(e => new Date(e.time) > now)) return { ...base, reason: '有提前记录的餐次，请核对已吃部分。' };
  if (intake.coverage?.kcal?.complete === false) return { ...base, reason: '部分食物热量未知，暂不判断全天摄入。' };
  if (base.dayComplete) return { ...base, state: 'settled', reason: '已标记记录完成。不必为追齐数字强行进食。' };
  const margin = Math.max(TREND_POLICY.notableKcal, target * TREND_POLICY.notableShare);
  if (eaten > target + margin) return { ...base, state: 'over', direction: 'over', active: true,
    reason: '已记录摄入高于每日计划；后续正餐照常安排，按饥饿感调整份量。' };
  if (hour >= TREND_POLICY.lateHour) return { ...base, state: 'late',
    reason: '若尚未吃正餐，照常安排；晚间不必为凑数字强行加餐。' };
  return { ...base, reason: '目前记录不足以判断全天摄入；下一餐照常安排。' };
}

/** 同一份纠偏方向交给文案、推荐筛选和份量预算，避免各自判断。 */
export function correctionPlan({ trend, gaps, targets, hour }) {
  const split = macroSplit(targets, gaps);
  const protein = gaps.protein.remaining > 10;
  const fiber = gaps.fiber.remaining > 5;
  const fatHigh = gaps.fat.upperRemaining <= 0 || split.structure === 'fat';
  const carbLow = gaps.carb.remaining > 30 && split.structure !== 'carb';
  const carbHigh = split.structure === 'carb';
  const energyOver = gaps.kcal.remaining <= 0 || trend.direction === 'over';
  const active = trend.active && !trend.dayComplete;
  // 超计划不取消正常吃饭。蛋白不足时允许明确标注的少量食物选择，绝不伪装成剩余额度。
  const optionalProtein = gaps.kcal.remaining <= 0 && protein;
  const lean = fatHigh || energyOver;
  const nextMeal = trend.remainingMeals[0] || null;
  let action = '';
  if (trend.dayComplete) {
    action = '今天不必追齐计划数字；若饿了可按需少量进食，明天回到正常三餐。';

  } else if (active && trend.direction === 'under') {
    action = carbLow
      ? `${nextMeal?.label || '下一餐'}正常吃，在餐内增加一小份米饭、薯类或全谷主食${protein ? '，搭配鱼虾、去皮禽肉或低脂奶豆类' : ''}。`
      : `${nextMeal?.label || '下一餐'}保留正常主食，搭配一份鱼虾、去皮禽肉或奶豆类，增加食物种类。`;
    if (fatHigh) action += '脂肪已经偏高，优先少油主食和较瘦的蛋白来源，少选坚果、油炸和肥肉来补热量。';
    if (carbHigh && !fatHigh) action += '当前结构偏碳水，主食适量，搭配蛋白来源和蔬菜，不只增加米面。';
  } else if (active && trend.direction === 'over') {
    action = protein ? '后续餐次照常吃，优先选鱼虾、去皮禽肉或低脂奶豆类，搭配蔬菜；替换掉一部分油炸、肥肉和甜饮。'
      : '后续餐次照常安排主食、蛋白来源和蔬菜，少选油炸、肥肉和甜饮，按饱腹感决定份量。';
  } else if (optionalProtein) action = '如果还有一餐或感到饿，可选一小份较瘦的蛋白来源；这些食物仍有热量，不必强行补齐蛋白目标。';
  if (active && fiber) action += '在餐内加一份蔬菜或完整水果，主食可搭配全谷物。';
  if (active) action += hour >= 18 ? '晚间只做小幅调整，不必一餐补齐，也不需要跳餐或额外运动抵消。' : '分到后续餐次，不跳餐，也不需要额外运动抵消。';
  return { active, direction: trend.direction, dayComplete: trend.dayComplete, currentCovered: trend.currentCovered,
    protein, fiber, fatHigh, carbLow, carbHigh, lean, energyOver, optionalProtein, nextMeal, action };
}
