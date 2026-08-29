import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklySummary, windowDates } from '../js/core/weekly-summary.js';
import { MIN_POINTS_FOR_CLAIM } from '../js/core/trend-reading.js';

const day = (n, end = '2026-08-28') => new Date(Date.parse(`${end}T00:00:00Z`) - n * 86400000)
  .toISOString().slice(0, 10);
const rowOf = (s, key) => s.rows.find((r) => r.key === key);

test('窗口是往前数 7 个日历日，含当天', () => {
  const dates = windowDates('2026-08-28', 7);
  assert.equal(dates.length, 7);
  assert.equal(dates[0], '2026-08-22');
  assert.equal(dates[6], '2026-08-28');
  assert.deepEqual(windowDates('不是日期'), [], '日期串坏掉时给空窗口，不能抛');
  assert.deepEqual(windowDates(null), []);
});

test('日期串坏掉时返回 null，不炸整张卡', () => {
  assert.equal(weeklySummary({ endDate: 'x' }), null);
  assert.equal(weeklySummary({}), null);
  assert.equal(weeklySummary(), null);
});

test('什么数据都没有时也给得出一张小结', () => {
  const s = weeklySummary({ endDate: '2026-08-28', targets: { kcal: 2000, protein: 150 } });
  assert.ok(s.rows.length >= 4);
  assert.equal(rowOf(s, 'logged').value, '0 / 7 天');
  assert.equal(rowOf(s, 'kcal').value, '—', '没记录时不该编一个日均出来');
  assert.equal(rowOf(s, 'weight').value, '—');
  assert.equal(rowOf(s, 'training').value, '0 次');
});

test('摄入的分母是有饮食记录的天数，不是日历天数', () => {
  /*
   * 全应用一致的口径。7 天里只记了 3 天、每天都吃 2000 kcal，
   * 日均就是 2000 —— 按日历天数算会得出 857，那是把没记的 4 天当成了 0 kcal。
   */
  const dietDaily = [0, 1, 2].map((i) => ({ date: day(i), kcal: 2000, protein: 150 }));
  const s = weeklySummary({ endDate: '2026-08-28', dietDaily, targets: { kcal: 2000, protein: 150 } });
  assert.equal(rowOf(s, 'logged').value, '3 / 7 天');
  assert.match(rowOf(s, 'kcal').value, /^2000 kcal$/, `按日历天数算了：${rowOf(s, 'kcal').value}`);
  assert.match(rowOf(s, 'protein').value, /\/ 3 天$/, '蛋白达标率的分母也得是有记录的天数');
});

test('样本少于三天不给日均', () => {
  for (let n = 0; n < MIN_POINTS_FOR_CLAIM; n += 1) {
    const dietDaily = Array.from({ length: n }, (_, i) => ({ date: day(i), kcal: 2000, protein: 150 }));
    const s = weeklySummary({ endDate: '2026-08-28', dietDaily, targets: { kcal: 2000, protein: 150 } });
    assert.equal(rowOf(s, 'kcal').value, '—', `只有 ${n} 天记录却给出了日均`);
    assert.equal(rowOf(s, 'protein'), undefined, `只有 ${n} 天记录却给出了达标率`);
  }
});

test('蛋白达标按目标的九成算，差一两克不算没达标', () => {
  const at = (v) => weeklySummary({
    endDate: '2026-08-28',
    dietDaily: [0, 1, 2].map((i) => ({ date: day(i), kcal: 2000, protein: v })),
    targets: { kcal: 2000, protein: 150 },
  });
  assert.match(rowOf(at(148), 'protein').value, /^3 \//, '差 2g 被判成没达标，太苛刻');
  assert.match(rowOf(at(135), 'protein').value, /^3 \//, '正好九成应当算达标');
  assert.match(rowOf(at(120), 'protein').value, /^0 \//, '只有八成不该算达标');
});

test('体重报首末差，不做拟合', () => {
  /*
   * 一周之内点太少，拟合出来的斜率会被单次水分波动带着走。
   * 中间那天涨了 2kg（吃了顿火锅）不该改变「这一周掉了 0.5kg」这个事实。
   */
  const healthDays = [
    { date: day(6), weightKg: 80 },
    { date: day(3), weightKg: 82 },
    { date: day(0), weightKg: 79.5 },
  ];
  const s = weeklySummary({ endDate: '2026-08-28', healthDays });
  assert.equal(rowOf(s, 'weight').value, '-0.5 kg');
  assert.match(rowOf(s, 'weight').note, /共 3 次称重/);

  const one = weeklySummary({ endDate: '2026-08-28', healthDays: [{ date: day(2), weightKg: 77 }] });
  assert.match(rowOf(one, 'weight').note, /只称了一次/, '一次称重看不出方向，要说出来');
});

test('窗口外的数据不算进来', () => {
  const s = weeklySummary({
    endDate: '2026-08-28',
    dietDaily: [{ date: day(20), kcal: 9999, protein: 300 }, { date: day(0), kcal: 2000, protein: 150 }],
    healthDays: [{ date: day(30), weightKg: 95 }, { date: day(1), weightKg: 80 }],
    trainingDays: [{ date: day(40), items: [{ id: 'a', sets: [{}] }] }],
    targets: { kcal: 2000, protein: 150 },
  });
  assert.equal(rowOf(s, 'logged').value, '1 / 7 天', '把窗口外的日子算进来了');
  assert.equal(rowOf(s, 'training').value, '0 次');
  assert.match(rowOf(s, 'weight').note, /只称了一次/);
});

test('训练只报做了几次几组，不下「该练几组」的结论', () => {
  const s = weeklySummary({
    endDate: '2026-08-28',
    trainingDays: [
      { date: day(1), items: [{ id: 'a', sets: [{}, {}, {}] }] },
      { date: day(3), items: [{ id: 'b', sets: [{}, {}] }] },
      { date: day(4), items: [] },   // 建了但一个动作都没选：不算一次训练
    ],
  });
  assert.equal(rowOf(s, 'training').value, '2 次');
  assert.match(rowOf(s, 'training').note, /共记下 5 组/);
  for (const r of s.rows) {
    assert.doesNotMatch(String(r.note), /应该|建议每周|太少|不够/, `训练那行下了结论：${r.note}`);
  }
});

test('脏数据不该让小结抛异常', () => {
  const s = weeklySummary({
    endDate: '2026-08-28',
    dietDaily: [{ date: day(1), kcal: 'abc', protein: null }, { date: day(2) }, { date: day(3), kcal: 2000, protein: 150 }],
    healthDays: [{ date: day(1), weightKg: 'x', steps: null }, { date: day(2), weightKg: 0 }],
    trainingDays: [{ date: day(1) }, { date: day(2), items: null }],
    targets: { kcal: 2000, protein: 150 },
  });
  for (const r of s.rows) {
    assert.doesNotMatch(String(r.value), /NaN|undefined|null/, `${r.label} 的值是 ${r.value}`);
    assert.doesNotMatch(String(r.note), /NaN|undefined|null/, `${r.label} 的说明是 ${r.note}`);
  }
});

/*
 * 累计收支只算「配对日」：那一天既有饮食记录，又有设备记录的消耗。
 *
 * 少了任何一半都算不出那天的盈亏。把漏记的日子当成 0 kcal 摄入，
 * 会造出「近 7 日累计缺口 12000 kcal」这种并不存在的结论。
 */
test('累计收支只算同时有摄入和消耗的日子', () => {
  const days = ['2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'];
  const s = weeklySummary({
    endDate: '2026-08-28',
    // 七天里只记了四天饮食
    dietDaily: days.slice(0, 4).map((date) => ({ date, kcal: 2000, protein: 100 })),
    // 七天都有设备消耗
    healthDays: days.map((date) => ({ date, restingEnergy: 1500, activeEnergy: 700, steps: 8000, exerciseMinutes: 30 })),
    targets: { kcal: 2200, protein: 110 },
  });
  const by = Object.fromEntries(s.rows.map((r) => [r.key, r]));
  assert.equal(s.pairedDays, 4, '配对日应当只有四天');
  // 每个配对日 2000 − 2200 = −200，四天共 −800
  assert.match(by.balance.value, /缺口 800 kcal/);
  assert.match(by.balance.note, /依据 4 个完整日/);
  // 漏记那三天绝不能按 0 kcal 摄入计入（否则会变成 −7400）
  assert.doesNotMatch(by.balance.value, /7400|6600/);
});

test('配对数据不足时直说不足，不硬凑一个数', () => {
  const s = weeklySummary({
    endDate: '2026-08-28',
    dietDaily: [{ date: '2026-08-27', kcal: 2000, protein: 100 }],
    // 有饮食的那天缺设备消耗，有消耗的那天没饮食
    healthDays: [{ date: '2026-08-26', restingEnergy: 1500, activeEnergy: 600 }],
    targets: { kcal: 2200, protein: 110 },
  });
  const by = Object.fromEntries(s.rows.map((r) => [r.key, r]));
  assert.equal(s.pairedDays, 0);
  assert.equal(by.balance.value, '—');
  assert.match(by.balance.note, /配对数据不足/);
});

/*
 * 「日均锻炼」读 Apple 健康的锻炼分钟，「力量训练」是健身页记的次数。
 * 两个数完全不是一回事：练了 40 分钟和「训练 1 次」说的不是同一件事。
 */
test('日均锻炼取设备分钟，不拿力量训练次数顶替', () => {
  const days = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'];
  const s = weeklySummary({
    endDate: '2026-08-28',
    dietDaily: [],
    healthDays: days.map((date, i) => ({ date, exerciseMinutes: 20 + i * 10, steps: 6000 })),
    trainingDays: [{ date: '2026-08-25', items: [{ sets: [{}, {}, {}] }] }],
    targets: { kcal: 2200, protein: 110 },
  });
  const by = Object.fromEntries(s.rows.map((r) => [r.key, r]));
  assert.equal(by.exercise.value, '40 分钟', '20/30/40/50/60 的均值是 40');
  assert.match(by.exercise.note, /Apple 健康/);
  assert.equal(by.training.value, '1 次');
  assert.match(by.training.label, /力量训练/, '两个数得叫不同的名字');
  assert.notEqual(by.exercise.label, by.training.label);
});

test('设备数据太少时不给日均，缺测的日子不进分母', () => {
  const s = weeklySummary({
    endDate: '2026-08-28',
    dietDaily: [],
    healthDays: [{ date: '2026-08-27', exerciseMinutes: 45, steps: 9000 }],
    targets: { kcal: 2200, protein: 110 },
  });
  const keys = s.rows.map((r) => r.key);
  assert.ok(!keys.includes('exercise'), '只有一天数据不该报「日均锻炼」');
  assert.ok(!keys.includes('steps'));
});
