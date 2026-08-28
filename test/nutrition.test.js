import test from 'node:test';
import assert from 'node:assert/strict';
import {
  basalMetabolicRate, staticTDEE, dailyTargets, dynamicTDEE, activityCurve,
  leanBodyMass, bmi, bmiCategory, ageFrom, proteinTarget, sumNutrients, computeGaps,
  validateProfile, ATWATER, KCAL_PER_KG_FAT, CARB_RDA_G, ACTIVITY_LEVELS, ageIsEstimated,
  rateGuidance, MAX_GAIN_RATE_PCT, MAX_LOSS_RATE_PCT,
} from '../js/core/nutrition.js';

const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

const male = { sex: 'male', age: 30, heightCm: 175, weightKg: 72, activity: 'light', goal: 'maintain' };
const female = { sex: 'female', age: 28, heightCm: 162, weightKg: 55, activity: 'sedentary', goal: 'cut' };

test('Mifflin-St Jeor 与已知数值一致', () => {
  // 10*72 + 6.25*175 - 5*30 + 5 = 1668.75 → 1669
  assert.equal(basalMetabolicRate(male).kcal, 1669);
  // 10*55 + 6.25*162 - 5*28 - 161 = 1261.5 → 1262（Math.round 向上）
  assert.equal(basalMetabolicRate(female).kcal, 1262);
  assert.equal(basalMetabolicRate(male).formula, 'Mifflin-St Jeor');
});

test('有体脂率时改用 Katch-McArdle', () => {
  const r = basalMetabolicRate({ ...male, bodyFatPct: 18 });
  assert.equal(r.formula, 'Katch-McArdle');
  // 370 + 21.6 * (72 * 0.82) = 370 + 1275.26 = 1645
  assert.equal(r.kcal, 1645);
});

test('年龄由生日推算，跨生日前后差一岁', () => {
  assert.equal(ageFrom({ birthday: '1995-03-01' }, new Date(2026, 1, 28)), 30);
  assert.equal(ageFrom({ birthday: '1995-03-01' }, new Date(2026, 2, 1)), 31);
  assert.equal(ageFrom({}), 30, '缺数据时回落到 30');
});

test('瘦体重与 BMI 分类', () => {
  assert.equal(leanBodyMass(72, 18), 59.04);
  assert.equal(leanBodyMass(72, null), null);
  assert.equal(leanBodyMass(72, 80), null, '荒谬的体脂率应被拒绝');
  assert.equal(bmi(72, 175), 23.5);
  assert.equal(bmiCategory(23.5).key, 'normal');
  assert.equal(bmiCategory(29).key, 'obese');
  assert.equal(bmiCategory(17).key, 'under');
});

test('TDEE = BMR × 活动系数', () => {
  const s = staticTDEE(male);
  assert.equal(s.factor, 1.375);
  assert.equal(s.tdee, Math.round(1669 * 1.375));
});

test('减脂目标产生赤字，增肌产生盈余', () => {
  const cut = dailyTargets({ ...male, goal: 'cut' });
  const bulk = dailyTargets({ ...male, goal: 'bulk' });
  const keep = dailyTargets({ ...male, goal: 'maintain' });
  assert.equal(cut.dailyDelta, -550, '0.5kg/周 ≈ 每天 550 kcal');
  assert.ok(cut.kcal < keep.kcal);
  assert.ok(bulk.kcal > keep.kcal);
});

test('过激速率会按体重比例、每日赤字和成人常用下限共同限制', () => {
  const extreme = dailyTargets({ ...female, rateKgPerWeek: -1.5 });
  assert.ok(extreme.clampedByFloor, '过激的目标速率应触发下限保护');
  assert.ok(extreme.kcal >= 1200);
  assert.ok(extreme.rateWasClamped);
  assert.ok(Math.abs(extreme.rateKgPerWeek) <= female.weightKg * 0.01 + 0.01);
  assert.ok(extreme.dailyDelta >= -750);
});

test('宏量营养素分配自洽：三大宏量的热量之和与总热量闭合', () => {
  for (const p of [male, female, { ...male, goal: 'bulk' }, { ...male, bodyFatPct: 25, goal: 'cut' }]) {
    const t = dailyTargets(p);
    const fromMacros = t.protein * 4 + t.fat * 9 + t.carb * 4;
    assert.ok(Math.abs(fromMacros - t.kcal) <= 4,
      `${JSON.stringify(p.goal)}: 宏量合计 ${fromMacros} 与目标 ${t.kcal} 偏差过大`);
    assert.ok(t.fat >= p.weightKg * 0.7, '脂肪不应低于必需量');
    assert.ok(t.fatUpper >= t.fat, '脂肪计划值不能高于 AMDR 参考上限');
    assert.ok(Math.abs(t.fatUpper * 9 - t.kcal * 0.35) <= 5,
      '脂肪参考上限应对应总能量的 35%');
    assert.ok(t.carb >= 50, '碳水有保底');
  }
});

test('蛋白质目标：减脂 > 维持，且以瘦体重为基准更高', () => {
  const cut = proteinTarget({ ...male, bodyFatPct: 18 }, 'cut');
  const keep = proteinTarget({ ...male, bodyFatPct: 18 }, 'maintain');
  assert.ok(cut.grams > keep.grams);
  assert.match(cut.basis, /瘦体重/);
  assert.match(proteinTarget(male, 'cut').basis, /体重/);
});

test('自定义 g/kg 覆盖默认算法', () => {
  const t = proteinTarget({ ...male, proteinPerKg: 2 }, 'cut');
  assert.equal(t.grams, 144);
});

test('非法身体信息和过高自定义蛋白不会生成伪精确结果', () => {
  assert.equal(validateProfile({}).valid, false);
  assert.throws(() => basalMetabolicRate({}), /身体|性别|体重/);
  assert.throws(() => dailyTargets({ ...male, rateKgPerWeek: 'x' }), /目标速率/);
  assert.throws(() => proteinTarget({ ...male, proteinPerKg: 8 }, 'cut'), /蛋白质/);
  assert.throws(() => dailyTargets({ ...male, sex: 'unknown' }), /性别/);
  assert.match(validateProfile({ ...male, goal: 'cut', rateKgPerWeek: 0.3 }).errors.join('；'), /不能为正数/);
  assert.match(validateProfile({ ...male, goal: 'bulk', rateKgPerWeek: -0.3 }).errors.join('；'), /不能为负数/);
  assert.match(validateProfile({ ...male, goal: 'maintain', rateKgPerWeek: 0.1 }).errors.join('；'), /应为 0/);
});

test('中国成人纤维与饮水参考口径', () => {
  const m = dailyTargets(male);
  const f = dailyTargets(female);
  assert.ok(m.fiber >= 25 && m.fiber <= 30);
  assert.equal(m.waterMl, 1700);
  assert.equal(f.waterMl, 1500);
});

test('活动曲线：凌晨为 0，深夜为 1，单调不减', () => {
  assert.equal(activityCurve(0), 0);
  assert.equal(activityCurve(6 / 24), 0);
  assert.equal(activityCurve(1), 1);
  let prev = -1;
  for (let i = 0; i <= 24; i += 1) {
    const v = activityCurve(i / 24);
    assert.ok(v >= prev, `曲线在 ${i} 点回退了`);
    prev = v;
  }
});

test('动态 TDEE：活动多的一天预算更高', () => {
  const lazy = dynamicTDEE({ bmr: 1669, activeSoFar: 150, dayFraction: 1, baselineActive: 400 });
  const busy = dynamicTDEE({ bmr: 1669, activeSoFar: 900, dayFraction: 1, baselineActive: 400 });
  assert.ok(busy.tdee > lazy.tdee + 500);
});

test('动态 TDEE 优先使用健康快照覆盖时间，不受页面当前时间参数影响', () => {
  const base = {
    bmr: 1600, activeSoFar: 250, basalSoFar: 800,
    baselineResting: 1600, baselineActive: 400, observationFraction: 0.5,
  };
  const noon = dynamicTDEE({ ...base, dayFraction: 0.5 });
  const night = dynamicTDEE({ ...base, dayFraction: 0.95 });
  assert.deepEqual(night, noon, '同一份 12:00 快照不能因为页面到了深夜而改变预计消耗');
});

test('动态 TDEE：清晨不会把静息能量外推成天文数字', () => {
  // 凌晨 4 点（f≈0.17）只有 340 kcal 静息数据，早期版本会外推成 ~2000
  const early = dynamicTDEE({ bmr: 1640, basalSoFar: 340, activeSoFar: 0, dayFraction: 0.17, baselineActive: 500 });
  assert.equal(early.basal, 1640, '未过半天时应直接用公式值');
  const late = dynamicTDEE({ bmr: 1640, basalSoFar: 1500, activeSoFar: 400, dayFraction: 0.8, baselineActive: 500 });
  assert.ok(late.basal <= 1640 * 1.4, '外推结果被限制在合理范围');
  assert.ok(late.basal >= 1640 * 0.8);
});

test('动态 TDEE 会把已发生的活动外推到全天', () => {
  const midday = dynamicTDEE({ bmr: 1600, activeSoFar: 200, dayFraction: 0.5, baselineActive: 500 });
  assert.ok(midday.active > 200, '中午时应预估下午还会继续消耗');
  assert.ok(midday.projected, '未过完的一天应标记为预估');
});

test('动态 TDEE 与 Apple 静息+活动口径一致，不重复叠加固定 TEF', () => {
  const full = dynamicTDEE({ bmr: 1600, basalSoFar: 1600, activeSoFar: 500, dayFraction: 1, intakeKcal: 2200 });
  assert.equal(full.tdee, 2100);
  assert.equal(full.tef, 0);
});

test('活动字段缺失不等于零：优先基线，无基线才用活动系数补足', () => {
  const withBaseline = dynamicTDEE({
    bmr: 1600, basalSoFar: 800, activeSoFar: null, observationFraction: 0.5,
    baselineActive: 450, fallbackTDEE: 2200,
  });
  assert.equal(withBaseline.activeSource, 'device-baseline');
  assert.equal(withBaseline.active, 450);
  assert.equal(withBaseline.measured, 800, '缺失活动不能伪装成设备累计值');

  const fallback = dynamicTDEE({
    bmr: 1600, basalSoFar: 800, activeSoFar: null, observationFraction: 0.5,
    fallbackTDEE: 2200,
  });
  assert.equal(fallback.activeSource, 'formula-fallback');
  assert.equal(fallback.active, 600);
  assert.equal(fallback.tdee, 2200);
  assert.equal(dailyTargets({ ...male }, fallback).tdeeSource, 'apple',
    '静息部分已采用今天设备记录，仍属于混合设备估算');

  const explicitZero = dynamicTDEE({
    bmr: 1600, basalSoFar: 800, activeSoFar: 0, observationFraction: 0.5,
    fallbackTDEE: 2200,
  });
  assert.equal(explicitZero.activeSource, 'device-today');
  assert.equal(explicitZero.active, 0, '明确记录的 0 才能按零活动处理');

  const tooEarlyForEither = dynamicTDEE({
    bmr: 1600, basalSoFar: 250, activeSoFar: null, observationFraction: 0.15,
    fallbackTDEE: 2200,
  });
  assert.equal(dailyTargets({ ...male }, tooEarlyForEither).tdeeSource, 'formula',
    '静息和活动都回退公式时，界面不能伪装成 Apple 动态目标');
});

test('异常活动且无历史基线时回退到静态活动量，而不是把活动清零', () => {
  const result = dynamicTDEE({
    bmr: 1600, basalSoFar: 800, activeSoFar: 12000, observationFraction: 0.5,
    fallbackTDEE: 2200,
  });
  assert.equal(result.activeCapped, true);
  assert.equal(result.activeSource, 'formula-fallback');
  assert.equal(result.active, 600);
  assert.equal(result.measured, 800, '被拒绝的活动值不能混入设备累计');
});

test('营养汇总与差额', () => {
  const total = sumNutrients([
    { kcal: 300, protein: 20, fat: 10, carb: 30, fiber: 2, sugar: 3, sodium: 400 },
    { kcal: 200.5, protein: 5.5, fat: 2, carb: 40, fiber: 1, sugar: 1, sodium: 100 },
  ]);
  assert.equal(total.kcal, 500.5);
  assert.equal(total.protein, 25.5);
  assert.equal(total.totalSugar, 0, '旧条目没有 totalSugar 时不应凭空猜测');
  const gaps = computeGaps({ kcal: 2000, protein: 120 }, total);
  assert.equal(gaps.kcal.remaining, 1499.5);
  assert.equal(gaps.protein.pct, 21);
  const fatGap = computeGaps({ fat: 60, fatUpper: 84 }, { fat: 72 }).fat;
  assert.equal(fatGap.remaining, -12, '可以超过计划值');
  assert.equal(fatGap.upperRemaining, 12, '未超过真正的参考上限');
});


/* ------------------------------------------- 活动能量的合理性上限 */

test('凌晨报来不可能的活动能量时，热量目标不被顶高', () => {
  // 用户实测：00:57 存进来活动能量 2010 kcal（近期日均 310），
  // 折合 35 kcal/分钟持续一小时，世界纪录级选手也做不到。
  // 不拦的话 TDEE 被算成 4142 kcal，目标顶到 4455。
  const f = 57 / 1440;
  const bad = dynamicTDEE({
    bmr: 1580, activeSoFar: 2010, basalSoFar: 23520, dayFraction: f,
    baselineActive: 310, intakeKcal: 0, fallbackTDEE: 2423,
  });
  const none = dynamicTDEE({
    bmr: 1580, activeSoFar: 0, basalSoFar: null, dayFraction: f,
    baselineActive: 310, intakeKcal: 0, fallbackTDEE: 2423,
  });
  assert.equal(bad.activeCapped, true, '应识别出这个数不可能');
  assert.equal(bad.activeReported, 2010, '原始值仍要能读到，便于提示用户');
  assert.ok(bad.tdee < 2400, `TDEE 应回到正常量级，实得 ${bad.tdee}`);
  assert.ok(Math.abs(bad.tdee - none.tdee) < 30,
    `不可信的数据应等同于「今天还没有活动数据」，实得 ${bad.tdee} vs ${none.tdee}`);
});

test('晚上报来的多天累加值也要拦住，不能只在凌晨管用', () => {
  /*
   * 15 kcal/分钟那条天花板到了晚上就形同虚设：elapsedMin 接近 1440，
   * 上限涨到 21600 kcal。日均 600 的人 20:00 报来 18000（一个月的量）
   * 照样放行，热量目标被顶到 19717 kcal —— 而这正是那条护栏要拦的情况。
   */
  const evening = 20 / 24;
  const fake = dynamicTDEE({
    bmr: 1768, activeSoFar: 18000, basalSoFar: 1500, dayFraction: evening,
    baselineActive: 600, baselineResting: 1700, fallbackTDEE: 2600,
  });
  assert.equal(fake.activeCapped, true, `18000 kcal 活动能量必须被判为不可信，实得 tdee ${fake.tdee}`);
  assert.ok(fake.tdee < 3000, `TDEE 应回到正常量级，实得 ${fake.tdee}`);
  assert.equal(fake.activeReported, 18000, '原始值仍要能读到，界面才说得出哪儿不对');

  // 一场马拉松的活动能量约 2600 kcal —— 日均 600 的人真跑了也不该被误伤
  const marathon = dynamicTDEE({
    bmr: 1768, activeSoFar: 2600, basalSoFar: 1500, dayFraction: evening,
    baselineActive: 600, baselineResting: 1700, fallbackTDEE: 2600,
  });
  assert.equal(marathon.activeCapped, false, `马拉松被误判成脏数据，tdee ${marathon.tdee}`);

  // 久坐的人第一次去徒步：基线低，但绝对量并不离谱，靠 +2500 那一项放行
  const firstHike = dynamicTDEE({
    bmr: 1600, activeSoFar: 1800, basalSoFar: 1400, dayFraction: evening,
    baselineActive: 120, baselineResting: 1550, fallbackTDEE: 2000,
  });
  assert.equal(firstHike.activeCapped, false, '基线低不等于今天不能动，实得 capped=true');

  // 没有基线时这条不生效：新用户手上没有可比的数，宁可信设备
  const noBaseline = dynamicTDEE({
    bmr: 1768, activeSoFar: 3000, basalSoFar: 1500, dayFraction: evening, fallbackTDEE: 2600,
  });
  assert.equal(noBaseline.activeCapped, false);
});

test('真实的大运动量不会被上限误伤', () => {
  // 半天骑车 700 kcal：12 小时里平均不到 1 kcal/分钟，完全正常
  const hard = dynamicTDEE({
    bmr: 1580, activeSoFar: 700, basalSoFar: null, dayFraction: 0.5,
    baselineActive: 310, intakeKcal: 0, fallbackTDEE: 2423,
  });
  assert.equal(hard.activeCapped, false);
  assert.equal(hard.activeSoFar, 700, '原样采信');
  assert.ok(hard.active > 1100, `应把高于平时的活动节奏外推到全天，实得 ${hard.active}`);
  assert.equal(hard.tdee, 1580 + hard.active, 'Apple 口径只合计静息与活动，不重复叠加 TEF');
});

test('一小时高强度训练在上限之内', () => {
  // 早上 7 点练了一小时，烧掉 600 kcal：10 kcal/分钟，剧烈但可达
  const f = 8 / 24;
  const r = dynamicTDEE({
    bmr: 1600, activeSoFar: 600, basalSoFar: null, dayFraction: f,
    baselineActive: 300, intakeKcal: 0, fallbackTDEE: 2400,
  });
  assert.equal(r.activeCapped, false, '真实训练不该被判成异常');
});

test('静息能量在一天刚开始时本来就不被采信', () => {
  // 这条防线原本就有：凌晨按比例外推会把静息放大好几倍
  const r = dynamicTDEE({
    bmr: 1580, activeSoFar: 0, basalSoFar: 23520, dayFraction: 57 / 1440,
    baselineActive: 310, intakeKcal: 0, fallbackTDEE: 2423,
  });
  assert.equal(r.basal, 1580, '过半天之前一律用公式值');
});


/* ==================================================================
 * 公式对文献值。这一组不是回归测试，是「防止有人把公式改成拍脑袋的数」——
 * 每条都能追到出处，改动时必须先说明依据。
 * ================================================================== */

test('Mifflin-St Jeor 与原文公式逐项吻合', () => {
  // Mifflin MD et al., Am J Clin Nutr 1990;51:241-247
  //   男：10W + 6.25H − 5A + 5      女：10W + 6.25H − 5A − 161
  const cases = [
    { p: { ...male, age: 30, heightCm: 175, weightKg: 72 }, want: 10 * 72 + 6.25 * 175 - 5 * 30 + 5 },
    { p: { ...female, age: 28, heightCm: 162, weightKg: 55 }, want: 10 * 55 + 6.25 * 162 - 5 * 28 - 161 },
    { p: { ...male, age: 55, heightCm: 168, weightKg: 90 }, want: 10 * 90 + 6.25 * 168 - 5 * 55 + 5 },
  ];
  for (const { p, want } of cases) {
    const r = basalMetabolicRate(p);
    assert.equal(r.formula, 'Mifflin-St Jeor');
    assert.equal(r.kcal, Math.round(want), JSON.stringify(p));
  }
});

test('Katch-McArdle 与原文公式吻合，且优先于 Mifflin', () => {
  // Katch & McArdle：BMR = 370 + 21.6 × 瘦体重(kg)
  const p = { ...male, weightKg: 80, bodyFatPct: 20 };
  const lbm = 80 * 0.8;                       // 64 kg
  const r = basalMetabolicRate(p);
  assert.equal(r.formula, 'Katch-McArdle', '填了体脂率就该用体成分公式');
  assert.equal(r.kcal, Math.round(370 + 21.6 * lbm));
  assert.equal(r.lbm, 64);
});

test('Atwater 系数就是 4/4/9/7', () => {
  // 通用 Atwater 系数：蛋白 4、碳水 4、脂肪 9、乙醇 7 kcal/g
  assert.deepEqual(ATWATER, { protein: 4, carb: 4, fat: 9, alcohol: 7 });
});

test('脂肪当量沿用 Wishnofsky 的 7700 kcal/kg', () => {
  // Wishnofsky M, Am J Clin Nutr 1958（原文 3500 kcal/lb）
  assert.equal(KCAL_PER_KG_FAT, 7700);
  assert.ok(Math.abs(KCAL_PER_KG_FAT * 0.45359237 - 3492) < 10, '换算回英制应接近 3500 kcal/lb');
});

test('微量目标对齐各自的权威推荐值', () => {
  const t = dailyTargets({ ...male, weightKg: 72, activity: 'light' });
  // 膳食纤维：按 14 g / 1000 kcal 计算，并收敛到中国成人常用的 25–30 g 参考范围
  assert.equal(t.fiber, Math.round(Math.min(30, Math.max(25, (t.kcal / 1000) * 14))));
  // 钠：WHO 建议成人 < 2000 mg/天（约合 5 g 食盐）
  assert.equal(t.sodium, 2000);
  // 添加糖：WHO 建议游离糖 < 总能量的 10%
  assert.equal(t.sugar, Math.round((t.kcal * 0.1) / 4));
});

test('脂肪目标落在 IOM 的 AMDR 区间内（占总能量 20%~35%）', () => {
  for (const p of [male, female, { ...male, weightKg: 100 }, { ...female, weightKg: 45 }]) {
    const t = dailyTargets(p);
    const pct = (t.fat * 9) / t.kcal;
    assert.ok(pct >= 0.195 && pct <= 0.355, `${JSON.stringify(p)} 得到 ${(pct * 100).toFixed(1)}%`);
  }
});

test('碳水区间由当天热量预算解出，照方案吃绝不会被判成「低于建议」', () => {
  /*
   * 这条挡的是「碳水区间直接搬 AMDR 45%~65%」那版：
   * 高蛋白减脂档蛋白占掉四成供能，方案给的碳水（76g）远在 45% 供能（184g）以下，
   * 卡片会对着照方案吃的人写「低于建议 108g」—— 应用在指责用户执行它自己开的方案。
   */
  let checked = 0;
  for (const sex of ['male', 'female']) {
    for (const goal of ['cut', 'maintain', 'bulk']) {
      for (const activity of ['sedentary', 'light', 'moderate', 'active', 'athlete']) {
        for (const weightKg of [42, 55, 70, 80, 95, 120]) {
          for (const proteinPerKg of [undefined, 1.2, 1.6, 2.0, 2.4, 2.8]) {
            const t = dailyTargets({
              sex, age: 30, heightCm: sex === 'male' ? 175 : 162, weightKg, activity, goal, proteinPerKg,
            });
            const who = `${sex}/${goal}/${activity}/${weightKg}kg/${proteinPerKg}`;
            assert.ok(t.carbLower <= t.carb && t.carb <= t.carbUpper,
              `${who}：方案碳水 ${t.carb}g 掉在自己的建议区间 ${t.carbLower}–${t.carbUpper}g 外`);
            assert.ok(t.fatLower <= t.fat && t.fat <= t.fatUpper,
              `${who}：方案脂肪 ${t.fat}g 掉在 AMDR ${t.fatLower}–${t.fatUpper}g 外`);
            checked += 1;
          }
        }
      }
    }
  }
  assert.ok(checked > 1000, '组合太少，扫不出边角');
});

test('碳水区间的两端就是脂肪吃到 AMDR 两端时的余数', () => {
  // 区间讲的是「多吃的脂肪要从碳水里扣」，两端必须能被这条式子解释，
  // 否则又变回了凭空给的靶子。
  const t = dailyTargets({ sex: 'male', age: 30, heightCm: 178, weightKg: 80, activity: 'moderate', goal: 'cut' });
  const carbAtFat = (f) => (t.kcal - t.protein * 4 - f * 9) / 4;
  assert.ok(Math.abs(t.carbLower - carbAtFat(t.fatUpper)) <= 1,
    `下界 ${t.carbLower} 对不上脂肪吃满 ${t.fatUpper}g 时的余数 ${carbAtFat(t.fatUpper).toFixed(1)}`);
  assert.ok(Math.abs(t.carbUpper - carbAtFat(t.fatLower)) <= 1,
    `上界 ${t.carbUpper} 对不上脂肪只吃 ${t.fatLower}g 时的余数 ${carbAtFat(t.fatLower).toFixed(1)}`);
  assert.ok(t.carbLower < t.carb && t.carb < t.carbUpper, '计划值该落在区间中间');
});

test('碳水低于 IOM 推荐量时会被标出来，而不是悄悄放过', () => {
  assert.equal(CARB_RDA_G, 130);
  // 高蛋白 + 低热量的组合最容易把碳水挤到 130g 以下
  const t = dailyTargets({ sex: 'female', age: 30, heightCm: 158, weightKg: 48, activity: 'sedentary', goal: 'cut', proteinPerKg: 2.4 });
  if (t.carb < CARB_RDA_G) assert.equal(t.carbBelowRda, true);
  const t2 = dailyTargets({ ...male, activity: 'active' });
  if (t2.carb >= CARB_RDA_G) assert.equal(t2.carbBelowRda, false);
});

test('活动系数用的是流传最广的那组惯例值', () => {
  assert.deepEqual(
    Object.values(ACTIVITY_LEVELS).map((l) => l.factor),
    [1.2, 1.375, 1.55, 1.725, 1.9],
  );
});

test('有 Apple 实测数据时不再乘活动系数，不会把运动算两遍', () => {
  const p = { ...male, activity: 'active' };   // 系数 1.725
  const stat = staticTDEE(p);
  const dyn = dynamicTDEE({
    bmr: stat.bmr, activeSoFar: 500, basalSoFar: null, dayFraction: 1,
    baselineActive: 500, intakeKcal: 2000, fallbackTDEE: stat.tdee,
  });
  // 动态值 = 静息 + 实测活动；Apple 口径不再重复叠加固定 TEF，与 1.725 无关
  assert.equal(dyn.tdee, Math.round(stat.bmr + 500));
  assert.equal(dyn.tef, 0);
  assert.ok(dyn.tdee < stat.tdee + 500, '不应该在系数之上再叠一份活动能量');
});

/* --------------------------- 依据的优先级 --------------------------- */

test('静息能量优先用实测，公式只是兜底', () => {
  const base = { bmr: 1580, activeSoFar: 200, dayFraction: 0.5, baselineActive: 310, intakeKcal: 800, fallbackTDEE: 2423 };
  assert.equal(dynamicTDEE({ ...base }).basalSource, 'formula');
  assert.equal(dynamicTDEE({ ...base, baselineResting: 1610 }).basalSource, 'measured-baseline');
  assert.equal(dynamicTDEE({ ...base, baselineResting: 1610 }).basal, 1610, '有实测就该用实测值');
  const today = dynamicTDEE({ ...base, baselineResting: 1610, basalSoFar: 820 });
  assert.equal(today.basalSource, 'measured-today');
  assert.equal(today.basal, 1640, '今天实测 820 kcal 过半天 → 全天 1640');
});

test('实测消耗与预计消耗分开返回，界面不能把预计说成实测', () => {
  const r = dynamicTDEE({
    bmr: 1580, activeSoFar: 240, basalSoFar: 800, baselineResting: 1600,
    dayFraction: 0.5, baselineActive: 310, intakeKcal: 900, fallbackTDEE: 2400,
  });
  assert.equal(r.measured, 1040, '实测部分只含已经发生的 800 + 240');
  assert.equal(r.projected, true);
  assert.ok(r.tdee > r.measured, '全天预计必然大于此刻实测');
});

test('年龄是填的还是兜底猜的，必须能分辨', () => {
  assert.equal(ageIsEstimated({ birthday: '1996-03-02' }), false);
  assert.equal(ageIsEstimated({ age: 41 }), false);
  assert.equal(ageIsEstimated({}), true, '什么都没填时用的是默认 30 岁');
  assert.equal(ageIsEstimated({ birthday: '乱写' }), true);
  assert.equal(ageFrom({}), 30);
  assert.equal(dailyTargets({ ...male, age: undefined }).ageEstimated, true);
  assert.equal(dailyTargets({ ...male, age: undefined, birthday: '1996-03-02' }).ageEstimated, false);
});

test('蛋白目标落在文献给出的区间内', () => {
  // ISSN 立场声明：运动人群 1.4~2.0 g/kg 体重
  // Morton 等 2018 meta 分析：增肌摄入约 1.6 g/kg
  // Helms 等 2014（自然健美备赛）：减脂期 2.3~3.1 g/kg 瘦体重
  const noBf = proteinTarget(male, 'bulk');
  assert.ok(noBf.grams / 72 >= 1.4 && noBf.grams / 72 <= 2.0, `${noBf.grams / 72} g/kg`);

  const withBf = proteinTarget({ ...male, weightKg: 80, heightCm: 178, bodyFatPct: 20 }, 'cut');
  const perLbm = withBf.grams / 64;
  assert.ok(perLbm >= 2.3 && perLbm <= 3.1, `减脂期 ${perLbm} g/kg 瘦体重应落在 Helms 区间`);
});

test('增重的建议上沿不能照抄减重那条 1% 体重/周', () => {
  /*
   * 1% 体重/周 来自减重：再快下去掉的就不只是脂肪。它约束的是脂肪能被
   * 动员多快。增重受的是另一个限制 —— 肌肉本身长多快，即便新手也就
   * 每周 0.25%~0.5% 体重，超出这一段多出来的按比例主要是脂肪。
   * 共用一个 1% 会允许 45kg 的人计划每周 +0.45kg（一个月长 4% 体重）。
   *
   * 这两个数现在是**建议上沿**而不是闸门（见 ABSURD_RATE_PCT 那段注释），
   * 所以要检查的是「越没越线」，不是「有没有被改小」。
   */
  for (const weightKg of [45, 60, 70, 85, 100, 120]) {
    const prof = { sex: 'male', age: 28, heightCm: 178, weightKg, activity: 'active' };
    const advisory = (rateKgPerWeek, goal) => rateGuidance({ weightKg, rateKgPerWeek });

    const gainCap = round(weightKg * MAX_GAIN_RATE_PCT, 2);
    const lossCap = round(weightKg * MAX_LOSS_RATE_PCT, 2);
    assert.ok(lossCap > gainCap, `${weightKg}kg 的减重上沿该比增重上沿宽`);
    assert.equal(advisory(gainCap).level, 'ok', `${weightKg}kg 增 ${gainCap} 不该越线`);
    assert.equal(advisory(gainCap + 0.06).level, 'over', `${weightKg}kg 增 ${gainCap + 0.06} 该越线`);
    assert.equal(advisory(-lossCap).level, 'ok', `${weightKg}kg 减 ${lossCap} 不该越线`);

    // 同一个速度：减重侧还在建议内，增重侧已经越线
    const between = round((gainCap + lossCap) / 2, 2);
    assert.equal(advisory(-between).level, 'ok');
    assert.equal(advisory(between).level, 'over');

    // 闸门只拦离谱的量级，而且拦的是同一个数（不分增减）
    assert.equal(advisory(weightKg * 0.02).level, 'absurd');
    assert.equal(advisory(-weightKg * 0.02).level, 'absurd');
  }
  // 默认的 +0.25 kg/周 对一般体重不该被收敛
  const normal = dailyTargets({ sex: 'male', age: 28, heightCm: 178, weightKg: 70, activity: 'active', goal: 'bulk' });
  assert.equal(normal.rateWasClamped, false, `默认增重速率被收敛了：${normal.rateKgPerWeek}`);
});

/*
 * 建议上沿之内之外都照填的数算，只有明显填错的量级才拦。
 *
 * 原先 0.5% 是硬截断：58kg 的人填 +0.30 会被悄悄改成 +0.29，
 * 差 11 kcal/天 —— 远小于食物估算和 TDEE 本身的误差，
 * 界面却要为此说一句「你填的 0.3 过快」。科学结论说的是
 * 「超过 0.5% 就不划算」，不是「0.517% 不安全必须拦下」，
 * 这两句话不该由同一个机制执行。
 */
test('建议上沿只警告不截断，硬闸门只拦离谱的量级', () => {
  const prof = { sex: 'male', age: 28, heightCm: 178, weightKg: 58, activity: 'active' };

  const slightlyOver = dailyTargets({ ...prof, goal: 'bulk', rateKgPerWeek: 0.3 });
  assert.equal(slightlyOver.rateKgPerWeek, 0.3, '越过建议上沿一点点不该被改数');
  assert.equal(slightlyOver.rateWasClamped, false);
  assert.equal(slightlyOver.rateOverAdvisory, true, '越线了得说出来');
  assert.equal(slightlyOver.rateAdvisoryKg, 0.29);

  const onCap = dailyTargets({ ...prof, goal: 'bulk', rateKgPerWeek: 0.29 });
  assert.equal(onCap.rateOverAdvisory, false, '正好落在上沿上不算越线');

  // 离谱的输入照样拦下来，而且要说清是被哪一条限住的
  const absurd = dailyTargets({ ...prof, goal: 'bulk', rateKgPerWeek: 3 });
  assert.ok(absurd.rateWasClamped);
  assert.ok(Math.abs(absurd.rateKgPerWeek) < 3);
  assert.equal(absurd.rateAbsurd, true);

  /*
   * 「是哪一条限住的」只许点名一个。原先那句话同时点了体重比例和
   * 每日热量上限两个机制，而实测只有后者真的碰到了 —— 用户照着去查
   * 另一条会发现根本对不上。
   */
  const byDailyKcal = dailyTargets({ ...prof, goal: 'bulk', rateKgPerWeek: 0.6 });
  assert.equal(byDailyKcal.rateLimitedBy, 'daily-kcal',
    `0.6 是被每天 +500 kcal 的上限限住的，却报了 ${byDailyKcal.rateLimitedBy}`);
});

test('填速率时的即时提示：三档说三种话', () => {
  const at = (rateKgPerWeek) => rateGuidance({ weightKg: 58, rateKgPerWeek });

  assert.equal(at(0.25).level, 'ok');
  assert.match(at(0.25).text, /在建议范围内/);
  // 「相当于每天多吃多少 kcal」是填数的人真正要的那个换算
  assert.match(at(0.25).text, /每天多吃 275 kcal/);
  assert.match(at(-0.5).text, /每天少吃 550 kcal/);

  assert.equal(at(0.45).level, 'over');
  assert.match(at(0.45).text, /超过建议上沿 0.29 kg\/周/);
  assert.match(at(0.45).text, /主要是脂肪/);
  assert.match(at(-0.75).text, /瘦体重/);
  // 越线不是错误：仍然能存，只是要知道代价
  assert.match(at(0.45).text, /仍然可以按这个数执行/);

  assert.equal(at(1.2).level, 'absurd');
  assert.match(at(1.2).text, /填错/);

  assert.equal(at(0).text, '维持体重：热量按估算消耗安排，不做刻意的盈余或赤字。');
  // 体重还没填时不要硬凑一句话出来
  assert.equal(rateGuidance({ weightKg: null, rateKgPerWeek: 0.5 }).text, '');
});
