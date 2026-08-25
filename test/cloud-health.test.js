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
  active_energy: '103.21',
  resting_energy: '791.67',
  exercise_minutes: 3,
  stand_minutes: 36,
  distance_km: '1.113',
  sleep_minutes: 352,
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
  assert.equal(day.energyObservedAt, '2026-08-25T06:09:00.000Z');
  assert.equal(day.weightMeasuredAt, undefined, '测量时间只参与服务端新旧判断，不应污染本地健康字段');
  assert.deepEqual(day._cloudHealthSync, {
    schemaVersion: 1,
    capturedAt: '2026-08-25T06:10:00.000Z',
    updatedAt: '2026-08-25T06:10:04.000Z',
    deviceId: 'device-1',
    source: 'apple_shortcuts',
  });
});

test('无效日期和全部越界的账号行不会进入本地数据库', () => {
  assert.equal(cloudHealthRowToDay({ ...remoteRow, date: '2026-02-31' }), null);
  assert.equal(cloudHealthRowToDay({
    date: '2026-08-25', captured_at: remoteRow.captured_at,
    steps: 9999999, weight_kg: -1,
  }), null);
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

test('账号健康日期范围忽略坏日期并按日期排序', () => {
  assert.deepEqual(cloudHealthRange([
    { date: '2026-08-25' }, { date: 'bad' }, { date: '2026-08-02' },
  ]), ['2026-08-02', '2026-08-25']);
  assert.equal(cloudHealthRange([]), null);
});
