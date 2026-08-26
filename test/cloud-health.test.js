import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cloudHealthRowToDay, newerCloudHealthDays, cloudHealthRange,
} from '../js/core/cloud-health.js';

const remoteRow = {
  date: '2026-08-25',
  captured_at: '2026-08-25T06:10:00.000Z',
  cumulative_captured_at: '2026-08-25T06:09:00.000Z',
  updated_at: '2026-08-25T06:10:04.000Z',
  timezone: 'Asia/Shanghai',
  source: 'apple_shortcuts',
  device_id: 'device-1',
  steps: '1594',
  steps_captured_at: '2026-08-25T06:09:00.000Z',
  active_energy: '103.21',
  active_energy_captured_at: '2026-08-25T06:08:00.000Z',
  resting_energy: '791.67',
  resting_energy_captured_at: '2026-08-25T06:07:00.000Z',
  exercise_minutes: 3,
  exercise_minutes_captured_at: '2026-08-25T06:09:00.000Z',
  stand_minutes: 36,
  stand_minutes_captured_at: '2026-08-25T06:09:00.000Z',
  distance_km: '1.113',
  distance_km_captured_at: '2026-08-25T06:09:00.000Z',
  sleep_minutes: 352,
  sleep_minutes_captured_at: '2026-08-25T06:00:00.000Z',
  weight_kg: 59,
  resting_hr: 70,
  weight_measured_at: '2026-08-25T01:00:00.000Z',
};

test('账号每日健康行映射到现有本地字段并保留同步版本', () => {
  const day = cloudHealthRowToDay(remoteRow);
  assert.equal(day.date, '2026-08-25');
  assert.equal(day.steps, 1594);
  assert.equal(day.activeEnergy, 103.21);
  assert.equal(day.restingEnergy, 791.67);
  assert.equal(day.distanceKm, 1.113);
  assert.equal(day.sleepMinutes, 352);
  assert.equal(day.weightKg, 59);
  assert.equal(day.restingHR, 70);
  assert.equal(day.energyObservedAt, '2026-08-25T06:07:00.000Z');
  assert.equal(day.weightMeasuredAt, undefined, '测量时间只参与服务端新旧判断，不应污染本地健康字段');
  assert.deepEqual(day._cloudHealthSync, {
    schemaVersion: 2,
    capturedAt: '2026-08-25T06:10:00.000Z',
    updatedAt: '2026-08-25T06:10:04.000Z',
    deviceId: 'device-1',
    source: 'apple_shortcuts',
    fieldCursors: {
      steps: '2026-08-25T06:09:00.000Z',
      activeEnergy: '2026-08-25T06:08:00.000Z',
      restingEnergy: '2026-08-25T06:07:00.000Z',
      exerciseMinutes: '2026-08-25T06:09:00.000Z',
      standMinutes: '2026-08-25T06:09:00.000Z',
      distanceKm: '2026-08-25T06:09:00.000Z',
      sleepMinutes: '2026-08-25T06:00:00.000Z',
      weightKg: '2026-08-25T01:00:00.000Z',
      restingHR: '2026-08-25T06:10:00.000Z',
    },
    fieldValues: {
      steps: 1594,
      activeEnergy: 103.21,
      restingEnergy: 791.67,
      exerciseMinutes: 3,
      standMinutes: 36,
      distanceKm: 1.113,
      sleepMinutes: 352,
      weightKg: 59,
      restingHR: 70,
    },
  });
});

test('无效日期和全部越界的账号行不会进入本地数据库', () => {
  assert.equal(cloudHealthRowToDay({ ...remoteRow, date: '2026-02-31' }), null);
  assert.equal(cloudHealthRowToDay({
    date: '2026-08-25', captured_at: remoteRow.captured_at,
    steps: 9999999, weight_kg: -1,
  }), null);
});

test('数据库迁移前的旧行仍可读取，并明确保留为 legacy 游标语义', () => {
  const legacy = { ...remoteRow };
  for (const key of Object.keys(legacy)) {
    if (key.endsWith('_captured_at') && key !== 'cumulative_captured_at') delete legacy[key];
  }
  const day = cloudHealthRowToDay(legacy);
  assert.equal(day.steps, 1594);
  assert.equal(day._cloudHealthSync.schemaVersion, 1);
  assert.equal(day._cloudHealthSync.fieldCursors.steps, remoteRow.cumulative_captured_at);
  assert.equal(day._cloudHealthSync.fieldCursors.activeEnergy, remoteRow.cumulative_captured_at);
});

test('只合并比本地云版本更新的每日行', () => {
  const local = [{
    date: remoteRow.date,
    steps: 1000,
    _cloudHealthSync: { updatedAt: '2026-08-25T06:10:04.000Z' },
  }];
  assert.equal(newerCloudHealthDays([remoteRow], local).length, 0);
  const newer = { ...remoteRow, updated_at: '2026-08-25T06:15:00.000Z', steps: 2000 };
  assert.equal(newerCloudHealthDays([newer], local)[0].steps, 2000);
  assert.equal(newerCloudHealthDays([remoteRow], []).length, 1);
});

test('部分累计上传只下发真正变动的字段，不重放同一行里保留的旧值', () => {
  const first = cloudHealthRowToDay(remoteRow);
  const localAfterOfficialImport = {
    ...first,
    steps: 1700,
    activeEnergy: 120,
    restingEnergy: 810,
    weightKg: 60,
  };
  const stepsOnly = {
    ...remoteRow,
    updated_at: '2026-08-25T06:20:04.000Z',
    captured_at: '2026-08-25T06:20:00.000Z',
    cumulative_captured_at: '2026-08-25T06:20:00.000Z',
    steps: 2000,
    steps_captured_at: '2026-08-25T06:20:00.000Z',
  };

  const patch = newerCloudHealthDays([stepsOnly], [localAfterOfficialImport])[0];
  assert.equal(patch.steps, 2000);
  assert.equal(patch.activeEnergy, undefined);
  assert.equal(patch.restingEnergy, undefined);
  assert.equal(patch.weightKg, undefined);
  assert.equal(patch.energyObservedAt, undefined);
  assert.equal(patch._cloudHealthSync.fieldValues.activeEnergy, 103.21);

  const energyLater = {
    ...stepsOnly,
    updated_at: '2026-08-25T06:25:04.000Z',
    active_energy: 130,
    active_energy_captured_at: '2026-08-25T06:25:00.000Z',
  };
  const energyPatch = newerCloudHealthDays([energyLater], [{
    ...localAfterOfficialImport,
    ...patch,
  }])[0];
  assert.equal(energyPatch.activeEnergy, 130);
  assert.equal(energyPatch.restingEnergy, undefined);
  assert.equal(energyPatch.energyObservedAt, '2026-08-25T06:07:00.000Z');
});

test('账号健康日期范围忽略坏日期并按日期排序', () => {
  assert.deepEqual(cloudHealthRange([
    { date: '2026-08-25' }, { date: 'bad' }, { date: '2026-08-02' },
  ]), ['2026-08-02', '2026-08-25']);
  assert.equal(cloudHealthRange([]), null);
});
