import test from 'node:test';
import assert from 'node:assert/strict';
import {
  basalMetabolicRate, staticTDEE, dailyTargets, dynamicTDEE, activityCurve,
  leanBodyMass, bmi, bmiCategory, ageFrom, proteinTarget, sumNutrients, computeGaps,
} from '../js/core/nutrition.js';

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
  assert.equal(ageFrom({ birthday: '1995-03-01' }, new Date('2026-02-28')), 30);
  assert.equal(ageFrom({ birthday: '1995-03-01' }, new Date('2026-03-01')), 31);
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

test('热量目标不会低于安全下限', () => {
  const extreme = dailyTargets({ ...female, rateKgPerWeek: -1.5 });
  assert.ok(extreme.clampedByFloor, '过激的目标速率应触发下限保护');
  assert.ok(extreme.kcal >= 1200);
  assert.ok(extreme.kcal >= basalMetabolicRate(female).kcal);
});

test('宏量营养素分配自洽：三大宏量的热量之和接近总热量', () => {
  for (const p of [male, female, { ...male, goal: 'bulk' }, { ...male, bodyFatPct: 25, goal: 'cut' }]) {
    const t = dailyTargets(p);
    const fromMacros = t.protein * 4 + t.fat * 9 + t.carb * 4;
    assert.ok(Math.abs(fromMacros - t.kcal) / t.kcal < 0.06,
      `${JSON.stringify(p.goal)}: 宏量合计 ${fromMacros} 与目标 ${t.kcal} 偏差过大`);
    assert.ok(t.fat >= p.weightKg * 0.7, '脂肪不应低于必需量');
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

test('营养汇总与差额', () => {
  const total = sumNutrients([
    { kcal: 300, protein: 20, fat: 10, carb: 30, fiber: 2, sugar: 3, sodium: 400 },
    { kcal: 200.5, protein: 5.5, fat: 2, carb: 40, fiber: 1, sugar: 1, sodium: 100 },
  ]);
  assert.equal(total.kcal, 500.5);
  assert.equal(total.protein, 25.5);
  const gaps = computeGaps({ kcal: 2000, protein: 120 }, total);
  assert.equal(gaps.kcal.remaining, 1499.5);
  assert.equal(gaps.protein.pct, 21);
});
