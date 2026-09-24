import test from 'node:test';
import assert from 'node:assert/strict';
import { energyObservation, completeEnergyDay } from '../js/core/energy-observation.js';
import { energyRing } from '../js/core/energy-ring.js';
import { sumNutrients, computeGaps } from '../js/core/nutrition.js';
import { dailyMetrics, nutrientScale, macroSplit } from '../js/core/metrics.js';

const row = { date: '2026-09-19', restingEnergy: 1400, activeEnergy: 350,
  energyObservedAt: new Date('2026-09-19T22:30:00').toISOString(), energyCoverage: { status: 'partial' } };
const now = new Date('2026-09-20T01:30:00');
const targets = { kcal: 2119, protein: 109, carb: 250, fat: 60, fiber: 25, sodium: 2000, sugar: 50 };

test('部分日保留已知消耗，仍不参与完整日校准；圈心明确显示计划差额', () => {
  const observation = energyObservation(row, row.date, now);
  assert.equal(observation.knownBurnedNow, 1750);
  assert.equal(observation.burnedNow, null);
  assert.equal(completeEnergyDay(row, now), null);
  const ring = energyRing({ eaten: 2254, burned: observation.knownBurnedNow, target: 2119,
    balanceAvailable: observation.valid, historical: true });
  assert.equal(ring.center.label, '超出计划');
  assert.equal(ring.center.kcal, 135);
  assert.equal(ring.legend.find(l => l.track === 'burn').kcal, 1750);
  assert.equal(ring.legend.find(l => l.track === 'burn').label, '已知消耗');
  assert.ok(ring.segments.some(s => s.track === 'burn'));
});

test('单项消耗缺失或异常不抹掉另一项；真实零与全未知有区别', () => {
  for (const activeEnergy of [null, -1, 9000]) {
    assert.equal(energyObservation({ ...row, activeEnergy }, row.date, now).knownBurnedNow, 1400);
  }
  assert.equal(energyObservation({ ...row, restingEnergy: 0, activeEnergy: 0 }, row.date, now).knownBurnedNow, 0);
  assert.equal(energyObservation({ date: row.date }, row.date, now).knownBurnedNow, null);
  assert.equal(energyObservation(row, row.date, new Date('2026-09-18T12:00:00')).knownBurnedNow, null);
});

test('补齐全天后恢复收支，摄入未知则不冒充零或生成计划差额', () => {
  const ring = energyRing({ eaten: 2254, burned: 2100, target: 2119, historical: true });
  assert.equal(ring.center.label, '当日收支');
  assert.equal(ring.center.kcal, 154);
  const partial = energyRing({ eaten: 500, burned: 1000, target: 2119, intakeComplete: false });
  assert.deepEqual(partial.center, { key: 'intake', label: '已知摄入', kcal: 500 });
  const unknown = energyRing({ eaten: 0, target: 2119, intakeComplete: false, intakeKnown: false });
  assert.equal(unknown.center.kcal, null);
  assert.equal(unknown.legend[0].kcal, null);
});

test('营养素部分记录按真实已知值画点，全未知不画零点，已知零仍保留', () => {
  const totals = sumNutrients([{ kcal: 200, protein: 10, fat: 5, carb: 20, fiber: 12, sodium: 2100, sugar: 0 },
    { kcal: 100, protein: null, fat: null, carb: 15, fiber: null, sodium: null, sugar: null }]);
  const gaps = computeGaps(targets, totals);
  const by = Object.fromEntries(dailyMetrics(targets, gaps).map(m => [m.key, m]));
  assert.equal(by.fiber.complete, false);
  assert.equal(nutrientScale(by.fiber).markerPct, 24);
  assert.equal(nutrientScale(by.fiber).level, 'plain');
  assert.equal(nutrientScale(by.sodium).level, 'over');
  assert.equal(nutrientScale(by.sugar).markerPct, 0);
  assert.equal(by.sugar.known, true);
  assert.equal(gaps.protein.remaining, null);
  const missing = computeGaps(targets, sumNutrients([{ kcal: 100, protein: 5, carb: 10, fat: 2 }]));
  const missingFiber = dailyMetrics(targets, missing).find(m => m.key === 'fiber');
  assert.equal(missingFiber.known, false);
  assert.equal(nutrientScale(missingFiber).markerPct, null);
});

test('碳水脂肪缺失时保留各自克数，不把不同覆盖范围算成全天比例', () => {
  const split = macroSplit(targets, { carb: { eaten: 180, known: true, complete: true },
    fat: { eaten: 20, known: true, complete: false } });
  assert.equal(split.carbG, 180);
  assert.equal(split.fatG, 20);
  assert.equal(split.carbPct, null);
  const missing = macroSplit(targets, { carb: { eaten: 180, known: true, complete: true },
    fat: { eaten: 0, known: false, complete: false } });
  assert.equal(missing.fatG, null);
});
