import test from 'node:test';
import assert from 'node:assert/strict';
import { intakeTrend } from '../js/core/intake-trend.js';
import { buildAdvice } from '../js/core/advisor.js';
import { dailyTargets } from '../js/core/nutrition.js';
import { per100 } from '../js/data/foods.js';

const date = '2026-09-06';
const at = time => new Date(date + 'T' + time + ':00');
const entry = (meal, time, kcal, day = date) => ({ date: day, time: day + 'T' + time + ':00', meal, kcal });
const history = Array.from({ length: 28 }, (_, i) => {
  const day = new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10);
  return [entry('breakfast', '08:00', 600, day), entry('lunch', '13:00', 1000, day), entry('dinner', '19:00', 800, day)];
}).flat();
const profile = { sex: 'male', age: 30, heightCm: 175, weightKg: 72, bodyFatPct: 18, activity: 'light', goal: 'maintain' };
const targets = { ...dailyTargets(profile), kcal: 2400, protein: 130, carb: 300, fat: 60, fatUpper: 90, fiber: 25 };
const intake = { kcal: 800, protein: 25, fat: 65, carb: 55, fiber: 5, sodium: 600, sugar: 5 };
const entries = [entry('breakfast', '08:00', 300), entry('lunch', '13:00', 500)];
const input = { targets, intake, entries, rhythmEntries: history, now: at('15:30'), profile };
const predict = patch => intakeTrend({ ...input, ...patch });

test('午餐后持续偏少：复用个人三餐，范围整体偏离才提醒', () => {
  const t = predict();
  assert.equal(t.state, 'under');
  assert.equal(t.source, 'personal');
  assert.equal(t.days, 28);
  assert.equal(t.remainingMeals[0].key, 'dinner');
  assert.ok(t.range.high < targets.kcal * 0.88);
  assert.equal(t.range.high % 50, 0);
});
test('历史不足使用更宽的三餐范围，不编造个人习惯', () => {
  const fallback = predict({ rhythmEntries: history.slice(0, 18) });
  assert.equal(fallback.source, 'guideline');
  assert.equal(fallback.days, 6);
  assert.ok(fallback.range.high - fallback.range.low > predict().range.high - predict().range.low);
});
test('正在午餐、刚记完餐和不足45分钟的阶段差先观察', () => {
  for (const time of ['13:10', '13:35', '14:15']) assert.equal(predict({ now: at(time) }).active, false, time);
  const recent = [entries[0], entry('lunch', '15:10', 500)];
  assert.equal(predict({ entries: recent }).state, 'watch');
});
test('空记录、只记一餐、无时间、未来时间和汇总不一致不能判摄入不足', () => {
  for (const patch of [
    { entries: [] }, { entries: [entries[0]] },
    { entries: entries.map(e => ({ ...e, time: null })) },
    { entries: [entries[0], entry('lunch', '16:00', 500)] },
    { intake: { ...intake, kcal: 1600 } },
  ]) {
    const t = predict(patch); assert.equal(t.active, false); assert.equal(t.range, null);
  }
});
test('延迟吃晚饭不报警，提前吃的晚饭不再加一次到预测里', () => {
  assert.equal(predict({ now: at('19:40') }).active, false);
  const earlyDinner = [...entries, entry('dinner', '16:00', 900)];
  const t = predict({ entries: earlyDinner, intake: { ...intake, kcal: 1700 }, now: at('17:10') });
  assert.equal(t.remainingMeals.length, 0);
  assert.equal(t.active, false);
  assert.ok(t.range.high < 2100, '提前吃的晚餐不能被重复预测');
});
test('同样的早餐午餐，较多摄入可预测全天偏高，正常摄入不报警', () => {
  const make = kcal => predict({ intake: { ...intake, kcal }, entries: [entry('breakfast', '08:00', 700), entry('lunch', '13:00', kcal - 700)] });
  assert.equal(make(2200).state, 'over');
  assert.equal(make(1600).state, 'steady');
});
test('记录已明显超出是事实；深夜、历史日、无效资料不出纠偏催促', () => {
  const over = { intake: { ...intake, kcal: 2900 } };
  assert.equal(predict(over).direction, 'over');
  for (const patch of [{ isToday: false }, { enabled: false }, { now: at('23:00') }]) {
    assert.equal(predict({ ...over, ...patch }).active, false);
    assert.equal(predict(patch).active, false);
  }
});
test('目标变化重新映射比例，加餐只计已摄入，不生成夜宵阶段', () => {
  const snack = entry('snack', '14:00', 500);
  const t = predict({ entries: [...entries, snack], intake: { ...intake, kcal: 1300 } });
  assert.ok(t.range.high > predict().range.high);
  assert.deepEqual(t.remainingMeals.map(m => m.key), ['dinner']);
  const higher = predict({ targets: { ...targets, kcal: 2800 } });
  assert.ok(higher.range.high > predict().range.high);
});
test('脂肪偏高且热量不足：纠偏推荐包含少油主食和瘦蛋白并控制份量', () => {
  const a = buildAdvice(input);
  assert.equal(a.correction.active, true);
  assert.equal(a.correction.fatHigh, true);
  assert.equal(a.budget.meal.key, 'dinner');
  assert.ok(a.recommend.some(r => r.food.cat === 'staple'), a.recommend.map(r => r.food.name).join(','));
  assert.ok(a.recommend.some(r => r.nutrients.protein >= 8));
  assert.ok(a.recommend.some(r => r.nutrients.fiber >= 2 && r.tags.includes('high-fiber')));
  for (const r of a.recommend) {
    const p = per100(r.food);
    assert.ok(p.fat * 9 <= p.kcal * 0.4);
    assert.ok(!r.tags.includes('fried'));
    assert.ok(r.nutrients.kcal <= a.budget.kcal);
  }
  assert.match(a.correction.action, /蔬菜|水果/);
});
test('热量偏高但蛋白不足仍给明确带热量的小份高蛋白食物', () => {
  const a = buildAdvice({ ...input, intake: { ...intake, kcal: 2900 }, now: at('18:30') });
  assert.ok(a.budget.optional);
  assert.ok(a.recommend.length);
  for (const r of a.recommend) {
    const p = per100(r.food);
    assert.ok(r.nutrients.kcal > 0 && r.nutrients.kcal <= 200);
    assert.ok(p.kcal <= 200 && p.protein * 4 >= p.kcal * 0.3);
  }
  assert.match(a.correction.action, /照常吃/);
});
test('深夜大缺口只给克制建议，低蛋白也不强迫大量进食', () => {
  const a = buildAdvice({ ...input, now: at('22:30') });
  assert.equal(a.trend.state, 'late');
  assert.equal(a.correction.active, false);
  assert.match(a.status.headline, /不必一次补完/);
  assert.doesNotMatch(a.insights.map(i => i.action).join(''), /个鸡蛋|g 鸡胸肉/);
  assert.ok(a.recommend.every(r => r.nutrients.kcal <= 240));
});
test('数据未改变时重复计算不改变趋势和食物顺序', () => {
  const first = buildAdvice(input), second = buildAdvice(input);
  assert.deepEqual(first.trend, second.trend);
  assert.deepEqual(first.recommend.map(r => r.food.id), second.recommend.map(r => r.food.id));
});

test('未来条目即使总量超计划也不能当作已吃过报警', () => {
  const t = predict({ burnedNow: 1000, intake: { ...intake, kcal: 3200 }, entries: [...entries, entry('dinner', '19:00', 2400)] });
  assert.equal(t.active, false);
  assert.equal(t.currentCovered, false);
  assert.match(t.reason, /未来时间/);
});

test('轻微超过目标保持中性；全天预测确实偏高时主卡与趋势一致', () => {
  const slight = buildAdvice({ ...input, intake: { ...intake, kcal: 2480 }, entries: [] });
  assert.equal(slight.status.level, 'good');
  const a = buildAdvice({ ...input, intake: { ...intake, kcal: 2380 },
    entries: [entry('breakfast', '08:00', 700), entry('lunch', '13:00', 1680)] });
  assert.equal(a.trend.direction, 'over');
  assert.equal(a.status.level, 'warn');
});

test('2359/2162 晚间不再假设下一餐，也不声称差额几乎没有影响', () => {
  for (const now of [at('20:30'), at('21:00'), at('23:59')]) {
    const a = buildAdvice({ ...input, now, burnedNow: 1674,
      targets: { ...targets, kcal: 2162 }, intake: { ...intake, kcal: 2359 } });
    assert.equal(a.status.headline, '明天照常安排三餐');
    assert.match(a.status.detail, /2359 kcal.*2162 kcal.*197 kcal/);
    assert.doesNotMatch(a.status.detail, /几乎没有影响|下一餐|后续餐/);
    assert.equal(a.correction.active, false);
    assert.doesNotMatch([a.correction.action, a.trend.reason, ...a.insights.map(i => i.action)].join(''), /下一餐|后续餐|余下餐/);
  }
  const daytime = buildAdvice({ ...input, now: at('12:00'), entries: [],
    targets: { ...targets, kcal: 2162 }, intake: { ...intake, kcal: 2359 } });
  assert.equal(daytime.status.headline, '下一餐回到正常预算');
});

test('低于全天计划但已覆盖当前消耗，不激活补热量纠偏且不宣称全天已吃够', () => {
  const a = buildAdvice({ ...input, burnedNow: 700 });
  assert.ok(a.gaps.kcal.remaining > 1000);
  assert.equal(a.trend.state, 'covered');
  assert.equal(a.trend.active, false);
  assert.equal(a.correction.active, false);
  assert.equal(a.status.headline, '暂不必为目标额外加餐');
  assert.match(a.status.detail, /当前.*700 kcal.*随消耗继续变化.*正餐照常安排/);
  assert.doesNotMatch(a.correction.action, /增加一小份|补热量/);
  assert.equal(a.gaps.kcal.target, targets.kcal, '当前收支不应改写全天计划');
  assert.equal(buildAdvice({ ...input, burnedNow: 800 }).trend.currentCovered, true);
  assert.equal(buildAdvice({ ...input, burnedNow: 801 }).trend.active, true);
  for (const burnedNow of [null, 0, -10, NaN, Infinity]) {
    assert.equal(buildAdvice({ ...input, burnedNow }).trend.active, true, String(burnedNow));
  }
});

test('深夜未达目标但已有当前盈余，不催补摄入，缺少消耗不假造收支', () => {
  const args = { ...input, now: at('23:00'), intake: { ...intake, kcal: 1900 } };
  const a = buildAdvice({ ...args, burnedNow: 1674 });
  assert.equal(a.status.headline, '今天不必再追齐数字');
  assert.match(a.status.detail, /已覆盖这部分消耗/);
  assert.equal(a.budget.optional, true);
  assert.ok(a.budget.kcal <= 200);
  const unknown = buildAdvice(args);
  assert.doesNotMatch(unknown.status.detail, /已覆盖/);
  assert.match(unknown.status.detail, /计划余量不等于必须补吃/);
  assert.equal(buildAdvice({ ...args, burnedNow: 1674, isToday: false }).status.headline, '回看这一天的记录');
});

test('晚餐提前记完后不再重复安排一顿正餐，蛋白缺口也不触发补吃', () => {
  for (const kcal of [1700, 2350, 2800]) {
    const a = buildAdvice({ ...input, now: at('18:30'), intake: { ...intake, kcal },
      entries: [...entries, entry('dinner', '17:00', kcal - 800)] });
    assert.equal(a.trend.dayComplete, true);
    assert.equal(a.trend.active, false);
    assert.equal(a.correction.active, false);
    assert.equal(a.budget.optional, true);
    assert.ok(a.budget.kcal <= 200);
    const copy = [a.status.headline, a.status.detail, a.correction.action, a.trend.reason, ...a.insights.map(i => i.action)].join('');
    assert.doesNotMatch(copy, /下一餐|后续餐|余下餐/);
    assert.match(copy, /明天/);
  }
});
