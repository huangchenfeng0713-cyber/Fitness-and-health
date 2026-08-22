/**
 * 营养目标计算引擎
 * 纯函数模块，不依赖 DOM，可在 Node 中单元测试。
 *
 * 主要能力：
 *  1. 基础代谢 BMR（Mifflin-St Jeor / Katch-McArdle）
 *  2. 静态 TDEE（活动系数）与动态 TDEE（结合 Apple 健康当日实际消耗）
 *  3. 热量 / 蛋白质 / 脂肪 / 碳水 / 纤维 / 钠 / 糖 / 饮水 的每日目标
 *  4. 当日预算的实时再分配（按已过时间、已摄入量）
 */

export const KCAL_PER_KG_FAT = 7700; // 1kg 脂肪组织约含 7700 kcal
export const ATWATER = { protein: 4, carb: 4, fat: 9, alcohol: 7 };

/** 活动系数（不含运动时用低档，运动由 Apple 健康的活动能量单独补足） */
export const ACTIVITY_LEVELS = {
  sedentary: { key: 'sedentary', label: '久坐（几乎不运动）', factor: 1.2 },
  light: { key: 'light', label: '轻度活动（每周 1-3 次）', factor: 1.375 },
  moderate: { key: 'moderate', label: '中等活动（每周 3-5 次）', factor: 1.55 },
  active: { key: 'active', label: '高强度（每周 6-7 次）', factor: 1.725 },
  athlete: { key: 'athlete', label: '运动员 / 体力劳动', factor: 1.9 },
};

export const GOALS = {
  cut: { key: 'cut', label: '减脂', defaultRateKgPerWeek: -0.5 },
  maintain: { key: 'maintain', label: '维持', defaultRateKgPerWeek: 0 },
  bulk: { key: 'bulk', label: '增肌', defaultRateKgPerWeek: 0.25 },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

/** 由出生日期算年龄；也接受直接传入的数字年龄 */
export function ageFrom(profile, today = new Date()) {
  if (profile?.birthday) {
    const b = new Date(profile.birthday);
    if (!Number.isNaN(b.getTime())) {
      let a = today.getFullYear() - b.getFullYear();
      const m = today.getMonth() - b.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < b.getDate())) a -= 1;
      if (a > 0 && a < 120) return a;
    }
  }
  return Number(profile?.age) > 0 ? Number(profile.age) : 30;
}

/** 瘦体重（kg）。有体脂率才算得出，否则返回 null */
export function leanBodyMass(weightKg, bodyFatPct) {
  if (!(weightKg > 0)) return null;
  const bf = Number(bodyFatPct);
  if (!(bf > 0) || bf >= 70) return null;
  return round(weightKg * (1 - bf / 100), 2);
}

export function bmi(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}

export function bmiCategory(value) {
  // 采用《中国成人超重和肥胖症预防控制指南》切点
  if (value == null) return null;
  if (value < 18.5) return { key: 'under', label: '偏瘦' };
  if (value < 24) return { key: 'normal', label: '正常' };
  if (value < 28) return { key: 'over', label: '超重' };
  return { key: 'obese', label: '肥胖' };
}

/**
 * 基础代谢率（kcal/天）
 * 有体脂率优先用 Katch-McArdle（对体成分敏感），否则 Mifflin-St Jeor。
 */
export function basalMetabolicRate(profile) {
  const weight = Number(profile.weightKg) || 0;
  const height = Number(profile.heightCm) || 0;
  const age = ageFrom(profile);
  const lbm = leanBodyMass(weight, profile.bodyFatPct);

  if (lbm) {
    return { kcal: round(370 + 21.6 * lbm), formula: 'Katch-McArdle', lbm };
  }
  const base = 10 * weight + 6.25 * height - 5 * age;
  const kcal = profile.sex === 'female' ? base - 161 : base + 5;
  return { kcal: round(Math.max(kcal, 800)), formula: 'Mifflin-St Jeor', lbm: null };
}

/** 静态 TDEE：BMR × 活动系数 */
export function staticTDEE(profile) {
  const { kcal: bmr, formula, lbm } = basalMetabolicRate(profile);
  const level = ACTIVITY_LEVELS[profile.activity] || ACTIVITY_LEVELS.light;
  return { bmr, formula, lbm, factor: level.factor, tdee: round(bmr * level.factor) };
}

/**
 * 一天中活动能量的累积曲线（0~1）。
 * 人在 07:00 前几乎不产生活动消耗，23:00 后基本停止，中间近似线性偏后。
 */
export function activityCurve(dayFraction) {
  const f = clamp(dayFraction, 0, 1);
  const start = 7 / 24;
  const end = 23 / 24;
  if (f <= start) return 0;
  if (f >= end) return 1;
  const t = (f - start) / (end - start);
  // 轻微 S 形：上午偏慢，午后到傍晚加速
  return round(t * t * (3 - 2 * t), 4);
}

/**
 * 动态 TDEE：用 Apple 健康当天真实消耗推算全天总消耗。
 * @param {object} opts
 *  - bmr: 基础代谢
 *  - activeSoFar: 当日已产生的活动能量 kcal（Apple 健康）
 *  - basalSoFar: 当日已产生的静息能量 kcal（Apple 健康，可选）
 *  - dayFraction: 当日已过时间比例 0~1
 *  - baselineActive: 近期平均每日活动能量（用于外推剩余时间），可选
 *  - intakeKcal: 已摄入热量（用于食物热效应 TEF）
 */
export function dynamicTDEE({
  bmr,
  activeSoFar = 0,
  basalSoFar = null,
  dayFraction = 1,
  baselineActive = null,
  intakeKcal = 0,
  fallbackTDEE = null,
}) {
  const f = clamp(dayFraction, 0, 1);
  // 静息部分：一天刚开始时按比例外推会被严重放大（清晨 4 点除以 0.17 就翻 6 倍），
  // 所以只在过了大半天后才采信 Apple 的静息数据，并限制在公式值的 1.4 倍以内。
  const basalFullDay = basalSoFar != null && f >= 0.4
    ? clamp(basalSoFar / f, bmr * 0.8, bmr * 1.4)
    : bmr;

  /*
   * 活动能量也要设上限，理由和静息那条一样。
   *
   * 凌晨 00:57 报来 2010 kcal 活动能量（近期日均才 310），换算成 35 kcal/分钟
   * 持续了一小时——世界纪录级选手也做不到。这种数只可能是导入端把多天累加成
   * 了一天。不拦的话热量目标会被顶到 4455 kcal，比真实需要多出近一倍。
   *
   * 天花板取 15 kcal/分钟：接近人类持续输出的极限，真实的大运动量碰不到它，
   * 而按天累加出来的假数据一定会超。
   */
  const MAX_ACTIVE_PER_MIN = 15;
  const elapsedMin = Math.max(1, f * 1440);
  const activeCeiling = elapsedMin * MAX_ACTIVE_PER_MIN;
  const curveNow = activityCurve(f);
  const activeCapped = activeSoFar > activeCeiling;
  // 超了就不是「削到天花板」而是「这个数不能用」：退回按平时节奏推算，
  // 拿天花板当真值等于把编出来的数字当依据，只是错得少一点而已。
  const activeTrusted = activeCapped
    ? (baselineActive > 0 ? baselineActive * curveNow : 0)
    : activeSoFar;

  let activeFullDay;
  if (baselineActive > 0) {
    // 按"今天相对平时的活跃程度"外推剩余时间
    const expectedByNow = baselineActive * curveNow;
    const pace = expectedByNow > 30 ? clamp(activeTrusted / expectedByNow, 0.4, 2.0) : 1;
    activeFullDay = activeTrusted + baselineActive * (1 - curveNow) * pace;
  } else if (curveNow > 0.2) {
    activeFullDay = activeTrusted / curveNow;
  } else {
    activeFullDay = fallbackTDEE ? Math.max(activeTrusted, (fallbackTDEE - bmr) * 0.8) : activeTrusted;
  }

  // 食物热效应约占摄入的 10%（按目标摄入估算，避免吃得少反而预算降太多）
  const tef = round(Math.max(intakeKcal, fallbackTDEE || 0) * 0.1);
  const total = round(basalFullDay + activeFullDay + tef);

  return {
    basal: round(basalFullDay),
    active: round(activeFullDay),
    activeSoFar: round(activeTrusted),
    activeReported: round(activeSoFar),
    activeCapped,
    tef,
    tdee: total,
    projected: f < 0.98,
  };
}

/** 蛋白质目标（g/天） */
export function proteinTarget(profile, goalKey) {
  const weight = Number(profile.weightKg) || 60;
  const height = Number(profile.heightCm) || 170;
  const lbm = leanBodyMass(weight, profile.bodyFatPct);
  const goal = goalKey || profile.goal || 'maintain';

  if (profile.proteinPerKg > 0) {
    return { grams: round(weight * profile.proteinPerKg), basis: '自定义 g/kg 体重' };
  }
  if (lbm) {
    // 以瘦体重为基准更准确：减脂期需要更高比例以保住肌肉
    const perKgLbm = goal === 'cut' ? 2.4 : goal === 'bulk' ? 2.2 : 2.0;
    return { grams: round(lbm * perKgLbm), basis: `${perKgLbm} g/kg 瘦体重` };
  }
  const bmiVal = bmi(weight, height) || 22;
  // 肥胖人群用"调整体重"，避免蛋白目标被脂肪重量抬高
  const refWeight = bmiVal > 30 ? round(24 * (height / 100) ** 2 + 0.25 * (weight - 24 * (height / 100) ** 2), 1) : weight;
  const perKg = goal === 'cut' ? 1.8 : goal === 'bulk' ? 1.8 : 1.4;
  return { grams: round(refWeight * perKg), basis: `${perKg} g/kg 体重` };
}

/**
 * 计算完整的每日营养目标。
 * @param {object} profile 身体信息与目标设置
 * @param {object} [dynamic] 动态消耗结果（有则用真实消耗替代活动系数）
 */
export function dailyTargets(profile, dynamic = null) {
  const stat = staticTDEE(profile);
  const goal = GOALS[profile.goal] ? profile.goal : 'maintain';
  const rate = profile.rateKgPerWeek != null
    ? Number(profile.rateKgPerWeek)
    : GOALS[goal].defaultRateKgPerWeek;

  const tdee = dynamic?.tdee > 0 ? dynamic.tdee : stat.tdee;
  const dailyDelta = round((rate * KCAL_PER_KG_FAT) / 7);

  let kcal = tdee + dailyDelta;
  // 安全下限：不低于 BMR，且不低于性别最低摄入建议
  const floor = Math.max(stat.bmr, profile.sex === 'female' ? 1200 : 1500);
  const clampedByFloor = kcal < floor;
  kcal = round(Math.max(kcal, floor));

  const protein = proteinTarget(profile, goal);
  const weight = Number(profile.weightKg) || 60;

  // 脂肪：保底 0.8 g/kg 体重，且落在总热量的 20%~35%
  const fatFloor = weight * 0.8;
  let fat = Math.max(fatFloor, (kcal * 0.25) / ATWATER.fat);
  fat = Math.min(fat, (kcal * 0.35) / ATWATER.fat);

  // 碳水：热量减去蛋白与脂肪后的剩余，最低 50g（保护中枢神经供能）
  const remain = kcal - protein.grams * ATWATER.protein - fat * ATWATER.fat;
  let carb = remain / ATWATER.carb;
  if (carb < 50) {
    carb = 50;
    // 碳水触底时压缩脂肪来平衡
    fat = Math.max(fatFloor * 0.9, (kcal - protein.grams * 4 - carb * 4) / ATWATER.fat);
  }

  return {
    goal,
    rateKgPerWeek: rate,
    bmr: stat.bmr,
    formula: stat.formula,
    lbm: stat.lbm,
    staticTdee: stat.tdee,
    tdee: round(tdee),
    tdeeSource: dynamic?.tdee > 0 ? 'apple' : 'formula',
    // 今天的活动能量数值不可信、已改按平时节奏估算 —— 要让界面能说出这件事，
    // 否则用户看到一个正常的目标，不会知道自己的快捷指令取错了数据
    activeCapped: dynamic?.activeCapped === true,
    activeReported: dynamic?.activeReported ?? null,
    dailyDelta,
    clampedByFloor,
    kcal,
    protein: round(protein.grams),
    proteinBasis: protein.basis,
    fat: round(fat),
    carb: round(carb),
    fiber: round(clamp((kcal / 1000) * 14, 20, 40)),
    sodium: 2000,       // mg，约等于 5g 食盐
    sugar: round((kcal * 0.1) / ATWATER.carb), // 添加糖 < 10% 供能
    waterMl: round(clamp(weight * 35, 1200, 4000) / 50) * 50,
  };
}

/** 汇总一组饮食条目的营养 */
export function sumNutrients(entries = []) {
  const total = { kcal: 0, protein: 0, fat: 0, carb: 0, fiber: 0, sugar: 0, sodium: 0 };
  for (const e of entries) {
    total.kcal += Number(e.kcal) || 0;
    total.protein += Number(e.protein) || 0;
    total.fat += Number(e.fat) || 0;
    total.carb += Number(e.carb) || 0;
    total.fiber += Number(e.fiber) || 0;
    total.sugar += Number(e.sugar) || 0;
    total.sodium += Number(e.sodium) || 0;
  }
  for (const k of Object.keys(total)) total[k] = round(total[k], 1);
  return total;
}

/** 目标 vs 实际的差额与完成度 */
export function computeGaps(targets, intake) {
  const keys = ['kcal', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium'];
  const out = {};
  for (const k of keys) {
    const target = Number(targets[k]) || 0;
    const eaten = Number(intake[k]) || 0;
    out[k] = {
      target: round(target, 1),
      eaten: round(eaten, 1),
      remaining: round(target - eaten, 1),
      pct: target > 0 ? round((eaten / target) * 100) : 0,
    };
  }
  return out;
}

export { clamp, round };
