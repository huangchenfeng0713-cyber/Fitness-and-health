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
import { normalizeSession } from '../core/training.js';
import { nextPortionMemory } from '../core/portion.js';
import {
  computeBaseline, repairMisscaledEnergy, findMisscaledEnergyDays,
  findImplausibleDays, clearImplausibleValues, implausibleFields, isPlausibleHealthValue,
} from '../core/health.js';
import {
  isCompleteAppleSnapshot, mergeApplePartialRows, replaceAppleSnapshotRows, stampManualPatch,
} from '../core/health-merge.js';
import { FOODS, FOOD_BY_ID, nutrientsFor, hasFoodMix, foodMixNutrition } from '../data/foods.js';

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
  trainingDays: [],      // 每日训练记录，按日期
  favorites: [],         // 常吃食物 id
  portionMemory: {},     // { foodId: 克数 } —— 用户自己改过的份量
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

async function hydrateStore({ notify = false } = {}) {
  const [profile, favorites, portionMemory, lastImport, customFoods, healthDays, dietAll, training] = await Promise.all([
    db.getSetting('profile', null),
    db.getSetting('favorites', []),
    db.getSetting('portionMemory', {}),
    db.getSetting('lastImport', null),
    db.getAll(db.STORES.customFoods),
    db.getAll(db.STORES.health),
    db.getAll(db.STORES.diet),
    db.getAll(db.STORES.training),
  ]);

  state.profile = migrateStoredProfile(profile);
  // 把兼容修复写回去，避免之后每次启动都重复迁移。首次启动没有旧档案时不主动落库。
  if (profile && JSON.stringify(profile) !== JSON.stringify(state.profile)) {
    try {
      await db.setSetting('profile', state.profile);
    } catch (error) {
      // 会话意外失效后账号数据会被写锁保护；此时先用内存中的兼容结果完成启动，
      // 等原账号重新登录解锁后再由下一次正常保存落库。
      if (error?.code !== 'account_data_locked') throw error;
    }
  }
  state.favorites = favorites || [];
  state.portionMemory = portionMemory || {};
  state.lastImport = lastImport;
  state.customFoods = customFoods || [];
  state.trainingDays = (training || []).map(normalizeSession).filter((s) => s.date);
  setHealthDays(healthDays || []);
  rebuildDietDaily(cleanEntries(dietAll));
  state.dietEntries = cleanEntries(dietAll).filter((e) => e.date === state.day);
  state.ready = true;
  recompute();
  if (notify) emit();
  return state;
}

export async function initStore() {
  return hydrateStore();
}

/**
 * 云端快照替换或安全退出清库后，从 IndexedDB 重新装载内存状态。
 * 视图只订阅 store，无需知道数据来自本机操作还是账号同步。
 */
export async function reloadStoreFromDB() {
  return hydrateStore({ notify: true });
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
/*
 * 从库里读出来的饮食条目先过一遍。
 *
 * addEntry 有校验，但恢复备份和云端同步是绕过它直接落库的 —— 一条 null
 * 就能让 recompute 里的 sumNutrients / buildAdvice 抛异常，而 recompute
 * 是在 boot 里跑的：抛出去用户连设置抽屉都打不开，没法回去删那条数据。
 */
const cleanEntries = (rows) => (Array.isArray(rows) ? rows : [])
  .filter((e) => e && typeof e === 'object');

/*
 * 看历史日期时把 now 钉在当天 20:00，否则会按此刻的钟点给出「该吃午饭了」这种建议。
 *
 * 日期串坏掉时退回真实时间：`new Date('xT20:00:00')` 是 Invalid Date，
 * 一路传进 buildAdvice 就抛 RangeError，而 recompute 是不许抛的。
 * 备份恢复和云端同步都能把一个坏 day 写进来。
 */
function pinnedNow(day, now) {
  const pinned = new Date(`${day}T20:00:00`);
  return Number.isNaN(pinned.getTime()) ? now : pinned;
}

export function recompute(now = new Date()) {
  const p = state.profile;
  const health = state.healthByDate.get(state.day) || {};
  const isToday = state.day === todayKey(now);

  /*
   * 身高、体重、体脂只认 Apple 健康，而且是「所选日期之前最近一次」——
   * 称重不是每天都有，取不到当天的就一直沿用上一次读到的，直到出现新记录。
   *
   * 原先身高那条写的是 `hcm > 0 && !p.heightCm`：手填过一次之后设备记录就再也
   * 进不来了，换算 BMI 和静息能量用的还是几年前那个数。现在设备记录一律优先。
   *
   * 档案里存的那份手填值没有删，它只在设备从来没给过这一项时才顶上——
   * 新用户第一次打开、或者把健康数据清空重来时，至少还算得出目标。
   */
  const effectiveProfile = { ...p };
  const bodySource = {};
  for (const key of ['weightKg', 'bodyFatPct', 'heightCm']) {
    const hit = latestHealthEntry(key, state.day);
    bodySource[key] = hit;
    if (hit) effectiveProfile[key] = hit.value;
  }

  /*
   * 身体信息算不出目标时，退回默认档案继续跑，绝不把异常抛出去。
   *
   * recompute() 在 boot 的 hydrateStore() 里就会执行一次。之前这里让
   * RangeError 直接冒泡：恢复了一份含 16 岁生日的备份之后，整个应用起不来，
   * 首屏还显示成「本地存储不可用，IndexedDB 打不开」——既救不回来，
   * 报错还指向完全无关的方向（用户连设置抽屉都打不开，没法回去改那条数据）。
   *
   * 现在把原因记进 derived.profileError，界面照常渲染并提示去哪儿修。
   */
  const profileCheck = validateProfile(effectiveProfile);
  const profileError = profileCheck.valid ? null : profileCheck.errors.join('；');
  const calcProfile = profileCheck.valid
    ? effectiveProfile
    : { ...DEFAULT_PROFILE, sex: effectiveProfile.sex || DEFAULT_PROFILE.sex };

  const baseline = computeBaseline(state.healthDays, state.dietDaily, state.day);
  const { kcal: bmr } = basalMetabolicRate(calcProfile);
  const stat = staticTDEE(calcProfile);

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

  /*
   * 目标用「近期节奏」算，当天固定；实时那份只用来说今天实际收支。
   *
   * 原先目标直接跟着今天的 Apple 累计走：白天按 2076 kcal 吃，晚上手表把活动
   * 能量同步上来，目标当场变成 1399，同一顿饭从「刚好」变成「超标 180」——
   * 用户什么都没做错，是脚下的尺子在动。
   *
   * 现在目标那把尺子用近 14 天设备记录的日均（完整天的记录，不含外推），
   * 一天之内不会变；今天动得多还是少，交给下面这个实时收支去说。
   * 两个数字各回答各的问题，不再互相打架。
   */
  const planned = p.useAppleEnergy && (baseline.restingEnergy > 0 || baseline.activeEnergy > 0)
    ? dynamicTDEE({
      bmr,
      baselineResting: baseline.restingEnergy,
      baselineActive: baseline.activeEnergy,
      observationFraction: 1,
      fallbackTDEE: stat.tdee,
    })
    : null;

  const targets = dailyTargets(calcProfile, planned);

  /*
   * 今日实际能量收支：吃进去的 减 今天真的消耗掉的。
   * 这个数一天之内会随手表更新而变，本来就该变——它说的是「今天」，
   * 不是「今天该吃多少」。
   */
  const liveTdee = dynamic ? Math.round(dynamic.tdee) : null;
  const liveEnergy = liveTdee != null ? {
    tdee: liveTdee,
    surplus: Math.round((Number(intake.kcal) || 0) - liveTdee),
    plannedSurplus: targets.dailyDelta,
    // 目标算的是近期节奏，实时这份是今天：差多少就是「今天比平时多动/少动了多少」
    vsPlanned: Math.round(liveTdee - targets.tdee),
  } : null;
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
    now: isToday ? now : pinnedNow(state.day, now),
    isToday,
    waterCount: health.waterCount,
  });

  state.derived = {
    effectiveProfile, health, baseline, dynamic, targets, intake, advice, isToday, bmr,
    staticTdee: stat.tdee, energyData, profileError, bodySource, liveEnergy,
    demoMode: p.demoMode === true || p.onboarded !== true || profileError != null,
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
export function latestHealthEntry(key, upToDate = state.day) {
  for (let i = state.healthDays.length - 1; i >= 0; i -= 1) {
    const d = state.healthDays[i];
    if (d.date > upToDate) continue;
    const v = Number(d[key]);
    if (Number.isFinite(v) && v > 0) return { value: v, date: d.date };
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
  state.dietEntries = cleanEntries(await db.getDietByDate(dayKey));
  recompute();
  emit();
}

export async function saveProfile(patch) {
  // 是否完成首次引导由调用方明确写入。只改同步开关或来源优先级，不能把默认身体数据
  // 悄悄当成用户已经确认过的真实档案。
  const next = { ...state.profile, ...patch };
  const checked = validateProfile(next);
  if (!checked.valid) throw new RangeError(checked.errors.join('；'));
  await db.setSetting('profile', next);
  state.profile = next;
  recompute();
  emit();
}

/**
 * 保存某一天的训练记录。
 *
 * 空计划直接删掉那一行，不留 { items: [] } 的空壳——否则「最近练过」和
 * 周容量统计会把空白日也算成练过一次。
 */
export async function saveTraining(date, session) {
  const clean = normalizeSession({ ...session, date });
  const rest = state.trainingDays.filter((s) => s.date !== date);
  if (!clean.items.length) {
    await db.del(db.STORES.training, date);
    state.trainingDays = rest;
  } else {
    const row = { ...clean, updatedAt: new Date().toISOString() };
    await db.put(db.STORES.training, row);
    state.trainingDays = [...rest, clean].sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  emit();
  return clean;
}

/** 某一天的训练记录；没有就给一个空的，调用方不用判空 */
export function trainingFor(date) {
  return state.trainingDays.find((s) => s.date === date) || { date, items: [] };
}

export function compositionNote(components = []) {
  const chosen = (Array.isArray(components) ? components : [])
    .filter((component) => Number(component.grams) > 0)
    .map((component) => `${component.label || component.name} ${component.grams}${component.unit || 'g'}`);
  return chosen.length ? `配料：${chosen.join('、')}` : '';
}

/** 新增一条饮食记录；复合食物可直接传入逐项求和后的营养与配料快照。 */
export async function addEntry({
  foodId, name, grams, meal, custom = null, note = '', sugarLevel = null,
  nutrients: suppliedNutrients = null, composition = null,
}) {
  const food = custom || findFood(foodId);
  if (!food) throw new Error('找不到这个食物');
  const nutrients = suppliedNutrients || custom?.nutrients || nutrientsFor(food, grams, sugarLevel);
  const savedComposition = Array.isArray(composition) ? composition : null;
  const entry = {
    date: state.day,
    time: new Date().toISOString(),
    meal: meal || 'snack',
    foodId: food.id || null,
    name: name || food.name,
    grams: Number(grams) || 0,
    // 字段名不能叫 sugar：下面展开的 nutrients 里 sugar 是糖的克数，会把档位覆盖掉
    sugarLevel,
    note: note || compositionNote(savedComposition),
    ...(savedComposition ? { composition: savedComposition } : {}),
    ...nutrients,
  };
  const id = await db.put(db.STORES.diet, entry);
  entry.id = id;
  state.dietEntries = [...state.dietEntries, entry];
  await touchFavorite(food.id);
  await rememberPortion(food, entry.grams);
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
    if (food && hasFoodMix(food) && Array.isArray(current.composition) && current.composition.length) {
      const previous = Number(current.grams);
      const requested = Math.max(0, Number(patch.grams) || 0);
      const ratio = previous > 0 ? requested / previous : 0;
      const amounts = Object.fromEntries(current.composition.map((component) => [
        component.foodId, Math.max(0, Number(component.grams) || 0) * ratio,
      ]));
      const mixed = foodMixNutrition(food, amounts);
      next = {
        ...next,
        grams: mixed.grams,
        ...mixed.nutrients,
        composition: mixed.components,
        note: compositionNote(mixed.components),
      };
    } else if (food) {
      next = { ...next, ...nutrientsFor(food, patch.grams, current.sugarLevel) };
    }
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

/**
 * 恢复刚删除的一条饮食记录。
 *
 * 保留原 id、日期、时间、配料快照和营养值；重新走 addEntry 会生成新时间，
 * 复合食物还可能按当前食物库重算，撤销就不再是撤销原记录了。
 */
export async function restoreEntry(entry) {
  if (!entry || entry.id == null || !entry.date) throw new TypeError('缺少可恢复的饮食记录');
  const restored = { ...entry };
  await db.put(db.STORES.diet, restored);
  if (restored.date === state.day && !state.dietEntries.some((e) => e.id === restored.id)) {
    state.dietEntries = [...state.dietEntries, restored];
  }
  await refreshDietDaily();
  recompute();
  emit();
  return restored;
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
  await db.setSetting('favorites', next);
  state.favorites = next;
}

/** 从“历史”快捷入口移除一项；不会删除已经记下的饮食记录或自定义食物。 */
export async function removeFavorite(foodId) {
  if (!foodId || !state.favorites.includes(foodId)) return false;
  const next = state.favorites.filter((id) => id !== foodId);
  await db.setSetting('favorites', next);
  state.favorites = next;
  emit();
  return true;
}

// 记住你自己的碗有多大。判断都在 core/portion.js，这里只管落库。
export function portionMemory() {
  return state.portionMemory;
}

async function rememberPortion(food, grams) {
  const next = nextPortionMemory(state.portionMemory, food, grams);
  if (!next) return;
  await db.setSetting('portionMemory', next);
  state.portionMemory = next;
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
  await db.clearAllStores();
  state.profile = { ...DEFAULT_PROFILE };
  state.healthDays = [];
  state.healthByDate = new Map();
  state.dietEntries = [];
  state.dietDaily = [];
  state.customFoods = [];
  state.favorites = [];
  state.portionMemory = {};
  state.lastImport = null;
  recompute();
  emit();
}

export { db };
