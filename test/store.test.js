import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compositionNote, migrateStoredProfile, resolveEnergyObservation, recompute, state,
} from '../js/lib/store.js';

test('普通食物没有自选配料时也能生成记录说明', () => {
  assert.equal(compositionNote(null), '');
  assert.equal(compositionNote(undefined), '');
  assert.equal(compositionNote([]), '');
  assert.equal(compositionNote([
    { label: '椰奶', grams: 20, unit: 'ml' },
    { label: '西米', grams: 25 },
  ]), '配料：椰奶 20ml、西米 25g');
});

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


/*
 * recompute() 在 boot 的 hydrateStore() 里就会跑一次。
 * 之前它让 RangeError 直接冒泡：恢复一份含 16 岁生日的备份之后整个应用起不来，
 * 首屏还显示成「本地存储不可用，IndexedDB 打不开」——救不回来，报错还指向无关的方向。
 * 用户连设置抽屉都打不开，没法回去改那条数据。
 */
const BASE_PROFILE = {
  sex: 'male', birthday: '1995-06-15', heightCm: 175, weightKg: 70,
  goal: 'maintain', rateKgPerWeek: 0, activity: 'light', onboarded: true,
};
const AT_NOON = new Date('2026-08-27T12:00:00+08:00');

const runWith = (patch) => {
  state.profile = { ...BASE_PROFILE, ...patch };
  state.day = '2026-08-27';
  recompute(AT_NOON);
  return state.derived;
};

test('身体信息算不出目标时不会让整条流水线崩掉', () => {
  for (const [label, patch] of [
    ['未成年', { birthday: '2011-06-15' }],
    ['身高为 0', { heightCm: 0 }],
    ['体重不合理', { weightKg: 0 }],
    // 生日留空是有意的：按 30 岁估算，不算错误。这里测的是真的填坏了的情况
    ['生日格式无效', { birthday: '不是日期' }],
    ['减脂配正速率', { goal: 'cut', rateKgPerWeek: 0.5 }],
  ]) {
    let derived;
    assert.doesNotThrow(() => { derived = runWith(patch); }, `${label} 让 recompute 抛异常了`);
    assert.ok(derived.profileError, `${label} 没有记录原因`);
    assert.ok(Number.isFinite(derived.targets.kcal) && derived.targets.kcal > 0,
      `${label} 之后算不出可用的热量目标`);
    // 退回默认档案算出来的数字不能冒充个性化结果
    assert.equal(derived.demoMode, true, `${label} 没有标成非个性化`);
  }
});

test('身体信息改回可用之后立刻恢复个性化', () => {
  runWith({ birthday: '2011-06-15' });
  const fixed = runWith({});
  assert.equal(fixed.profileError, null);
  assert.equal(fixed.demoMode, false);
  assert.ok(fixed.targets.kcal > 0);
});
