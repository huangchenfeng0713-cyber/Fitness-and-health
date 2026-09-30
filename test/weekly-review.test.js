import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyReview, weeklyReviewFromRecords, REVIEW_MIN_DAYS } from '../js/core/weekly-review.js';
import { KCAL_PER_KG_FAT } from '../js/core/nutrition.js';

const today = '2026-08-31';
const endDate = '2026-08-30';
const plan = (over = {}) => ({ status: 'ready', rateKgPerWeek: 0.25, kcal: 2800, protein: 140, ...over });
const weight = (kgPerWeek, stdErrKgPerWeek = 0.03) => ({ kgPerWeek, stdErrKgPerWeek, records: 12, spanDays: 26 });
const lift = (name, pct, direction = pct >= 2 ? 'up' : pct <= -2 ? 'down' : 'flat') => ({ id: name, name, trend: { pct, direction } });
const base = (over = {}) => ({
  today, endDate, goal: 'bulk', plan: plan(), change: null, windowDays: 28, adjust: 0,
  weight: weight(0.25), intake: { loggedDays: 20, avgKcal: 2800 }, protein: { days: 6, hit: 6, target: 140 },
  training: { activeDays: 6, volume: null, lifts: [] }, ...over,
});
const keys = (review) => review.items.map((i) => i.key);

test('照计划在走：继续，并把主项力量当好消息挂上', () => {
  const r = weeklyReview(base({ training: { activeDays: 6, lifts: [lift('杠铃卧推', 5), lift('杠铃深蹲', 3)] } }));
  assert.deepEqual(keys(r), ['on-track']);
  assert.equal(r.items[0].title, '照现在的节奏继续');
  assert.match(r.items[0].basis, /近 4 周体重 \+0\.25 ± 0\.03 kg\/周，计划 \+0\.25，基本一致；主项力量：杠铃卧推 \+5%、杠铃深蹲 \+3%/);
});

test('计划刚改过、称重不够、没法算计划时，先说还差什么', () => {
  assert.equal(weeklyReview(base({ plan: { status: 'unavailable' } })).items[0].key, 'plan');
  const wait = weeklyReview(base({ change: { key: 'kcal', from: 2800, to: 2950, at: '2026-08-27' } })).items[0];
  assert.equal(wait.key, 'wait');
  assert.equal(wait.title, `照新目标再吃 ${REVIEW_MIN_DAYS - 4} 天`);
  assert.match(wait.basis, /^4 天前目标从 2800 kcal 改成 2950 kcal/);
  const rate = weeklyReview(base({ change: { key: 'rate', from: -0.5, to: -0.4, at: today } })).items[0];
  assert.match(rate.basis, /^今天计划速度从 -0\.5 改成 -0\.4 kg\/周/);
  // 两周以前改的不算「刚改过」
  assert.notEqual(weeklyReview(base({ change: { key: 'kcal', from: 1, to: 2, at: '2026-08-10' } })).items[0].key, 'wait');
  const weigh = weeklyReview(base({ weight: { kgPerWeek: null, records: 2 } })).items[0];
  assert.equal(weigh.key, 'weigh');
  assert.match(weigh.basis, /只有 2 次称重/);
});

test('差得出来才下结论；饮食记得不全就不判断是谁的问题', () => {
  assert.equal(weeklyReview(base({ weight: weight(0.1, 0.2) })).items[0].key, 'unclear');
  const log = weeklyReview(base({ weight: weight(0.05), intake: { loggedDays: 9, avgKcal: 2800 } })).items[0];
  assert.equal(log.key, 'log');
  assert.match(log.basis, /涨得比计划慢；可近 28 天只记了 9 天饮食，分不清是吃少了/);
});

test('吃得和目标不一样：先按目标吃，不改计划', () => {
  const more = weeklyReview(base({ weight: weight(0.05), intake: { loggedDays: 20, avgKcal: 2500 } })).items[0];
  assert.equal(more.key, 'eat-more');
  assert.equal(more.title, '先按目标吃够');
  assert.match(more.basis, /比目标 2800 kcal 少 300 kcal/);
  assert.equal(more.apply, undefined);
  const less = weeklyReview(base({ weight: weight(0.6), intake: { loggedDays: 20, avgKcal: 3150 } })).items[0];
  assert.equal(less.key, 'eat-less');
  assert.match(less.action, /更可能是脂肪/);
  // 减脂掉得太快又吃得少：橙色，劝吃够
  const cut = weeklyReview(base({ goal: 'cut', plan: plan({ rateKgPerWeek: -0.5, kcal: 2100 }), weight: weight(-0.9), intake: { loggedDays: 20, avgKcal: 1800 } })).items[0];
  assert.deepEqual([cut.key, cut.level, cut.title], ['eat-more', 'warn', '别吃得比目标还少']);
});

test('按目标吃了却走偏：建议一小步消耗校正，采用后目标正好变这么多', () => {
  const slow = weeklyReview(base({ weight: weight(0.07) })).items[0];
  // (0.25 − 0.07) × 1100 ≈ 198 → 一步最多 150
  assert.equal(Math.round((0.25 - 0.07) * (KCAL_PER_KG_FAT / 7)), 198);
  assert.equal(slow.key, 'adjust');
  assert.equal(slow.title, '每天多吃 150 kcal');
  assert.deepEqual(slow.apply, { kind: 'adjust', value: 150, delta: 150 });
  assert.match(slow.basis, /说明实际消耗比估算高约 200 kcal/);
  assert.match(slow.action, /采用后目标从 2800 kcal 变成 2950 kcal/);
  // 照现在的设置存下去的计划比旧目标低 300（设备基线变了）：校正把这段差一起补上
  const drifted = weeklyReview(base({ weight: weight(0.07), fresh: { kcal: 2500 } })).items[0];
  assert.deepEqual(drifted.apply, { kind: 'adjust', value: 450, delta: 150 });
  // 增肌涨太快、按目标吃了 → 少吃
  const fast = weeklyReview(base({ weight: weight(0.6), adjust: 100 })).items[0];
  assert.deepEqual([fast.title, fast.apply.value, fast.apply.delta], ['每天少吃 150 kcal', -50, -150]);
  // 减脂掉得比计划快 → 多吃；维持在往上涨 → 少吃
  const cut = weeklyReview(base({ goal: 'cut', plan: plan({ rateKgPerWeek: -0.5, kcal: 2100 }), weight: weight(-0.8), intake: { loggedDays: 20, avgKcal: 2100 } })).items[0];
  assert.equal(cut.apply.delta, 150);
  assert.match(cut.basis, /掉得比计划快/);
  const keep = weeklyReview(base({ goal: 'maintain', plan: plan({ rateKgPerWeek: 0, kcal: 2500 }), weight: weight(0.3), intake: { loggedDays: 20, avgKcal: 2500 } })).items[0];
  assert.equal(keep.apply.delta, -150);
  assert.match(keep.basis, /在往上涨/);
});

test('校正到了上限、目标在下限时，不再往那个方向调', () => {
  const max = weeklyReview(base({ weight: weight(0.05), adjust: 450 })).items[0];
  assert.equal(max.key, 'adjust-max');
  assert.equal(max.apply, undefined);
  assert.match(max.action, /饮食漏记/);
  // 还能调 50：不到一小步，也按上限处理
  assert.equal(weeklyReview(base({ weight: weight(0.05), adjust: 460 })).items[0].key, 'adjust-max');
  const floor = weeklyReview(base({ goal: 'cut', plan: plan({ rateKgPerWeek: -0.5, kcal: 1500, clampedByFloor: true }), weight: weight(-0.2), intake: { loggedDays: 20, avgKcal: 1500 } })).items[0];
  assert.equal(floor.key, 'floor');
});

test('蛋白、周组数、力量各自成条，最多三条', () => {
  const protein = weeklyReview(base({ protein: { days: 5, hit: 1, target: 140 } }));
  assert.deepEqual(keys(protein), ['on-track', 'protein']);
  assert.match(protein.items[1].basis, /5 天里，只有 1 天吃够 140g 蛋白/);
  assert.equal(keys(weeklyReview(base({ protein: { days: 2, hit: 0, target: 140 } }))).includes('protein'), false);

  const volume = { reference: { lo: 10, hi: 20 }, groups: [
    { label: '腘绳', sets: 2, status: 'low' }, { label: '胸', sets: 12, status: 'ok' }, { label: '小腿', sets: 0, status: 'low' }] };
  const v = weeklyReview(base({ training: { activeDays: 4, volume, lifts: [] } }));
  assert.equal(v.items[1].key, 'volume');
  assert.equal(v.items[1].title, '给小腿、腘绳多安排几组');
  assert.equal(v.items[1].link, 'training');
  assert.equal(keys(weeklyReview(base({ training: { activeDays: 2, volume, lifts: [] } }))).includes('volume'), false);

  // 增肌：体重在涨，力量一个都没涨
  const flat = weeklyReview(base({ training: { activeDays: 4, volume: null, lifts: [lift('卧推', 1), lift('深蹲', -1)] } }));
  assert.deepEqual(keys(flat), ['on-track', 'strength-flat']);
  // 单独成条时，体重那条不再念一遍主项力量
  assert.doesNotMatch(flat.items[0].basis, /主项力量/);

  // 减脂：一半以上在降 → 建议放慢速度（可一键采用）
  const cutBase = { goal: 'cut', plan: plan({ rateKgPerWeek: -0.5, requestedRateKgPerWeek: -0.5, kcal: 2100 }), weight: weight(-0.5), intake: { loggedDays: 20, avgKcal: 2100 } };
  const down = weeklyReview(base({ ...cutBase, training: { activeDays: 4, lifts: [lift('卧推', -5), lift('深蹲', -3), lift('划船', 1)] } }));
  const s = down.items.find((i) => i.key === 'strength-down');
  assert.deepEqual(s.apply, { kind: 'rate', value: -0.4 });
  // 体重那条已经在劝多吃时，力量那条不再重复
  const eatMore = weeklyReview(base({ ...cutBase, weight: weight(-0.9), intake: { loggedDays: 20, avgKcal: 1800 },
    training: { activeDays: 4, lifts: [lift('卧推', -5), lift('深蹲', -3)] } }));
  assert.equal(keys(eatMore).includes('strength-down'), false);

  const all = weeklyReview(base({ protein: { days: 5, hit: 1, target: 140 }, training: { activeDays: 4, volume, lifts: [lift('卧推', 0), lift('深蹲', 0)] } }));
  assert.equal(all.items.length, 3);
});

/* ------------------------------------------------- 从记录拼输入 ------------- */

const weighIns = (from, days, start, perWeek, every = 2) => Array.from({ length: days }, (_, i) => {
  const date = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
  return i % every === 0 ? { date, weightKg: Math.round((start + (i / 7) * perWeek) * 100) / 100 } : { date, steps: 8000 };
});
const dietDays = (from, days, kcal, protein = 150, skip = () => false) => Array.from({ length: days }, (_, i) => {
  const date = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
  return skip(i) ? null : { date, kcal, protein, coverage: { kcal: { complete: true }, protein: { complete: true } } };
}).filter(Boolean);

test('从记录拼：体重和饮食共用同一段窗口，最近一次改计划之前的不算', () => {
  const healthDays = weighIns('2026-08-03', 28, 70, 0.07);
  const dietDaily = dietDays('2026-08-03', 28, 2800);
  const r = weeklyReviewFromRecords({
    today, endDate, goal: 'bulk', plan: plan(), fresh: { kcal: 2800 },
    planSteps: [{ date: '2026-08-03', kcal: 2800, rateKgPerWeek: 0.25 }], healthDays, dietDaily, trainingDays: [],
  });
  assert.equal(r.items[0].key, 'adjust');
  assert.equal(r.items[0].apply.delta, 150);

  // 20 天前改过目标：窗口从那天起算，之前吃的不拿来解释之后的体重
  const changed = weeklyReviewFromRecords({
    today, endDate, goal: 'bulk', plan: plan(), fresh: { kcal: 2800 },
    planSteps: [{ date: '2026-08-03', kcal: 2500, rateKgPerWeek: 0.25 }, { date: '2026-08-11', kcal: 2800, rateKgPerWeek: 0.25 }],
    healthDays, dietDaily: [...dietDays('2026-08-03', 8, 1500), ...dietDays('2026-08-11', 20, 2800)], trainingDays: [],
  });
  assert.equal(changed.items[0].key, 'adjust');
  assert.match(changed.items[0].basis, /有记录的 20 天里日均 2800 kcal/);

  // 今天刚采用了调整：同一条建议不再挂着，改成「照新目标再吃」
  const adopted = weeklyReviewFromRecords({
    today, endDate, goal: 'bulk', plan: plan(), fresh: { kcal: 2950 },
    planSteps: [{ date: '2026-08-03', kcal: 2800, rateKgPerWeek: 0.25 }, { date: today, kcal: 2950, rateKgPerWeek: 0.25 }],
    healthDays, dietDaily, trainingDays: [],
  });
  assert.equal(adopted.items[0].key, 'wait');
  assert.match(adopted.items[0].basis, /^今天目标从 2800 kcal 改成 2950 kcal/);
});

test('从记录拼：标了不完整的饮食日不算；蛋白看近 7 天', () => {
  const healthDays = weighIns('2026-08-03', 28, 70, 0.25);
  const dietDaily = dietDays('2026-08-03', 28, 2800, 90).map((d, i) => (i % 2 ? { ...d, coverage: { kcal: { complete: false }, protein: { complete: false } } } : d));
  const r = weeklyReviewFromRecords({
    today, endDate, goal: 'bulk', plan: plan(), fresh: { kcal: 2800 }, planSteps: [], healthDays, dietDaily, trainingDays: [],
  });
  assert.equal(r.items[0].key, 'on-track');
  const protein = r.items.find((i) => i.key === 'protein');
  assert.ok(protein);
  assert.match(protein.basis, /近 7 天有记录的 3 天里，只有 0 天吃够 140g 蛋白/);
});
