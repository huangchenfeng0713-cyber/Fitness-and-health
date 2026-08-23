import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeValue, parseAppleDate, parseAttrs, createAggregator, feedXmlChunk,
  parseHealthJson, parseHealthCsv, computeBaseline, toDayKey,
  findImplausibleDays, clearImplausibleValues, implausibleFields,
  isPlausibleHealthValue,
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
  assert.ok(Math.abs(normalizeValue('energy', 4184, 'j') - 1) < 1e-9, '小写 j 也应识别');
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
  assert.equal(parseAppleDate('2026-08-20').dayKey, '2026-08-20', '裸日期不应受运行时区影响');
  assert.equal(parseAppleDate('2024-02-29').dayKey, '2024-02-29');
  assert.equal(parseAppleDate('2026-02-29'), null, '非法日期不能被自动滚到三月');
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

test('睡眠跨午夜按整段最终醒来日归档，重叠来源只算区间并集', () => {
  const agg = createAggregator();
  feedXmlChunk([
    rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleep', '2026-08-19 23:00:00 +0800', '2026-08-20 07:00:00 +0800'),
    rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepCore', '2026-08-19 23:00:00 +0800', '2026-08-19 23:50:00 +0800'),
    rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepREM', '2026-08-19 23:50:00 +0800', '2026-08-20 00:30:00 +0800'),
    rec('HKCategoryTypeIdentifierSleepAnalysis', 'HKCategoryValueSleepAnalysisAsleepCore', '2026-08-20 00:30:00 +0800', '2026-08-20 07:00:00 +0800'),
  ].join('\n'), agg);
  const result = agg.result();
  assert.deepEqual(result.days.map((d) => d.date), ['2026-08-20']);
  assert.equal(result.days[0].sleepMinutes, 480, 'legacy 总段与分期重叠时不能翻倍');
  assert.equal(result.quality.sleepOverlapMinutes, 480);
});

test('XML 精确重复去重，多设备累计量不再静默相加', () => {
  const stamp = '2026-08-20 09:00:00 +0800';
  const end = '2026-08-20 10:00:00 +0800';
  const row = (source, value) => `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="${source}" unit="count" startDate="${stamp}" endDate="${end}" value="${value}"/>`;
  const agg = createAggregator();
  feedXmlChunk([row('Apple Watch', 1000), row('Apple Watch', 1000), row('iPhone', 800)].join('\n'), agg);
  const result = agg.result();
  assert.equal(result.days[0].steps, 1000, '跨来源采用单来源日总量最大值近似，不能得到 1800/2800');
  assert.equal(result.quality.duplicateRecords, 1);
  assert.equal(result.quality.multiSourceDays, 1);
});

test('多来源累计量按 5 分钟区间保留互补时段，只在重叠桶按优先级选源', () => {
  const row = (source, value, start, end) => `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="${source}" unit="count" startDate="${start}" endDate="${end}" value="${value}"/>`;
  const agg = createAggregator();
  feedXmlChunk([
    row('Apple Watch', 1000, '2026-08-20 09:00:00 +0800', '2026-08-20 09:05:00 +0800'),
    row('iPhone', 800, '2026-08-20 09:00:00 +0800', '2026-08-20 09:05:00 +0800'),
    row('iPhone', 600, '2026-08-20 09:05:00 +0800', '2026-08-20 09:10:00 +0800'),
  ].join('\n'), agg);
  const result = agg.result();
  assert.equal(result.days[0].steps, 1600, '重叠段取 Watch，iPhone 的互补时段仍应保留');
  assert.equal(result.quality.overlapBuckets, 1);
  assert.equal(result.quality.droppedOverlapByMetric.steps, 800);
  assert.equal(result.quality.resolutionMinutes, 5);
  assert.equal(result.quality.sourceCoverage.length, 2);
});

test('同名来源的两台设备也必须参与重叠消重，不能先在来源内相加', () => {
  const a = createAggregator();
  const sample = (device, value) => `<Record type="HKQuantityTypeIdentifierStepCount"
    sourceName="Apple Watch" device="${device}" value="${value}" unit="count"
    startDate="2026-08-20 09:00:00 +0800" endDate="2026-08-20 09:05:00 +0800"/>`;
  feedXmlChunk([sample('Watch7,1', 1000), sample('Watch6,1', 800)].join(''), a);
  const result = a.result();
  assert.equal(result.days[0].steps, 1000);
  assert.equal(result.quality.overlapBuckets, 1);
});

test('HKWasUserEntered 的手动样本在重叠区间优先于设备推断优先级', () => {
  const agg = createAggregator();
  feedXmlChunk([
    '<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-08-20 09:00:00 +0800" endDate="2026-08-20 09:05:00 +0800" value="1000"/>',
    '<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-08-20 09:00:00 +0800" endDate="2026-08-20 09:05:00 +0800" value="100"><MetadataEntry key="HKWasUserEntered" value="true"/></Record>',
  ].join('\n'), agg);
  const result = agg.result();
  assert.equal(result.days[0].steps, 100);
  assert.equal(result.metadata.sources.find((s) => s.sourceName === 'iPhone').userEnteredRecords, 1);
});

test('UUID/ExternalUUID 优先精确去重，ExternalUUID 不同的同属性记录必须同时保留', () => {
  const agg = createAggregator();
  const attrs = 'type="HKQuantityTypeIdentifierDietaryEnergyConsumed" sourceName="饮食 App" unit="kcal" startDate="2026-08-20 12:00:00 +0800" endDate="2026-08-20 12:00:00 +0800" value="100"';
  feedXmlChunk([
    `<Record uuid="ABC-123" ${attrs}/>` ,
    `<Record uuid="ABC-123" ${attrs}/>` ,
    `<Record ${attrs}><MetadataEntry key="HKExternalUUID" value="meal-A"/></Record>`,
    `<Record ${attrs}><MetadataEntry key="HKExternalUUID" value="meal-B"/></Record>`,
  ].join('\n'), agg);
  const result = agg.result();
  assert.equal(result.days[0].hkKcal, 300);
  assert.equal(result.quality.duplicateRecords, 1);
  assert.equal(result.quality.identityCounts.uuid, 1);
  assert.equal(result.quality.identityCounts.externalUUID, 2);
});

test('SyncIdentifier 只保留最高 SyncVersion，同版本再出现视为重复', () => {
  const sample = (value, version) => `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="同步 App" unit="count" startDate="2026-08-20 09:00:00 +0800" endDate="2026-08-20 09:05:00 +0800" value="${value}"><MetadataEntry key="HKMetadataKeySyncIdentifier" value="steps-1"/><MetadataEntry key="HKMetadataKeySyncVersion" value="${version}"/></Record>`;
  const agg = createAggregator();
  feedXmlChunk([sample(100, 1), sample(250, 2), sample(250, 2)].join('\n'), agg);
  const result = agg.result();
  assert.equal(result.days[0].steps, 250);
  assert.equal(result.quality.supersededSyncRecords, 1);
  assert.equal(result.quality.duplicateRecords, 1);
  assert.equal(result.quality.syncIdentifierRecords, 1);
});

test('ActivitySummary 覆盖圆环指标，Workout 仅形成独立摘要且不重复加入活动能量', () => {
  const xml = `<HealthData locale="zh_CN">
    <ExportDate value="2026-08-21 08:00:00 +0800"/>
    <Me HKCharacteristicTypeIdentifierDateOfBirth="1990-01-01" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale"/>
    <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Apple Watch" unit="kcal" startDate="2026-08-20 10:00:00 +0800" endDate="2026-08-20 11:00:00 +0800" value="400"/>
    <Record type="HKQuantityTypeIdentifierAppleExerciseTime" sourceName="Apple Watch" unit="min" startDate="2026-08-20 10:00:00 +0800" endDate="2026-08-20 11:00:00 +0800" value="20"/>
    <ActivitySummary dateComponents="2026-08-20" activeEnergyBurned="350" activeEnergyBurnedUnit="kcal" appleExerciseTime="25" appleStandHours="10" activeEnergyBurnedGoal="500"/>
    <Workout uuid="workout-1" workoutActivityType="HKWorkoutActivityTypeRunning" sourceName="Apple Watch" sourceVersion="11.0" creationDate="2026-08-20 11:10:00 +0800" startDate="2026-08-20 10:00:00 +0800" endDate="2026-08-20 11:00:00 +0800" duration="60" durationUnit="min" totalEnergyBurned="300" totalEnergyBurnedUnit="kcal" totalDistance="5" totalDistanceUnit="km"><MetadataEntry key="HKExternalUUID" value="run-1"/></Workout>
    <Record type="HKQuantityTypeIdentifierNotSupported" startDate="2026-08-20 12:00:00 +0800" endDate="2026-08-20 12:00:00 +0800" value="1"/>
  </HealthData>`;
  const agg = createAggregator();
  const tail = feedXmlChunk(xml, agg);
  agg.finishDocument(tail);
  const result = agg.result();
  const day = result.days[0];
  assert.equal(day.activeEnergy, 350, 'ActivitySummary 比 Record 求和更权威');
  assert.equal(day.exerciseMinutes, 25);
  assert.equal(day.standHours, 10);
  assert.equal(day.workoutCount, 1);
  assert.equal(day.workoutEnergy, 300);
  assert.equal(day.activeEnergy, 350, 'Workout 的 300 kcal 绝不能再加到 activeEnergy');
  assert.equal(result.workouts[0].sourceVersion, '11.0');
  assert.equal(result.metadata.exportDate.value, '2026-08-21 08:00:00 +0800');
  assert.equal(result.metadata.me.HKCharacteristicTypeIdentifierDateOfBirth, '1990-01-01');
  assert.equal(result.quality.unsupportedRecords, 1);
  assert.equal(result.quality.activitySummaryDays, 1);
  assert.equal(result.fullSnapshot, true);
});

test('新版 Workout 可从内嵌 WorkoutStatistics 读取能量和距离摘要', () => {
  const a = createAggregator();
  feedXmlChunk(`<Workout workoutActivityType="HKWorkoutActivityTypeRunning" sourceName="Apple Watch"
    startDate="2026-08-20 10:00:00 +0800" endDate="2026-08-20 11:00:00 +0800"
    duration="60" durationUnit="min">
    <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="300" unit="kcal"/>
    <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="5000" unit="m"/>
  </Workout>`, a);
  const workout = a.result().workouts[0];
  assert.equal(workout.totalEnergy, 300);
  assert.equal(workout.distanceKm, 5);
  assert.equal(workout.statistics.length, 2);
});

test('Correlation 内嵌 Record 不会被当顶层样本重复累计', () => {
  const agg = createAggregator();
  feedXmlChunk(`<HealthData><Correlation type="HKCorrelationTypeIdentifierFood" startDate="2026-08-20 12:00:00 +0800" endDate="2026-08-20 12:00:00 +0800"><Record type="HKQuantityTypeIdentifierDietaryEnergyConsumed" unit="kcal" startDate="2026-08-20 12:00:00 +0800" endDate="2026-08-20 12:00:00 +0800" value="500"/></Correlation></HealthData>`, agg);
  const result = agg.result();
  assert.equal(result.days.length, 0);
  assert.deepEqual(result.quality.unsupportedXmlElements, [{ type: 'Correlation', count: 1 }]);
});

test('未知顶层容器必须整体跳过，内嵌 Record 不能污染聚合结果', () => {
  const a = createAggregator();
  const xml = `<HealthData>
    <!-- 注释中的 <Record type="HKQuantityTypeIdentifierStepCount" value="9999"/> 也不能解析 -->
    <FutureHealthElement version="1">
      <FutureHealthElement>
        <Record type="HKQuantityTypeIdentifierStepCount" sourceName="未来格式" value="7000" unit="count"
          startDate="2026-08-20 08:00:00 +0800" endDate="2026-08-20 08:05:00 +0800"/>
      </FutureHealthElement>
      <Record type="HKQuantityTypeIdentifierStepCount" sourceName="未来格式" value="5000" unit="count"
        startDate="2026-08-20 09:00:00 +0800" endDate="2026-08-20 09:05:00 +0800"/>
    </FutureHealthElement>
    <FutureLeaf value="x"/>
    <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" value="100" unit="count"
      startDate="2026-08-20 10:00:00 +0800" endDate="2026-08-20 10:05:00 +0800"/>
  </HealthData>`;
  const tail = feedXmlChunk(xml, a);
  a.finishDocument(tail);
  const result = a.result();
  assert.equal(result.days[0].steps, 100);
  assert.deepEqual(result.quality.unsupportedXmlElements, [
    { type: 'FutureHealthElement', count: 1 },
    { type: 'FutureLeaf', count: 1 },
  ]);
  assert.equal(result.quality.unsupportedXmlElementCount, 2);
  assert.equal(result.quality.unknownXmlElementCount, 2);
  assert.equal(result.quality.snapshotBlockedByUnknownElements, true);
  assert.equal(result.quality.documentComplete, true);
  assert.equal(result.fullSnapshot, false, '未知 schema 不能授权删除旧 Apple 字段');
});

test('已知可安全略过的 Apple 顶层结构不会阻止完整快照', () => {
  const a = createAggregator();
  const tail = feedXmlChunk(`<HealthData>
    <Correlation type="HKCorrelationTypeIdentifierBloodPressure">
      <Record type="HKQuantityTypeIdentifierBloodPressureSystolic" value="120"/>
    </Correlation>
    <ClinicalRecord type="HKClinicalTypeIdentifierAllergyRecord"/>
  </HealthData>`, a);
  a.finishDocument(tail);
  const result = a.result();
  assert.equal(result.quality.unsupportedXmlElementCount, 2);
  assert.equal(result.quality.unknownXmlElementCount, 0);
  assert.equal(result.fullSnapshot, true);
});

test('只有完整闭合的 HealthData 才标记全量快照，截断 XML 必须降级为 partial', () => {
  const complete = createAggregator();
  let tail = feedXmlChunk(`<HealthData>${rec('HKQuantityTypeIdentifierStepCount', 10, '2026-08-20 09:00:00 +0800', '2026-08-20 09:05:00 +0800', 'count')}</HealthData>`, complete);
  complete.finishDocument(tail);
  assert.equal(complete.result().fullSnapshot, true);

  const broken = createAggregator();
  tail = feedXmlChunk('<HealthData><Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2026-08-20 09:00:00 +0800"', broken);
  broken.finishDocument(tail);
  const result = broken.result();
  assert.equal(result.fullSnapshot, false);
  assert.equal(result.quality.documentComplete, false);
  assert.equal(result.quality.truncatedXml, true);
});

test('只有文件尾部而没有 HealthData 开头时绝不能标记全量快照', () => {
  const a = createAggregator();
  const tail = feedXmlChunk(`${rec('HKQuantityTypeIdentifierStepCount', 10,
    '2026-08-20 09:00:00 +0800', '2026-08-20 09:05:00 +0800', 'count')}</HealthData>`, a);
  a.finishDocument(tail);
  const result = a.result();
  assert.equal(result.fullSnapshot, false);
  assert.equal(result.quality.documentStarted, false);
  assert.equal(result.quality.truncatedXml, true);
});

test('未知顶层容器未闭合时即使看见根尾标签也必须降级为 partial', () => {
  const a = createAggregator();
  const tail = feedXmlChunk('<HealthData><FutureHealthElement><Record/></HealthData>', a);
  a.finishDocument(tail);
  const result = a.result();
  assert.equal(result.fullSnapshot, false);
  assert.equal(result.quality.documentStarted, true);
  assert.equal(result.quality.documentComplete, true);
  assert.equal(result.quality.truncatedXml, true);
});

test('即使出现 HealthData 尾标签，未闭合的 Record 仍视为损坏快照', () => {
  const a = createAggregator();
  const tail = feedXmlChunk(`<HealthData><Record type="HKQuantityTypeIdentifierStepCount"
    value="100" unit="count" startDate="2026-08-20 09:00:00 +0800"
    endDate="2026-08-20 09:05:00 +0800"></HealthData>`, a);
  a.finishDocument(tail);
  const result = a.result();
  assert.equal(result.fullSnapshot, false);
  assert.equal(result.quality.documentComplete, true);
  assert.equal(result.quality.truncatedXml, true);
});

test('来源版本、设备与创建时间在质量元数据中保留，XML 实体会解码', () => {
  const a = createAggregator();
  feedXmlChunk(`<Record type="HKQuantityTypeIdentifierStepCount" value="100" unit="count"
    sourceName="Watch &amp; Phone" sourceVersion="10.1" device="&lt;&lt;HKDevice&gt;&gt;"
    creationDate="2026-08-20 09:06:00 +0800" startDate="2026-08-20 09:00:00 +0800"
    endDate="2026-08-20 09:05:00 +0800"/>`, a);
  const source = a.result().quality.sourceCoverage[0];
  assert.equal(source.sourceName, 'Watch & Phone');
  assert.deepEqual(source.sourceVersions, ['10.1']);
  assert.deepEqual(source.devices, ['<<HKDevice>>']);
  assert.equal(source.firstCreationDate, '2026-08-20 09:06:00 +0800');
  assert.equal(source.lastCreationDate, '2026-08-20 09:06:00 +0800');
});

test('跨午夜累计样本按持续时间拆分到两个本地日', () => {
  const agg = createAggregator();
  feedXmlChunk(rec('HKQuantityTypeIdentifierStepCount', 100, '2026-08-20 23:55:00 +0800', '2026-08-21 00:05:00 +0800', 'count'), agg);
  const { days } = agg.result();
  assert.equal(days[0].steps, 50);
  assert.equal(days[1].steps, 50);
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

test('JSON 平均型按日求平均，最近值按时间而不是数组顺序', () => {
  const { days } = parseHealthJson({ data: { metrics: [
    { name: 'resting_heart_rate', units: 'count/min', data: [
      { date: '2026-08-20 20:00:00 +0800', qty: 80 },
      { date: '2026-08-20 08:00:00 +0800', qty: 60 },
    ] },
    { name: 'weight_body_mass', units: 'lb', data: [
      { date: '2026-08-20 20:00:00 +0800', qty: 154.3 },
      { date: '2026-08-20 08:00:00 +0800', qty: 150 },
    ] },
  ] } });
  assert.equal(days[0].restingHR, 70);
  assert.ok(Math.abs(days[0].weightKg - 70) < 0.1, 'point/metric 单位应换算且取时间最新值');
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

test('CSV 支持引号逗号、空值、BOM、单位表头与重复日期合并', () => {
  const csv = '\uFEFFdate,steps,weight[lb],active_energy(kJ)\r\n'
    + '2026-08-20,"1,234",,418.4\r\n'
    + '2026-08-20,"2,345",154.3,836.8\r\n';
  const result = parseHealthCsv(csv);
  assert.equal(result.days.length, 1);
  assert.equal(result.days[0].steps, 2345, '同日重复行按后值合并，而不是产出重复日期');
  assert.ok(Math.abs(result.days[0].weightKg - 70) < 0.1);
  assert.ok(Math.abs(result.days[0].activeEnergy - 200) < 1e-9);
});

test('异常健康值被隔离而不是写入', () => {
  assert.equal(isPlausibleHealthValue('steps', -1), false);
  assert.equal(isPlausibleHealthValue('weightKg', 900), false);
  const { days, quality } = parseHealthJson({ date: '2026-08-20', steps: -10, weight: 70 });
  assert.equal(days[0].steps, undefined);
  assert.equal(days[0].weightKg, 70);
  assert.equal(quality.invalidRecords, 1);
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

test('历史能量修复逐字段处理，且不会碰当天未同步完的静息能量', async () => {
  const { repairMisscaledEnergy } = await import('../js/core/health.js');
  const fixed = repairMisscaledEnergy([
    { date: '2026-08-01', steps: 8000, restingEnergy: 1.48, activeEnergy: 550, hkKcal: 1900 },
    { date: '2026-08-20', steps: 100, restingEnergy: 40, activeEnergy: 5 },
  ], '2026-08-20');
  assert.equal(fixed.length, 1);
  assert.equal(fixed[0].restingEnergy, 1480);
  assert.equal(fixed[0].activeEnergy, 550);
  assert.equal(fixed[0].hkKcal, 1900);
});

test('基线先排序并截断当前日，不能偷看未来体重', () => {
  const health = [
    { date: '2026-09-01', weightKg: 90, activeEnergy: 900 },
    { date: '2026-08-08', weightKg: 69.8, activeEnergy: 400 },
    { date: '2026-08-01', weightKg: 70.1, activeEnergy: 300 },
    { date: '2026-08-05', weightKg: 70.0, activeEnergy: 350 },
    { date: '2026-08-09', weightKg: 69.7, activeEnergy: 450 },
  ];
  const b = computeBaseline(health, [], '2026-08-10', 14);
  assert.equal(b.latestWeight, 69.7);
  assert.ok(b.activeEnergy < 500);
  assert.ok(b.weightTrend < 0);
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
  // export.xml 不携带「健康」App 中用户配置的来源顺序；这里显式复现该用户的 iPhone 优先设置。
  const agg = createAggregator({ sourcePriority: ['iPhone', 'Apple Watch'] });
  feedXmlChunk([
    recFrom('iPhone', 'HKQuantityTypeIdentifierStepCount', 5000, '2026-08-22 09:00:00 +0800', '2026-08-22 09:30:00 +0800', 'count'),
    recFrom('iPhone', 'HKQuantityTypeIdentifierStepCount', 3419, '2026-08-22 15:00:00 +0800', '2026-08-22 15:30:00 +0800', 'count'),
    recFrom('Apple Watch', 'HKQuantityTypeIdentifierStepCount', 4600, '2026-08-22 09:00:00 +0800', '2026-08-22 09:30:00 +0800', 'count'),
    recFrom('Apple Watch', 'HKQuantityTypeIdentifierStepCount', 3280, '2026-08-22 15:00:00 +0800', '2026-08-22 15:30:00 +0800', 'count'),
  ].join('\n'), agg);
  const { days } = agg.result();
  assert.equal(days[0].steps, 8419, '应按显式来源顺序选择 iPhone，而不是相加成 16299');
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


/* ---------------------------------------------------- 样本量必须是真的 */

test('摄入均值的分母是「记了饮食的天数」，不是日历天数', () => {
  // 用户实测：14 天健康数据 + 只记了 1 天饮食，
  // 原先报出「近 14 天平均低于目标 3168 kcal/天，每周 2.88 kg 脂肪赤字」——
  // 那 13 天不是饿着，只是没记，这个结论是凭空造的。
  const healthDays = [];
  for (let i = 1; i <= 14; i += 1) {
    const d = new Date(Date.UTC(2026, 7, 23) - i * 86400000).toISOString().slice(0, 10);
    healthDays.push({ date: d, steps: 5000, activeEnergy: 300, restingEnergy: 1600 });
  }
  healthDays.sort((a, b) => (a.date < b.date ? -1 : 1));
  const dietDays = [{ date: '2026-08-22', kcal: 1287, protein: 75 }];

  const b = computeBaseline(healthDays, dietDays, '2026-08-23');
  assert.equal(b.healthDaysCounted, 14);
  assert.equal(b.loggedDays, 1, '只有 1 天有饮食记录');
  assert.equal(b.kcalIntake, 1287, '均值本身没错，错的是曾经把它当成 14 天的均值');
  assert.equal(b.windowDays, 14);
});

test('记满之后分母跟着变大', () => {
  const healthDays = [];
  const dietDays = [];
  for (let i = 1; i <= 6; i += 1) {
    const d = new Date(Date.UTC(2026, 7, 23) - i * 86400000).toISOString().slice(0, 10);
    healthDays.push({ date: d, steps: 5000, activeEnergy: 300 });
    dietDays.push({ date: d, kcal: 2000, protein: 120 });
  }
  healthDays.sort((a, b) => (a.date < b.date ? -1 : 1));
  dietDays.sort((a, b) => (a.date < b.date ? -1 : 1));
  const b = computeBaseline(healthDays, dietDays, '2026-08-23');
  assert.equal(b.loggedDays, 6);
  assert.equal(b.kcalIntake, 2000);
});

test('焦耳单位不区分大小写（只有 cal / Cal 那一对需要区分）', () => {
  assert.ok(Math.abs(normalizeValue('energy', 4184, 'J') - 1) < 1e-9);
  assert.ok(Math.abs(normalizeValue('energy', 4184, 'j') - 1) < 1e-9);
  assert.ok(Math.abs(normalizeValue('energy', 41.84, 'kJ') - 10) < 1e-9);
  assert.ok(Math.abs(normalizeValue('energy', 41.84, 'kj') - 10) < 1e-9);
  assert.equal(normalizeValue('energy', 530, 'Cal'), 530, 'Cal 仍必须是千卡');
  assert.equal(normalizeValue('energy', 5300, 'cal'), 5.3, '小写 cal 仍是小卡');
});

test('单位换算用的是精确换算因子', () => {
  assert.ok(Math.abs(normalizeValue('mass', 1, 'lb') - 0.45359237) < 1e-12);
  assert.ok(Math.abs(normalizeValue('length', 1, 'in') - 2.54) < 1e-12);
  assert.ok(Math.abs(normalizeValue('length', 1, 'ft') - 30.48) < 1e-12);
  assert.ok(Math.abs(normalizeValue('distance', 1, 'mi') - 1.609344) < 1e-12);
  assert.ok(Math.abs(normalizeValue('volume', 1, 'l') - 1000) < 1e-12);
});
