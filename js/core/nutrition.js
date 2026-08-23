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
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(profile.birthday));
    const b = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(NaN);
    if (!Number.isNaN(b.getTime())
      && b.getFullYear() === Number(m?.[1])
      && b.getMonth() === Number(m?.[2]) - 1
      && b.getDate() === Number(m?.[3])) {
      let a = today.getFullYear() - b.getFullYear();
      const m = today.getMonth() - b.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < b.getDate())) a -= 1;
      if (a > 0 && a < 120) return a;
    }
  }
  return Number(profile?.age) > 0 ? Number(profile.age) : 30;
}

/** 成人静息能量与营养目标的输入校验；不拿虚构的默认身高体重去生成“精确”结果。 */
export function validateProfile(profile) {
  const errors = [];
  const finiteIn = (value, lo, hi) => Number.isFinite(Number(value)) && Number(value) >= lo && Number(value) <= hi;
  if (!profile || typeof profile !== 'object') return { valid: false, errors: ['缺少身体信息'] };
  if (!['male', 'female'].includes(profile.sex)) errors.push('请选择性别');
  if (!finiteIn(profile.weightKg, 35, 350)) errors.push('体重需在 35–350 kg');
  if (!finiteIn(profile.heightCm, 130, 230)) errors.push('身高需在 130–230 cm');
  const age = ageFrom(profile);
  if (!finiteIn(age, 18, 100)) errors.push('本计算仅适用于 18–100 岁成人');
  if (profile.birthday) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(profile.birthday));
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    if (!d || d.getFullYear() !== Number(m?.[1]) || d.getMonth() !== Number(m?.[2]) - 1
      || d.getDate() !== Number(m?.[3])) errors.push('生日格式无效');
  }
  if (profile.bodyFatPct != null && profile.bodyFatPct !== '' && !finiteIn(profile.bodyFatPct, 2, 70)) {
    errors.push('体脂率需在 2%–70%');
  }
  if (!ACTIVITY_LEVELS[profile.activity]) errors.push('活动水平无效');
  if (!GOALS[profile.goal]) errors.push('目标类型无效');
  if (profile.rateKgPerWeek != null && !Number.isFinite(Number(profile.rateKgPerWeek))) errors.push('目标速率必须是数字');
  if (profile.proteinPerKg != null
    && (!Number.isFinite(Number(profile.proteinPerKg)) || Number(profile.proteinPerKg) < 0.5
      || Number(profile.proteinPerKg) > 3.5)) errors.push('自定义蛋白质需在 0.5–3.5 g/kg');
  return { valid: errors.length === 0, errors, age };
}

function assertValidProfile(profile) {
  const checked = validateProfile(profile);
  if (!checked.valid) throw new RangeError(checked.errors.join('；'));
  return checked;
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
  assertValidProfile(profile);
  const weight = Number(profile.weightKg);
  const height = Number(profile.heightCm);
  const age = ageFrom(profile);
  const lbm = leanBodyMass(weight, profile.bodyFatPct);

  if (lbm) {
    return { kcal: round(370 + 21.6 * lbm), formula: 'Katch-McArdle', lbm };
  }
  const base = 10 * weight + 6.25 * height - 5 * age;
  const kcal = profile.sex === 'female' ? base - 161 : base + 5;
  return { kcal: round(kcal), formula: 'Mifflin-St Jeor', lbm: null };
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
 * Apple 的静息 + 活动能量本身就是设备口径的总消耗拆分；不再额外叠加固定 10% TEF，
 * 避免目标页和趋势页同一天相差 150–250 kcal。
 */
export function dynamicTDEE({
  bmr,
  activeSoFar = 0,
  basalSoFar = null,
  dayFraction = 1,
  baselineActive = null,
  fallbackTDEE = null,
}) {
  const baseBmr = Number(bmr);
  if (!(baseBmr > 0) || !Number.isFinite(baseBmr)) throw new RangeError('BMR 必须是正数');
  const activeNow = Math.max(0, Number(activeSoFar) || 0);
  const f = clamp(dayFraction, 0, 1);
  // 静息部分：一天刚开始时按比例外推会被严重放大（清晨 4 点除以 0.17 就翻 6 倍），
  // 所以只在过了大半天后才采信 Apple 的静息数据，并限制在公式值的 1.4 倍以内。
  const basalFullDay = basalSoFar != null && f >= 0.4
    ? clamp(Number(basalSoFar) / f, baseBmr * 0.8, baseBmr * 1.4)
    : baseBmr;

  const curveNow = activityCurve(f);
  let activeFullDay;
  if (baselineActive > 0) {
    // 按"今天相对平时的活跃程度"外推剩余时间
    const expectedByNow = baselineActive * curveNow;
    const pace = expectedByNow > 30 ? clamp(activeNow / expectedByNow, 0.4, 2.0) : 1;
    activeFullDay = activeNow + baselineActive * (1 - curveNow) * pace;
  } else if (curveNow > 0.2) {
    activeFullDay = activeNow / curveNow;
  } else {
    activeFullDay = fallbackTDEE ? Math.max(activeNow, (fallbackTDEE - baseBmr) * 0.8) : activeNow;
  }

  const tef = 0;
  const total = round(basalFullDay + activeFullDay);

  return {
    basal: round(basalFullDay),
    active: round(activeFullDay),
    activeSoFar: round(activeNow),
    tef,
    tdee: total,
    projected: f < 0.98,
  };
}

/** 蛋白质目标（g/天） */
export function proteinTarget(profile, goalKey) {
  assertValidProfile(profile);
  const weight = Number(profile.weightKg);
  const height = Number(profile.heightCm);
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
  assertValidProfile(profile);
  const stat = staticTDEE(profile);
  const goal = GOALS[profile.goal] ? profile.goal : 'maintain';
  const requestedRate = profile.rateKgPerWeek != null
    ? Number(profile.rateKgPerWeek)
    : GOALS[goal].defaultRateKgPerWeek;
  const weight = Number(profile.weightKg);
  const maxRate = weight * 0.01;
  const rateByWeight = clamp(requestedRate, -maxRate, maxRate);

  const tdee = dynamic?.tdee > 0 ? dynamic.tdee : stat.tdee;
  // 固定 7700 只是短期预算近似；先限制到体重的 1%/周，再限制常用的 500–750 kcal 调整范围。
  const requestedDailyDelta = (rateByWeight * KCAL_PER_KG_FAT) / 7;
  const plannedDelta = clamp(requestedDailyDelta, -750, 500);

  let kcal = tdee + plannedDelta;
  // 常用成人减重计划的保守下限；不是“BMR 硬下限”，个体化医疗方案应由专业人员制定。
  const floor = profile.sex === 'female' ? 1200 : 1500;
  const clampedByFloor = kcal < floor;
  kcal = round(Math.max(kcal, floor));
  const dailyDelta = round(kcal - tdee);
  const rate = round((dailyDelta * 7) / KCAL_PER_KG_FAT, 2);
  const rateWasClamped = Math.abs(rate - requestedRate) > 0.005;

  const proteinPlan = proteinTarget(profile, goal);

  // 在同一个热量约束里求解三大宏量：先保留产品的低碳下限，再放入脂肪和蛋白目标。
  const carbFloor = 50;
  const fatFloor = Math.min(weight * 0.8, (kcal * 0.35) / ATWATER.fat);
  const maxProtein = Math.max(0,
    (kcal - fatFloor * ATWATER.fat - carbFloor * ATWATER.carb) / ATWATER.protein);
  let protein = Math.min(proteinPlan.grams, maxProtein);
  const proteinCapped = protein + 0.01 < proteinPlan.grams;
  let fat = clamp((kcal * 0.25) / ATWATER.fat, fatFloor, (kcal * 0.35) / ATWATER.fat);
  let carb = (kcal - protein * ATWATER.protein - fat * ATWATER.fat) / ATWATER.carb;
  if (carb < 50) {
    carb = carbFloor;
    fat = Math.max(fatFloor,
      (kcal - protein * ATWATER.protein - carb * ATWATER.carb) / ATWATER.fat);
  }
  if (protein * 4 + fat * 9 + carb * 4 > kcal + 0.01) {
    protein = Math.max(0, (kcal - fat * 9 - carb * 4) / 4);
  }

  const proteinRounded = round(protein);
  const fatRounded = round(fat);
  const carbRounded = round(Math.max(0,
    (kcal - proteinRounded * ATWATER.protein - fatRounded * ATWATER.fat) / ATWATER.carb), 1);

  return {
    goal,
    rateKgPerWeek: rate,
    requestedRateKgPerWeek: requestedRate,
    rateWasClamped,
    bmr: stat.bmr,
    formula: stat.formula,
    lbm: stat.lbm,
    staticTdee: stat.tdee,
    tdee: round(tdee),
    tdeeSource: dynamic?.tdee > 0 ? 'apple' : 'formula',
    dailyDelta,
    clampedByFloor,
    kcal,
    protein: proteinRounded,
    proteinBasis: proteinCapped ? `${proteinPlan.basis}（受总热量约束已下调）` : proteinPlan.basis,
    proteinCapped,
    fat: fatRounded,
    carb: carbRounded,
    fiber: round(clamp((kcal / 1000) * 14, 25, 30)),
    sodium: 2000,       // mg，约等于 5g 食盐
    sugar: round((kcal * 0.1) / ATWATER.carb), // WHO 游离糖 < 10% 供能
    waterMl: profile.sex === 'female' ? 1500 : 1700, // 温和气候、低身体活动成人饮水参考
  };
}

/** 汇总一组饮食条目的营养 */
export function sumNutrients(entries = []) {
  const total = {
    kcal: 0, protein: 0, fat: 0, carb: 0, fiber: 0, sugar: 0, totalSugar: 0, sodium: 0,
  };
  for (const e of entries) {
    total.kcal += Number(e.kcal) || 0;
    total.protein += Number(e.protein) || 0;
    total.fat += Number(e.fat) || 0;
    total.carb += Number(e.carb) || 0;
    total.fiber += Number(e.fiber) || 0;
    total.sugar += Number(e.sugar) || 0;
    total.totalSugar += Number(e.totalSugar) || 0;
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
