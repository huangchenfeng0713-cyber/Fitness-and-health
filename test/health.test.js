import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeValue, parseAppleDate, parseAttrs, createAggregator, feedXmlChunk,
  parseHealthJson, parseHealthCsv, computeBaseline, toDayKey,
  findImplausibleDays, clearImplausibleValues, implausibleFields,
} from '../js/core/health.js';

test('能量单位区分大小写：Apple 导出的 Cal 是千卡，不是小卡', () => {
  // export.xml 里 ActiveEnergyBurned / BasalEnergyBurned 的 unit 就是 "Cal"。
  // 若按小写比较，会当成小卡除以 1000，整套能量数据缩小一千倍。
  assert.equal(normalizeValue('energy', 530, 'Cal'), 530, 'Cal 必须原样保留');
  assert.equal(normalizeValue('energy', 530, 'kcal'), 530);
  assert.equal(normalizeValue('energy', 530, 'KCAL'), 530);
  assert.equal(normalizeValue('energy', 5300, 'cal'), 5.3, '小写 cal 才是小卡');
  assert.ok(Math.abs(normalizeValue('energy', 418.4, 'kJ') - 100) < 1e-9);
  assert.ok(Math.abs(normalizeValue('energy', 4184, 'J') - 1) < 1e-9);
});

test('单位换算覆盖 HealthKit 其它常见单位', () => {
  assert.ok(Math.abs(normalizeValue('mass', 158.7, 'lb') - 71.98) < 0.02);
  assert.equal(normalizeValue('mass', 72500, 'g'), 72.5);
  assert.equal(normalizeValue('length', 1.75, 'm'), 175);
  assert.equal(normalizeValue('distance', 1500, 'm'), 1.5);
  assert.ok(Math.abs(normalizeValue('distance', 1, 'mi') - 1.609) < 0.001);
  assert.equal(normalizeValue('volume', 1.5, 'L'), 1500);
  assert.equal(normalizeValue('time', 1.5, 'hr'), 90);
  assert.equal(normalizeValue('mass_mg', 2, 'g'), 2000);
});

test('体脂率：HealthKit 存的是 0~1 的比例，第三方常存百分数', () => {
  assert.ok(Math.abs(normalizeValue('percent', 0.181, '%') - 18.1) < 1e-9);
  assert.equal(normalizeValue('percent', 18.1, '%'), 18.1, '已是百分数就不再乘 100');
});

test('Apple 时间戳带时区偏移，日期取本地日', () => {
  const r = parseAppleDate('2026-08-21 07:12:33 +0800');
  assert.equal(r.dayKey, '2026-08-21');
  assert.equal(r.date.toISOString(), '2026-08-20T23:12:33.000Z');
  assert.equal(parseAppleDate('2026-08-21 23:50:00 -0700').dayKey, '2026-08-21',
    '西半球的深夜记录仍归当地当天');
  assert.equal(parseAppleDate(''), null);
});

test('属性解析', () => {
  const a = parseAttrs('type="HKQuantityTypeIdentifierStepCount" unit="count" value="1200"');
  assert.equal(a.type, 'HKQuantityTypeIdentifierStepCount');
  assert.equal(a.value, '1200');
});

const rec = (type, value, start, end = start, unit = '') =>
  `<Record type="${type}" unit="${unit}" startDate="${start}" endDate="${end}" value="${value}"/>`;

test('累加型指标相加，快照型取当天最后一条', () => {
  const agg = createAggregator();
  feedXmlChunk([
    rec('HKQuantityTypeIdentifierStepCount', 1200, '2026-08-20 09:00:00 +0800', '2026-08-20 09:10:00 +0800', 'count'),
    rec('HKQuantityTypeIdentifierStepCount', 800, '2026-08-20 10:00:00 +0800', '2026-08-20 10:10:00 +0800', 'count'),
    rec('HKQuantityTypeIdentifierBodyMass', 73.0, '2026-08-20 07:00:00 +0800', '2026-08-20 07:00:00 +0800', 'kg'),
    rec('HKQuantityTypeIdentifierBodyMass', 72.4, '2026-08-20 21:00:00 +0800', '2026-08-20 21:00:00 +0800', 'kg'),
  ].join('\n'), agg);
  const { days } = agg.result();
  assert.equal(days[0].steps, 2000);
  assert.equal(days[0].weightKg, 72.4, '体重取当天最后一次称重');
});

test('未知类型被跳过而不是报错', () => {
  const agg = createAggregator();
  feedXmlChunk(rec('HKQuantityTypeIdentifierSomethingNew', 1, '2026-08-20 09:00:00 +0800'), agg);
  const r = agg.result();
  assert.equal(r.days.length, 0);
  assert.equal(r.skipped, 1);
});

test('睡眠只统计入睡片段，并归到醒来那天', () => {
  const agg = createAggregator();
  feedXmlChunk([
    rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisInBed', '2026-08-19 23:00:00 +0800', '2026-08-19 23:30:00 +0800'),
    rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepCore', '2026-08-19 23:30:00 +0800', '2026-08-20 03:00:00 +0800'),
    rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepREM', '2026-08-20 03:00:00 +0800', '2026-08-20 06:30:00 +0800'),
  ].join('\n'), agg);
  const { days } = agg.result();
  assert.equal(days.length, 1);
  assert.equal(days[0].date, '2026-08-20', '跨午夜的睡眠归到起床那天');
  assert.equal(days[0].sleepMinutes, 420, '仅 Asleep 片段共 7 小时，卧床不算');
});

test('分块流式解析：标签被切成两半也不丢数据', () => {
  const xml = [
    rec('HKQuantityTypeIdentifierStepCount', 500, '2026-08-20 09:00:00 +0800', '2026-08-20 09:10:00 +0800', 'count'),
    rec('HKQuantityTypeIdentifierStepCount', 700, '2026-08-20 10:00:00 +0800', '2026-08-20 10:10:00 +0800', 'count'),
    rec('HKQuantityTypeIdentifierActiveEnergyBurned', 120, '2026-08-20 10:00:00 +0800', '2026-08-20 10:10:00 +0800', 'kcal'),
  ].join('\n');

  for (const size of [7, 13, 40, 97]) {
    const agg = createAggregator();
    let tail = '';
    for (let i = 0; i < xml.length; i += size) tail = feedXmlChunk(tail + xml.slice(i, i + size), agg);
    const { days } = agg.result();
    assert.equal(days[0].steps, 1200, `分块大小 ${size} 时步数丢失`);
    assert.equal(days[0].activeEnergy, 120, `分块大小 ${size} 时活动能量丢失`);
  }
});

test('Record 内含子元素时不会破坏解析', () => {
  const agg = createAggregator();
  feedXmlChunk(
    `<Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2026-08-20 09:00:00 +0800" endDate="2026-08-20 09:10:00 +0800" value="900">
       <MetadataEntry key="HKMetadataKeySyncVersion" value="1"/>
     </Record>`, agg);
  assert.equal(agg.result().days[0].steps, 900);
});

test('Health Auto Export 风格的 JSON', () => {
  const { days } = parseHealthJson({
    data: {
      metrics: [
        { name: 'step_count', units: 'count', data: [{ date: '2026-08-20 00:00:00 +0800', qty: 8600 }] },
        { name: 'active_energy', units: 'kJ', data: [{ date: '2026-08-20 00:00:00 +0800', qty: 2092 }] },
        { name: 'weight_body_mass', units: 'kg', data: [{ date: '2026-08-20 07:00:00 +0800', qty: 71.4 }] },
        { name: '完全不认识的指标', units: 'x', data: [{ date: '2026-08-20 07:00:00 +0800', qty: 1 }] },
      ],
    },
  });
  assert.equal(days.length, 1);
  assert.equal(days[0].steps, 8600);
  assert.equal(days[0].activeEnergy, 500, 'kJ 应换算为 kcal');
  assert.equal(days[0].weightKg, 71.4);
});

test('扁平 JSON（快捷指令粘贴的格式）', () => {
  const { days } = parseHealthJson([
    { date: '2026-08-20', steps: 8600, activeEnergy: 520, weightKg: 71.2 },
    { date: '2026-08-21', steps: 12000, activeEnergy: 700 },
  ]);
  assert.equal(days.length, 2);
  assert.equal(days[1].steps, 12000);
});

test('CSV 导入', () => {
  const { days } = parseHealthCsv('date,steps,active_energy,weight\n2026-08-20,8600,520,71.2\n2026-08-21,9100,610,71.0\n');
  assert.equal(days.length, 2);
  assert.equal(days[0].steps, 8600);
  assert.equal(days[1].weightKg, 71.0);
});

test('CSV 缺少日期列时明确失败而不是产生垃圾数据', () => {
  const r = parseHealthCsv('steps,weight\n8600,71.2\n');
  assert.equal(r.days.length, 0);
  assert.ok(r.skipped > 0);
});

test('基线：体重趋势用最小二乘拟合，抗单日波动', () => {
  const health = [];
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(2026, 7, 1 + i);
    // 每天降 0.05kg，叠加 ±0.4kg 的水分波动
    health.push({ date: toDayKey(d), weightKg: 73 - i * 0.05 + (i % 2 ? 0.4 : -0.4), activeEnergy: 400 + i * 5 });
  }
  const b = computeBaseline(health, [], '2026-08-20');
  assert.ok(Math.abs(b.weightTrend - -0.35) < 0.12, `趋势 ${b.weightTrend} 应接近 -0.35 kg/周`);
  assert.ok(b.activeEnergy > 400 && b.activeEnergy < 450);
});

test('基线：没有历史饮食记录时返回 null 而不是 0', () => {
  const b = computeBaseline([{ date: '2026-08-19', steps: 100 }], [], '2026-08-20');
  assert.equal(b.kcalIntake, null);
  assert.equal(b.proteinIntake, null);
});

test('单条 JSON 记录也能导入（快捷指令最容易产出这种）', () => {
  const { days } = parseHealthJson({ date: '2026-08-22', steps: 2413, activeEnergy: 76.8, weight: 59 });
  assert.equal(days.length, 1);
  assert.equal(days[0].steps, 2413);
  assert.equal(days[0].activeEnergy, 76.8);
  assert.equal(days[0].weightKg, 59);
});

test('字段名带多余空格 / 大小写 / 下划线都能认出来', () => {
  const variants = [
    { date: '2026-08-22', 'activeEnergy ': 76.8 },      // 末尾空格
    { date: '2026-08-22', ' activeEnergy': 76.8 },      // 开头空格
    { date: '2026-08-22', ACTIVE_ENERGY: 76.8 },        // 全大写加下划线
    { date: '2026-08-22', 'active energy': 76.8 },      // 空格分隔
    { date: '2026-08-22', 'Active-Energy': 76.8 },      // 连字符
    { date: '2026-08-22', 活动能量: 76.8 },              // 中文
  ];
  for (const v of variants) {
    const { days } = parseHealthJson(v);
    assert.equal(days[0]?.activeEnergy, 76.8, `没认出写法：${JSON.stringify(Object.keys(v))}`);
  }
});

test('体重的多种叫法都认得', () => {
  for (const k of ['weight', 'weightKg', 'body_mass', 'weight_body_mass', '体重']) {
    const { days } = parseHealthJson({ date: '2026-08-22', [k]: 59 });
    assert.equal(days[0]?.weightKg, 59, `没认出 ${k}`);
  }
});

test('认不出的字段会被列出来，而不是悄悄丢掉', () => {
  const r = parseHealthJson({ date: '2026-08-22', steps: 100, 心情: 5, mystery: 1 });
  assert.deepEqual(r.ignoredKeys.sort(), ['mystery', '心情']);
  assert.equal(r.days[0].steps, 100, '认得出的字段仍应正常导入');
});

test('缺少 date 时不产出垃圾数据', () => {
  const r = parseHealthJson({ steps: 100, weight: 59 });
  assert.equal(r.days.length, 0);
});

test('日期字段的多种叫法都认得', () => {
  for (const k of ['date', 'Date', 'day', '日期']) {
    const { days } = parseHealthJson({ [k]: '2026-08-22', steps: 100 });
    assert.equal(days[0]?.date, '2026-08-22', `没认出日期字段 ${k}`);
  }
});

test('CSV 表头也走同一套归一化', () => {
  const { days, ignoredKeys } = parseHealthCsv('Date, Active_Energy , weight, 心情\n2026-08-22,520,71.2,5\n');
  assert.equal(days[0].activeEnergy, 520);
  assert.equal(days[0].weightKg, 71.2);
  assert.deepEqual(ignoredKeys, ['心情']);
});

test('识别被单位缺陷缩小一千倍的日子', async () => {
  const { findMisscaledEnergyDays } = await import('../js/core/health.js');
  const days = [
    { date: '2026-08-01', steps: 8000, activeEnergy: 0.55, restingEnergy: 1.48 },  // 受影响
    { date: '2026-08-02', steps: 8000, activeEnergy: 550, restingEnergy: 1480 },   // 正常
    { date: '2026-08-03', steps: 0, activeEnergy: 0, restingEnergy: 0 },           // 空数据
    { date: '2026-08-04', steps: 300, activeEnergy: 12 },                          // 步数太少，不下结论
    { date: '2026-08-05', steps: 6000, activeEnergy: 8 },                          // 受影响
  ];
  assert.deepEqual(findMisscaledEnergyDays(days).map((d) => d.date), ['2026-08-01', '2026-08-05']);
});

test('修正只动能量字段，其余原样保留', async () => {
  const { repairMisscaledEnergy } = await import('../js/core/health.js');
  const fixed = repairMisscaledEnergy([
    { date: '2026-08-01', steps: 8000, weightKg: 71.2, sleepMinutes: 430, activeEnergy: 0.55, restingEnergy: 1.48, hkKcal: 1.9 },
  ]);
  assert.equal(fixed.length, 1);
  assert.equal(fixed[0].activeEnergy, 550);
  assert.equal(fixed[0].restingEnergy, 1480);
  assert.equal(fixed[0].hkKcal, 1900);
  assert.equal(fixed[0].steps, 8000, '步数不该被改');
  assert.equal(fixed[0].weightKg, 71.2, '体重不该被改');
  assert.equal(fixed[0].sleepMinutes, 430, '睡眠不该被改');
});

test('修正是幂等的：再跑一次不会把正确数据放大一千倍', async () => {
  const { repairMisscaledEnergy, findMisscaledEnergyDays } = await import('../js/core/health.js');
  const once = repairMisscaledEnergy([{ date: '2026-08-01', steps: 8000, activeEnergy: 0.55, restingEnergy: 1.48 }]);
  assert.equal(findMisscaledEnergyDays(once).length, 0, '修好后不该再被判定为需要修复');
  assert.equal(repairMisscaledEnergy(once).length, 0);
});

test('正常数据不会被误伤', async () => {
  const { repairMisscaledEnergy } = await import('../js/core/health.js');
  const normal = [
    { date: '2026-08-01', steps: 8000, activeEnergy: 550, restingEnergy: 1480 },
    { date: '2026-08-02', steps: 200, activeEnergy: 30, restingEnergy: 1450 },   // 真久坐
    { date: '2026-08-03', weightKg: 71 },                                        // 只有体重
  ];
  assert.deepEqual(repairMisscaledEnergy(normal), []);
});


/* ---------------------------------------------------- 多来源去重 */

const recFrom = (src, type, value, start, end = start, unit = '') =>
  `<Record type="${type}" sourceName="${src}" unit="${unit}" startDate="${start}" endDate="${end}" value="${value}"/>`;

test('iPhone 与 Apple Watch 各写一份步数时不重复计数', () => {
  // 实测：健康 App 当天显示 8419 步，把导出文件里所有来源加起来变成 16299 步。
  // 两台设备记的是同一段路，加起来就是把人走的路数了两遍。
  const agg = createAggregator();
  feedXmlChunk([
    recFrom('iPhone', 'HKQuantityTypeIdentifierStepCount', 5000, '2026-08-22 09:00:00 +0800', '2026-08-22 09:30:00 +0800', 'count'),
    recFrom('iPhone', 'HKQuantityTypeIdentifierStepCount', 3419, '2026-08-22 15:00:00 +0800', '2026-08-22 15:30:00 +0800', 'count'),
    recFrom('Apple Watch', 'HKQuantityTypeIdentifierStepCount', 4600, '2026-08-22 09:00:00 +0800', '2026-08-22 09:30:00 +0800', 'count'),
    recFrom('Apple Watch', 'HKQuantityTypeIdentifierStepCount', 3280, '2026-08-22 15:00:00 +0800', '2026-08-22 15:30:00 +0800', 'count'),
  ].join('\n'), agg);
  const { days } = agg.result();
  assert.equal(days[0].steps, 8419, '应取最完整的那个来源，而不是 16299');
});

test('只有一个来源时结果和原来完全一样', () => {
  const agg = createAggregator();
  feedXmlChunk([
    recFrom('iPhone', 'HKQuantityTypeIdentifierStepCount', 1200, '2026-08-20 09:00:00 +0800', '2026-08-20 09:10:00 +0800', 'count'),
    recFrom('iPhone', 'HKQuantityTypeIdentifierStepCount', 800, '2026-08-20 10:00:00 +0800', '2026-08-20 10:10:00 +0800', 'count'),
  ].join('\n'), agg);
  assert.equal(agg.result().days[0].steps, 2000);
});

test('活动能量与静息能量同样按来源去重', () => {
  const agg = createAggregator();
  feedXmlChunk([
    recFrom('Watch', 'HKQuantityTypeIdentifierActiveEnergyBurned', 300, '2026-08-22 09:00:00 +0800', '2026-08-22 09:30:00 +0800', 'Cal'),
    recFrom('某健身 App', 'HKQuantityTypeIdentifierActiveEnergyBurned', 280, '2026-08-22 09:00:00 +0800', '2026-08-22 09:30:00 +0800', 'Cal'),
    recFrom('Watch', 'HKQuantityTypeIdentifierBasalEnergyBurned', 1600, '2026-08-22 09:00:00 +0800', '2026-08-22 09:30:00 +0800', 'Cal'),
  ].join('\n'), agg);
  const d = agg.result().days[0];
  assert.equal(d.activeEnergy, 300, '两个来源记的是同一段运动，取一份');
  assert.equal(d.restingEnergy, 1600);
});

test('睡眠也不会因为手机与手表各记一份而翻倍', () => {
  const agg = createAggregator();
  feedXmlChunk([
    recFrom('Watch', 'HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepCore',
      '2026-08-21 23:00:00 +0800', '2026-08-22 06:00:00 +0800'),
    recFrom('某睡眠 App', 'HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepCore',
      '2026-08-21 23:10:00 +0800', '2026-08-22 05:50:00 +0800'),
  ].join('\n'), agg);
  const d = agg.result().days.find((x) => x.date === '2026-08-22');
  assert.equal(Math.round(d.sleepMinutes), 420, '取较完整的 7 小时，而不是两份相加的 13 小时以上');
});

/* ---------------------------------------------------- 不可能的数值 */

test('识别生理上不可能的数值', () => {
  // 用户实测：08-23 凌晨存进来 静息 23520 kcal、活动 2010 kcal
  const days = [
    { date: '2026-08-22', restingEnergy: 1626, activeEnergy: 346, steps: 8419 },
    { date: '2026-08-23', restingEnergy: 23520, activeEnergy: 2010, steps: 0 },
  ];
  const bad = findImplausibleDays(days);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].date, '2026-08-23');
  assert.deepEqual(implausibleFields(bad[0]), ['restingEnergy']);
  assert.deepEqual(implausibleFields(days[0]), [], '正常的一天不该被误伤');
});

test('大运动量不会被当成异常', () => {
  // 环法赛段级别的一天：活动能量 6500 kcal、40000 步，都是真实可达的
  assert.deepEqual(implausibleFields({ date: '2026-08-01', activeEnergy: 6500, steps: 40000, restingEnergy: 2100 }), []);
});

test('清掉异常值时只删该删的那几项', () => {
  const days = [{ date: '2026-08-23', restingEnergy: 23520, activeEnergy: 2010, weightKg: 59, steps: 0 }];
  const [fixed] = clearImplausibleValues(days);
  assert.equal(fixed.restingEnergy, undefined, '不可能的静息能量被抹掉');
  assert.equal(fixed.activeEnergy, 2010, '2010 没超过上限，不该被牵连');
  assert.equal(fixed.weightKg, 59, '体重原样保留');
  assert.equal(fixed.date, '2026-08-23');
});

test('基线平均值把不可能的数挡在外面', () => {
  // 否则一天坏数据会顺着基线污染之后 14 天的热量预算
  const days = [
    { date: '2026-08-20', restingEnergy: 1600, activeEnergy: 300 },
    { date: '2026-08-21', restingEnergy: 1600, activeEnergy: 300 },
    { date: '2026-08-22', restingEnergy: 23520, activeEnergy: 300 },
  ];
  const b = computeBaseline(days, [], '2026-08-23');
  assert.equal(Math.round(b.restingEnergy), 1600, '异常那天不参与平均');
});
