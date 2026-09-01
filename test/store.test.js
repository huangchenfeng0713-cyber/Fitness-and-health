import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compositionNote, findFood, LEGACY_FOOD_ID_REDIRECTS,
  migrateStoredProfile, resolveEnergyObservation, recompute, state,
} from '../js/lib/store.js';

test('食物库去重后旧 id 仍能读取到保留项', () => {
  const expected = {
    flatbread: 'shouzhuabing',
    croissant: 'croissant_plain',
    gailan: 'chinese_broccoli',
    mixue_lemon: 'mixue_lemonade',
    nuomiji: 'lotus_glutinous_chicken',
  };
  assert.deepEqual(LEGACY_FOOD_ID_REDIRECTS, expected);
  for (const [legacy, current] of Object.entries(expected)) {
    assert.equal(findFood(legacy)?.id, current, `${legacy} 没有迁移到 ${current}`);
  }
});

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


/* ------------------- 身高体重只认 Apple 健康，且一直沿用最近一次 ------------------- */

const withHealthDays = (days, patch = {}) => {
  state.healthDays = days;
  state.healthByDate = new Map(days.map((d) => [d.date, d]));
  const derived = runWith(patch);
  state.healthDays = [];
  state.healthByDate = new Map();
  return derived;
};

test('设备记录一律盖过手填的身高体重', () => {
  /*
   * 身高那条原先写的是「手填过就不再采用设备记录」，结果换了新表、量了新身高，
   * 应用里用的还是几年前手填的那个数，BMI 和静息能量跟着一起错。
   */
  const d = withHealthDays(
    [{ date: '2026-08-27', weightKg: 65.2, heightCm: 181, bodyFatPct: 16.4 }],
    { heightCm: 175, weightKg: 72, bodyFatPct: 25 },
  );
  assert.equal(d.effectiveProfile.heightCm, 181, '手填身高不该压住设备记录');
  assert.equal(d.effectiveProfile.weightKg, 65.2);
  assert.equal(d.effectiveProfile.bodyFatPct, 16.4);
});

test('没有新记录就一直沿用上一次读到的值，并记下是哪天读的', () => {
  // 称重不是每天都有：8-27 当天没称，仍应采用 8-24 那次，而不是退回手填值
  const d = withHealthDays([
    { date: '2026-08-24', weightKg: 62.4 },
    { date: '2026-08-25', steps: 8000 },
    { date: '2026-08-26', steps: 9000 },
    { date: '2026-08-27', steps: 3541 },
  ], { weightKg: 72 });
  assert.equal(d.effectiveProfile.weightKg, 62.4, '当天没称重就该沿用最近一次');
  assert.equal(d.bodySource.weightKg.date, '2026-08-24', '界面要能说清这个数是哪天读到的');
});

test('设备从来没给过时才用手填值，否则新用户连目标都算不出来', () => {
  const d = withHealthDays([{ date: '2026-08-27', steps: 3541 }], { heightCm: 175, weightKg: 72 });
  assert.equal(d.effectiveProfile.heightCm, 175);
  assert.equal(d.effectiveProfile.weightKg, 72);
  assert.equal(d.bodySource.weightKg, null, '没有来源时不该编一个出来');
  assert.equal(d.profileError, null, '手填值仍要能算出目标');
});

test('只看得到未来那天的记录时不往回借', () => {
  // 8-27 之后才称的重，不能用来解释 8-27 当天的目标
  const d = withHealthDays([{ date: '2026-08-28', weightKg: 61 }], { weightKg: 72 });
  assert.equal(d.effectiveProfile.weightKg, 72);
  assert.equal(d.bodySource.weightKg, null);
});

test('recompute 对着脏数据也不许抛 —— 它在 boot 里就会跑一次', () => {
  /*
   * 抛出去 = 整个应用起不来，而且用户连设置抽屉都打不开、没法回去改那条数据。
   * addEntry 和 saveProfile 都有校验，但恢复备份和云端同步是绕过它们直接落库的，
   * 所以这里假设 state 里什么都可能有。
   */
  const ok = { sex: 'male', age: 30, heightCm: 178, weightKg: 80, activity: 'moderate', goal: 'cut' };
  const blank = () => ({
    profile: {}, healthDays: [], healthByDate: new Map(), dietEntries: [], dietDaily: [],
    day: '2026-08-28', trainingDays: [], portionMemory: {}, customFoods: [],
  });
  const cases = {
    空档案: { profile: {} },
    身高体重不合格: { profile: { ...ok, heightCm: 5, weightKg: 5 } },
    活动和目标是垃圾: { profile: { ...ok, activity: '???', goal: '???' } },
    健康数据是脏的: {
      profile: ok,
      healthDays: [{ date: '2026-08-28', weightKg: 'abc', restingEnergy: -5, bodyFatPct: 'x' }],
    },
    // 备份里混进一条 null：曾经在 sumNutrients 和 buildAdvice 各炸一次
    饮食条目里混进null: { profile: ok, dietEntries: [{ foodId: 'nope', grams: 'x' }, null] },
    // `new Date('xT20:00:00')` 是 Invalid Date，一路传进 buildAdvice 就抛 RangeError
    日期串坏掉: { profile: ok, day: 'not-a-date' },
  };
  for (const [name, patch] of Object.entries(cases)) {
    Object.assign(state, blank(), patch);
    assert.doesNotThrow(() => recompute(), `${name} 让 recompute 抛了异常`);
    const t = state.derived?.targets || {};
    for (const k of ['kcal', 'protein', 'fat', 'carb']) {
      assert.ok(Number.isFinite(t[k]) && t[k] >= 0, `${name} 之后 ${k} 是 ${t[k]}`);
    }
  }
});

test('身体信息算不出目标时退回默认档案，并把原因交给界面去说', () => {
  Object.assign(state, {
    profile: { sex: 'male', age: 30, heightCm: 5, weightKg: 5, activity: 'moderate', goal: 'cut' },
    healthDays: [], healthByDate: new Map(), dietEntries: [], dietDaily: [],
    day: '2026-08-28', trainingDays: [], portionMemory: {}, customFoods: [],
  });
  recompute();
  assert.ok(state.derived.profileError, '没有把失败原因记进 derived，界面就无话可说');
  assert.ok(state.derived.targets.kcal > 0, '仍要给出一份能显示的默认目标');
});
