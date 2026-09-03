/**
 * 实时饮食建议引擎
 * 输入当日目标、已摄入、Apple 健康活动数据与当前时间，
 * 输出：状态判定 + 洞察 + 推荐食物（含具体份量）+ 应避免食物（含理由）。
 * 纯函数模块，不依赖 DOM。
 */

import { FOODS, per100, nutrientsFor, freeSugarPer100 } from '../data/foods.js';
import { clamp, round, ATWATER } from './nutrition.js';
import { macroSplit } from './metrics.js';
import { formatDuration } from './duration.js';
import { MEALS, paceNote, DEFAULT_RHYTHM_MODE } from './eating-rhythm.js';
import { todayKey } from './day.js';

/*
 * 餐次定义搬去了 core/eating-rhythm.js —— 时间窗和供能比就是「进食节奏」本身，
 * 那边的曲线要用它。这里再导出一遍，视图和测试的 import 路径不必跟着改。
 */
export { MEALS };

export const MEAL_LABEL = Object.fromEntries(MEALS.map((m) => [m.key, m.label]));

// 18:00 后不再把含咖啡因食品列为即时推荐，减少对当晚入睡和睡眠的潜在影响。
// 这是推荐系统的保守护栏，不代表个人对咖啡因的耐受或医学诊断。
export const CAFFEINE_CUTOFF_HOUR = 18;

// 防止临近一天结束时把此前没吃的热量全部塞进晚餐或夜宵。
// 这些只是产品护栏，不是营养学推荐值；日目标本身不会因此改变。
const MEAL_KCAL_CAP = {
  breakfast: 0.35, lunch: 0.45, snack: 0.18, dinner: 0.40, late: 0.10,
};
const MEAL_PROTEIN_CAP = {
  breakfast: 0.40, lunch: 0.50, snack: 0.25, dinner: 0.45, late: 0.25,
};

const MAIN_MEAL_CATS = new Set(['dish', 'chain', 'staple']);
const LIGHT_MEAL_CATS = new Set(['dairy', 'fruit', 'nut', 'drink', 'snack', 'egg', 'soy']);
const PREPARED_NAME = /(熟|水煮|白煮|烤|蒸|炖|焖|煎|炒|卤|拌|汤|粥|饭|面|粉|饺|包|罐头|即食)/;

/** 从营养数字自动推导标签，避免与手工标记冲突 */
export function deriveTags(food) {
  const p = per100(food);
  const tags = new Set(food.f || []);
  const density = p.kcal; // kcal / 100g
  const proteinRatio = p.kcal > 0 ? (p.protein * ATWATER.protein) / p.kcal : 0;

  const freeSugar = freeSugarPer100(food);
  // 纤维要看「每 100 kcal 含多少」：薯片每 100g 有 4g 纤维，但那是 548 kcal 换来的
  const fiberPer100kcal = p.kcal > 0 ? (p.fiber / p.kcal) * 100 : 0;
  const sugarRatio = p.kcal > 0 ? (freeSugar * ATWATER.carb) / p.kcal : 0;

  if (p.protein >= 15 || (proteinRatio >= 0.3 && p.protein >= 8)) tags.add('high-protein');
  if (proteinRatio >= 0.45) tags.add('protein-dense');
  if (density <= 80) tags.add('low-density');
  if (density >= 300) tags.add('high-density');
  if (fiberPer100kcal >= 2 && p.fiber >= 1) tags.add('high-fiber');
  if (freeSugar >= 8 || (sugarRatio >= 0.3 && freeSugar >= 5)) tags.add('high-sugar');
  if (p.sodium >= 600) tags.add('high-sodium');
  if (p.fat >= 20) tags.add('high-fat');
  if (Number(food.caffeineMg) > 0) tags.add('caffeinated');
  return tags;
}

/** 单次进食的合理份量上限（g），防止推荐出「一次吃 700g 沙拉」这种建议 */
const PORTION_CAP = {
  meat: 220, seafood: 250, egg: 180, dairy: 500, soy: 300,
  staple: 350, veg: 300, fruit: 300, nut: 40, drink: 500,
  snack: 80, dish: 450, other: 30,
};

const TAG_CACHE = new WeakMap();
function tagsOf(food) {
  let t = TAG_CACHE.get(food);
  if (!t) {
    t = deriveTags(food);
    TAG_CACHE.set(food, t);
  }
  return t;
}

/** 当前时刻落在哪一餐 */
/*
 * 「补蛋白 / 补纤维」这两张筛选表。
 *
 * 排序按**每 100 kcal 能拿到多少**，不按每 100g 的绝对量。
 * 补蛋白时真正的约束是热量预算：牛肉干每 100g 有 45g 蛋白，可也有 400 kcal，
 * 晚上照它补 40g 蛋白要顺带吃进 350 kcal，热量早就超了。
 * 同一个道理，薯片每 100g 有 4g 纤维，但那是 548 kcal 换来的。
 *
 * 先用 deriveTags 的门槛筛掉「其实算不上这一类」的，再按密度排 ——
 * 只按密度排的话黄瓜会排在鸡胸肉前面。
 */
const FOCUS_SPECS = {
  protein: { tag: 'high-protein', label: '补蛋白', per: (p) => (p.kcal > 0 ? (p.protein / p.kcal) * 100 : 0) },
  fiber: { tag: 'high-fiber', label: '补纤维', per: (p) => (p.kcal > 0 ? (p.fiber / p.kcal) * 100 : 0) },
};

export const FOCUS_LABEL = Object.fromEntries(
  Object.entries(FOCUS_SPECS).map(([k, v]) => [k, v.label]),
);

/*
 * 调味料和补剂不进这张表。
 *
 * cat: 'other' 装的是食用油、生抽、白砂糖、肌酸和 BCAA —— 没有一样是
 * 「我该吃点什么补上」的答案。BCAA 尤其不该排在第一：它按每 100 kcal
 * 的氨基酸含量确实最高，但那是三种氨基酸，不是完整蛋白，
 * 在全天蛋白够的前提下补它对合成没有额外作用。
 */
const FOCUS_EXCLUDE_CATS = new Set(['other']);

/** 某一类「补什么」的候选食物，密度高的排前面 */
export function focusFoods(key, foods = [], limit = 60) {
  const spec = FOCUS_SPECS[key];
  if (!spec) return [];
  return foods
    .filter((f) => !FOCUS_EXCLUDE_CATS.has(f.cat) && deriveTags(f).has(spec.tag))
    .map((f) => ({ food: f, density: spec.per(per100(f)) }))
    .sort((a, b) => b.density - a.density)
    .slice(0, limit)
    .map((x) => x.food);
}

export function currentMeal(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  for (const m of MEALS) if (h < m.endHour) return m;
  return MEALS[MEALS.length - 1];
}

/** 今天还剩哪些餐次（含当前餐） */
export function remainingMeals(now = new Date()) {
  const cur = currentMeal(now);
  const idx = MEALS.findIndex((m) => m.key === cur.key);
  return MEALS.slice(idx);
}

/** 「一份」这类量词里带了「一」，换算倍数时要去掉才通顺 */
function portionPhrase(name, mult) {
  if (mult === 1) return name;
  const unit = name.replace(/^一/, '') || name;
  if (mult === 0.5) return `半${unit}`;
  return `${mult} ${unit}`;
}

/** 把克数吸附到该食物的常用份量上，让建议更好执行 */
function snapToServing(food, grams, maxGrams = Infinity) {
  const unit = food.basis === '100ml' ? 'ml' : 'g';
  /*
   * 上限来自「剩余热量 ÷ 每 100g 热量」，是个浮点数。
   * 直接 Math.min 会让上限那一侧原样漏出去，界面上就出现
   * 「海鲜粥 384.00000000000006g」这种数——先取整再比较，且不越过上限。
   */
  const rounded = Math.min(Math.round(grams / 5) * 5, Math.floor(maxGrams));
  let best = { grams: rounded, label: `${rounded} ${unit}`, exact: false };
  for (const [name, g] of food.s || []) {
    for (const mult of [0.5, 1, 1.5, 2, 3]) {
      const cand = g * mult;
      if (cand > maxGrams + 0.01) continue;
      if (Math.abs(cand - grams) <= Math.max(grams * 0.28, 15)) {
        const label = portionPhrase(name, mult);
        if (!best.exact || Math.abs(cand - grams) < Math.abs(best.grams - grams)) {
          best = { grams: Math.round(cand), label: `${label}（约 ${Math.round(cand)} ${unit}）`, exact: true };
        }
      }
    }
  }
  return best;
}

/**
 * 计算这一餐应该给多少预算。
 * 把剩余热量按剩余餐次的份额权重分配，而不是平均分。
 */
export function mealBudget({
  kcalLeft, proteinLeft, dailyKcal = null, proteinTarget = null, now = new Date(),
}) {
  const rest = remainingMeals(now);
  const totalShare = rest.reduce((s, m) => s + m.share, 0) || 1;
  const cur = rest[0];
  const ratio = cur.share / totalShare;
  const allocatedKcal = Math.max(kcalLeft, 0) * ratio;
  const kcalCeiling = Number(dailyKcal) > 0
    ? Number(dailyKcal) * (MEAL_KCAL_CAP[cur.key] || 0.45) : Infinity;
  const kcal = round(Math.min(allocatedKcal, kcalCeiling));
  const allocatedProtein = Math.max(proteinLeft, 0) * ratio;
  const proteinCeiling = Number(proteinTarget) > 0
    ? Number(proteinTarget) * (MEAL_PROTEIN_CAP[cur.key] || 0.5) : Infinity;
  const requestedProtein = round(Math.min(allocatedProtein, proteinCeiling), 1);
  // 蛋白质本身至少提供 4 kcal/g。分别计算两个缺口会生成“42 kcal 补 16g 蛋白”
  // 这种物理上不可能的指令，因此先用热量约束住这一餐可显示的蛋白预算。
  const maxProteinByKcal = round(kcal / ATWATER.protein, 1);
  const proteinFeasible = requestedProtein <= maxProteinByKcal + 0.05;
  return {
    meal: cur,
    kcal,
    protein: round(Math.min(requestedProtein, maxProteinByKcal), 1),
    requestedProtein,
    maxProteinByKcal,
    proteinFeasible,
    restMealCount: rest.length,
    timeCapped: allocatedKcal > kcalCeiling + 0.5 || allocatedProtein > proteinCeiling + 0.05,
  };
}

/**
 * 给单个食物打分。分数越高越推荐。
 * @returns {null|object} 不适合时返回 null
 */
function scoreFood(food, ctx) {
  const p = per100(food);
  const tags = tagsOf(food);
  const { budget, gaps, goal, hour, isTrainingDay, recentIds, kcalLeft, proteinLeft } = ctx;

  // 调味料和纯油糖不作为"吃什么"的推荐
  if (food.cat === 'other') return null;
  if (tags.has('alcohol')) return null;
  if (hour >= CAFFEINE_CUTOFF_HOUR && tags.has('caffeinated')) return null;

  // “现在吃什么”不能把明确标注为生的肉和水产当成可直接入口的食物。
  // 这类条目仍保留在搜索与记账中，只从即时推荐里排除。
  const explicitRaw = food.state === 'raw' || /[（(]生[）)]/.test(food.name);
  if (explicitRaw) return null;

  // 建议份量：一餐由多样食物组成，单品只承担这一餐的一部分
  let grams;
  const defaultGrams = food.s?.[0]?.[1] || 100;
  const perItemProtein = Math.min(budget.protein * 0.6, 40);
  if (p.protein >= 5 && perItemProtein > 3) {
    const needed = (perItemProtein / p.protein) * 100;
    grams = clamp(needed, defaultGrams * 0.5, defaultGrams * 2);
  } else {
    grams = defaultGrams;
  }
  // 不能超出这一餐的热量预算，也不能超出全天剩余
  const kcalCap = Math.max(0, Math.min(kcalLeft, Math.max(budget.kcal, 150) * 0.8));
  const maxByKcal = p.kcal > 0 ? (kcalCap / p.kcal) * 100 : grams;
  const servingCap = Math.min(maxByKcal, PORTION_CAP[food.cat] || 300);
  grams = Math.min(grams, servingCap);
  if (grams < defaultGrams * 0.25 || grams < 10) return null;

  // 常用份量吸附也必须服从热量与分类上限；否则 450g 会再次跳成 1.5 份 525g。
  const snapped = snapToServing(food, grams, servingCap);
  const nut = nutrientsFor(food, snapped.grams);
  if (nut.kcal > Math.max(kcalLeft, 0) * 1.02) return null;
  if (nut.kcal > Math.max(budget.kcal, 200) * 0.95) return null;

  let score = 0;
  const reasons = [];

  // 1) 补蛋白的贡献（蛋白缺口越大权重越高）
  const proteinNeed = Math.max(proteinLeft, 0);
  const proteinWeight = proteinNeed > 0 ? clamp(proteinNeed / Math.max(gaps.protein.target * 0.35, 1), 0.3, 2.2) : 0.2;
  const proteinFill = proteinNeed > 0 ? clamp(nut.protein / Math.max(perItemProtein, 1), 0, 1.3) : 0;
  score += proteinFill * 42 * proteinWeight;
  if (nut.protein >= 15) reasons.push(`+${nut.protein}g 蛋白`);

  // 2) 蛋白性价比：每 100 kcal 能拿到多少蛋白
  const proteinPer100kcal = nut.kcal > 0 ? (nut.protein / nut.kcal) * 100 : 0;
  score += clamp(proteinPer100kcal, 0, 22) * 1.6;
  if (proteinPer100kcal >= 12) reasons.push(`每 100 kcal 含 ${round(proteinPer100kcal, 1)}g 蛋白`);

  // 3) 热量契合度：正好落在这餐预算内最好
  const target = Math.max(budget.kcal * 0.55, 110);
  const fit = 1 - Math.abs(nut.kcal - target) / target;
  score += clamp(fit, -1, 1) * 14;

  // 4) 目标导向
  if (goal === 'cut') {
    if (tags.has('low-density')) { score += 10; reasons.push('能量密度低、饱腹感强'); }
    if (tags.has('high-fiber')) { score += 8; reasons.push(`含 ${nut.fiber}g 膳食纤维`); }
    if (tags.has('high-density')) score -= 12;
  } else if (goal === 'bulk') {
    if (nut.kcal >= target * 0.7 && nut.protein >= 12) { score += 10; reasons.push('热量与蛋白都够，适合增肌'); }
    if (tags.has('low-density') && nut.protein < 8) score -= 8;
  }

  // 5) 微量营养约束：已超标的项要扣分
  if (gaps.sodium.remaining < gaps.sodium.target * 0.25) {
    score -= clamp(nut.sodium / 120, 0, 20);
  }
  if (gaps.sugar.remaining < 8) {
    score -= clamp(nut.sugar / 3, 0, 18);
  }
  if (gaps.fiber.remaining > 8 && nut.fiber >= 3) {
    score += 6;
    if (!reasons.some((r) => r.includes('纤维'))) reasons.push(`补 ${nut.fiber}g 纤维`);
  }
  if (gaps.fat.upperRemaining < 5 && nut.fat > 10) score -= 12;
  if (gaps.carb.remaining < 15 && nut.carb > 25) score -= 10;

  // 6) 加工与烹饪方式
  if (tags.has('fried')) score -= 14;
  if (tags.has('processed')) score -= 7;
  if (tags.has('sweetdrink')) score -= 16;
  if (tags.has('whole')) { score += 5; reasons.push('全谷物'); }

  // 7) 时段适配：不同餐次不只改变标题和预算，也真正改变候选食物的排序与筛选。
  const mealKey = budget.meal.key;
  const prepared = food.state === 'ready' || food.state === 'cooked' || PREPARED_NAME.test(food.name);
  const needsCooking = !prepared && (tags.has('cook')
    || ((food.cat === 'meat' || food.cat === 'seafood') && !tags.has('quick')));
  if (mealKey === 'breakfast') {
    if (needsCooking) return null;
    if (!tags.has('breakfast') && !LIGHT_MEAL_CATS.has(food.cat)) return null;
    if (tags.has('breakfast')) { score += 24; reasons.unshift('适合早餐'); }
    else if (tags.has('quick') || prepared) { score += 10; reasons.unshift('早餐时段方便食用'); }
    else score -= 6;
  }
  if (mealKey === 'lunch' || mealKey === 'dinner') {
    const mealLabel = MEAL_LABEL[mealKey];
    const mainMealFood = MAIN_MEAL_CATS.has(food.cat)
      || (prepared && ['meat', 'seafood', 'egg', 'soy', 'veg'].includes(food.cat));
    if (mainMealFood) {
      score += food.cat === 'dish' || food.cat === 'chain' ? 24 : 12;
      reasons.unshift(`适合${mealLabel}`);
    } else {
      score -= LIGHT_MEAL_CATS.has(food.cat) ? 14 : 8;
    }
    if (needsCooking) score -= 10;
    if (mealKey === 'dinner' && (tags.has('fried') || tags.has('high-fat'))) score -= 8;
  }
  if (mealKey === 'snack') {
    if (needsCooking || !LIGHT_MEAL_CATS.has(food.cat)) return null;
    score += 16; reasons.unshift('适合加餐，方便少量食用');
    if (nut.kcal > 250) score -= 8;
  }
  if (mealKey === 'late' || hour >= 21) {
    const lateReady = tags.has('late')
      || ((tags.has('quick') || prepared) && LIGHT_MEAL_CATS.has(food.cat));
    if (!lateReady || needsCooking || nut.kcal > 260 || nut.fat > 12) return null;
    score += 18;
    reasons.unshift('适合夜间少量食用');
  }

  // 8) 训练日补碳水
  if (isTrainingDay && nut.carb >= 25 && gaps.carb.remaining > 40) {
    score += 7;
    reasons.push('训练日补充糖原');
  }

  // 9) 重复度：今天已经吃过的降权，保证多样性
  if (recentIds.has(food.id)) score -= 18;

  if (!reasons.length) reasons.push(`${nut.kcal} kcal / ${nut.protein}g 蛋白`);

  return {
    food,
    grams: snapped.grams,
    portionLabel: snapped.label,
    nutrients: nut,
    score: round(score, 1),
    reasons: reasons.slice(0, 3),
    tags: [...tags],
  };
}

/** 把蛋白缺口翻译成"相当于多少食物"，让数字更有体感 */
function proteinEquivalent(grams) {
  if (grams <= 0) return null;
  const PER_EGG = 7.3;          // 一个鸡蛋约 7.3g 蛋白
  const PER_G_CHICKEN = 0.295;  // 鸡胸肉每克约 0.295g 蛋白
  return {
    eggs: Math.round(grams / PER_EGG),
    chickenGrams: Math.round(grams / PER_G_CHICKEN / 10) * 10,
  };
}

/**
 * 主入口：生成完整建议
 * @param {object} input
 *  - targets      dailyTargets() 的结果
 *  - intake       今日已摄入营养汇总
 *  - entries      今日饮食条目（用于多样性判断）
 *  - profile      身体信息
 *  - health       今日 Apple 健康数据 { activeEnergy, steps, exerciseMinutes, restingEnergy, weight }
 *  - baseline     近期基线 { activeEnergy, kcalIntake, proteinIntake, proteinHitDays, weightTrend }
 *  - now          当前时间
 */
export function buildAdvice(input) {
  const {
    targets,
    intake,
    entries = [],
    profile = {},
    health = {},
    baseline = {},
    now = new Date(),
    // 看历史日期时「今天还没同步」「今天还没记饮水」这类提醒都不该出现
    isToday = true,
    waterCount = null,
    // 近三周的饮食记录，只有「按我平常」那套口径要用（判断这个钟点该吃到多少）
    rhythmEntries = [],
  } = input;

  const gaps = {};
  for (const k of ['kcal', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium']) {
    const target = Number(targets[k]) || 0;
    const eaten = Number(intake[k]) || 0;
    gaps[k] = { target, eaten: round(eaten, 1), remaining: round(target - eaten, 1), pct: target > 0 ? round((eaten / target) * 100) : 0 };
    if (k === 'fat') {
      const upper = Number(targets.fatUpper) || target;
      gaps[k].upper = round(upper, 1);
      gaps[k].upperRemaining = round(upper - eaten, 1);
      gaps[k].upperPct = upper > 0 ? round((eaten / upper) * 100) : 0;
    }
  }

  const kcalLeft = gaps.kcal.remaining;
  const proteinLeft = gaps.protein.remaining;
  const hour = now.getHours() + now.getMinutes() / 60;
  const budget = mealBudget({
    kcalLeft, proteinLeft, dailyKcal: targets.kcal, proteinTarget: targets.protein, now,
  });
  // 活动能量已经被判为不可信时不能拿它推断训练日，
  // 否则会出现「凌晨躺床上却被告知今天是训练日、该补蛋白和碳水」这种事
  const isTrainingDay = (health.exerciseMinutes || 0) >= 30
    || (!targets.activeCapped && baseline.activeEnergy > 0
      && (health.activeEnergy || 0) > baseline.activeEnergy * 1.25);

  const ctx = {
    budget,
    gaps,
    goal: targets.goal,
    hour,
    isTrainingDay,
    recentIds: new Set(entries.map((e) => e?.foodId).filter(Boolean)),
    kcalLeft,
    proteinLeft,
  };

  // ---- 推荐 ----
  const scored = [];
  for (const food of FOODS) {
    const s = scoreFood(food, ctx);
    if (s && s.score > 0) scored.push(s);
  }
  scored.sort((a, b) => b.score - a.score);
  const recommend = [];
  const catCount = {};
  for (const item of scored) {
    catCount[item.food.cat] = (catCount[item.food.cat] || 0) + 1;
    if (catCount[item.food.cat] > 2) continue;
    recommend.push(item);
    if (recommend.length >= 6) break;
  }

  // ---- 避免 ----
  // ---- 状态判定 ----
  const hasIntake = (entries || []).length > 0
    || ['kcal', 'protein', 'fat', 'carb'].some((key) => Number(gaps[key]?.eaten) > 0);
  const status = judgeStatus({
    gaps, kcalLeft, hour, targets, budget, hasIntake,
    rhythmMode: profile.rhythmMode, rhythmEntries, asOf: todayKey(now),
  });

  // ---- 洞察 ----
  const insights = buildInsights({
    gaps, targets, health, baseline, profile, now, isTrainingDay, budget, entries,
    isToday, waterCount,
  });

  return {
    generatedAt: now.toISOString(),
    gaps,
    budget,
    isTrainingDay,
    status,
    insights,
    recommend,
    proteinEquivalent: proteinEquivalent(proteinLeft),
  };
}

/*
 * 主卡最上面那一段，**只说热量**。
 *
 * 它回答的是「今天吃的热量够不够、能不能走到计划要的那个速度」——
 * 一个问题一句话。原先这里还会抢着说蛋白缺口和钠超标：那两条在
 * 「今日提示」里本来就各有一条，同一件事在一屏里说两遍，
 * 而且会把热量的结论挤掉（钠超标 11% 就能顶掉「今天还差 900 kcal」）。
 * 蛋白、钠、纤维、糖一律归 buildInsights。
 */
export function judgeStatus({
  gaps, kcalLeft, hour, targets, budget, hasIntake = true,
  rhythmMode = DEFAULT_RHYTHM_MODE, rhythmEntries = [], asOf = null,
}) {
  const kcalPct = gaps.kcal.pct;
  /*
   * 这个钟点该吃到多少，由 core/eating-rhythm.js 说了算。
   *
   * 原先这里是 `(hour-6)/16` —— 一条匀速直线，等于假设人从早到晚均匀地吃。
   * 没有一个人是这样的：按它算，中午 12 点该吃到 37.5%，而三餐比例下
   * 一顿午饭吃完就该到 60%，同一个人会被这条直线判成「吃得快了」。
   */
  const pace = paceNote({
    mode: rhythmMode, hour, eatenPct: kcalPct, entries: rhythmEntries, asOf,
  });
  const dayProgress = pace.share;
  const expected = pace.should;

  if (kcalLeft < -targets.kcal * 0.12) {
    return {
      // 热量目标是计划区间，不是安全上限。单日偏高用橙色提醒即可；
      // 红色只留给钠、游离糖等真正的上限，避免诱导跳餐或补偿性节食。
      level: 'warn',
      headline: `今日比计划多 ${Math.abs(kcalLeft)} kcal`,
      detail: `已记录 ${gaps.kcal.eaten} kcal，今日计划为 ${gaps.kcal.target} kcal。单日偏差不能说明增减脂结果，不必跳过下一餐或明天补偿性少吃；如果一周内反复偏高，再结合 7 天体重趋势调整份量。`,
    };
  }
  if (kcalLeft < 0) {
    return {
      level: 'warn',
      headline: `热量刚好吃满并略超 ${Math.abs(kcalLeft)} kcal`,
      detail: `已记录 ${gaps.kcal.eaten} kcal，今日计划 ${gaps.kcal.target} kcal。这个幅度对计划几乎没有影响，今天无需补偿性少吃，下一餐回到正常预算即可。`,
    };
  }
  /*
   * 0 kcal 只说明「没有饮食记录」，不能据此断言这个人吃得慢。
   * 之前到下午会拿 0% 直接和时间进度比较，结果用户明明一口没记，界面却说
   * 「吃得慢一些」——既像在评价进食速度，也没有指出更可能的漏记。
   */
  if (!hasIntake) {
    const late = hour >= 21;
    // 没吃早餐时，剩余预算算法会把缺口按后续餐次重新分配，午餐数字因此可能接近
    // 全天的一半。那适合内部排预算，却不适合直接叫人一餐补回；空记录时只展示
    // 当前餐原本的日占比，避免出现「13:30 午餐建议 975 kcal」这种过量暗示。
    const normalMealKcal = round(Math.min(budget.kcal, targets.kcal * budget.meal.share));
    /*
     * 这一段只说热量。「漏记了就先补记」是数据质量的事，归今日提示第一条，
     * 在这儿再说一遍就是同一屏里写两次。
     */
    return {
      level: late ? 'warn' : 'good',
      headline: `还有 ${kcalLeft} kcal 热量余量`,
      detail: late
        ? `按计划今天要吃到 ${gaps.kcal.target} kcal。夜里不建议一次补完全天缺口，明天回到正常节奏即可。`
        : `按计划今天要吃到 ${gaps.kcal.target} kcal。${budget.meal.label}先按正常一餐安排，约 ${normalMealKcal} kcal，不必在这一餐补完当天缺口。`,
    };
  }
  if (kcalPct < expected - 30 && dayProgress > 0.5) {
    return {
      level: 'warn',
      headline: `还有 ${kcalLeft} kcal 没吃，偏少了`,
      detail: `若记录完整且长期大幅低于目标，可能增加恢复不足和瘦体重流失风险。接下来 ${budget.meal.label} 可先安排约 ${budget.kcal} kcal。`
        + (budget.timeCapped ? '不建议因为前面吃得少，就在这个时段一次补完全天缺口。' : ''),
    };
  }
  return {
    level: 'good',
    headline: `还有 ${kcalLeft} kcal 热量余量`,
    detail: `热量完成 ${kcalPct}%，${pace.text}。${budget.meal.label}建议 ${budget.kcal} kcal。`,
  };
}

/**
 * 今日提示的优先级。数字小的排前面。
 *
 * 一屏默认只放得下三条，所以「先说哪一条」本身就是判断：
 *  1 数据本身有问题 —— 漏记、没同步、数值不可信。它排最前面是因为
 *    下面每一条的可信度都取决于它：漏记半天的人，「热量还差 900」是假的。
 *  2 热量和蛋白 —— 今天真正要执行的两件事。
 *  3 明确的门槛 —— 钠、游离糖的上限，纤维的下限，都有公开出处。
 *  4 碳水脂肪的结构 —— 有很宽的合理区间，偏一点不是错误，所以排在门槛之后。
 *  5 活动、睡眠、饮水这类记录 —— 提醒性质，最后说。
 */
export const INSIGHT_PRIORITY = {
  data: 1, energy: 2, threshold: 3, split: 4, habit: 5,
};

/**
 * 结构化洞察条目。
 *
 * 每条都是三段：**当前情况**（title）、**判断依据**（basis）、**可执行建议**（action）。
 * 分开三段是因为原先它们糊在一句话里，读的人分不清哪句是事实、哪句是程序的推断 ——
 * 「吃得慢一些」当年就是这么混进来的：程序根本没有进餐时长数据，
 * 那句话没有任何依据，却和有依据的数字长得一模一样。
 */
export function buildInsights({
  gaps, targets, health, baseline, profile, now, isTrainingDay, budget, entries,
  isToday = true, waterCount = null,
}) {
  const list = [];
  const add = (type, priority, title, basis, action = '') => list.push({
    type,
    priority,
    title,
    basis,
    action,
    // text 是三段拼起来的整句，给只需要一段文字的地方用
    text: [basis, action].filter(Boolean).join(''),
  });
  const hour = now.getHours();

  /* ---------------- 1 数据本身有没有问题 ---------------- */

  /*
   * 漏记排在所有结论前面：下面每一条的分母都是它。
   * 半天没记的人看到「热量还差 900 kcal」，只会照着去多吃。
   */
  if (!entries.length && gaps.kcal.eaten <= 0 && hour >= 12) {
    add('warn', INSIGHT_PRIORITY.data, '今天尚无饮食记录',
      '下面所有的完成度都是从 0 算起的，漏记会让每一条建议都失真。',
      '若只是漏记，请先补记；若确实还没进食，下一餐按正常份量安排，不必一次补齐全天缺口。');
  }

  /*
   * 活动能量不可信时先把话说清楚，再谈预算。
   * 实测有人在凌晨 1 点被导入 2010 kcal 活动能量（近期日均 310），
   * 热量目标被顶到 4455。数值已经在 dynamicTDEE 那层挡掉了，但不说出来的话，
   * 用户只会看到一个正常的目标，不知道自己的快捷指令一直在取错数据。
   */
  if (targets.activeCapped) {
    add('warn', INSIGHT_PRIORITY.data, '今天的活动能量数值不可信',
      `健康数据里今天的活动能量是 ${round(targets.activeReported || 0)} kcal，`
      + `按现在的时间点算不可能达到（近期日均 ${round(baseline.activeEnergy || 0)} kcal）。`
      + '热量目标已改按平时的活动节奏估算。',
      '常见原因是取数快捷指令的日期范围没有选「今天」，把多天累加成了一天；也可能是单位或同步异常，请到「数据」页核对原始数值。');
  }

  // 没同步到活动能量，热量目标就退回公式估算——这件事得让人知道，而不是静默降级
  if (isToday && !targets.activeCapped && targets.tdeeSource !== 'apple') {
    add('warn', INSIGHT_PRIORITY.data, '今天还没有同步到活动能量',
      '热量目标暂时按活动系数估算，不是按设备记录算的。',
      '到设置的「数据管理」同步一次，目标会按今天实际的活动重新估。');
  }

  /*
   * 目标是怎么算出来的，依据够不够硬，得让用户看得到。
   * 年龄差 10 岁在 Mifflin-St Jeor 里就是 50 kcal，静默用兜底值等于悄悄编数据。
   */
  if (targets.ageEstimated) {
    add('warn', INSIGHT_PRIORITY.data, '年龄按 30 岁估算',
      '没有生日，静息能量只能用默认年龄算——年龄每差 10 岁就是 50 kcal。',
      '到设置里补上生日会更准。');
  }

  /* ---------------- 2 热量和蛋白 ---------------- */

  const proteinShort = gaps.protein.remaining;
  const kcalLeft = gaps.kcal.remaining;
  if (proteinShort > 0 && proteinShort * ATWATER.protein > kcalLeft + 1) {
    const need = round(proteinShort * ATWATER.protein);
    const minimumOver = Math.max(1, Math.ceil(need - kcalLeft));
    add('protein', INSIGHT_PRIORITY.energy, `剩下的热量补不齐这 ${round(proteinShort)}g 蛋白`,
      `蛋白质本身带热量：这些蛋白即使一点脂肪和碳水都不带也要 ${need} kcal，`
      + `而今天只剩 ${round(kcalLeft)} kcal。`,
      `可以守住热量余量，也可以优先补蛋白并接受大约 ${minimumOver} kcal 的超出；`
      + '不必为了凑数强行进食，明天把蛋白提前分到前几餐更省事。');
  } else if (proteinShort > 10) {
    const eq = proteinEquivalent(proteinShort);
    add('protein', INSIGHT_PRIORITY.energy, `蛋白还差 ${round(proteinShort)}g`,
      `${targets.proteinBasis}。`,
      `蛋白量约等于 ${eq.chickenGrams}g 鸡胸肉，或 ${eq.eggs} 个鸡蛋；这只是蛋白换算，实际选择还要计入总热量、脂肪和个人饮食偏好，可分到后续餐次完成。`);
  } else if (gaps.protein.pct >= 100) {
    add('good', INSIGHT_PRIORITY.energy, '蛋白已达标',
      `今日 ${gaps.protein.eaten}g / ${gaps.protein.target}g。`);
  }

  // 动态热量预算：把「今天的目标是按什么算的」讲清楚
  if (targets.tdeeSource === 'apple' && targets.staticTdee > 0) {
    const budgetDelta = round(targets.tdee - targets.staticTdee);
    const sourceText = targets.activeSource === 'formula-fallback'
      ? '按设备静息记录并用活动系数补足缺失活动'
      : targets.activeSource === 'device-baseline'
        ? '按设备静息记录与近期活动基线'
        : '按 Apple 设备估算值外推';
    if (Math.abs(budgetDelta) >= 80) {
      const up = budgetDelta > 0;
      add(up ? 'up' : 'down', INSIGHT_PRIORITY.energy,
        `热量目标比公式估算${up ? '高' : '低'} ${Math.abs(budgetDelta)} kcal`,
        `${sourceText}：${round(targets.tdee)} kcal，公式估算是 ${round(targets.staticTdee)} kcal。`);
    }
  }

  if (targets.carbBelowRda) {
    add('info', INSIGHT_PRIORITY.energy, `碳水目标 ${targets.carb}g，低于 IOM 推荐的 130g`,
      '蛋白和脂肪占得较多，把碳水挤到了这个水平以下。',
      '长期是否合适因人而异，可以适当把脂肪让出一些给碳水。');
  }

  /* ---------------- 3 明确的门槛 ---------------- */

  if (gaps.sodium.pct > 100) {
    add('warn', INSIGHT_PRIORITY.threshold,
      `钠已超出建议上限（${gaps.sodium.eaten}mg / ${gaps.sodium.target}mg）`,
      'WHO 成人钠摄入建议低于 2000 mg/天，约合 5g 食盐。',
      '余下餐次少选腌制品、加工肉和重口味汤汁。');
  }
  if (gaps.sugar.pct > 100) {
    add('warn', INSIGHT_PRIORITY.threshold,
      `游离糖已超出建议上限（${gaps.sugar.eaten}g / ${gaps.sugar.target}g）`,
      'WHO 建议游离糖低于总能量的 10%。',
      '先看含糖饮料、果汁和甜点。');
  }
  if (gaps.fiber.remaining > gaps.fiber.target * 0.5 && hour >= 14) {
    add('fiber', INSIGHT_PRIORITY.threshold,
      `膳食纤维偏低（${gaps.fiber.eaten}g / ${gaps.fiber.target}g）`,
      '中国成人参考 25–30g，现在过了大半天还不到一半。',
      '加一份蔬菜、完整水果或全谷物。');
  }

  /* ---------------- 4 碳水脂肪的结构 ---------------- */

  /*
   * 结构偏移不是错误，所以它排在门槛之后，也不用警告色。
   * 只在这一天真吃了不少东西之后才说：早饭一碗粥就判「偏碳水」，
   * 说的是那一顿，不是这一天。
   */
  const split = macroSplit(targets, gaps);
  if (split.structure === 'carb' || split.structure === 'fat') {
    const enough = split.kcal >= Math.max(400, (Number(targets.kcal) || 0) * 0.3);
    if (enough) {
      const heavy = split.structure === 'carb' ? '碳水' : '脂肪';
      const light = split.structure === 'carb' ? '脂肪' : '碳水';
      add('info', INSIGHT_PRIORITY.split, `今天的结构偏${heavy}`,
        `碳水和脂肪按热量算是 ${split.carbPct}% / ${split.fatPct}%，`
        + `碳水参考区间是 ${split.bandLo}–${split.bandHi}%。`,
        `不是问题，两者怎么分有很宽的合理区间；想贴近计划，下一餐把${light}多留一点。`);
    }
  }

  /* ---------------- 5 活动、睡眠、饮水 ---------------- */

  if (isTrainingDay) {
    add('info', INSIGHT_PRIORITY.habit, '今天是训练日',
      `锻炼 ${round(health.exerciseMinutes || 0)} 分钟`
      + (targets.activeCapped ? '' : `、活动能量 ${round(health.activeEnergy || 0)} kcal`)
      + '。',
      '每日总蛋白和分餐分配更重要；可把一餐约 20–40g 蛋白安排在训练前后，按耐受和饮食习惯调整。');
  }

  // 睡眠：只在设备真的记到的时候说，缺数据不等于没睡
  const sleep = Number(health.sleepMinutes);
  if (Number.isFinite(sleep) && sleep > 0 && sleep < 390) {
    add('info', INSIGHT_PRIORITY.habit, `昨晚睡了 ${formatDuration(sleep)}`,
      'AASM / SRS 共识建议成年人规律睡够至少 7 小时；设备记录的时长不能代表睡眠质量。',
      '若今天明显困倦或恢复不佳，可降低训练量或强度；若状态正常，不必只凭一晚数据自动取消训练。');
  }

  /*
   * 饮水这条说的是「记录」，不是「你水喝少了」。
   * 次数只代表主动饮水的行为，饮料、汤、粥里的水分同样被吸收，
   * 拿它当水分是否充足的判据是错的 —— 所以措辞只能停在「还没记过」。
   */
  if (isToday && hour >= 18 && Number(waterCount || 0) <= 0) {
    add('info', INSIGHT_PRIORITY.habit, '今天还没有记录饮水',
      '这里只数主动喝水的次数，不代表你今天没喝——汤、粥、饮料里的水分同样被吸收。',
      '喝了就在饮食页点一下，攒够几天才看得出自己的节奏。');
  }

  /*
   * 「近 N 天日均摄入」「蛋白达标几天」「体重趋势 x kg/周」原先都在这里出现一次，
   * 数据页的热量 / 蛋白 / 体重三张图下面又各说了一遍，而且图那边说得更全。
   * 今日提示只回答「今天怎么样」，走势归数据页。
   */

  // 同优先级保持写下来的顺序：sort 在这里是稳定的
  return list.sort((a, b) => a.priority - b.priority);
}
