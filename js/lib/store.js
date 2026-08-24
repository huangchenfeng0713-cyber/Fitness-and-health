/**
 * 应用状态中心
 * 负责：读写本地数据库、按当前日期汇总、驱动目标与建议的重新计算、通知视图刷新。
 */

import * as db from './db.js';
import { todayKey, dayFraction, shiftDay } from './utils.js';
import {
  dailyTargets, dynamicTDEE, basalMetabolicRate, sumNutrients, staticTDEE, validateProfile,
} from '../core/nutrition.js';
import { buildAdvice } from '../core/advisor.js';
import {
  computeBaseline, repairMisscaledEnergy, findMisscaledEnergyDays,
  findImplausibleDays, clearImplausibleValues, implausibleFields, isPlausibleHealthValue,
} from '../core/health.js';
import {
  isCompleteAppleSnapshot, mergeApplePartialRows, replaceAppleSnapshotRows, stampManualPatch,
} from '../core/health-merge.js';
import { FOODS, FOOD_BY_ID, nutrientsFor } from '../data/foods.js';

export const DEFAULT_PROFILE = {
  sex: 'male',
  birthday: '',
  age: 30,
  ageEstimated: true,
  heightCm: 172,
  weightKg: 65,
  bodyFatPct: null,
  activity: 'light',
  goal: 'maintain',
  rateKgPerWeek: null,
  proteinPerKg: null,
  useAppleEnergy: true,   // 用 Apple 设备记录动态估算热量预算
  syncWeightFromApple: true,
  appleSourcePriority: [], // 可选：export.xml sourceName 的统一优先顺序
  demoMode: false,
  onboarded: false,
};

const listeners = new Set();

export const state = {
  ready: false,
  profile: { ...DEFAULT_PROFILE },
  day: todayKey(),
  healthDays: [],        // 全部 Apple 健康按天数据
  healthByDate: new Map(),
  dietEntries: [],       // 当前日期的饮食条目
  dietDaily: [],         // 每日饮食汇总（用于趋势与基线）
  customFoods: [],
  favorites: [],         // 常吃食物 id
  lastImport: null,
  derived: null,
};

/**
 * v1.2 开始严格校验目标和速率的方向。旧版本允许保存“减脂 + 正数”这类组合，
 * 如果直接拿来计算会让升级后的应用在启动时抛错。迁移时以用户选的目标为准，
 * 只纠正速率符号，不改变幅度；维持目标归零。
 */
export function migrateStoredProfile(stored = null) {
  const source = stored && typeof stored === 'object' ? stored : {};
  const next = { ...DEFAULT_PROFILE, ...source };
  const rate = Number(next.rateKgPerWeek);
  if (Number.isFinite(rate)) {
    if (next.goal === 'cut' && rate > 0) next.rateKgPerWeek = -rate;
    if (next.goal === 'bulk' && rate < 0) next.rateKgPerWeek = Math.abs(rate);
    if (next.goal === 'maintain' && Math.abs(rate) > 0.001) next.rateKgPerWeek = 0;
  }
  if (next.birthday) next.ageEstimated = false;
  return next;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error('视图刷新出错', err); }
  }
}

/** 所有可选食物 = 内置库 + 用户自建 */
export function allFoods() {
  return [...state.customFoods, ...FOODS];
}

export function findFood(id) {
  return state.customFoods.find((f) => f.id === id) || FOOD_BY_ID.get(id) || null;
}

// ---------------------------------------------------------------- 初始化

export async function initStore() {
  const [profile, favorites, lastImport, customFoods, healthDays, dietAll] = await Promise.all([
    db.getSetting('profile', null),
    db.getSetting('favorites', []),
    db.getSetting('lastImport', null),
    db.getAll(db.STORES.customFoods),
    db.getAll(db.STORES.health),
    db.getAll(db.STORES.diet),
  ]);

  state.profile = migrateStoredProfile(profile);
  // 把兼容修复写回去，避免之后每次启动都重复迁移。首次启动没有旧档案时不主动落库。
  if (profile && JSON.stringify(profile) !== JSON.stringify(state.profile)) {
    await db.setSetting('profile', state.profile);
  }
  state.favorites = favorites || [];
  state.lastImport = lastImport;
  state.customFoods = customFoods || [];
  setHealthDays(healthDays || []);
  rebuildDietDaily(dietAll || []);
  state.dietEntries = (dietAll || []).filter((e) => e.date === state.day);
  state.ready = true;
  recompute();
  return state;
}

function setHealthDays(days) {
  state.healthDays = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  state.healthByDate = new Map(state.healthDays.map((d) => [d.date, d]));
}

function rebuildDietDaily(entries) {
  const byDate = new Map();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  state.dietDaily = [...byDate.entries()]
    .map(([date, list]) => ({ date, ...sumNutrients(list), count: list.length }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------------------------------------------------------------- 计算

/**
 * 重新计算当前日期的目标、摄入与建议。
 * 任何一次记录、任何一次设置修改后都会调用，做到"实时调整"。
 */
export function recompute(now = new Date()) {
  const p = state.profile;
  const health = state.healthByDate.get(state.day) || {};
  const isToday = state.day === todayKey(now);

  // 体重优先用 Apple 健康当天（或最近一次）的记录
  const effectiveProfile = { ...p };
  if (p.syncWeightFromApple) {
    const w = latestHealthValue('weightKg', state.day);
    if (w > 0) effectiveProfile.weightKg = w;
    const bf = latestHealthValue('bodyFatPct', state.day);
    if (bf > 0) effectiveProfile.bodyFatPct = bf;
    const hcm = latestHealthValue('heightCm', state.day);
    if (hcm > 0 && !p.heightCm) effectiveProfile.heightCm = hcm;
  }

  const baseline = computeBaseline(state.healthDays, state.dietDaily, state.day);
  const { kcal: bmr } = basalMetabolicRate(effectiveProfile);
  const stat = staticTDEE(effectiveProfile);

  const intake = sumNutrients(state.dietEntries);

  let dynamic = null;
  let energyData = {
    observedAt: null, ageMinutes: null, stale: false, missingObservationTime: false,
  };
  const hasEnergyData = Number(health.activeEnergy) > 0 || Number(health.restingEnergy) > 0;
  if (p.useAppleEnergy && hasEnergyData) {
    energyData = resolveEnergyObservation(health, state.lastImport, state.day, now);
    // 历史完整日不需要时间戳；今天若不知道累计值覆盖到几点，宁可回退到静态估算，
    // 也不能拿同一份旧快照跟着当前时钟反复外推。
    const canProject = !isToday || energyData.observedAt != null;
    if (canProject) {
      dynamic = dynamicTDEE({
        bmr,
        // 缺字段和明确记录为 0 不是一回事：缺失时应由近期基线或静态公式补足。
        activeSoFar: health.activeEnergy != null ? Number(health.activeEnergy) : null,
        basalSoFar: Number(health.restingEnergy) || null,
        // 近 14 天 Apple 设备记录的静息能量日均，优先于单次公式估算
        baselineResting: baseline.restingEnergy,
        observationFraction: isToday ? energyData.dayFraction : 1,
        baselineActive: baseline.activeEnergy,
        fallbackTDEE: stat.tdee,
      });
    }
  }

  const targets = dailyTargets(effectiveProfile, dynamic);
  const advice = buildAdvice({
    targets,
    intake,
    entries: state.dietEntries,
    profile: effectiveProfile,
    health,
    baseline: {
      ...baseline,
      // 分母用「有饮食记录的天数」，不是日历天数——否则会把没记的日子算成没达标
      proteinHitDays: countProteinHitDays(targets.protein, baseline.windowDays),
    },
    now: isToday ? now : new Date(`${state.day}T20:00:00`),
  });

  state.derived = {
    effectiveProfile, health, baseline, dynamic, targets, intake, advice, isToday, bmr,
    staticTdee: stat.tdee, energyData, demoMode: p.demoMode === true || p.onboarded !== true,
  };
  return state.derived;
}

/**
 * 找到这份累计能量真正覆盖到的时刻。今天的目标只按该时刻外推并保持不变，
 * 当前钟表继续前进不会再让同一份健康快照改变热量预算。
 */
export function resolveEnergyObservation(health, lastImport, day, now = new Date()) {
  const isToday = day === todayKey(now);
  if (!isToday) {
    return { observedAt: null, dayFraction: 1, ageMinutes: null, stale: false, missingObservationTime: false };
  }

  let observed = new Date(health?.energyObservedAt || '');
  if (Number.isNaN(observed.getTime()) || todayKey(observed) !== day) {
    const imported = new Date(lastImport?.at || '');
    const range = lastImport?.range;
    const coversDay = Array.isArray(range) ? day >= range[0] && day <= range[1] : lastImport?.days > 0;
    observed = !Number.isNaN(imported.getTime()) && todayKey(imported) === day && coversDay
      ? imported : new Date(NaN);
  }
  if (Number.isNaN(observed.getTime())) {
    return {
      observedAt: null, dayFraction: null, ageMinutes: null, stale: false,
      missingObservationTime: true,
    };
  }
  const ageMinutes = Math.max(0, Math.round((now.getTime() - observed.getTime()) / 60000));
  return {
    observedAt: observed.toISOString(),
    dayFraction: dayFraction(observed),
    ageMinutes,
    stale: ageMinutes >= 120,
    missingObservationTime: false,
  };
}

/** 取指定日期当天或之前最近一次的健康指标 */
export function latestHealthValue(key, upToDate = state.day) {
  for (let i = state.healthDays.length - 1; i >= 0; i -= 1) {
    const d = state.healthDays[i];
    if (d.date > upToDate) continue;
    const v = Number(d[key]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

function countProteinHitDays(target, windowDays = 7) {
  if (!(target > 0) || !windowDays) return null;
  // 必须和 computeBaseline 使用同一段日历窗口。按“已记录天数”去 slice 会在
  // 中间漏记时把更早的旧记录拉进来，让热量均值和蛋白达标率来自两段不同日期。
  const start = shiftDay(state.day, -Math.max(1, Math.floor(windowDays)));
  const recent = state.dietDaily.filter((d) => d.date >= start && d.date < state.day);
  if (!recent.length) return null;
  return recent.filter((d) => d.protein >= target * 0.9).length;
}

// ---------------------------------------------------------------- 变更操作

export async function setDay(dayKey) {
  state.day = dayKey;
  state.dietEntries = await db.getDietByDate(dayKey);
  recompute();
  emit();
}

export async function saveProfile(patch) {
  // 是否完成首次引导由调用方明确写入。只改同步开关或来源优先级，不能把默认身体数据
  // 悄悄当成用户已经确认过的真实档案。
  const next = { ...state.profile, ...patch };
  const checked = validateProfile(next);
  if (!checked.valid) throw new RangeError(checked.errors.join('；'));
  state.profile = next;
  await db.setSetting('profile', state.profile);
  recompute();
  emit();
}

/** 新增一条饮食记录 */
export async function addEntry({ foodId, name, grams, meal, custom = null, note = '', sugarLevel = null }) {
  const food = custom || findFood(foodId);
  if (!food) throw new Error('找不到这个食物');
  const nutrients = custom?.nutrients || nutrientsFor(food, grams, sugarLevel);
  const entry = {
    date: state.day,
    time: new Date().toISOString(),
    meal: meal || 'snack',
    foodId: food.id || null,
    name: name || food.name,
    grams: Number(grams) || 0,
    // 字段名不能叫 sugar：下面展开的 nutrients 里 sugar 是糖的克数，会把档位覆盖掉
    sugarLevel,
    note,
    ...nutrients,
  };
  const id = await db.put(db.STORES.diet, entry);
  entry.id = id;
  state.dietEntries = [...state.dietEntries, entry];
  await touchFavorite(food.id);
  await refreshDietDaily();
  recompute();
  emit();
  return entry;
}

export async function updateEntry(id, patch) {
  const idx = state.dietEntries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const current = state.dietEntries[idx];
  let next = { ...current, ...patch };
  if (patch.grams != null && current.foodId) {
    const food = findFood(current.foodId);
    if (food) next = { ...next, ...nutrientsFor(food, patch.grams, current.sugarLevel) };
  }
  await db.put(db.STORES.diet, next);
  state.dietEntries = state.dietEntries.map((e) => (e.id === id ? next : e));
  await refreshDietDaily();
  recompute();
  emit();
  return next;
}

export async function removeEntry(id) {
  await db.del(db.STORES.diet, id);
  state.dietEntries = state.dietEntries.filter((e) => e.id !== id);
  await refreshDietDaily();
  recompute();
  emit();
}

/** 把某一天的记录整批复制到当前日期（"和昨天一样"） */
export async function copyDay(fromDate) {
  const rows = await db.getDietByDate(fromDate);
  if (!rows.length) return 0;
  for (const row of rows) {
    const { id: _oldId, ...rest } = row;
    const entry = { ...rest, date: state.day, time: new Date().toISOString() };
    const newId = await db.put(db.STORES.diet, entry);
    state.dietEntries.push({ ...entry, id: newId });
  }
  await refreshDietDaily();
  recompute();
  emit();
  return rows.length;
}

async function refreshDietDaily() {
  rebuildDietDaily(await db.getAll(db.STORES.diet));
}

async function touchFavorite(foodId) {
  if (!foodId) return;
  const next = [foodId, ...state.favorites.filter((f) => f !== foodId)].slice(0, 24);
  state.favorites = next;
  await db.setSetting('favorites', next);
}

export async function addCustomFood(food) {
  const row = { ...food, id: food.id || `custom_${Date.now().toString(36)}`, custom: true };
  await db.put(db.STORES.customFoods, row);
  state.customFoods = [row, ...state.customFoods.filter((f) => f.id !== row.id)];
  emit();
  return row;
}

export async function removeCustomFood(id) {
  await db.del(db.STORES.customFoods, id);
  state.customFoods = state.customFoods.filter((f) => f.id !== id);
  emit();
}

/** 写入导入的 Apple 健康数据（同日期字段合并，不覆盖已有的其它字段） */
export async function mergeHealthDays(days, meta = {}) {
  const isCompleteSnapshot = isCompleteAppleSnapshot(meta);
  if (!days?.length && !isCompleteSnapshot) return 0;
  const importedAt = new Date();
  const today = todayKey(importedAt);
  const incomingDays = (days || []).map((day) => {
    const hasEnergy = Number(day.activeEnergy) > 0 || Number(day.restingEnergy) > 0;
    if (!hasEnergy || day.date !== today) return day;
    const observed = new Date(day.energyObservedAt || '');
    // 只有日期而没有钟点的 JSON/CSV 会被解析成 00:00。对“今天累计值”来说，
    // 导入时刻比午夜更接近真实覆盖终点；有明确钟点的快捷指令则原样保留。
    const looksLikeDateOnly = !Number.isNaN(observed.getTime()) && dayFraction(observed) < 1 / 1440;
    return (!day.energyObservedAt || looksLikeDateOnly)
      ? { ...day, energyObservedAt: importedAt.toISOString() }
      : day;
  });
  const existing = await db.getAll(db.STORES.health);
  const importId = `health-${Date.now().toString(36)}`;
  if (isCompleteSnapshot) {
    const { upserts, deletes } = replaceAppleSnapshotRows(existing, incomingDays, importId);
    await db.bulkSync(db.STORES.health, upserts, deletes);
  } else {
    const merged = mergeApplePartialRows(existing, incomingDays, importId);
    await db.bulkSync(db.STORES.health, merged);
  }
  setHealthDays(await db.getAll(db.STORES.health));
  state.lastImport = {
    at: importedAt.toISOString(),
    days: incomingDays.length,
    range: incomingDays.length
      ? [incomingDays[0].date, incomingDays[incomingDays.length - 1].date]
      : null,
    ...meta,
  };
  await db.setSetting('lastImport', state.lastImport);
  recompute();
  emit();
  return incomingDays.length;
}

/** 有多少天的能量数据受早期单位缺陷影响 */
export function countMisscaledDays() {
  return findMisscaledEnergyDays(state.healthDays).length;
}

/** 一键把受影响日子的能量数值乘回正确量级 */
export async function repairHealthEnergy() {
  const fixed = repairMisscaledEnergy(state.healthDays);
  if (!fixed.length) return 0;
  await db.bulkPut(db.STORES.health, fixed, { merge: true });
  setHealthDays(await db.getAll(db.STORES.health));
  recompute();
  emit();
  return fixed.length;
}

/** 哪几天存进来的数值在生理上不可能（多半是导入时日期范围选错，把多天累加成一天） */
export function listImplausibleDays() {
  return findImplausibleDays(state.healthDays)
    .map((d) => ({ date: d.date, fields: implausibleFields(d) }));
}

/**
 * 抹掉这些天不可能的数值，其余字段保留。
 * 这里必须整条覆写而不是 merge —— merge 会把旧记录里的字段原样带回来，
 * 想删掉的那几个反而删不掉。
 */
export async function clearImplausibleHealth() {
  const fixed = clearImplausibleValues(state.healthDays);
  if (!fixed.length) return 0;
  await db.bulkPut(db.STORES.health, fixed);
  setHealthDays(await db.getAll(db.STORES.health));
  recompute();
  emit();
  return fixed.length;
}

/** 手动写入 / 修改某天的健康数据 */
export async function saveHealthDay(date, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    if (key === 'source' || value == null || value === '') continue;
    if (!isPlausibleHealthValue(key, value)) throw new RangeError(`${key} 的数值超出可接受范围`);
  }
  const existing = state.healthByDate.get(date) || { date };
  const hasEnergyPatch = patch?.activeEnergy != null || patch?.restingEnergy != null;
  const timedPatch = hasEnergyPatch && date === todayKey()
    ? { ...patch, energyObservedAt: new Date().toISOString() }
    : patch;
  const row = stampManualPatch(existing, { ...timedPatch, date });
  await db.put(db.STORES.health, row);
  setHealthDays(await db.getAll(db.STORES.health));
  recompute();
  emit();
  return row;
}

export async function clearAllData() {
  for (const s of Object.values(db.STORES)) await db.clear(s);
  state.profile = { ...DEFAULT_PROFILE };
  state.healthDays = [];
  state.healthByDate = new Map();
  state.dietEntries = [];
  state.dietDaily = [];
  state.customFoods = [];
  state.favorites = [];
  state.lastImport = null;
  recompute();
  emit();
}

export { db };
