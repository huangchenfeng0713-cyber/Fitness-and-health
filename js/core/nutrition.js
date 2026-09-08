/**
 * 营养目标计算引擎
 * 纯函数模块，不依赖 DOM，可在 Node 中单元测试。
 *
 * 主要能力：
 *  1. 基础代谢 BMR（Mifflin-St Jeor / Katch-McArdle）
 *  2. 每日计划 TDEE（活动系数或完整日基线），独立的日内估算兼容接口
 *  3. 热量 / 蛋白质 / 脂肪 / 碳水 / 纤维 / 钠 / 糖 / 饮水 的每日目标
 *  4. 当日预算的实时再分配（按已过时间、已摄入量）
 */

/*
 * 1 kg 脂肪组织约含 7700 kcal（Wishnofsky 1958，英制原文是 3500 kcal/lb）。
 * 这是个经验换算，不是精确的生理常数：真实的体重变化里还有瘦体重、水分和
 * 代谢适应。仅用于初始预算近似，不在主区输出每周脂肪当量，也不能说成「会瘦多少」。
 */
export const KCAL_PER_KG_FAT = 7700;

/** 碳水 RDA（IOM/DRI，依据大脑葡萄糖利用量）。低于它只提示，不强行拉高目标 */
export const CARB_RDA_G = 130;
/** 本应用的碳水硬下限，纯工程护栏，不是营养推荐量 */
export const CARB_HARD_FLOOR_G = 50;
export const ATWATER = { protein: 4, carb: 4, fat: 9, alcohol: 7 };

/* 活动系数仅用于每日计划的公式分支；设备分支要求近期完整日。今天观测不改变已保存计划。 */
export const ACTIVITY_LEVELS = {
  sedentary: { key: 'sedentary', label: '久坐', factor: 1.2 },
  light: { key: 'light', label: '轻度活动', factor: 1.375 },
  moderate: { key: 'moderate', label: '中等活动', factor: 1.55 },
  active: { key: 'active', label: '较高日常活动量', factor: 1.725 },
  athlete: { key: 'athlete', label: '高强度活动', factor: 1.9 },
};

/*
 * 体重变化速率的上限，按占体重的比例/周。计划和判读共用这两个数 ——
 * 「计划允许多快」和「实测多快算偏快」不该是两个门槛。
 *
 * 减：1%/周。仅为运动营养实践参考，不代表个体组织变化的确定界线。
 * 增：0.5%/周。约束的是另一回事 —— 肌肉本身长多快。即便新手，肌肉的
 *     增肌期常用的体重变化参考是每周 0.25%~0.5%；更快增重可能提高脂肪增加比例。
 * 两者共用一个 1% 会允许 45kg 的人计划每周 +0.45kg，一个月长 4% 体重。
 */
export const MAX_LOSS_RATE_PCT = 0.01;
export const MAX_GAIN_RATE_PCT = 0.005;

/* 1.5%/周是本应用自动计划范围，不代表普遍生理极限。 */
export const ABSURD_RATE_PCT = 0.015;

export const GOALS = {
  cut: { key: 'cut', label: '减脂', defaultRateKgPerWeek: -0.5 },
  maintain: { key: 'maintain', label: '维持', defaultRateKgPerWeek: 0 },
  bulk: { key: 'bulk', label: '增肌期增重', defaultRateKgPerWeek: 0.25 },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 0) => {
  const m = 10 ** d;
  return Number.isFinite(v * m) ? Math.round(v * m) / m : v;
};

/** @deprecated 仅保留旧调用方的常量兼容；计算不再使用缺省年龄。 */
export const DEFAULT_AGE = 30;

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
      return a;
    }
  }
  if (profile?.birthday) return null;
  return profile?.ageEstimated !== true && profile?.age != null && Number.isFinite(Number(profile.age)) ? Number(profile.age) : null;
}

/** 年龄到底是填的还是兜底猜的 —— Mifflin-St Jeor 里年龄每差 10 岁就是 50 kcal */
export function ageIsEstimated(profile, today = new Date()) {
  // ageEstimated 仅用于识别旧版本猜测的年龄；此类年龄不再参与计算。
  // API/测试显式传入的 age 仍视为用户给定，保持向后兼容。
  if (!profile?.birthday) return profile?.ageEstimated === true || !(Number(profile?.age) > 0);
  // YYYY-MM-DD 不能直接交给 Date 解析：规范会按 UTC 午夜处理，在美洲时区会落到前一天。
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(profile.birthday));
  const b = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(NaN);
  if (Number.isNaN(b.getTime()) || b.getFullYear() !== Number(match?.[1])
    || b.getMonth() !== Number(match?.[2]) - 1 || b.getDate() !== Number(match?.[3])) return true;
  let a = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) a -= 1;
  return !(a > 0 && a < 120);
}

/** 成人静息能量与营养目标的输入校验；不拿虚构的默认身高体重去生成“精确”结果。 */
export function validateProfile(profile, today = new Date()) {
  const errors = [];
  const finiteIn = (value, lo, hi) => Number.isFinite(Number(value)) && Number(value) >= lo && Number(value) <= hi;
  if (!profile || typeof profile !== 'object') return { valid: false, errors: ['缺少身体信息'] };
  if (!['male', 'female'].includes(profile.sex)) errors.push('请选择性别');
  if (!finiteIn(profile.weightKg, 35, 350)) errors.push('体重需在 35–350 kg');
  if (!finiteIn(profile.heightCm, 130, 230)) errors.push('身高需在 130–230 cm');
  const age = ageFrom(profile, today);
  if (age == null && !profile.birthday) errors.push('请填写生日或明确年龄');
  if (age != null && !finiteIn(age, 18, 100)) errors.push('本计算仅适用于 18–100 岁成人');
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
  if (profile.rateKgPerWeek != null && !Number.isFinite(Number(profile.rateKgPerWeek))) {
    errors.push('目标速率必须是数字');
  } else if (profile.rateKgPerWeek != null && GOALS[profile.goal]) {
    const rate = Number(profile.rateKgPerWeek);
    if (profile.goal === 'cut' && rate > 0) errors.push('减脂目标的体重变化不能为正数');
    if (profile.goal === 'bulk' && rate < 0) errors.push('增肌目标的体重变化不能为负数');
    if (profile.goal === 'maintain' && Math.abs(rate) > 0.001) errors.push('维持体重时目标速率应为 0');
  }
  if (profile.proteinPerKg != null
    && (!Number.isFinite(Number(profile.proteinPerKg)) || Number(profile.proteinPerKg) < 0.5
      || Number(profile.proteinPerKg) > 3.5)) errors.push('自定义蛋白质需在 0.5–3.5 g/kg');
  return { valid: errors.length === 0, errors, age };
}

/**
 * 填「目标速率」时该说什么，以及什么样的输入根本不该被存下来。
 *
 * 建议上沿（MAX_LOSS_RATE_PCT / MAX_GAIN_RATE_PCT）不是闸门：超过了照样能执行，
 * 只是得把代价说清楚。真正拦下的只有明显填错的量级（ABSURD_RATE_PCT）。
 * 表单里的即时提示和主卡上的说明共用这一个判断 ——
 * 否则同一个数在「填的时候」和「看的时候」会得到两种说法。
 *
 * @returns {{level:'ok'|'over'|'absurd', text, advisoryKg, absurdKg, dailyKcal, pctOfWeight}}
 */
export function rateGuidance({ weightKg, rateKgPerWeek } = {}) {
  const weight = Number(weightKg);
  const rate = Number(rateKgPerWeek);
  const blank = {
    level: 'ok', text: '', advisoryKg: null, absurdKg: null, dailyKcal: 0, pctOfWeight: null,
  };
  if (!(weight > 0) || !Number.isFinite(rate)) return blank;
  if (Math.abs(rate) < 0.005) {
    return { ...blank, text: '维持体重：热量按估算消耗安排，不做刻意的盈余或赤字。' };
  }
  const gaining = rate > 0;
  const advisoryKg = round(weight * (gaining ? MAX_GAIN_RATE_PCT : MAX_LOSS_RATE_PCT), 2);
  const absurdKg = round(weight * ABSURD_RATE_PCT, 2);
  const magnitude = Math.abs(rate);
  const pctOfWeight = round((magnitude / weight) * 100, 2);
  const dailyKcal = round((rate * KCAL_PER_KG_FAT) / 7);
  const shape = { advisoryKg, absurdKg, dailyKcal, pctOfWeight };
  const base = `约为体重的 ${pctOfWeight}%/周，相当于每天${gaining ? '多' : '少'}吃 ${Math.abs(dailyKcal)} kcal。`;

  if (magnitude > absurdKg + 1e-9) {
    return {
      ...shape,
      level: 'absurd',
      text: `每周 ${magnitude} kg 超过了体重的 ${round(ABSURD_RATE_PCT * 100, 1)}%（约 ${absurdKg} kg/周）。`
        + '超出本应用自动计划范围，请调整输入或寻求个体评估。',
    };
  }
  if (magnitude > advisoryKg + 0.025) {
    return {
      ...shape,
      level: 'over',
      text: `${base}超过建议上沿 ${advisoryKg} kg/周：`
        + (gaining
          ? '这高于增肌期常用的体重增长范围，可能提高脂肪增加比例；短期水分变化也会影响体重。'
          : '持续过快减重会增加瘦体重流失风险；短期水分变化也会影响体重。')
        + '建议结合连续几周体重趋势、训练表现和饮食完整度再决定是否维持。',
    };
  }
  return { ...shape, level: 'ok', text: `${base}在建议范围内（上沿约 ${advisoryKg} kg/周）。` };
}

function assertValidProfile(profile, today = new Date()) {
  const checked = validateProfile(profile, today);
  if (!checked.valid) throw new RangeError(checked.errors.join('；'));
  return checked;
}

/** 瘦体重（kg）。有体脂率才算得出，否则返回 null */
export function leanBodyMass(weightKg, bodyFatPct) {
  if (!(weightKg > 0)) return null;
  const bf = Number(bodyFatPct);
  if (bodyFatPct == null || bodyFatPct === '' || !Number.isFinite(bf) || bf < 2 || bf > 70) return null;
  return round(weightKg * (1 - bf / 100), 2);
}

export function bmi(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiCategory(value, age = null) {
  // 采用《中国成人超重和肥胖症预防控制指南》切点
  if (value == null || !Number.isFinite(value)) return null;
  if (age != null && (age < 18 || age >= 80)) return { key: 'outside', label: '普通成人分类不适用' };
  if (value < 18.5) return { key: 'under', label: '偏瘦' };
  if (value < 24) return { key: 'normal', label: '正常' };
  if (value < 28) return { key: 'over', label: '超重' };
  return { key: 'obese', label: '肥胖' };
}

/**
 * 基础代谢率（kcal/天）
 * 默认用 Mifflin-St Jeor；仅明确选择且体脂记录有效、近期时使用 Katch-McArdle。
 */
export function basalMetabolicRate(profile, today = new Date()) {
  assertValidProfile(profile, today);
  const weight = Number(profile.weightKg);
  const height = Number(profile.heightCm);
  const age = ageFrom(profile, today);
  const lbm = leanBodyMass(weight, profile.bodyFatPct);

  // Katch-McArdle：BMR = 370 + 21.6 × 瘦体重(kg)。体脂测量误差会传入结果，不能保证更准确。
  if (lbm && profile.energyFormula === 'katch' && profile.bodyFatFresh === true) {
    return { kcal: round(370 + 21.6 * lbm), formula: 'Katch-McArdle', lbm, ageEstimated: false };
  }
  // Mifflin-St Jeor（1990）：10W + 6.25H − 5A，男 +5 / 女 −161
  const base = 10 * weight + 6.25 * height - 5 * age;
  const kcal = profile.sex === 'female' ? base - 161 : base + 5;
  return {
    kcal: round(kcal),
    formula: 'Mifflin-St Jeor',
    lbm: null,
    ageEstimated: ageIsEstimated(profile),
  };
}

/** 静态 TDEE：BMR × 活动系数 */
export function staticTDEE(profile, today = new Date()) {
  const { kcal: bmr, formula, lbm, ageEstimated } = basalMetabolicRate(profile, today);
  const level = ACTIVITY_LEVELS[profile.activity] || ACTIVITY_LEVELS.light;
  return { bmr, formula, lbm, ageEstimated, factor: level.factor, tdee: round(bmr * level.factor) };
}

/*
 * 一天中活动能量的累积曲线（0~1）。
 *
 * 说明白：这条曲线是**建模假设，不是实测数据**，也没有文献出处。
 * 要从「现在已经消耗了多少」推出「全天会消耗多少」，就必须假设一个作息形状；
 * 我们手上只有 Apple 健康的每日汇总，拿不到分时数据，推不出这个人真实的曲线。
 *
 * 三个参数明写在这里，别藏在数字里：
 *   WAKE_HOUR = 7   假设 07:00 前基本没有活动消耗（睡着）
 *   SLEEP_HOUR = 23 假设 23:00 后基本停止
 *   中间用 smoothstep（3t²−2t³），即上午慢、午后到傍晚快、睡前又慢下来
 *
 * 这个假设对夜班、早锻炼的人是不准的。所以凡是用到它的结果都标了
 * projected: true，界面上必须说成「预计」，不能说成「已消耗」。
 */
export const ACTIVITY_CURVE_ASSUMPTION = { wakeHour: 7, sleepHour: 23, shape: 'smoothstep' };

export function activityCurve(dayFraction) {
  const f = clamp(dayFraction, 0, 1);
  const start = ACTIVITY_CURVE_ASSUMPTION.wakeHour / 24;
  const end = ACTIVITY_CURVE_ASSUMPTION.sleepHour / 24;
  if (f <= start) return 0;
  if (f >= end) return 1;
  const t = (f - start) / (end - start);
  return round(t * t * (3 - 2 * t), 4);
}

/**
 * 动态 TDEE：用 Apple 设备当天累计能量推算全天总消耗。
 * @param {object} opts
 *  - bmr: 基础代谢
 *  - activeSoFar: 当日已产生的活动能量 kcal（Apple 健康）
 *  - basalSoFar: 当日已产生的静息能量 kcal（Apple 健康，可选）
 *  - observationFraction: 健康快照覆盖到的一天比例 0~1
 *  - dayFraction: 旧调用兼容字段；未提供 observationFraction 时才使用
 *  - baselineActive: 近期平均每日活动能量（用于外推剩余时间），可选
 * Apple 的静息 + 活动能量本身就是设备口径的总消耗拆分；不再额外叠加固定 10% TEF，
 * 避免目标页和趋势页同一天相差 150–250 kcal。
 */
export function dynamicTDEE({
  bmr,
  activeSoFar = null,
  basalSoFar = null,
  baselineResting = null,
  observationFraction = null,
  dayFraction = 1,
  baselineActive = null,
  fallbackTDEE = null,
}) {
  const baseBmr = Number(bmr);
  if (!(baseBmr > 0) || !Number.isFinite(baseBmr)) throw new RangeError('BMR 必须是正数');
  const activeValue = Number(activeSoFar);
  const hasActiveToday = activeSoFar != null && Number.isFinite(activeValue) && activeValue >= 0;
  const activeNow = hasActiveToday ? activeValue : 0;
  // dayFraction 仅为旧调用兼容；新调用必须传健康快照的覆盖时间，而不是页面当前时间。
  const fraction = observationFraction == null ? Number(dayFraction) : Number(observationFraction);
  const f = Number.isFinite(fraction) ? clamp(fraction, 0, 1) : 1;
  const basalNow = Number(basalSoFar);
  const hasBasalToday = Number.isFinite(basalNow) && basalNow > 0;
  const baselineRestingValue = Number(baselineResting);
  const hasBaselineResting = Number.isFinite(baselineRestingValue) && baselineRestingValue > 0;
  const baselineActiveValue = Number(baselineActive);
  const hasBaselineActive = Number.isFinite(baselineActiveValue) && baselineActiveValue > 0;
  const fallbackTdeeValue = Number(fallbackTDEE);
  const hasFallbackTdee = Number.isFinite(fallbackTdeeValue) && fallbackTdeeValue > 0;

  /*
   * 静息部分，按「依据够不够硬」排序取值：
   *
   *   1. 今天设备累计（过了大半天才敢外推）—— 最贴近今天的记录
   *   2. 近 14 天设备记录日均 —— 完整天的记录值，不含外推
   *   3. Mifflin-St Jeor / Katch-McArdle 公式值 —— 纯估算，兜底
   *
   * 原先跳过第 2 档直接落到公式：明明有十几天 Apple 设备记录的完整静息能量摆在那儿，
   * 却拿公式去猜，这不合理。
   *
   * 第 1 档限定 f ≥ 0.4 是因为一天刚开始时按比例外推会被严重放大
   * （清晨 4 点除以 0.17 就翻 6 倍）；上下界按同一档参考值的 0.8~1.4 倍收敛，
   * 这个区间是工程上的合理性护栏，不是生理常数。
   */
  const restingRef = hasBaselineResting ? baselineRestingValue : baseBmr;
  let basalFullDay = restingRef;
  let basalSource = hasBaselineResting ? 'measured-baseline' : 'formula';
  if (hasBasalToday && f >= 0.4) {
    basalFullDay = clamp(basalNow / f, restingRef * 0.8, restingRef * 1.4);
    basalSource = 'measured-today';
  }

  /* 15 kcal/分钟是快照合理性检查阈值；超出时暂不用于外推，不作生理定论。 */
  const MAX_ACTIVE_PER_MIN = 15;
  const elapsedMin = Math.max(1, f * 1440);
  const activeCeiling = elapsedMin * MAX_ACTIVE_PER_MIN;
  /* 外推另参考本人完整日基线，采用 4 倍或 +2500 kcal 的宽松产品检查范围。 */
  const MAX_ACTIVE_VS_BASELINE = 4;
  const MAX_ACTIVE_EXTRA = 2500;
  const baselineCeiling = hasBaselineActive
    ? Math.max(baselineActiveValue * MAX_ACTIVE_VS_BASELINE, baselineActiveValue + MAX_ACTIVE_EXTRA)
    : Infinity;
  const curveNow = activityCurve(f);
  const activeCapped = hasActiveToday
    && (activeNow > activeCeiling || activeNow > baselineCeiling);
  // 超了就不是「削到天花板」而是「这个数不能用」：退回按平时节奏推算，
  // 拿天花板当真值等于把编出来的数字当依据，只是错得少一点而已。
  const activeAccepted = hasActiveToday && !activeCapped ? activeNow : 0;
  const activeTrusted = activeCapped || !hasActiveToday
    ? (hasBaselineActive ? baselineActiveValue * curveNow : 0)
    : activeNow;

  let activeFullDay;
  let activeSource;
  if ((activeCapped || !hasActiveToday) && !hasBaselineActive) {
    // 活动字段缺失或已判为异常，且没有近期设备基线时，只能用静态 TDEE 中的
    // 活动增量兜底；把缺测当作 0 会系统性低估全天消耗。
    activeFullDay = hasFallbackTdee ? Math.max(0, fallbackTdeeValue - baseBmr) : 0;
    activeSource = 'formula-fallback';
  } else if (hasBaselineActive) {
    // 按"今天相对平时的活跃程度"外推剩余时间
    const expectedByNow = baselineActiveValue * curveNow;
    const pace = expectedByNow > 30 ? clamp(activeTrusted / expectedByNow, 0.4, 2.0) : 1;
    activeFullDay = activeTrusted + baselineActiveValue * (1 - curveNow) * pace;
    activeSource = activeCapped || !hasActiveToday ? 'device-baseline' : 'device-today';
  } else if (curveNow > 0.2) {
    activeFullDay = activeTrusted / curveNow;
    activeSource = 'device-today';
  } else {
    activeFullDay = hasFallbackTdee
      ? Math.max(activeTrusted, (fallbackTdeeValue - baseBmr) * 0.8)
      : activeTrusted;
    activeSource = 'device-today';
  }

  // Apple 的静息能量与活动能量已经是设备的总消耗拆分；固定再加 TEF 会重复计算。
  // 保留 tef 字段是为了兼容现有调用方，但该口径下恒为 0。
  const tef = 0;
  const total = round(basalFullDay + activeFullDay);

  return {
    basal: round(basalFullDay),
    basalSource,
    active: round(activeFullDay),
    activeSource,
    activeSoFar: round(activeAccepted),
    activeReported: hasActiveToday ? round(activeNow) : null,
    activeCapped,
    tef,
    tdee: total,
    // 到快照覆盖时刻为止的设备累计，不含任何外推；字段名为历史兼容保留
    measured: round((hasBasalToday ? basalNow : 0) + activeAccepted),
    projected: f < 0.98,
  };
}

/** 蛋白质目标（g/天） */
export function proteinTarget(profile, goalKey, today = new Date()) {
  assertValidProfile(profile, today);
  const weight = Number(profile.weightKg);
  const height = Number(profile.heightCm);
  const lbm = leanBodyMass(weight, profile.bodyFatPct);
  const goal = goalKey || profile.goal || 'maintain';

  if (profile.proteinPerKg > 0) {
    return { grams: round(weight * profile.proteinPerKg), basis: '自定义 g/kg 体重' };
  }
  // 默认按总重计算；体脂和 BMI 分界不隐式切换分母。
  const refWeight = weight;
  const perKg = goal === 'cut' ? 1.8 : goal === 'bulk' ? 1.8 : 1.4;
  return { grams: round(refWeight * perKg), basis: `${perKg} g/kg 体重` };
}

/**
 * 计算完整的每日营养目标。
 * @param {object} profile 身体信息与目标设置
 * @param {object} [dynamic] 动态消耗结果（有则用设备能量估算替代活动系数）
 */
export function dailyTargets(profile, dynamic = null, today = new Date()) {
  const check = validateProfile(profile, today);
  if (!check.valid) return unavailablePlan(profile, check.errors.join('；'));
  if (check.age < 19 || check.age > 78) return unavailablePlan(profile, '自动计划适用于 19–78 岁一般健康成人；当前年龄需个体评估');
  if (profile.goal === 'cut' && bmi(profile.weightKg, profile.heightCm) < 18.5) return unavailablePlan(profile, 'BMI 偏低与减脂目标冲突，暂不生成限制摄入计划');
  const stat = staticTDEE(profile, today);
  const goal = GOALS[profile.goal] ? profile.goal : 'maintain';
  const requestedRate = profile.rateKgPerWeek != null
    ? Number(profile.rateKgPerWeek)
    : GOALS[goal].defaultRateKgPerWeek;
  const weight = Number(profile.weightKg);
  /*
   * 只拦离谱的输入，建议上沿不截断 —— 用户填的数照用，由界面说明它在哪一档。
   * 减和增的建议上沿不是同一个数（见 MAX_LOSS_RATE_PCT / MAX_GAIN_RATE_PCT）。
   */
  const absurd = weight * ABSURD_RATE_PCT;
  const rateByWeight = clamp(requestedRate, -absurd, absurd);
  // 输入本身就离谱（不是被后面的每日热量上限收敛的）
  const rateAbsurd = Math.abs(requestedRate) > absurd + 1e-9;
  const advisoryCap = requestedRate < 0 ? weight * MAX_LOSS_RATE_PCT : weight * MAX_GAIN_RATE_PCT;

  const hasDynamicTdee = dynamic?.tdee > 0;
  const hasDeviceContribution = hasDynamicTdee
    && (dynamic.basalSource !== 'formula' || dynamic.activeSource !== 'formula-fallback');
  const tdee = hasDynamicTdee ? dynamic.tdee : stat.tdee;
  // 固定 7700 只是短期预算近似；离谱值已经在上面拦掉，这里再限制常用的 500–750 kcal 调整范围。
  const requestedDailyDelta = (rateByWeight * KCAL_PER_KG_FAT) / 7;
  const plannedDelta = clamp(requestedDailyDelta, -750, 500);

  let kcal = tdee + plannedDelta;
  // 常用成人减重计划的保守下限；不是“BMR 硬下限”，个体化医疗方案应由专业人员制定。
  const floor = profile.sex === 'female' ? 1200 : 1500;
  const clampedByFloor = kcal < floor;
  kcal = round(Math.max(kcal, floor));
  const dailyDelta = round(kcal - tdee);
  if ((goal === 'cut' && dailyDelta >= 0) || (goal === 'bulk' && dailyDelta <= 0)
    || (goal === 'maintain' && Math.abs(dailyDelta) > 1)) {
    return unavailablePlan(profile, '应用计划下限与目标方向冲突，当前设置不能生成该目标');
  }
  if (rateAbsurd) return unavailablePlan(profile, '输入速率超出本应用自动计划范围');
  const rate = round((dailyDelta * 7) / KCAL_PER_KG_FAT, 2);
  /*
   * 三个状态，界面要说不同的话：
   *   rateWasClamped   算出来的和填的不一样
   *   rateLimitedBy    **最终**是哪一条决定了这个数 —— 文案只许点名它一个。
   *                    原先那句「按体重比例和每日热量调整上限」点了两个机制，
   *                    而实测只有一条在起作用，另一条根本没碰到。
   *   rateOverAdvisory 最终这个速度站在建议上沿之外（不管是不是被截断过）
   */
  const rateWasClamped = Math.abs(rate - requestedRate) > 0.005;
  // 谁最后决定了这个数：先按离谱上限收，再按每日热量上限收，后者更靠后
  const cappedByDailyKcal = Math.abs(requestedDailyDelta - plannedDelta) > 0.5;
  const rateLimitedBy = !rateWasClamped ? null
    : clampedByFloor ? 'floor' : cappedByDailyKcal ? 'daily-kcal' : rateAbsurd ? 'absurd' : null;
  const rateAdvisoryPct = weight > 0 ? round((advisoryCap / weight) * 100, 2) : null;
  const ratePctOfWeight = weight > 0 ? round((Math.abs(rate) / weight) * 100, 2) : null;
  const overAdvisory = Math.abs(rate) > advisoryCap + 0.025;

  const proteinPlan = proteinTarget(profile, goal, today);

  // 在同一个热量约束里求解三大宏量：先保留产品的低碳下限，再放入脂肪和蛋白目标。
  // 50 g 是工程护栏而非推荐量；低于 130 g RDA 时会另行提示。
  const carbFloor = CARB_HARD_FLOOR_G;
  const fatFloor = Math.min(weight * 0.8, (kcal * 0.35) / ATWATER.fat);
  const maxProtein = Math.max(0,
    (kcal - fatFloor * ATWATER.fat - carbFloor * ATWATER.carb) / ATWATER.protein);
  let protein = Math.min(proteinPlan.grams, maxProtein);
  const proteinCapped = protein + 0.01 < proteinPlan.grams;
  let fat = clamp((kcal * 0.25) / ATWATER.fat, fatFloor, (kcal * 0.35) / ATWATER.fat);
  let carb = (kcal - protein * ATWATER.protein - fat * ATWATER.fat) / ATWATER.carb;
  if (carb < carbFloor) {
    carb = carbFloor;
    fat = Math.max(fatFloor,
      (kcal - protein * ATWATER.protein - carb * ATWATER.carb) / ATWATER.fat);
  }
  if (protein * 4 + fat * 9 + carb * 4 > kcal + 0.01) {
    protein = Math.max(0, (kcal - fat * 9 - carb * 4) / 4);
  }

  const proteinRounded = round(protein);
  const fatRounded = round(fat);
  // fat 是用于闭合宏量热量的计划点，不是“吃过就超标”的上限。
  // AMDR 的真正上界是总能量的 35%，单独返回给界面与推荐算法使用。
  const fatUpper = round((kcal * 0.35) / ATWATER.fat);
  // AMDR 的下界是 20%。界面把脂肪当区间画，两头都得有依据，
  // 不能一头是文献值、另一头随手取个数。
  const fatLower = round((kcal * 0.20) / ATWATER.fat);
  const carbRounded = round(Math.max(0,
    (kcal - proteinRounded * ATWATER.protein - fatRounded * ATWATER.fat) / ATWATER.carb), 1);
  /*
   * 碳水的区间不是照抄 AMDR 的 45%~65%，而是拿今天这些热量和脂肪 AMDR 的两端联立解出来的：
   * 脂肪吃到上界，碳水就落到下界；脂肪吃到下界，碳水才顶到上界。
   * 区间说的是「多吃的脂肪得从碳水里扣」这件事本身，而不是凭空给一个该吃多少的靶子。
   *
   * 直接搬 AMDR 会自相矛盾：高蛋白减脂档里蛋白就占掉四成供能，照方案吃到的碳水（76g）
   * 远在 45% 供能（184g）以下，卡片会写「低于建议 108g」—— 应用在指责用户
   * 执行了它自己开的方案。碳水真低到有生理风险时另有 carbBelowRda（IOM 130g RDA）说话，
   * 不该由这条区间兼职。末尾夹住 carbRounded 是因为碳水撞到 50g 护栏时脂肪会被反算下去，
   * 那种情况下计划值可能落在联立解之外。
   */
  const carbAtFat = (f) => (kcal - proteinRounded * ATWATER.protein - f * ATWATER.fat) / ATWATER.carb;
  // 取整只许把区间放宽：四舍五入过的下界曾经比计划值本身还高 0.2g，
  // 卡片于是对着照方案吃的人写「低于建议」。
  const carbLower = Math.max(0, Math.floor(Math.min(carbAtFat(fatUpper), carbRounded)));
  const carbUpper = Math.ceil(Math.max(carbAtFat(fatLower), carbRounded));

  return {
    status: 'ready', reason: null,
    goal,
    rateKgPerWeek: rate,
    requestedRateKgPerWeek: requestedRate,
    rateWasClamped,
    rateLimitedBy,
    rateAbsurd,
    // 最终速度站在建议上沿之外 —— 界面据此说明它站在哪儿，而不是改掉它
    rateOverAdvisory: overAdvisory,
    rateAdvisoryKg: round(advisoryCap, 2),
    rateAdvisoryPct,
    ratePctOfWeight,
    bmr: stat.bmr,
    formula: stat.formula,
    lbm: stat.lbm,
    staticTdee: stat.tdee,
    ageEstimated: stat.ageEstimated === true,
    basalSource: dynamic?.basalSource || 'formula',
    activeSource: dynamic?.activeSource || 'formula-fallback',
    measuredKcal: dynamic?.measured ?? null,
    carbBelowRda: round(carb) < CARB_RDA_G,
    tdee: round(tdee),
    tdeeSource: hasDeviceContribution ? 'apple' : 'formula',
    // 今天的活动能量数值不可信、已改按平时节奏估算 —— 要让界面能说出这件事，
    // 否则用户看到一个正常的目标，不会知道自己的快捷指令取错了数据
    activeCapped: dynamic?.activeCapped === true,
    activeReported: dynamic?.activeReported ?? null,
    dailyDelta,
    clampedByFloor,
    kcal,
    protein: proteinRounded,
    proteinBasis: proteinCapped ? `${proteinPlan.basis}（受总热量约束已下调）` : proteinPlan.basis,
    proteinCapped,
    fat: fatRounded,
    fatUpper,
    fatLower,
    carb: carbRounded,
    carbLower,
    carbUpper,
    fiber: 25,
    fiberUpper: 30,
    ...nutrientReferences(profile, kcal),
    waterMl: profile.sex === 'female' ? 1500 : 1700, // 温和气候、低身体活动成人饮水参考
  };
}

/** 已核实 WHO 一般成人钠及游离糖参考。年龄钠表未核实，不启用；5% 为进一步益处参考。 */
export function nutrientReferences(profile = {}, kcal = 2000) {
  const age = ageFrom(profile);
  const energy = Number(kcal) > 0 ? Number(kcal) : 2000;
  return {
    sodium: 2000,
    sodiumAttention: null,
    sugar: Math.min(50, energy * 0.1 / ATWATER.carb),
    sugarAttention: Math.min(25, energy * 0.05 / ATWATER.carb),
  };
}

/** 汇总一组饮食条目的营养 */
export const NUTRIENT_KEYS = ['kcal', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'totalSugar', 'sodium'];
/** Read-time migration only. Old custom forms converted blanks to zero and did not
 * specify carbohydrate/free-sugar semantics. Keep that snapshot for review. */
export function normalizeDietEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  if (entry.nutritionSchema >= 2 || !(entry.custom || String(entry.foodId || '').startsWith('custom_'))) return entry;
  const raw = entry.legacyNutrition || Object.fromEntries(NUTRIENT_KEYS.map(k => [k, entry[k] ?? null]));
  return { ...entry, legacyNutrition: raw, nutritionReview: true, carbBasis: 'unknown',
    ...Object.fromEntries(NUTRIENT_KEYS.filter(k => k !== 'kcal').map(k => [k,null])) };
}
export const isNutrientNumber = v => (typeof v === 'number' || typeof v === 'string') && v !== '' && String(v).trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;
export function nutrientIssues(entry = {}, index = null) {
  const issues = NUTRIENT_KEYS.filter(k => entry[k] != null && entry[k] !== '' && !isNutrientNumber(entry[k]))
    .map(field => ({ id: entry.id ?? index, name: entry.name || entry.foodName || '', field, value: entry[field], reason: '需为非负有限数' }));
  if (isNutrientNumber(entry.sugar) && isNutrientNumber(entry.totalSugar) && Number(entry.sugar) > Number(entry.totalSugar)) issues.push({ id: entry.id ?? index, name: entry.name || '', field: 'sugar', value: entry.sugar, reason: '游离糖不能超过总糖' });
  return issues;
}
export function sumNutrients(entries = []) {
  const total = Object.fromEntries(NUTRIENT_KEYS.map(k => [k, 0]));
  const coverage = Object.fromEntries(NUTRIENT_KEYS.map(k => [k, { known: 0, total: entries.length, complete: true }]));
  const issues = [];
  entries.map(normalizeDietEntry).forEach((e, i) => {
    if (!e || typeof e !== 'object') { issues.push({ id: i, reason: '条目格式无效' }); Object.values(coverage).forEach(c => { c.complete = false; }); return; }
    const invalid = nutrientIssues(e, i);
    issues.push(...invalid);
    for (const k of NUTRIENT_KEYS) {
      const v = e[k];
      if (!isNutrientNumber(v) || invalid.some(issue => issue.field === k)) { coverage[k].complete = false; continue; }
      const sum = total[k] + Number(v);
      if (!Number.isFinite(sum)) { coverage[k].complete = false; issues.push({ id: e.id ?? i, field: k, reason: '合计溢出' }); continue; }
      total[k] = sum; coverage[k].known += 1;
    }
  });
  for (const k of NUTRIENT_KEYS) total[k] = round(total[k], 1);
  return { ...total, coverage, issues };
}

/** 目标 vs 实际的差额与完成度 */
export function computeGaps(targets = {}, intake = {}) {
  const out = {};
  for (const k of ['kcal', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium']) {
    const target = targets[k] != null && Number.isFinite(Number(targets[k])) && Number(targets[k]) >= 0 ? Number(targets[k]) : null;
    const known = intake[k] != null && intake[k] !== '' && Number.isFinite(Number(intake[k])) && Number(intake[k]) >= 0;
    const eaten = known ? Number(intake[k]) : 0;
    const complete = known && intake.coverage?.[k]?.complete !== false;
    out[k] = { target, eaten: round(eaten,1), complete,
      remaining: complete && target != null ? round(target-eaten,1) : null,
      pct: complete && target > 0 ? round(eaten/target*100) : null };
    if (k === 'fat') {
      const upper = targets.fatUpper ?? target;
      Object.assign(out[k], { upper, upperRemaining: complete && upper != null ? round(upper-eaten,1) : null,
        upperPct: complete && upper > 0 ? round(eaten/upper*100) : null });
    }
  }
  return out;
}

export { clamp, round };

/** No invented person's targets: nullable shape keeps record views usable. */
export function unavailablePlan(profile = {}, reason = '请完善身体信息') {
  return { status: 'unavailable', reason, goal: GOALS[profile?.goal] ? profile.goal : 'maintain',
    ...Object.fromEntries(['kcal', 'protein', 'fat', 'fatUpper', 'fatLower', 'carb', 'carbLower', 'carbUpper', 'fiber', 'fiberUpper', 'sodium', 'sugar', 'tdee', 'bmr', 'dailyDelta', 'rateKgPerWeek'].map(k => [k, null])),
    requestedRateKgPerWeek: profile?.rateKgPerWeek ?? null };
}
