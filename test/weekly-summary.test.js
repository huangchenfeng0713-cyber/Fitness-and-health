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
  assert.equal(rowOf(s, 'training'), undefined, '力量训练次数留在健身页，不在速览重复');
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
  // 三次称重之间隔着的多半是水分，不够说方向
  assert.match(rowOf(s, 'weight').note, /方向还看不准/);

  const one = weeklySummary({ endDate: '2026-08-28', healthDays: [{ date: day(2), weightKg: 77 }] });
  assert.match(rowOf(one, 'weight').note, /只称了一次/, '一次称重看不出方向，要说出来');
});

/*
 * 称够 4 次才敢说方向 —— 和趋势卡「至少 4 次称重、隔开 7 天」是同一道门槛，
 * 这里的窗口本来就是 7 天，所以只卡次数。
 */
test('称够次数才说这一周在往哪走', () => {
  const at = (vals) => weeklySummary({
    endDate: '2026-08-28',
    healthDays: vals.map((w, i) => ({ date: day(vals.length - 1 - i), weightKg: w })),
  });
  assert.match(rowOf(at([80, 79.6, 79.3, 79]), 'weight').note, /往下走/);
  assert.match(rowOf(at([79, 79.3, 79.6, 80]), 'weight').note, /往上走/);
  assert.match(rowOf(at([79, 79.1, 79.2, 79.2]), 'weight').note, /基本持平/);
  assert.match(rowOf(at([80, 79.5, 79]), 'weight').note, /看不准/, '只称了三次不该报方向');
  // 第三列写结论，不写「共 N 次称重」「哪天到哪天」这类口径
  for (const vals of [[80, 79.6, 79.3, 79], [80, 79.5, 79]]) {
    assert.doesNotMatch(rowOf(at(vals), 'weight').note, /次称重|→/);
  }
});

test('窗口外的数据不算进来', () => {
  const s = weeklySummary({
    endDate: '2026-08-28',
    dietDaily: [{ date: day(20), kcal: 9999, protein: 300 }, { date: day(0), kcal: 2000, protein: 150 }],
    healthDays: [{ date: day(30), weightKg: 95 }, { date: day(1), weightKg: 80 }],
    targets: { kcal: 2000, protein: 150 },
  });
  assert.equal(rowOf(s, 'logged').value, '1 / 7 天', '把窗口外的日子算进来了');
  assert.match(rowOf(s, 'weight').note, /只称了一次/);
});

test('近 7 日速览不重复健身页的力量训练次数和组数', () => {
  const s = weeklySummary({
    endDate: '2026-08-28',
    trainingDays: [
      { date: day(1), items: [{ id: 'a', sets: [{}, {}, {}] }] },
      { date: day(3), items: [{ id: 'b', sets: [{}, {}] }] },
    ],
  });
  assert.equal(rowOf(s, 'training'), undefined);
  assert.ok(!s.rows.some((r) => /力量训练|共记下 .*组/.test(`${r.label} ${r.note}`)));
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
  // 第三列折成日均：总数是几天攒的，人排饭是按天排的
  assert.match(by.balance.note, /^日均缺口 200 kcal$/);
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
    targets: { kcal: 2200, protein: 110 },
  });
  const by = Object.fromEntries(s.rows.map((r) => [r.key, r]));
  assert.equal(by.exercise.value, '40分钟', '20/30/40/50/60 的均值是 40');
  /*
   * 这一行没有第三列。「一周 150 分钟」那个结论同一页的趋势卡已经说过一次，
   * 剩下能写的只有「按有数据的 5 天算」那类口径 —— 用户拿它做不出任何决定。
   */
  assert.equal(by.exercise.note, '');
  assert.equal(by.steps.note, '');
  assert.equal(by.training, undefined, '力量训练次数应留在健身页');
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

test('配对不足时点名缺的是哪一半', () => {
  /*
   * 只说「配对数据不足」，用户不知道该去补记饮食还是去同步手表 ——
   * 这两件事要做的动作完全不同。
   */
  const health = [];
  for (let i = 0; i < 6; i += 1) {
    health.push({ date: day(i), restingEnergy: 1500, activeEnergy: 400 });
  }
  const s = weeklySummary({ endDate: '2026-08-28', healthDays: health, dietDaily: [] });
  const balance = s.rows.find((r) => r.key === 'balance');
  assert.equal(balance.value, '—');
  assert.match(balance.note, /配对数据不足/);
  assert.match(balance.note, /缺饮食记录/, '没说清缺的是哪一半');
  // 几天几天那串数是口径：用户能动手的只有「去补记饮食」，报数改不了什么
  assert.doesNotMatch(balance.note, /\d+ 天/, '第三列又在报口径');

  // 反过来：饮食记着、手表没同步
  const noDevice = weeklySummary({
    endDate: '2026-08-28',
    dietDaily: Array.from({ length: 5 }, (_, i) => ({ date: day(i), kcal: 2000, protein: 100 })),
    healthDays: Array.from({ length: 5 }, (_, i) => ({ date: day(i), weightKg: 70 })),
  });
  assert.match(noDevice.rows.find((r) => r.key === 'balance').note, /缺设备记录/);
});
