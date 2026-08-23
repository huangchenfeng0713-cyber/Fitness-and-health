/**
 * 实时饮食建议引擎
 * 输入当日目标、已摄入、Apple 健康活动数据与当前时间，
 * 输出：状态判定 + 洞察 + 推荐食物（含具体份量）+ 应避免食物（含理由）。
 * 纯函数模块，不依赖 DOM。
 */

import { FOODS, per100, nutrientsFor, freeSugarPer100 } from '../data/foods.js';
import { clamp, round, ATWATER } from './nutrition.js';

/** 餐次定义：时间窗 + 该餐在全天热量中的默认占比 */
export const MEALS = [
  { key: 'breakfast', label: '早餐', endHour: 10.5, share: 0.25 },
  { key: 'lunch', label: '午餐', endHour: 14.5, share: 0.35 },
  { key: 'snack', label: '加餐', endHour: 17.5, share: 0.10 },
  { key: 'dinner', label: '晚餐', endHour: 21, share: 0.30 },
  { key: 'late', label: '夜宵', endHour: 24, share: 0.05 },
];

export const MEAL_LABEL = Object.fromEntries(MEALS.map((m) => [m.key, m.label]));

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
function snapToServing(food, grams) {
  let best = { grams: Math.round(grams / 5) * 5, label: `${Math.round(grams / 5) * 5} g`, exact: false };
  for (const [name, g] of food.s || []) {
    for (const mult of [0.5, 1, 1.5, 2, 3]) {
      const cand = g * mult;
      if (Math.abs(cand - grams) <= Math.max(grams * 0.28, 15)) {
        const label = portionPhrase(name, mult);
        if (!best.exact || Math.abs(cand - grams) < Math.abs(best.grams - grams)) {
          best = { grams: Math.round(cand), label: `${label}（约 ${Math.round(cand)} g）`, exact: true };
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
export function mealBudget({ kcalLeft, proteinLeft, now = new Date() }) {
  const rest = remainingMeals(now);
  const totalShare = rest.reduce((s, m) => s + m.share, 0) || 1;
  const cur = rest[0];
  const ratio = cur.share / totalShare;
  const kcal = round(Math.max(kcalLeft, 0) * ratio);
  const requestedProtein = round(Math.max(proteinLeft, 0) * ratio, 1);
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
  grams = Math.min(grams, maxByKcal, PORTION_CAP[food.cat] || 300);
  if (grams < defaultGrams * 0.25 || grams < 10) return null;

  const snapped = snapToServing(food, grams);
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
  if (gaps.fat.remaining < 5 && nut.fat > 10) score -= 12;
  if (gaps.carb.remaining < 15 && nut.carb > 25) score -= 10;

  // 6) 加工与烹饪方式
  if (tags.has('fried')) score -= 14;
  if (tags.has('processed')) score -= 7;
  if (tags.has('sweetdrink')) score -= 16;
  if (tags.has('whole')) { score += 5; reasons.push('全谷物'); }

  // 7) 时段适配：早餐和夜宵要能马上吃到，别推荐需要现做的生鲜
  const mealKey = budget.meal.key;
  const needsCooking = tags.has('cook') || ((food.cat === 'meat' || food.cat === 'seafood') && !tags.has('quick'));
  if (mealKey === 'breakfast') {
    if (tags.has('breakfast')) { score += 16; reasons.push('适合早餐'); }
    else if (tags.has('quick')) score += 8;
    if (needsCooking) score -= 16;
  }
  if (mealKey === 'snack') {
    if (tags.has('quick') || food.cat === 'fruit' || food.cat === 'dairy' || food.cat === 'nut') { score += 10; reasons.push('随手可得，不用现做'); }
    if (needsCooking) score -= 14;
    if (nut.kcal > 250) score -= 8;
  }
  if (mealKey === 'late' || hour >= 21) {
    if (tags.has('late') || (p.kcal <= 120 && nut.fat <= 6 && tags.has('quick'))) { score += 12; reasons.push('份量较轻，适合深夜少量食用'); }
    else score -= 12;
    if (needsCooking) score -= 14;
    if (tags.has('high-fat') || tags.has('fried')) score -= 12;
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

/** 生成"应避免"清单：按当前最紧的约束找出最不划算的选项 */
function buildAvoidList(ctx, limit = 5) {
  const { gaps, kcalLeft, proteinLeft, goal, hour } = ctx;
  const out = [];
  const seen = new Set();

  const push = (food, kind, reason, severity) => {
    if (seen.has(food.id)) return;
    seen.add(food.id);
    out.push({ food, kind, reason, severity, per100: per100(food) });
  };

  const kcalTight = kcalLeft < gaps.kcal.target * 0.2;
  const proteinShort = proteinLeft > gaps.protein.target * 0.25;
  const sodiumOver = gaps.sodium.remaining < gaps.sodium.target * 0.2;
  const sugarOver = gaps.sugar.remaining < 5;
  const fatOver = gaps.fat.remaining < gaps.fat.target * 0.1;
  const lateNight = hour >= 21;

  for (const food of FOODS) {
    if (food.cat === 'other') continue;
    const p = per100(food);
    const tags = tagsOf(food);
    const proteinPer100kcal = p.kcal > 0 ? (p.protein / p.kcal) * 100 : 0;

    if (sodiumOver && tags.has('high-sodium')) {
      push(food, 'sodium', `钠已达 ${gaps.sodium.eaten} mg（目标 ${gaps.sodium.target} mg），它每 100g 还要再加 ${p.sodium} mg`, 3);
    } else if (sugarOver && (tags.has('sweetdrink') || tags.has('high-sugar'))) {
      push(food, 'sugar', `今日游离糖已到 ${gaps.sugar.eaten}g / ${gaps.sugar.target}g，它每 100g 还含 ${round(freeSugarPer100(food), 1)}g 游离糖`, 3);
    } else if (kcalTight && proteinShort && p.kcal >= 250 && proteinPer100kcal < 6) {
      push(food, 'empty', `只剩 ${Math.max(kcalLeft, 0)} kcal 却还差 ${round(proteinLeft)}g 蛋白，它 ${p.kcal} kcal/100g 却几乎不含蛋白`, 3);
    } else if (kcalTight && p.kcal >= 300) {
      push(food, 'kcal', `热量预算只剩 ${Math.max(kcalLeft, 0)} kcal，一份就会吃超`, 2);
    } else if (lateNight && (tags.has('fried') || tags.has('high-fat') || tags.has('high-sugar'))) {
      push(food, 'late', `${p.kcal} kcal/100g，临睡前吃大份高脂食物可能增加消化负担，今晚更适合轻一点的份量`, 2);
    } else if (fatOver && p.fat >= 25) {
      push(food, 'fat', `脂肪已接近上限（${gaps.fat.eaten}g / ${gaps.fat.target}g），它含 ${p.fat}g 脂肪/100g`, 2);
    } else if (goal === 'cut' && tags.has('fried') && p.kcal >= 300) {
      push(food, 'fried', `减脂期油炸物能量密度过高（${p.kcal} kcal/100g），同样饱腹感的代价太大`, 1);
    } else if (goal === 'cut' && tags.has('sweetdrink')) {
      push(food, 'drink', '液体糖几乎不带来饱腹感，最容易在不知不觉中吃超', 1);
    } else if (proteinShort && tags.has('high-density') && proteinPer100kcal < 5 && food.cat !== 'nut') {
      push(food, 'empty', `蛋白还差 ${round(proteinLeft)}g，它 ${p.kcal} kcal/100g 却只有 ${p.protein}g 蛋白`, 1);
    }
  }

  // 先按严重度排序，再按"约束类型"和分类做多样性限流，避免整屏都是同一个原因
  out.sort((a, b) => b.severity - a.severity || b.per100.kcal - a.per100.kcal);
  const kindCount = {};
  const catCount = {};
  const final = [];
  for (const item of out) {
    if ((kindCount[item.kind] || 0) >= 2) continue;
    if ((catCount[item.food.cat] || 0) >= 2) continue;
    kindCount[item.kind] = (kindCount[item.kind] || 0) + 1;
    catCount[item.food.cat] = (catCount[item.food.cat] || 0) + 1;
    final.push(item);
    if (final.length >= limit) break;
  }
  return final;
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
  } = input;

  const gaps = {};
  for (const k of ['kcal', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium']) {
    const target = Number(targets[k]) || 0;
    const eaten = Number(intake[k]) || 0;
    gaps[k] = { target, eaten: round(eaten, 1), remaining: round(target - eaten, 1), pct: target > 0 ? round((eaten / target) * 100) : 0 };
  }

  const kcalLeft = gaps.kcal.remaining;
  const proteinLeft = gaps.protein.remaining;
  const hour = now.getHours() + now.getMinutes() / 60;
  const budget = mealBudget({ kcalLeft, proteinLeft, now });
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
    recentIds: new Set(entries.map((e) => e.foodId).filter(Boolean)),
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
  const avoid = buildAvoidList(ctx, 5);

  // ---- 状态判定 ----
  const status = judgeStatus({ gaps, kcalLeft, proteinLeft, hour, targets, budget });

  // ---- 洞察 ----
  const insights = buildInsights({ gaps, targets, health, baseline, profile, now, isTrainingDay, budget, entries });

  return {
    generatedAt: now.toISOString(),
    gaps,
    budget,
    isTrainingDay,
    status,
    insights,
    recommend,
    avoid,
    proteinEquivalent: proteinEquivalent(proteinLeft),
  };
}

/** 一句话总体判定 */
export function judgeStatus({ gaps, kcalLeft, proteinLeft, hour, targets, budget }) {
  const dayProgress = clamp((hour - 6) / 16, 0, 1); // 6:00~22:00
  const kcalPct = gaps.kcal.pct;
  const proteinPct = gaps.protein.pct;
  const expected = round(dayProgress * 100);

  if (kcalLeft < -targets.kcal * 0.12) {
    return {
      level: 'bad',
      headline: `热量超出 ${Math.abs(kcalLeft)} kcal`,
      detail: `已摄入 ${gaps.kcal.eaten} kcal，超过今日目标 ${gaps.kcal.target} kcal。今天剩下的时间以水、无糖茶和蔬菜为主，明天不必补偿性少吃，回到正常预算即可。`,
    };
  }
  if (kcalLeft < 0) {
    return {
      level: 'warn',
      headline: `热量刚好吃满并略超 ${Math.abs(kcalLeft)} kcal`,
      detail: proteinLeft > 0
        ? `蛋白完成 ${proteinPct}%。蛋白质本身含有热量，今天无法在不继续增加热量的情况下补齐；不必硬补，明天把蛋白提前分配到前几餐。`
        : `蛋白已经完成 ${proteinPct}%。今天无需补偿性少吃，下一餐回到正常预算即可。`,
    };
  }
  if (proteinLeft > 0 && proteinLeft * ATWATER.protein > kcalLeft + 1) {
    const minimumOver = Math.ceil(proteinLeft * ATWATER.protein - kcalLeft);
    return {
      level: 'warn',
      headline: `热量只剩 ${round(kcalLeft)} kcal，无法补齐 ${round(proteinLeft)}g 蛋白`,
      detail: `这些蛋白即使不带脂肪和碳水也至少需要 ${round(proteinLeft * ATWATER.protein)} kcal。可选择守住热量余量，或优先补蛋白并接受至少约 ${minimumOver} kcal 的超出；今天不必为了凑数强行进食。`,
    };
  }
  if (proteinLeft > gaps.protein.target * 0.5 && dayProgress > 0.6) {
    return {
      level: 'warn',
      headline: `蛋白还差 ${round(proteinLeft)}g，缺口偏大`,
      detail: `已经过了一天的 ${expected}%，蛋白才完成 ${proteinPct}%。剩余 ${kcalLeft} kcal 需要优先给高蛋白食物，碳水和脂肪往后放。`,
    };
  }
  if (kcalPct < expected - 30 && dayProgress > 0.5) {
    return {
      level: 'warn',
      headline: `还有 ${kcalLeft} kcal 没吃，偏少了`,
      detail: `长期大幅低于目标不利于保留肌肉和持续执行。接下来 ${budget.meal.label} 建议吃到约 ${budget.kcal} kcal。`,
    };
  }
  if (gaps.sodium.pct > 110) {
    return {
      level: 'warn',
      headline: `钠摄入超标 ${gaps.sodium.pct - 100}%`,
      detail: `已摄入 ${gaps.sodium.eaten} mg（建议上限 ${gaps.sodium.target} mg）。今天余下的选择请避开加工肉、腌制品和重口味汤汁；如有医生规定的限盐或限水方案，以医嘱为准。`,
    };
  }
  const pace = kcalPct - expected;
  const paceText = Math.abs(pace) <= 12
    ? `与当前时间进度（${expected}%）基本同步`
    : pace > 0
      ? `比当前时间进度（${expected}%）吃得快一些，后面几餐留意份量`
      : `比当前时间进度（${expected}%）吃得慢一些，别把缺口全压到晚上`;
  const proteinText = proteinLeft > 0 ? `蛋白还差 ${round(proteinLeft)}g` : '蛋白已达标';
  return {
    level: 'good',
    headline: `还有 ${kcalLeft} kcal 热量余量，${proteinText}`,
    detail: `热量完成 ${kcalPct}%，蛋白完成 ${proteinPct}%，${paceText}。${budget.meal.label}建议 ${budget.kcal} kcal、${budget.protein}g 蛋白。`,
  };
}

/** 结构化洞察条目 */
export function buildInsights({ gaps, targets, health, baseline, profile, now, isTrainingDay, budget, entries }) {
  const list = [];
  const add = (type, title, text) => list.push({ type, title, text });

  /*
   * 活动能量不可信时先把话说清楚，再谈预算。
   * 实测有人在凌晨 1 点被导入 2010 kcal 活动能量（近期日均 310），
   * 热量目标被顶到 4455。数值已经在 dynamicTDEE 那层挡掉了，但不说出来的话，
   * 用户只会看到一个正常的目标，不知道自己的快捷指令一直在取错数据。
   */
  if (targets.activeCapped) {
    add('warn', '今天的活动能量数值不可信',
      `健康数据里今天的活动能量是 ${round(targets.activeReported || 0)} kcal，`
      + `按现在的时间点算不可能达到（近期日均 ${round(baseline.activeEnergy || 0)} kcal）。`
      + '热量目标已改按平时的活动节奏估算。'
      + '多半是取数的快捷指令里日期范围没选「今天」，把多天累加成了一天，建议去「健康」页核对一下。');
  }

  /*
   * 目标是怎么算出来的，依据够不够硬，得让用户看得到。
   * 年龄差 10 岁在 Mifflin-St Jeor 里就是 50 kcal，静默用兜底值等于悄悄编数据。
   */
  if (targets.ageEstimated) {
    add('warn', '年龄按 30 岁估算',
      '没填生日，基础代谢只能按 30 岁算。Mifflin-St Jeor 公式里年龄每差 10 岁就是 50 kcal，'
      + '到「设置」里补上生日，热量目标会更贴合你。');
  }
  if (targets.carbBelowRda) {
    add('info', `碳水目标 ${targets.carb}g，低于 130g 的推荐摄入量`,
      '130 g/天 是美国 IOM 给出的碳水推荐摄入量，依据是大脑的葡萄糖利用量。'
      + '当前配比里蛋白和脂肪占得较多，把碳水挤到了这个水平以下。'
      + '是否适合长期采用取决于个人情况；可考虑提高总热量、调整宏量配比，或向专业人员咨询。');
  }

  // 动态热量预算：把"今天比平时多动/少动"和"预算调整了多少"讲成同一件事
  if (targets.tdeeSource === 'apple' && targets.staticTdee > 0) {
    const budgetDelta = round(targets.tdee - targets.staticTdee);
    const activeDelta = baseline.activeEnergy > 0 ? round((health.activeEnergy || 0) - baseline.activeEnergy) : null;
    const sourceText = targets.activeSource === 'formula-fallback'
      ? '按设备静息记录并用活动系数补足缺失活动'
      : targets.activeSource === 'device-baseline'
        ? '按设备静息记录与近期活动基线'
        : '按 Apple 设备记录外推';
    if (Math.abs(budgetDelta) >= 80) {
      const up = budgetDelta > 0;
      add(
        up ? 'up' : 'down',
        `今日热量预算${up ? '上调' : '下调'} ${Math.abs(budgetDelta)} kcal`,
        `${sourceText}，今天预计总消耗 ${round(targets.tdee)} kcal（完全按活动系数估算是 ${round(targets.staticTdee)} kcal），因此目标定为 ${targets.kcal} kcal。`
        + (activeDelta != null
          ? `当前活动能量 ${round(health.activeEnergy || 0)} kcal，近期平均 ${round(baseline.activeEnergy)} kcal。`
          : ''),
      );
    }
  }

  if (isTrainingDay) {
    add('info', '今天是训练日',
      `锻炼 ${round(health.exerciseMinutes || 0)} 分钟`
      + (targets.activeCapped ? '' : `、活动能量 ${round(health.activeEnergy || 0)} kcal`)
      + '。在全天总量充足的前提下，可把约 20–40g 高质量蛋白安排在训练前后；训练量大或恢复时间紧时再搭配碳水。');
  }

  // 蛋白
  if (gaps.protein.remaining > 10) {
    const eq = proteinEquivalent(gaps.protein.remaining);
    add('protein', `蛋白还差 ${round(gaps.protein.remaining)}g`, `约等于 ${eq.chickenGrams}g 鸡胸肉，或 ${eq.eggs} 个鸡蛋。目标依据：${targets.proteinBasis}。`);
  } else if (gaps.protein.pct >= 100) {
    add('good', '蛋白已达标', `今日 ${gaps.protein.eaten}g / ${gaps.protein.target}g。充足蛋白是维持瘦体重的重要因素之一。`);
  }

  // 纤维
  if (gaps.fiber.remaining > gaps.fiber.target * 0.5 && now.getHours() >= 14) {
    add('fiber', `膳食纤维偏低（${gaps.fiber.eaten}g / ${gaps.fiber.target}g）`, '可再加一份蔬菜、完整水果或全谷物；这通常有助于饱腹，但实际感受因人而异。');
  }

  // 糖
  if (gaps.sugar.pct > 100) {
    add('warn', `游离糖已超出建议上限（${gaps.sugar.eaten}g / ${gaps.sugar.target}g）`, '可先检查含糖饮料、果汁、糖浆和甜点；换成不加糖的饮品能减少对应的糖和热量。');
  }

  // 钠
  if (gaps.sodium.pct > 100) {
    add('warn', `钠已超出建议上限（${gaps.sodium.eaten}mg / ${gaps.sodium.target}mg）`, '高钠可能带来短期水分与体重波动，幅度因人而异。余下餐次尽量少选腌制品、加工肉和重口味汤汁；如有医生规定的限水或限盐方案，以医嘱为准。');
  }

  /*
   * 近期摄入趋势。
   *
   * 分母必须是「真正记了饮食的天数」（baseline.loggedDays），不是日历天数。
   * 没记的日子不在样本里，把它们当成 0 kcal 会造出「近 14 天日均赤字 3168 kcal」
   * 这种根本不存在的结论——那 13 天只是没记。
   *
   * 样本太小时干脆不下结论：1-2 天的均值说明不了趋势。
   */
  const MIN_LOGGED_DAYS = 3;
  const logged = baseline.loggedDays ?? 0;
  if (logged >= MIN_LOGGED_DAYS && baseline.kcalIntake != null) {
    const diff = round(baseline.kcalIntake - targets.kcal);
    const scope = `有记录的 ${logged} 天`;
    if (Math.abs(diff) > targets.kcal * 0.1) {
      // 7700 kcal/kg 是 Wishnofsky 1958 的经验值，只是「脂肪当量」的换算，
      // 不等于实际会掉多少体重（真实减重里还有瘦体重和水分）。措辞照此保留。
      add(
        diff > 0 ? 'warn' : 'info',
        `${scope}平均${diff > 0 ? '高于' : '低于'}目标 ${Math.abs(diff)} kcal/天`,
        `按 7700 kcal/kg 的脂肪当量换算，相当于每周 ${round((Math.abs(diff) * 7) / 7700, 2)} kg 的`
        + `${diff > 0 ? '盈余' : '赤字'}（只是能量换算，不等于体重真会这样变）。`
        + (diff > 0
          ? '先从最容易砍的项目下手：饮料、油、加工零食。'
          : '若体重下降过快（>1%/周）建议把赤字收小一点。')
        + (logged < (baseline.windowDays || 14)
          ? `注意这是 ${logged} 天的平均，没记录的日子没有计入。`
          : ''),
      );
    }
    if (baseline.proteinHitDays != null) {
      add('info', `${scope}里蛋白达标 ${baseline.proteinHitDays} 天`,
        baseline.proteinHitDays >= logged * 0.7
          ? '蛋白执行得不错，保持住。'
          : '蛋白达标率偏低。把高蛋白食物固定安排进早餐和加餐，比每天临时想吃什么更容易坚持。');
    }
  } else if (logged > 0 && logged < MIN_LOGGED_DAYS) {
    add('info', `只有 ${logged} 天的饮食记录`,
      `摄入趋势要至少 ${MIN_LOGGED_DAYS} 天才算得出来。记满几天之后，这里会给出平均摄入与目标的差距。`);
  }

  // 体重趋势 vs 目标速率
  if (baseline.weightTrend != null && Math.abs(baseline.weightTrend) > 0.01) {
    const perWeek = round(baseline.weightTrend, 2);
    const goalRate = targets.rateKgPerWeek;
    add(
      'info',
      `初步体重趋势 ${perWeek > 0 ? '+' : ''}${perWeek} kg/周`,
      goalRate !== 0 && Math.sign(perWeek) !== Math.sign(goalRate) && Math.abs(perWeek) > 0.15
        ? `与目标方向（${goalRate > 0 ? '+' : ''}${goalRate} kg/周）相反。短期水分会干扰斜率，先核对饮食记录并继续观察；至少积累 28 天且有足够称重点后，再按小步幅调整热量。`
        : `目标为 ${goalRate > 0 ? '+' : ''}${goalRate} kg/周。短期趋势易受水分影响；是否调整热量请以至少 28 天的趋势页判断为准。`,
    );
  }

  // 饮水
  if (health.waterMl != null && targets.waterMl) {
    const left = targets.waterMl - health.waterMl;
    if (left > 500) add('info', `饮水参考还差 ${round(left)} ml`, `通用参考为 ${targets.waterMl} ml，可在余下时间分次补充；炎热、运动和医生要求会改变个人需要。`);
  }

  if (!entries.length && gaps.kcal.eaten <= 0 && now.getHours() >= 12) {
    add('warn', '今天还没有记录任何饮食', '漏记会让所有建议失真。哪怕只是大致估个份量，也比不记准确得多。');
  }

  return list;
}
