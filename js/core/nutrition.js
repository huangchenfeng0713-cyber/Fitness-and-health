/**
 * 营养目标计算引擎
 * 纯函数模块，不依赖 DOM，可在 Node 中单元测试。
 *
 * 主要能力：
 *  1. 基础代谢 BMR（Mifflin-St Jeor / Katch-McArdle）
 *  2. 静态 TDEE（活动系数）与动态 TDEE（结合 Apple 设备当日能量记录）
 *  3. 热量 / 蛋白质 / 脂肪 / 碳水 / 纤维 / 钠 / 糖 / 饮水 的每日目标
 *  4. 当日预算的实时再分配（按已过时间、已摄入量）
 */

/*
 * 1 kg 脂肪组织约含 7700 kcal（Wishnofsky 1958，英制原文是 3500 kcal/lb）。
 * 这是个经验换算，不是精确的生理常数：真实的体重变化里还有瘦体重、水分和
 * 代谢适应，所以凡是用它的地方都要说成「脂肪当量」，不能说成「会瘦多少」。
 */
export const KCAL_PER_KG_FAT = 7700;

/** 碳水 RDA（IOM/DRI，依据大脑葡萄糖利用量）。低于它只提示，不强行拉高目标 */
export const CARB_RDA_G = 130;
/** 本应用的碳水硬下限，纯工程护栏，不是营养推荐量 */
export const CARB_HARD_FLOOR_G = 50;
export const ATWATER = { protein: 4, carb: 4, fat: 9, alcohol: 7 };

/*
 * 活动系数。沿用 Harris-Benedict 体系里流传最广的那组倍数（1.2 / 1.375 / 1.55 /
 * 1.725 / 1.9）。要说清楚：这组数字是营养实践里的**惯例**，不是某项测量的结果，
 * 不同教科书给的档位也略有出入。
 *
 * 它只在「没有 Apple 健康数据」时决定 TDEE。一旦当天有设备活动能量记录，
 * dynamicTDEE 会改用「静息 + 活动」，不再乘这个系数或重复叠加固定 TEF，
 * 所以不存在把运动量算两遍的问题。
 */
export const ACTIVITY_LEVELS = {
  sedentary: { key: 'sedentary', label: '久坐（几乎不运动）', factor: 1.2 },
  light: { key: 'light', label: '轻度活动（每周 1-3 次）', factor: 1.375 },
  moderate: { key: 'moderate', label: '中等活动（每周 3-5 次）', factor: 1.55 },
  active: { key: 'active', label: '高强度（每周 6-7 次）', factor: 1.725 },
  athlete: { key: 'athlete', label: '运动员 / 体力劳动', factor: 1.9 },
};

/*
 * 体重变化速率的上限，按占体重的比例/周。计划和判读共用这两个数 ——
 * 「计划允许多快」和「实测多快算偏快」不该是两个门槛。
 *
 * 减：1%/周。再快下去掉的就不只是脂肪。约束的是脂肪能被动员多快。
 * 增：0.5%/周。约束的是另一回事 —— 肌肉本身长多快。即便新手，肌肉的
 *     增肌期常用的体重变化参考是每周 0.25%~0.5%；更快增重可能提高脂肪增加比例。
 * 两者共用一个 1% 会允许 45kg 的人计划每周 +0.45kg，一个月长 4% 体重。
 */
export const MAX_LOSS_RATE_PCT = 0.01;
export const MAX_GAIN_RATE_PCT = 0.005;

/*
 * 上面两个是**建议上沿**，不是硬闸门。
 *
 * 证据支持的是「超过这个速度，脂肪增加或瘦体重流失风险可能上升」，
 * 不是「0.517% 不安全，必须拦下」。原先按 0.5% 硬截断，58kg 的人填 0.30
 * 会被悄悄改成 0.29 —— 差 11 kcal/天，远小于食物估算和 TDEE 的误差，
 * 却让界面说出「你填的 0.3 过快」这种过度精确的话。
 *
 * 现在只拦明显不可能的输入：每周超过体重的 1.5%。那个量级已经不是
 * 「激进的计划」而是填错了（60kg 的人每周 ±0.9kg）。
 * 落在建议上沿和硬上限之间的值原样保留，由界面说明它站在哪儿。
 */
export const ABSURD_RATE_PCT = 0.015;

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

/** 没填生日也没填年龄时的兜底值。用到它的地方必须让界面提示「这是估算」 */
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
      if (a > 0 && a < 120) return a;
    }
  }
  return Number(profile?.age) > 0 ? Number(profile.age) : DEFAULT_AGE;
}

/** 年龄到底是填的还是兜底猜的 —— Mifflin-St Jeor 里年龄每差 10 岁就是 50 kcal */
export function ageIsEstimated(profile, today = new Date()) {
  // 设置页没有“年龄”输入框；默认档案用 ageEstimated 标记 30 岁占位值。
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
        + '这个量级已经不是激进的计划而是填错了，请先改小。',
    };
  }
  if (magnitude > advisoryKg + 1e-9) {
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

  // Katch-McArdle：BMR = 370 + 21.6 × 瘦体重(kg)。有体脂率时优先，因为它对体成分敏感，
  // 且不需要年龄和性别——填了体脂率的人能拿到更硬的依据。
  if (lbm) {
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
export function staticTDEE(profile) {
  const { kcal: bmr, formula, lbm, ageEstimated } = basalMetabolicRate(profile);
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
  /*
   * 第二道：和这个人自己近期的活动量比。
   *
   * 上面那条速率天花板只在一天刚开始时收得紧 —— 到了晚上 elapsedMin 接近 1440，
   * 它涨到 21600 kcal，而它本来就是为了拦「导入端把多天累加成一天」写的：
   * 日均 600 kcal 的人晚上报来 18000（一个月的量）照样放行，
   * 热量目标被顶到 19717 kcal。那不是「今天练得狠」，是数据错了。
   *
   * 所以再按本人基线卡一道：4 倍日均、或日均 + 2500 kcal，取宽的那个。
   * 一场马拉松的活动能量约 2600 kcal，日均 600 的人放行到 3100，接得住；
   * 按天累加出来的假数据一定会超。没有基线时这条不生效 ——
   * 新用户手上没有可比的数，宁可信设备。
   *
   * 两个都是护栏，没有生理含义，只是「这个数还能不能当依据」的判断。
   */
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
 * @param {object} [dynamic] 动态消耗结果（有则用设备能量估算替代活动系数）
 */
export function dailyTargets(profile, dynamic = null) {
  assertValidProfile(profile);
  const stat = staticTDEE(profile);
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
    : cappedByDailyKcal ? 'daily-kcal' : rateAbsurd ? 'absurd' : 'floor';
  const rateAdvisoryPct = weight > 0 ? round((advisoryCap / weight) * 100, 2) : null;
  const ratePctOfWeight = weight > 0 ? round((Math.abs(rate) / weight) * 100, 2) : null;
  const overAdvisory = Math.abs(rate) > advisoryCap + 1e-9;

  const proteinPlan = proteinTarget(profile, goal);

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
    // 恢复备份和云端同步是绕过 addEntry 直接落库的，条目里混进 null 不是假想：
    // 这里一抛，recompute 就断了，用户连设置抽屉都打不开、没法回去删那条数据
    if (!e || typeof e !== 'object') continue;
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
    if (k === 'fat') {
      const upper = Number(targets.fatUpper) || target;
      out[k].upper = round(upper, 1);
      out[k].upperRemaining = round(upper - eaten, 1);
      out[k].upperPct = upper > 0 ? round((eaten / upper) * 100) : 0;
    }
  }
  return out;
}

export { clamp, round };
