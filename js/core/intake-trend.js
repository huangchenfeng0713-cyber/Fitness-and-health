/** 今日摄入趋势：沿用三餐参照和当天目标，只输出有条件的范围，不输出概率分。 */
import { personalMealReference, GUIDELINE_MEALS } from './eating-rhythm.js';
import { todayKey } from './day.js';
import { macroSplit } from './metrics.js';

// 产品提醒护栏，非生理阈值或经过校准的统计置信区间。
export const TREND_POLICY = Object.freeze({ graceHours: 0.75, notableShare: 0.12, notableKcal: 250, lateHour: 21 });
const positive = n => Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0;
const quantile = (values, p) => {
  const a = [...values].sort((x, y) => x - y);
  if (!a.length) return 0;
  const pos = (a.length - 1) * p, i = Math.floor(pos);
  return a[i] + ((a[i + 1] ?? a[i]) - a[i]) * (pos - i);
};
const label = key => ({ breakfast: '早餐', lunch: '午餐', dinner: '晚餐' })[key];

export function intakeTrend({ targets = {}, intake = {}, entries = [], rhythmEntries = [], now = new Date(), isToday = true, enabled = true, burnedNow = null } = {}) {
  const target = positive(targets.kcal), eaten = positive(intake.kcal);
  const date = todayKey(now), hour = now.getHours() + now.getMinutes() / 60;
  const personal = personalMealReference(rhythmEntries, { asOf: date });
  const meals = personal.meals || GUIDELINE_MEALS;
  const source = personal.meals ? 'personal' : 'guideline';
  const basis = source === 'personal' ? `最近 ${personal.days} 个有效记录日的三餐节奏` : '固定三餐参照（个人有效记录不足 7 天）';
  // burnedNow 由调用方排除过期、缺字段和不可信的设备快照；不能用全天外推值代替。
  const burn = isToday && enabled && Number.isFinite(burnedNow) && burnedNow > 0 ? burnedNow : null;
  const base = { state: 'uncertain', active: false, direction: null, range: null, source, days: personal.days, basis, remainingMeals: [], target, eaten,
    burnedNow: burn, currentCovered: burn != null && eaten >= burn, dayComplete: isToday && hour >= TREND_POLICY.lateHour };
  if (!isToday) return { ...base, state: 'historical', reason: '历史日期只展示记录，不预测接下来的摄入。' };
  if (!enabled || !target) return { ...base, reason: '先完善身体资料，再判断今日摄入趋势。' };
  const todayEntries = entries.filter(e => e && e.date === date && positive(e.kcal) > 0);
  const byMeal = new Map();
  let latest = -Infinity, timedKcal = 0;
  for (const e of todayEntries) {
    const time = new Date(e.time || '');
    if (!Number.isFinite(time.getTime()) || todayKey(time) !== date || time > now) continue;
    const h = time.getHours() + time.getMinutes() / 60;
    latest = Math.max(latest, h);
    timedKcal += positive(e.kcal);
    byMeal.set(e.meal, (byMeal.get(e.meal) || 0) + positive(e.kcal));
  }
  const remainingMeals = meals.filter(m => hour < m.endHour && !(byMeal.get(m.key) >= 100));
  const info = { ...base, dayComplete: base.dayComplete || !remainingMeals.length,
    remainingMeals: remainingMeals.map(m => ({ ...m, label: label(m.key) })) };
  if (todayEntries.some(e => new Date(e.time || '') > now)) return {
    ...info, currentCovered: false, reason: '今天含有未来时间的饮食条目，先核对哪些已经吃过，再判断全天走势。',
  };
  if (hour >= TREND_POLICY.lateHour) return { ...info, state: 'late', reason: '今晚不必追齐数字；若饿了可少量进食，明天回到正常三餐。' };
  const margin = Math.max(TREND_POLICY.notableKcal, target * TREND_POLICY.notableShare);
  // 已经明显超过全天计划是记录事实，不需要把缺失记录误当成零来预测。
  if (eaten > target + margin) {
    if (!remainingMeals.length) return {
      ...info, state: 'settled', reason: '今天不再追着计划差额调整，明天回到正常三餐。',
    };
    return { ...info, state: 'over', active: true, direction: 'over', reason: '当前已记录摄入已明显高于今日计划，后续餐次仍正常安排。' };
  }
  if (timedKcal < Math.max(400, target * 0.2) || Math.abs(timedKcal - eaten) > Math.max(50, eaten * 0.1)
    || meals.filter(m => byMeal.get(m.key) >= 100).length < 2) {
    return info.dayComplete
      ? { ...info, state: 'settled', reason: '今天的记录可能尚未记全，先核对是否漏记；不必为计划差额额外加餐。' }
      : { ...info, reason: '当前记录还不足以判断全天走势；先核对是否漏记，下一餐照常安排。' };
  }
  const grace = TREND_POLICY.graceHours;
  const insideMeal = h => meals.some(m => h >= m.startHour && h < m.endHour + grace && !(byMeal.get(m.key) >= 100 && latest < h - grace));
  // 刚记餐、餐窗尚未结束、已过餐窗却没有该餐记录：不把短暂进度差当成全天偏离。
  if (hour - latest < grace || insideMeal(hour)
    || meals.some(m => hour >= m.endHour + grace && !(byMeal.get(m.key) >= 100))) {
    return { ...info, state: info.dayComplete ? 'settled' : 'watch', reason: '餐次可能仍在进行或尚未记全，暂不提醒调整。' };
  }
  const remainingKeys = new Set(remainingMeals.map(m => m.key));
  const plannedShare = remainingMeals.reduce((s, m) => s + m.share, 0);
  const samples = (personal.dailyShares || []).filter(d => [...remainingKeys].every(k => d[k] != null))
    .map(d => [...remainingKeys].reduce((s, k) => s + d[k], 0));
  const typical = samples.length >= 7 ? quantile(samples, 0.5) : plannedShare;
  // 范围包含个人日间结构变化和额外误差空间。无个人样本时留更宽余地。
  const slack = samples.length >= 7 ? 0.10 : 0.18;
  const lowShare = Math.max(0, Math.min(typical, samples.length >= 7 ? quantile(samples, 0.15) : typical) - slack);
  const highShare = Math.min(1, Math.max(typical, samples.length >= 7 ? quantile(samples, 0.85) : typical) + slack);
  const low = eaten + target * lowShare, high = eaten + target * highShare;
  const range = { low: Math.max(Math.round(eaten), Math.floor(low / 50) * 50), high: Math.ceil(high / 50) * 50 };
  const direction = high < target - margin ? 'under' : low > target + margin ? 'over' : null;
  const forecast = { ...info, range, reason: `若后续主餐延续${basis}，全天可能落在这个范围；漏记或临时加餐会改变结果。` };
  if (!remainingMeals.length) return { ...forecast, state: 'settled', reason: '今天不必追齐计划差额；按饥饿感决定是否少量加餐，明天照常安排三餐。' };
  if (!direction) return { ...forecast, state: 'steady' };
  // 当前这顿已记录且至少经过 45 分钟，参照阶段也保持了 45 分钟，才确认持续偏离。
  const priorHour = hour - grace;
  if (insideMeal(priorHour) || remainingMeals.some(m => priorHour >= m.startHour)) {
    return { ...forecast, state: 'watch', reason: '先留出餐后观察时间，暂不提醒调整。' };
  }
  if (direction === 'under' && base.currentCovered) return { ...forecast, state: 'covered',
    reason: '已记录摄入覆盖当前消耗，暂不必为达到计划额外加餐；当前收支会随消耗继续变化，后续正餐照常安排。' };
  return { ...forecast, direction, state: direction, active: true };
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
  const active = trend.active && !trend.dayComplete && !(trend.direction === 'under' && trend.currentCovered);
  // 超计划不取消正常吃饭。蛋白不足时允许明确标注的少量食物选择，绝不伪装成剩余额度。
  const optionalProtein = gaps.kcal.remaining <= 0 && protein;
  const lean = fatHigh || energyOver;
  const nextMeal = trend.remainingMeals[0] || null;
  let action = '';
  if (trend.dayComplete) {
    action = '今天不必追齐计划数字；若饿了可按需少量进食，明天回到正常三餐。';
  } else if (trend.currentCovered && gaps.kcal.remaining > 0 && !active) {
    action = '当前摄入已覆盖设备记录的消耗，暂不必为目标额外加餐；后续正餐照常安排，按饥饿感决定份量。';
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
