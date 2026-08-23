import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyTargets } from '../js/core/nutrition.js';
import { buildAdvice, currentMeal, mealBudget, deriveTags, MEALS } from '../js/core/advisor.js';
import { FOOD_BY_ID, per100 } from '../js/data/foods.js';

const profile = { sex: 'male', age: 30, heightCm: 175, weightKg: 72, bodyFatPct: 18, activity: 'light', goal: 'cut' };
const targets = dailyTargets(profile);
const zero = { kcal: 0, protein: 0, fat: 0, carb: 0, fiber: 0, sugar: 0, sodium: 0 };
const at = (hhmm) => new Date(`2026-08-21T${hhmm}:00`);

const advise = (intake = {}, opts = {}) => buildAdvice({
  targets, profile, intake: { ...zero, ...intake }, entries: [], now: at('12:30'), ...opts,
});

test('餐次按时间划分', () => {
  assert.equal(currentMeal(at('07:30')).key, 'breakfast');
  assert.equal(currentMeal(at('12:30')).key, 'lunch');
  assert.equal(currentMeal(at('16:00')).key, 'snack');
  assert.equal(currentMeal(at('19:30')).key, 'dinner');
  assert.equal(currentMeal(at('23:00')).key, 'late');
});

test('餐次预算按剩余餐次的份额分配，不是平均分', () => {
  const b = mealBudget({ kcalLeft: 1000, proteinLeft: 100, now: at('12:30') });
  assert.equal(b.meal.key, 'lunch');
  // 午餐 .35 /（.35+.10+.30+.05）
  assert.equal(b.kcal, Math.round(1000 * (0.35 / 0.8)));
  assert.ok(b.kcal > 1000 / b.restMealCount, '占比高的餐次拿到更多预算');
});

test('标签从营养数字推导', () => {
  const chicken = deriveTags(FOOD_BY_ID.get('chicken_breast'));
  assert.ok(chicken.has('high-protein') && chicken.has('protein-dense'));
  assert.ok(!chicken.has('high-density'), '133 kcal/100g 不算高能量密度');
  const broccoli = deriveTags(FOOD_BY_ID.get('broccoli'));
  assert.ok(broccoli.has('low-density') && broccoli.has('high-fiber'));
  const chips = deriveTags(FOOD_BY_ID.get('potato_chips'));
  assert.ok(chips.has('high-density') && chips.has('high-sodium') && chips.has('fried'));
  assert.ok(!chips.has('high-fiber'), '薯片的 4g 纤维是 548 kcal 换来的，不该算高纤维');

  // 游离糖：可乐算，西瓜和纯奶的天然糖不算（WHO 定义）
  assert.ok(deriveTags(FOOD_BY_ID.get('cola')).has('high-sugar'));
  assert.ok(deriveTags(FOOD_BY_ID.get('yogurt_sweet')).has('high-sugar'));
  assert.ok(!deriveTags(FOOD_BY_ID.get('watermelon')).has('high-sugar'));
  assert.ok(!deriveTags(FOOD_BY_ID.get('milk_whole')).has('high-sugar'));
});

test('空腹开局：状态良好，推荐非空且份量合理', () => {
  const a = advise();
  assert.equal(a.status.level, 'good');
  assert.ok(a.recommend.length >= 4);
  for (const r of a.recommend) {
    assert.ok(r.grams > 0 && r.grams <= 500, `${r.food.name} 份量 ${r.grams}g 不合理`);
    assert.ok(r.nutrients.kcal <= a.gaps.kcal.remaining, '推荐不应超出剩余热量');
    assert.ok(r.portionLabel.length > 0);
  }
});

test('推荐不会让人一顿吃掉全天剩余热量', () => {
  const a = advise();
  for (const r of a.recommend) {
    assert.ok(r.nutrients.kcal <= Math.max(a.budget.kcal, 200),
      `${r.food.name} ${r.nutrients.kcal} kcal 超过这一餐预算 ${a.budget.kcal}`);
  }
});

test('蛋白缺口大时优先推荐高蛋白密度食物', () => {
  const a = advise({ kcal: 1000, protein: 20, fat: 40, carb: 130 }, { now: at('18:30') });
  const top = a.recommend[0];
  const p = per100(top.food);
  assert.ok((p.protein * 4) / p.kcal > 0.3, `首推 ${top.food.name} 的蛋白供能比过低`);
  assert.match(a.status.headline, /蛋白/);
});

test('热量超标时给出 bad 状态，只剩零热量的选择', () => {
  const a = advise({ kcal: targets.kcal + 400, protein: 140, fat: 70, carb: 200 });
  assert.equal(a.status.level, 'bad');
  for (const r of a.recommend) {
    assert.ok(r.nutrients.kcal <= 5, `预算吃光后仍推荐了 ${r.food.name}（${r.nutrients.kcal} kcal）`);
  }
  assert.ok(a.avoid.length > 0, '超标时必须给出避免清单');
});

test('钠超标时避免清单指向高钠食物并说明数字', () => {
  const a = advise({ kcal: 800, protein: 40, sodium: 1950 });
  const names = a.avoid.map((x) => x.food.name);
  assert.ok(a.avoid.some((x) => x.kind === 'sodium'), '应给出钠相关的避免项');
  assert.ok(a.avoid.some((x) => /钠已达/.test(x.reason)));
  assert.ok(names.length === new Set(names).size, '避免清单不应重复');
});

test('避免清单有多样性：不会整屏都是同一个原因', () => {
  const a = advise({ kcal: 800, protein: 40, sodium: 1950, sugar: 45 });
  const kinds = new Set(a.avoid.map((x) => x.kind));
  assert.ok(kinds.size >= 2, `理由类型只有 ${[...kinds]}`);
  const cats = a.avoid.map((x) => x.food.cat);
  for (const c of new Set(cats)) {
    assert.ok(cats.filter((x) => x === c).length <= 2, `分类 ${c} 出现超过 2 次`);
  }
});

test('深夜不推荐需要现做的生鲜与高油食物', () => {
  const a = advise({ kcal: 1500, protein: 100, fat: 50, carb: 140 }, { now: at('22:30') });
  assert.equal(a.budget.meal.key, 'late');
  for (const r of a.recommend) {
    assert.ok(!r.tags.includes('fried'), `深夜推荐了油炸食物 ${r.food.name}`);
    assert.ok(r.nutrients.fat <= 20, `深夜推荐了高脂食物 ${r.food.name}`);
  }
});

test('早餐时段偏向即食/早餐类食物', () => {
  const a = advise({}, { now: at('07:30') });
  const quickCount = a.recommend.filter((r) => r.tags.includes('breakfast') || r.tags.includes('quick')).length;
  assert.ok(quickCount >= 3, `早餐推荐里只有 ${quickCount} 项是即食的`);
});

test('训练日会被识别并给出补给建议', () => {
  const a = advise({ kcal: 900, protein: 50 }, { health: { exerciseMinutes: 55, activeEnergy: 700 } });
  assert.equal(a.isTrainingDay, true);
  assert.ok(a.insights.some((i) => i.title.includes('训练日')));
});

test('蛋白缺口换算成具体食物份量', () => {
  const a = advise({ kcal: 500, protein: 30 });
  assert.ok(a.proteinEquivalent.eggs > 0);
  assert.ok(a.proteinEquivalent.chickenGrams > 0);
  assert.ok(a.insights.some((i) => /鸡蛋/.test(i.text)));
});

test('没有历史饮食记录时不会编造"近期平均摄入"', () => {
  const a = buildAdvice({
    targets, profile, intake: zero, entries: [], now: at('12:30'),
    baseline: { days: 14, activeEnergy: 500, kcalIntake: null, proteinIntake: null },
  });
  assert.ok(!a.insights.some((i) => /平均.*于目标/.test(i.title)),
    '缺少历史数据时不应输出平均摄入偏差');
});

test('动态预算的洞察与目标数字一致', () => {
  const t = { ...targets, tdeeSource: 'apple', tdee: 2600, staticTdee: 2262, kcal: 2050 };
  const a = buildAdvice({
    targets: t, profile, intake: zero, entries: [], now: at('12:30'),
    health: { activeEnergy: 800 }, baseline: { days: 14, activeEnergy: 400, kcalIntake: 1900 },
  });
  const note = a.insights.find((i) => i.title.includes('热量预算'));
  assert.ok(note, '应产生预算调整说明');
  assert.match(note.title, /上调 338 kcal/);
  assert.ok(note.text.includes('2050'), '正文里的目标值应与 targets.kcal 一致');
});

test('每个餐次都能给出可执行的建议', () => {
  for (const m of MEALS) {
    const hour = Math.max(1, Math.floor(m.endHour - 1));
    const a = advise({ kcal: 400, protein: 25 }, { now: at(`${String(hour).padStart(2, '0')}:00`) });
    assert.ok(a.recommend.length > 0, `${m.label} 没有任何推荐`);
    assert.ok(a.status.headline.length > 0);
    assert.ok(a.budget.kcal >= 0);
  }
});

test('游离糖：完整水果与纯奶不计入上限，风味酸奶只计添加部分', async () => {
  const { nutrientsFor, freeSugarFactor, FOOD_BY_ID: FB } = await import('../js/data/foods.js');
  assert.equal(nutrientsFor(FB.get('watermelon'), 300).sugar, 0, '西瓜的果糖不算添加糖');
  assert.equal(nutrientsFor(FB.get('milk_whole'), 250).sugar, 0, '牛奶的乳糖不算添加糖');
  assert.ok(nutrientsFor(FB.get('cola'), 330).sugar > 30, '一罐可乐应算 35g 左右游离糖');
  assert.ok(nutrientsFor(FB.get('juice_orange'), 250).sugar > 20, '果汁按游离糖计');
  assert.ok(freeSugarFactor(FB.get('yogurt_sweet')) > 0 && freeSugarFactor(FB.get('yogurt_sweet')) < 1,
    '含糖风味酸奶只计添加部分，乳糖仍应扣除');
  // 热量与其它宏量不受影响
  assert.ok(nutrientsFor(FB.get('watermelon'), 300).carb > 20);
});


/* -------------------------- 结论必须配得上样本量 -------------------------- */

test('只记了 1 天时不下「近 14 天平均」的结论', () => {
  // 用户实测：14 天健康数据 + 1 天饮食记录，
  // 曾报出「近 14 天平均低于目标 3168 kcal/天，每周 2.88 kg 脂肪赤字」
  const a = buildAdvice({
    targets, profile, intake: zero, entries: [], now: at('12:30'),
    baseline: { days: 14, windowDays: 14, healthDaysCounted: 14, loggedDays: 1,
      activeEnergy: 310, kcalIntake: 1287, proteinIntake: 75, proteinHitDays: 0 },
  });
  const titles = a.insights.map((i) => i.title);
  assert.ok(!titles.some((t) => /近 14 天平均/.test(t)), `不该出现 14 天的平均结论：${titles.join(' / ')}`);
  assert.ok(!titles.some((t) => /近 14 天蛋白达标/.test(t)), `不该把没记的日子算成没达标：${titles.join(' / ')}`);
  assert.ok(titles.some((t) => /只有 1 天的饮食记录/.test(t)), `应说明样本不足：${titles.join(' / ')}`);
});

test('样本够了才给平均摄入偏差，且写明真实天数', () => {
  const a = buildAdvice({
    targets, profile, intake: zero, entries: [], now: at('12:30'),
    baseline: { days: 14, windowDays: 14, healthDaysCounted: 14, loggedDays: 5,
      activeEnergy: 310, kcalIntake: 1200, proteinIntake: 70, proteinHitDays: 1 },
  });
  const hit = a.insights.find((i) => /平均低于目标/.test(i.title));
  assert.ok(hit, '5 天样本应该给出结论');
  assert.ok(/有记录的 5 天/.test(hit.title), `标题要写明真实天数：${hit.title}`);
  assert.ok(/没记录的日子没有计入/.test(hit.text), '要提醒样本小于窗口');
  assert.ok(/脂肪当量/.test(hit.text) && /不等于体重真会这样变/.test(hit.text),
    '7700 kcal/kg 只是能量换算，措辞不能说成一定会瘦多少');
  const prot = a.insights.find((i) => /蛋白达标/.test(i.title));
  assert.ok(/有记录的 5 天/.test(prot.title), `蛋白达标率的分母也要真实：${prot.title}`);
});

test('没填生日时会说明年龄是估算的', () => {
  const noAge = { sex: 'male', heightCm: 175, weightKg: 72, activity: 'light', goal: 'cut' };
  const a = buildAdvice({
    targets: dailyTargets(noAge), profile: noAge, intake: zero, entries: [], now: at('12:30'),
  });
  assert.ok(a.insights.some((i) => /年龄按 30 岁估算/.test(i.title)),
    '兜底年龄不能悄悄用掉');
});
