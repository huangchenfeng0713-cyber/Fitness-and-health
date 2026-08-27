import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyTargets } from '../js/core/nutrition.js';
import {
  buildAdvice, currentMeal, mealBudget, deriveTags, MEALS, CAFFEINE_CUTOFF_HOUR,
} from '../js/core/advisor.js';
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

test('热量不足以承载蛋白缺口时，不生成物理上不可能的餐次目标', () => {
  const b = mealBudget({ kcalLeft: 42, proteinLeft: 16, now: at('23:48') });
  assert.equal(b.kcal, 42);
  assert.equal(b.proteinFeasible, false);
  assert.equal(b.maxProteinByKcal, 10.5);
  assert.equal(b.protein, 10.5, '42 kcal 理论上最多只能承载 10.5g 纯蛋白');

  const a = buildAdvice({
    targets: { ...targets, kcal: 2194, protein: 106 },
    profile,
    intake: { ...zero, kcal: 2152, protein: 90 },
    entries: [],
    now: at('23:48'),
  });
  assert.match(a.status.headline, /无法补齐 16g 蛋白/);
  assert.match(a.status.detail, /至少需要 64 kcal/);
  assert.ok(!/零热量.*高蛋白/.test(a.status.detail));
});

test('蛋白已经达标时不显示负数缺口', () => {
  const a = advise({ kcal: 900, protein: targets.protein + 12 });
  assert.match(a.status.headline, /蛋白已达标/);
  assert.doesNotMatch(a.status.headline, /蛋白还差 -/);
});

test('脂肪计划值与参考上限分开，超过计划值不会被误判为超上限', () => {
  const a = advise({ kcal: 1200, fat: targets.fat + 5 });
  assert.ok(a.gaps.fat.remaining < 0, '应反映已超过计划分配值');
  assert.ok(a.gaps.fat.upperRemaining > 0, '仍低于 35% 供能参考上限');
  assert.ok(a.gaps.fat.upper > a.gaps.fat.target);
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

test('咖啡因可由含量或显式标记识别，草本茶和含“茶”菜名不误判', () => {
  assert.equal(CAFFEINE_CUTOFF_HOUR, 18);
  assert.ok(deriveTags(FOOD_BY_ID.get('black_coffee')).has('caffeinated'));
  assert.ok(deriveTags({
    id: 'caffeine_test', name: '测试饮料', cat: 'drink', n: [0, 0, 0, 0, 0, 0, 0],
    s: [['一杯', 250]], caffeineMg: 12, f: [],
  }).has('caffeinated'), '只有 caffeineMg 的食品也应识别为含咖啡因');
  for (const id of ['barley_tea', 'chrysanthemum_tea', 'tea_egg', 'tea_tree_mushroom']) {
    assert.ok(!deriveTags(FOOD_BY_ID.get(id)).has('caffeinated'), `${id} 不应因名称含“茶”被误判`);
  }
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

test('吸附到常用份量后仍不能越过分类份量上限', () => {
  const a = advise({}, { now: at('07:30') });
  const soup = a.recommend.find((r) => r.food.id === 'claypot_meat_soup');
  if (soup) assert.ok(soup.grams <= 450, `瓦罐肉汤吸附后变成 ${soup.grams}g`);
  assert.ok(a.recommend.every((r) => r.grams <= 500), '出现超过通用单次上限的推荐');
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

test('18:00 起排除含咖啡因推荐，并在避免清单解释睡眠原因', () => {
  const nearTarget = {
    kcal: targets.kcal - 10,
    protein: targets.protein,
    fat: targets.fat,
    carb: targets.carb,
    fiber: targets.fiber,
    sugar: 0,
    sodium: 0,
  };
  const beforeCutoff = advise(nearTarget, { now: at('17:59') });
  assert.ok(beforeCutoff.recommend.some((item) => item.tags.includes('caffeinated')),
    '截止时间前不应误伤含咖啡因候选');

  for (const time of ['18:00', '19:30', '22:30']) {
    const a = advise(nearTarget, { now: at(time) });
    assert.ok(a.recommend.every((item) => !item.tags.includes('caffeinated')),
      `${time} 仍推荐了含咖啡因食品：${a.recommend.map((item) => item.food.name).join('、')}`);
    assert.ok(a.avoid.some((item) => item.kind === 'caffeine'
      && /18:00/.test(item.reason) && /入睡|睡眠/.test(item.reason)),
    `${time} 的避免清单没有说明咖啡因与睡眠原因`);
  }

  const atNight = advise(nearTarget, { now: at('22:30') });
  assert.ok(atNight.recommend.some((item) => ['barley_tea', 'chrysanthemum_tea'].includes(item.food.id)),
    '无咖啡因的大麦茶或菊花茶仍应可作为夜间轻量候选');
});

test('早餐时段偏向即食/早餐类食物', () => {
  const a = advise({}, { now: at('07:30') });
  const quickCount = a.recommend.filter((r) => r.tags.includes('breakfast') || r.tags.includes('quick')).length;
  assert.ok(quickCount >= 3, `早餐推荐里只有 ${quickCount} 项是即食的`);
  assert.ok(a.recommend.every((r) => r.tags.includes('breakfast')
    || ['dairy', 'fruit', 'nut', 'drink', 'snack', 'egg', 'soy'].includes(r.food.cat)),
  `早餐混入了正餐食材：${a.recommend.map((r) => r.food.name).join('、')}`);
});

test('午餐和晚餐真正优先正餐，不推荐明确标为生的食材', () => {
  for (const [time, label] of [['12:00', '午餐'], ['19:30', '晚餐']]) {
    const a = advise({}, { now: at(time) });
    assert.ok(a.recommend.length >= 4, `${label}推荐数量不足`);
    assert.ok(a.recommend.every((r) => r.food.state !== 'raw' && !/[（(]生[）)]/.test(r.food.name)),
      `${label}仍推荐了生食材：${a.recommend.map((r) => r.food.name).join('、')}`);
    const matched = a.recommend.filter((r) => r.reasons.some((reason) => reason === `适合${label}`));
    assert.ok(matched.length >= 3, `${label}只有 ${matched.length} 项正餐候选`);
  }
});

test('加餐只推荐方便少量食用的食物', () => {
  const a = advise({}, { now: at('16:00') });
  assert.ok(a.recommend.length > 0);
  assert.ok(a.recommend.every((r) => r.reasons.includes('适合加餐，方便少量食用')),
    `加餐混入了正餐食材：${a.recommend.map((r) => r.food.name).join('、')}`);
});

test('夜间不会把全天缺口一次补完，只给轻量候选', () => {
  const a = advise({}, { now: at('22:30') });
  assert.ok(a.budget.timeCapped, '夜间缺口很大时应触发餐次上限');
  assert.ok(a.budget.kcal <= targets.kcal * 0.10 + 1,
    `夜宵预算 ${a.budget.kcal} kcal 超过日目标的 10%`);
  assert.ok(a.recommend.length > 0);
  for (const r of a.recommend) {
    assert.ok(r.reasons.includes('适合夜间少量食用'), `${r.food.name} 没有通过夜间适配`);
    assert.ok(r.nutrients.kcal <= 260 && r.nutrients.fat <= 12, `${r.food.name} 夜间份量过重`);
  }
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

test('多日趋势归数据页的图，今日提示不再重复一遍', () => {
  /*
   * 用户实测：14 天健康数据 + 1 天饮食记录，
   * 曾报出「近 14 天平均低于目标 3168 kcal/天，相当于每周 2.88 kg 脂肪赤字」——
   * 那 13 天只是没记。
   *
   * 「分母是有记录的天数、样本不足就不下结论」这条口径没有取消，
   * 只是跟着这几条结论一起搬到了数据页的图下面，
   * 现在由 core/trend-reading.js 把关（见 test/trend-reading.test.js）。
   * 这里守的是另一件事：搬走之后别再有人把它们加回今日提示。
   */
  const a = buildAdvice({
    targets, profile, intake: zero, entries: [], now: at('12:30'),
    baseline: {
      days: 14, windowDays: 14, healthDaysCounted: 14, loggedDays: 5,
      activeEnergy: 310, kcalIntake: 1200, proteinIntake: 70, proteinHitDays: 1,
      weightTrend: 1.2,
    },
  });
  const titles = a.insights.map((i) => i.title);
  for (const dup of [/平均[^，。]*目标/, /蛋白达标 \d+ 天/, /体重趋势/, /近 \d+ 天/, /天的饮食记录/]) {
    assert.ok(!titles.some((t) => dup.test(t)),
      `多日趋势只该出现在数据页的图下面：${titles.join(' / ')}`);
  }
  // 今天本身的判断照旧要给
  assert.ok(titles.length > 0, '今日提示不该被清空');
});

test('没填生日时会说明年龄是估算的', () => {
  const noAge = { sex: 'male', heightCm: 175, weightKg: 72, activity: 'light', goal: 'cut' };
  const a = buildAdvice({
    targets: dailyTargets(noAge), profile: noAge, intake: zero, entries: [], now: at('12:30'),
  });
  assert.ok(a.insights.some((i) => /年龄按 30 岁估算/.test(i.title)),
    '兜底年龄不能悄悄用掉');
});

test('推荐份量始终是整数克，热量上限那一侧不会漏出浮点数', () => {
  // 实测：推荐里出现「海鲜粥 384.00000000000006g」「希腊酸奶 113.55932203389831g」。
  // 份量上限是「剩余热量 ÷ 每 100g 热量」，本身是浮点；
  // 直接和取整后的克数取 min，上限那一侧会原样漏到界面上。
  const profile = {
    sex: 'male', birthday: '1995-01-01', heightCm: 175, weightKg: 70,
    goal: 'cut', rateKgPerWeek: -0.5, activity: 'light',
  };
  const targets = dailyTargets(profile, null);
  const offenders = [];
  let scanned = 0;
  for (let hour = 6; hour <= 23; hour += 1) {
    for (let eaten = 0; eaten < 2200; eaten += 137) {
      const now = new Date(`2026-08-27T${String(hour).padStart(2, '0')}:00:00+08:00`);
      const advice = buildAdvice({
        targets,
        intake: {
          kcal: eaten, protein: eaten / 25, fat: eaten / 40, carb: eaten / 9,
          fiber: eaten / 200, sugar: eaten / 120, sodium: eaten,
        },
        entries: [], profile, health: {}, baseline: {}, now,
      });
      for (const rec of advice.recommend || []) {
        scanned += 1;
        if (!Number.isInteger(rec.grams)) offenders.push(`${rec.food.name} ${rec.grams}`);
      }
    }
  }
  assert.ok(scanned > 500, `只扫到 ${scanned} 条推荐，覆盖不够`);
  assert.deepEqual(offenders.slice(0, 5), [], `${offenders.length} 条推荐的克重不是整数`);
});
