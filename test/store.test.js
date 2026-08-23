import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateStoredProfile, resolveEnergyObservation } from '../js/lib/store.js';

test('v1.2 升级会迁移旧版冲突目标，不让应用在启动时崩溃', () => {
  assert.equal(migrateStoredProfile({ goal: 'cut', rateKgPerWeek: 0.4 }).rateKgPerWeek, -0.4);
  assert.equal(migrateStoredProfile({ goal: 'bulk', rateKgPerWeek: -0.25 }).rateKgPerWeek, 0.25);
  assert.equal(migrateStoredProfile({ goal: 'maintain', rateKgPerWeek: -0.2 }).rateKgPerWeek, 0);
  assert.equal(migrateStoredProfile({ birthday: '1990-01-01', ageEstimated: true }).ageEstimated, false);
});

test('同一份健康快照随时钟前进仍使用原覆盖比例', () => {
  const local = (hour, minute = 0) => new Date(2026, 7, 23, hour, minute);
  const health = { energyObservedAt: local(12).toISOString() };
  const atNoon = resolveEnergyObservation(health, null, '2026-08-23', local(12, 5));
  const atNight = resolveEnergyObservation(health, null, '2026-08-23', local(22));
  assert.equal(atNoon.dayFraction, 0.5);
  assert.equal(atNight.dayFraction, 0.5);
  assert.equal(atNight.stale, true);
  assert.equal(atNight.ageMinutes, 600);
});

test('旧数据可用导入时刻作覆盖时间，完全缺时间则明确回退', () => {
  const local = (hour) => new Date(2026, 7, 23, hour);
  const fromImport = resolveEnergyObservation({}, {
    at: local(15).toISOString(), days: 1, range: ['2026-08-23', '2026-08-23'],
  }, '2026-08-23', local(16));
  assert.equal(fromImport.dayFraction, 0.625);
  assert.equal(fromImport.missingObservationTime, false);

  const missing = resolveEnergyObservation({}, null, '2026-08-23', local(16));
  assert.equal(missing.observedAt, null);
  assert.equal(missing.missingObservationTime, true);
});
