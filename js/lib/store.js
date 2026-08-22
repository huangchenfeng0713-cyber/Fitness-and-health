/**
 * 应用状态中心
 * 负责：读写本地数据库、按当前日期汇总、驱动目标与建议的重新计算、通知视图刷新。
 */

import * as db from './db.js';
import { todayKey, dayFraction } from './utils.js';
import { dailyTargets, dynamicTDEE, basalMetabolicRate, sumNutrients, staticTDEE } from '../core/nutrition.js';
import { buildAdvice } from '../core/advisor.js';
import { computeBaseline } from '../core/health.js';
import { FOODS, FOOD_BY_ID, nutrientsFor } from '../data/foods.js';

export const DEFAULT_PROFILE = {
  sex: 'male',
  birthday: '',
  age: 30,
  heightCm: 172,
  weightKg: 65,
  bodyFatPct: null,
  activity: 'light',
  goal: 'maintain',
  rateKgPerWeek: null,
  proteinPerKg: null,
  useAppleEnergy: true,   // 用 Apple 健康的真实消耗动态调整热量预算
  syncWeightFromApple: true,
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

  state.profile = { ...DEFAULT_PROFILE, ...(profile || {}) };
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
  const isToday = state.day === todayKey();

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
  const hasEnergyData = Number(health.activeEnergy) > 0 || Number(health.restingEnergy) > 0;
  if (p.useAppleEnergy && hasEnergyData) {
    dynamic = dynamicTDEE({
      bmr,
      activeSoFar: Number(health.activeEnergy) || 0,
      basalSoFar: Number(health.restingEnergy) || null,
      dayFraction: isToday ? dayFraction(now) : 1,
      baselineActive: baseline.activeEnergy,
      intakeKcal: intake.kcal,
      fallbackTDEE: stat.tdee,
    });
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
      proteinHitDays: countProteinHitDays(targets.protein, baseline.days),
    },
    now: isToday ? now : new Date(`${state.day}T20:00:00`),
  });

  state.derived = {
    effectiveProfile, health, baseline, dynamic, targets, intake, advice, isToday, bmr,
    staticTdee: stat.tdee,
  };
  return state.derived;
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
  const recent = state.dietDaily.filter((d) => d.date < state.day).slice(-windowDays);
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
  // 只要用户动过设置，就不再显示首次引导
  state.profile = { ...state.profile, ...patch, onboarded: true };
  await db.setSetting('profile', state.profile);
  recompute();
  emit();
}

/** 新增一条饮食记录 */
export async function addEntry({ foodId, name, grams, meal, custom = null, note = '' }) {
  const food = custom || findFood(foodId);
  if (!food) throw new Error('找不到这个食物');
  const nutrients = custom?.nutrients || nutrientsFor(food, grams);
  const entry = {
    date: state.day,
    time: new Date().toISOString(),
    meal: meal || 'snack',
    foodId: food.id || null,
    name: name || food.name,
    grams: Number(grams) || 0,
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
    if (food) next = { ...next, ...nutrientsFor(food, patch.grams) };
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
  if (!days?.length) return 0;
  await db.bulkPut(db.STORES.health, days, { merge: true });
  setHealthDays(await db.getAll(db.STORES.health));
  state.lastImport = {
    at: new Date().toISOString(),
    days: days.length,
    range: [days[0].date, days[days.length - 1].date],
    ...meta,
  };
  await db.setSetting('lastImport', state.lastImport);
  recompute();
  emit();
  return days.length;
}

/** 手动写入 / 修改某天的健康数据 */
export async function saveHealthDay(date, patch) {
  const existing = state.healthByDate.get(date) || { date };
  const row = { ...existing, ...patch, date, source: patch.source || existing.source || 'manual' };
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
