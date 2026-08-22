import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeValue, parseAppleDate, parseAttrs, createAggregator, feedXmlChunk,
  parseHealthJson, parseHealthCsv, computeBaseline, toDayKey,
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
