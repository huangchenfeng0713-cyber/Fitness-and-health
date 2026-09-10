import test from 'node:test';
import assert from 'node:assert/strict';
import { energyObservation, completeEnergyDay } from '../js/core/energy-observation.js';
import { todayKey } from '../js/core/day.js';
import { dailyTargets, validateProfile, ageFrom, bmi, bmiCategory, proteinTarget, leanBodyMass, sumNutrients } from '../js/core/nutrition.js';
import { computeBaseline, normalizeValue, parseHealthJson, parseHealthCsv, createAggregator, feedXmlChunk, repairMisscaledEnergy, clearImplausibleValues } from '../js/core/health.js';
import { nutrientsFor, validateFood } from '../js/data/foods.js';
import { weeklySummary } from '../js/core/weekly-summary.js';
import { weightTrendStats } from '../js/core/health-insights.js';
import { trendReading } from '../js/core/trend-reading.js';
import { state, recompute, planForProfile } from '../js/lib/store.js';
import { mergeApplePartialRows, stampManualPatch } from '../js/core/health-merge.js';
import { validateNutritionRow } from '../js/lib/db.js';
import { mergeSameEntries } from '../js/core/diet-log.js';
import { num } from '../js/lib/utils.js';

test('unknown display, independent nutrient sample counts, and current invalid profiles remain unknown', () => {
  for (const value of [null, undefined, '', ' ', false, [], Infinity]) assert.equal(num(value), '—');
  assert.equal(num(0), '0');
  const baseline = computeBaseline([], [
    {date:'2026-09-06', kcal:null, protein:20},
    {date:'2026-09-05', kcal:0, protein:-1},
    {date:'2026-09-04', kcal:200, protein:10, coverage:{kcal:{complete:false}}},
  ], '2026-09-07');
  assert.equal(baseline.kcalIntake, 0);
  assert.equal(baseline.loggedDays, 1);
  assert.equal(baseline.proteinIntake, 15);
  assert.equal(baseline.proteinLoggedDays, 2);
  const saved = dailyTargets(profile, null, now);
  const broken = {...profile, birthday:'2026-02-30', targetVersions:[{id:'old',effectiveDate:'2026-09-01',targets:saved}]};
  assert.equal(planForProfile(broken, '2026-09-07', now).status, 'unavailable');
  assert.equal(planForProfile(broken, '2026-09-06', now).versionId, 'old');
});

const now = new Date('2026-09-07T12:00:00+08:00');
const profile = { sex: 'male', age: 30, heightCm: 175, weightKg: 70, activity: 'light', goal: 'maintain', useAppleEnergy: true, onboarded: true };
const today = { date: '2026-09-07', restingEnergy: 900, activeEnergy: 200, energyObservedAt: now.toISOString() };

test('date-only JSON and CSV do not invent field cutoff times', () => {
  for (const row of [parseHealthJson({date:'2026-09-07',activeEnergy:0,restingEnergy:800}).days[0],
    parseHealthCsv('date,activeEnergy,restingEnergy\n2026-09-07,0,800').days[0]]) {
    assert.equal(row.activeEnergy, 0);
    assert.equal(energyObservation(row,row.date,now).status, 'missing-time');
  }
});

test('numeric contracts reject booleans and invalid quantities without hiding originals', () => {
  assert.equal(energyObservation({...today,activeEnergy:false},today.date,now).status,'suspect');
  assert.equal(validateFood({n:[100,false,0,0,0,0,0]}).valid,false);
  assert.equal(validateFood({n:{bad:100}}).valid,false);
  const original={id:'bad-grams',name:'record',grams:-5,kcal:100};
  const merged=mergeSameEntries([original])[0];
  assert.equal(merged.grams,null);
  assert.equal(merged.issues.some(i=>i.field==='grams'),true);
  assert.equal(original.grams,-5);
});
/*
 * 自然日的两端按**本机时区**算，别写死 +08:00。
 *
 * computeBaseline 拿 `new Date(`${today}T00:00:00`)` 当 now，那是本地零点；
 * 而 completeEnergyDay 要求 `end <= now`。写死 +08:00 的话，在比它更东的时区
 * （实测 Australia/Sydney）昨天的「+08:00 那天的末尾」落在本地今天零点之后，
 * 昨天那一行就被判成还没结束 —— 配对日少一天。CI 跑 UTC，所以这条一直没露头。
 */
export function fullDay(date, restingEnergy = 1500, activeEnergy = 200) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { date, restingEnergy, activeEnergy, energyObservedAt: end.toISOString(),
    energyCoverage: { status: 'complete', start: start.toISOString(), end: end.toISOString() } };
}

test('F01: missing, zero, future, suspect and per-field misalignment share a single verdict', () => {
  assert.equal(energyObservation({ ...today, activeEnergy: 0 }, today.date, now).burnedNow, 900);
  for (const patch of [{ activeEnergy: null }, { restingEnergy: null }, { activeEnergy: 15000 },
    { energyObservedAt: '2026-09-07T18:00:00+08:00' }, { energyObservedAt: '2026-09-07T08:00:00+08:00' },
    { _cloudHealthSync: { fieldCursors: { restingEnergy: now.toISOString(), activeEnergy: '2026-09-07T11:00:00+08:00' } } }]) {
    const raw = { ...today, ...patch }, before = structuredClone(raw);
    assert.equal(energyObservation(raw, today.date, now).burnedNow, null);
    assert.deepEqual(raw, before);
  }
});

test('F01/F03: ring and advice use same value, formula plan does not mean no sync', () => {
  const saved = { ...state };
  try {
    for (const activeEnergy of [0, null, 15000, 200]) {
      const row = { ...today, activeEnergy };
      Object.assign(state, { profile, day: today.date, healthDays: [row], healthByDate: new Map([[row.date, row]]), dietEntries: [], dietDaily: [] });
      const d = recompute(now);
      assert.equal(d.liveEnergy.burnedNow, d.advice.trend.burnedNow);
      assert.equal(d.targets.tdeeSource, 'formula');
      if (activeEnergy === 200) assert.ok(!d.advice.insights.some(i => /没有同步/.test(i.title)));
    }
  } finally { Object.assign(state, saved); }
});

/*
 * 截止时间要在**任何时区**下都落在这一天里面。
 *
 * 原先写的是 `2026-09-06T08:00:00+08:00`，而测试不钉时区：在 UTC 下它正好等于
 * 当天零点，也就是「日界」而不是「早上八点」—— 这条用例想说的「同步停在早上」
 * 在 CI 上根本没被表达出来。08:00Z 在 UTC 和 +08:00 下都在日内，也都在末尾一小时之外。
 */
test('F02: partial and unknown historical records are excluded; three complete paired days enable baseline', () => {
  const partial = { date: '2026-09-06', restingEnergy: 600, activeEnergy: 100, energyObservedAt: '2026-09-06T08:00:00Z' };
  assert.equal(completeEnergyDay(partial, now), null);
  assert.equal(computeBaseline([fullDay('2026-09-05'), partial], [], today.date).restingEnergy, null);
  const rows = ['04','05','06'].map(d => fullDay(`2026-09-${d}`));
  const b = computeBaseline([...rows, { ...partial, date: '2026-09-03' }], [], today.date);
  assert.equal(b.energyPairedDays, 3); assert.equal(b.restingEnergy, 1500); assert.equal(b.activeEnergy, 200);
});

/*
 * 3.15.0 之前存下的消耗记录不许因为「没有 coverage 字段」被整批作废。
 *
 * 那次改动把「历史日可用」的判据收成了显式的 `coverage.status === 'complete'`，
 * 而老行根本没有这个字段（当年还不存在）。结果是用户之前所有的每日消耗一次性消失：
 * 当日收支、趋势图、近 7 日、14 天基线全空 —— 数字却一条不少地躺在 IndexedDB 里。
 * 判据当时连「最后样本正好结束于次日零点」和「只同步到早上八点」都分不出，
 * 两者同样是 unknown-coverage，说明它拦的不是残缺，是「没有元数据」。
 *
 * 现在按老行自带的 energyObservedAt（旧聚合器里就是「当天最后一个样本结束于几点」）反推。
 */
test('F02: 3.15.0 之前的老记录按自带的截止时间反推覆盖范围，不因为缺字段整批作废', () => {
  const legacy = (patch) => ({ date: '2026-09-05', restingEnergy: 1650, activeEnergy: 520, ...patch });
  const dayEnd = new Date('2026-09-05T00:00:00'); dayEnd.setDate(dayEnd.getDate() + 1);
  const at = (ms) => new Date(dayEnd.getTime() + ms).toISOString();
  const usable = [
    ['样本正好结束于次日零点', legacy({ energyObservedAt: at(0) })],
    ['样本停在 23:58，仍算走完了这一天', legacy({ energyObservedAt: at(-2 * 60000) })],
    ['来源只给了日期、没给钟点', legacy({ energyObservedAt: new Date('2026-09-05T00:00:00').toISOString() })],
    ['连截止时间都没有', legacy({})],
  ];
  for (const [label, row] of usable) {
    const o = energyObservation(row, row.date, now);
    assert.equal(o.status, 'valid', label);
    assert.equal(o.burnedNow, 2170, label);
  }
  // 反推不是无条件信任：真的停在半路、或者时间戳压根不属于这一天，照旧排除
  const dropped = [
    ['同步停在这一天的中途', legacy({ energyObservedAt: at(-10 * 3600000) }), 'partial'],
    // 往前挪：时间戳同样不属于这一天，但别挪到 now 之后去，否则先命中 future 那一档
    ['时间戳不属于这一天', legacy({ energyObservedAt: at(-3 * 86400000) }), 'unknown-coverage'],
    ['数值本身不可信', legacy({ activeEnergy: 15000, energyObservedAt: at(0) }), 'suspect'],
  ];
  for (const [label, row, status] of dropped) {
    const o = energyObservation(row, row.date, now);
    assert.equal(o.status, status, label);
    assert.equal(o.burnedNow, null, label);
  }
  // 今天那一行按定义就还没走完，不许被反推成「完整日」——它照旧走过期 / 缺截止时间那几档。
  // 日期从 now 自己算，别借文件顶上那个 today 固定值：它写死 2026-09-07，
  // 在 +08:00 以西够远的时区里那一天还没到，整条断言会变成在量 future。
  const liveDate = todayKey(now);
  const live = energyObservation({ ...today, date: liveDate }, liveDate, now);
  assert.equal(live.dateMode, 'today');
  assert.equal(live.complete, false);
  // 整条链路：老记录要能重新撑起 14 天基线
  const b = computeBaseline(['02','03','04'].map(d => legacy({ date: `2026-09-${d}`, energyObservedAt:
    new Date(new Date(`2026-09-${d}T00:00:00`).getTime() + 86400000).toISOString() })), [], today.date);
  assert.equal(b.energyPairedDays, 3);
  assert.equal(b.restingEnergy, 1650);
  assert.equal(b.activeEnergy, 520);
});

test('F02: explicit natural-day windows support 23 and 25 hours without changing raw totals', () => {
  for (const [date, start, end, hours] of [
    ['2026-03-08','2026-03-08T00:00:00-05:00','2026-03-09T00:00:00-04:00',23],
    ['2026-11-01','2026-11-01T00:00:00-04:00','2026-11-02T00:00:00-05:00',25]]) {
    const row = { date, restingEnergy: hours * 60, activeEnergy: 0, energyObservedAt: end, energyCoverage: { status: 'complete', start, end } };
    assert.equal(completeEnergyDay(row, new Date('2026-12-01')).burnedNow, hours * 60);
  }
});

test('F06: illegal, missing and out-of-range birthdays never become 30', () => {
  for (const birthday of ['2030-01-01','2026-09-01','1900-01-01','2026-02-30','bad']) {
    const p = { ...profile, birthday };
    assert.notEqual(ageFrom(p, now), 30); assert.equal(validateProfile(p, now).valid, false);
    assert.equal(dailyTargets(p, null, now).status, 'unavailable');
  }
  assert.equal(ageFrom({}), null);
  assert.equal(dailyTargets({ ...profile, age: null }, null, now).kcal, null);
});

test('F06: invalid sex does not crash the store or invent targets', () => {
  const saved = { ...state };
  try {
    Object.assign(state, { profile: { ...profile, sex: 'bad' }, day: today.date, healthDays: [], healthByDate: new Map(), dietEntries: [], dietDaily: [] });
    const d = recompute(now);
    assert.equal(d.targets.kcal, null); assert.deepEqual(d.advice.recommend, []); assert.ok(d.profileError);
  } finally { Object.assign(state, saved); }
});

test('F06: raw BMI classifies before rounding; low BMI cut and outside-age plans are unavailable', () => {
  const raw = bmi(73.45, 175); assert.equal(raw.toFixed(1), '24.0'); assert.equal(bmiCategory(raw).key, 'normal');
  assert.equal(dailyTargets({ ...profile, weightKg: 50, goal: 'cut' }).status, 'unavailable');
  assert.equal(dailyTargets({ ...profile, age: 80 }).status, 'unavailable');
});

test('F07: body-fat boundaries and BMI30 do not silently switch protein denominator', () => {
  for (const bodyFatPct of [null, 2, 69.9, 70]) assert.equal(proteinTarget({ ...profile, bodyFatPct }).grams, 98);
  assert.equal(leanBodyMass(70, 0), null); assert.equal(leanBodyMass(70, 70), 21);
  const a = proteinTarget({ ...profile, weightKg: 91.9, goal: 'bulk' });
  const b = proteinTarget({ ...profile, weightKg: 92.1, goal: 'bulk' });
  assert.ok(Math.abs(b.grams - a.grams) <= 1); assert.match(b.basis, /体重/);
});

test('F08: full preview solver and budget agree; direction conflicts return no rate', () => {
  const p = { ...profile, goal: 'bulk', rateKgPerWeek: 0.7, targetVersions: [] };
  const preview = planForProfile(p, today.date, now);
  assert.equal(preview.dailyDelta, 500); assert.equal(preview.rateKgPerWeek, 0.45);
  assert.equal(preview.kcal, dailyTargets(p, null, now).kcal);
  assert.notEqual(preview.kcal, planForProfile({ ...p, weightKg: 80 }, today.date, now).kcal);
  const cut = dailyTargets({ ...profile, sex: 'female', weightKg: 35, heightCm: 130, age: 100, goal: 'cut', rateKgPerWeek: -0.4 });
  assert.equal(cut.kcal, null); assert.equal(cut.rateKgPerWeek, null);
});

test('F09: custom milk/fruit categories cannot guess free sugar; explicit zero survives', () => {
  const milk = { custom: true, cat: 'dairy', basis: '100ml', carbBasis: 'available', n: [64,3.2,3.6,4.8,null,4.8,null] };
  const n = nutrientsFor(milk, 250); assert.equal(n.totalSugar, 12); assert.equal(n.sugar, null); assert.equal(n.fiber, null);
  assert.equal(nutrientsFor({ ...milk, freeSugar: 0 }, 250).sugar, 0);
  assert.equal(nutrientsFor({ ...milk, cat: 'fruit' }, 250).sugar, null);
});

test('F10: available and total carbs normalize consistently while label energy remains unchanged', () => {
  const food = { custom: true, carbBasis: 'available', n: [99,2,3,4,10,1,0] };
  assert.equal(validateFood(food).valid, true); assert.equal(nutrientsFor(food,100).carb,4); assert.equal(nutrientsFor(food,100).kcal,99);
  assert.equal(validateFood({ ...food, carbBasis: 'total' }).valid, false);
  assert.equal(nutrientsFor({ ...food, carbBasis: 'unknown' },100).carb,null);
});

test('F09/F10: aggregation retains known subtotal, unknown coverage and locatable invalid entries', () => {
  const entries = [{ id:1,kcal:100,fiber:0 },{ id:2,kcal:-500,fiber:null },{ id:3,kcal:Infinity }];
  const sum = sumNutrients(entries); assert.equal(sum.kcal,100); assert.equal(sum.coverage.kcal.complete,false);
  assert.equal(sum.coverage.fiber.known,1); assert.deepEqual(sum.issues.map(i=>i.id),[2,3]);
  assert.throws(()=>validateNutritionRow('diet',entries[1]),/2.*kcal/);
  assert.equal(mergeSameEntries(entries)[0].kcal,100);
});

test('F11: null activity is not zero and summary reports actual paired-day count', () => {
  const rows = ['04','05','06'].map(d => fullDay(`2026-09-${d}`));
  const dietDaily = rows.map(r=>({date:r.date,kcal:1800,protein:100}));
  const result = weeklySummary({ endDate:'2026-09-06',healthDays:rows,dietDaily });
  assert.equal(result.pairedDays,3); assert.match(result.rows.find(r=>r.key==='balance').label,/3\/7/);
  assert.equal(weeklySummary({ endDate:'2026-09-06',healthDays:rows.map(r=>({...r,activeEnergy:null,steps:null})),dietDaily }).pairedDays,0);
});

test('F12: inclusive end date excludes today, 7-day points do not manufacture weekly trend', () => {
  const rows = Array.from({length:30},(_,i)=>({date:`2026-08-${String(i+1).padStart(2,'0')}`,weightKg:70}));
  assert.equal(weightTrendStats([...rows,{date:'2026-08-31',weightKg:75}],30,'2026-08-30').kgPerWeek,0);
  assert.equal(weightTrendStats(rows,7,'2026-08-30').kgPerWeek,null);
});

test('F12: dated plan versions never replace earlier comparisons', () => {
  const base = dailyTargets(profile);
  const p = { ...profile, targetVersions:[{ id:'v1',savedAt:'2026-09-07T00:00:00Z',effectiveDate:'2026-09-07',targets:{...base,kcal:2345} }] };
  assert.equal(planForProfile(p,'2026-09-07',now).versionId,'v1');
  assert.equal(planForProfile(p,'2026-09-06',now).context,'按当前设置对照');
});

test('F13: sparse exercise reports actual total, and 55bpm has a neutral branch with symptom advice', () => {
  const points = [1,2,3].map(i=>({x:`2026-09-0${i}`,y:20}));
  assert.match(trendReading('exercise',points),/共 60 分钟/); assert.doesNotMatch(trendReading('exercise',points),/一周约|还差|已达/);
  const hr=trendReading('restingHR',points.map(p=>({...p,y:55})));
  assert.doesNotMatch(hr,/处在成人常见/); assert.match(hr,/晕厥|胸痛/);
  assert.doesNotMatch(trendReading('balance',points),/7700|每周.*kg/);
});

test('F14: low values alone are never repaired; evidence permits a validated reversible correction', () => {
  assert.deepEqual(repairMisscaledEnergy([{date:'2026-09-01',restingEnergy:20,activeEnergy:10,steps:1500}],today.date),[]);
  const raw = {date:'2026-09-01',restingEnergy:1.5,_fieldProvenance:{restingEnergy:{parserVersion:'cal-div1000-v1',originalUnit:'Cal',originalValue:1500}}};
  const fixed = repairMisscaledEnergy([raw],today.date)[0]; assert.equal(fixed.restingEnergy,1500); assert.equal(fixed._energyRepair.original.restingEnergy,1.5);
  assert.deepEqual(repairMisscaledEnergy([fixed],today.date),[]);
  const excluded=clearImplausibleValues([{date:'2026-09-01',activeEnergy:9000}])[0]; assert.equal(excluded.activeEnergy,9000);
});

test('F17: overlapping, disjoint-within-five-minutes, midnight and workout-only XML fixtures', () => {
  const sample=(source,value,start,end)=>`<Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="${source}" unit="Cal" value="${value}" startDate="${start}" endDate="${end}"/>`;
  const a=createAggregator(); feedXmlChunk(sample('Apple Watch',10,'2026-09-06 12:00:00 +0800','2026-09-06 12:02:00 +0800')
    +sample('iPhone',8,'2026-09-06 12:00:00 +0800','2026-09-06 12:02:00 +0800')
    +sample('iPhone',12,'2026-09-06 12:02:00 +0800','2026-09-06 12:04:00 +0800'),a);
  assert.equal(a.result().days[0].activeEnergy,22);
  const b=createAggregator(); feedXmlChunk(sample('Apple Watch',20,'2026-09-05 23:50:00 +0800','2026-09-06 00:10:00 +0800'),b);
  assert.deepEqual(b.result().days.map(d=>d.activeEnergy),[10,10]);
  const c=createAggregator(); feedXmlChunk('<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" totalEnergyBurned="200" totalEnergyBurnedUnit="Cal" startDate="2026-09-06 12:00:00 +0800" endDate="2026-09-06 12:30:00 +0800"/>',c);
  assert.ok(c.result().days.every(d=>d.activeEnergy==null));
});

test('F18: unknown units are rejected; percent and ratio depend on source contract', () => {
  assert.equal(normalizeValue('energy',10,'banana'),null); assert.equal(normalizeValue('mass',50,'stonez'),null);
  assert.equal(normalizeValue('energy',1,'cal'),0.001); assert.equal(normalizeValue('energy',1,'Cal'),1);
  assert.equal(normalizeValue('percent',0.5,'%'),0.5); assert.equal(normalizeValue('percent',0.5,'%',{percentFormat:'ratio'}),50);
  assert.equal(parseHealthJson({date:'2026-09-06',bodyFatPct:18.1}).days[0]?.bodyFatPct,18.1);
});

test('ActivitySummary replacement cannot inherit the replaced interval cutoff', () => {
  const a=createAggregator();
  feedXmlChunk('<HealthData><ExportDate value="2026-09-07 12:00:00 +0800"/>'
    + '<Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Watch" unit="Cal" value="20" startDate="2026-09-07 08:00:00 +0800" endDate="2026-09-07 09:00:00 +0800"/>'
    + '<ActivitySummary dateComponents="2026-09-07" activeEnergyBurned="200" activeEnergyBurnedUnit="kcal"/></HealthData>',a);
  const row=a.result().days[0];
  assert.equal(row.activeEnergy,200);
  assert.equal(row._fieldProvenance.activeEnergy.observedAt,'2026-09-07T04:00:00.000Z');
  assert.equal(row._fieldProvenance.activeEnergy.source,'Apple ActivitySummary');
  assert.equal(row._fieldProvenance.activeEnergy.coverage.status,'unknown');
});

test('field provenance survives partial merge without giving an old field a new cursor', () => {
  const rows=mergeApplePartialRows([], [today]);
  const newer=mergeApplePartialRows(rows,[{date:today.date,activeEnergy:300,energyObservedAt:'2026-09-07T12:30:00+08:00'}]);
  assert.equal(energyObservation(newer[0],today.date,new Date('2026-09-07T12:30:00+08:00')).status,'unaligned');
  const manual=stampManualPatch(newer[0],{activeEnergy:20});
  assert.equal(energyObservation(manual,today.date,now).valid,false);
});
