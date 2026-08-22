/**
 * Apple 健康数据解析与按天聚合
 * 纯逻辑模块（无 DOM / 无 File API），供 Web Worker 与单元测试共用。
 *
 * 支持三种来源：
 *  1. 「健康」App 导出的 导出.zip / export.zip / export.xml（HKRecord）
 *  2. Health Auto Export 等 App 输出的 JSON
 *  3. 快捷指令生成的简易 JSON / CSV
 */

/** 关心的 HealthKit 类型 → 内部字段 */
export const HEALTH_TYPES = {
  HKQuantityTypeIdentifierStepCount: { key: 'steps', label: '步数', agg: 'sum', unit: '步', kind: 'count' },
  HKQuantityTypeIdentifierActiveEnergyBurned: { key: 'activeEnergy', label: '活动能量', agg: 'sum', unit: 'kcal', kind: 'energy' },
  HKQuantityTypeIdentifierBasalEnergyBurned: { key: 'restingEnergy', label: '静息能量', agg: 'sum', unit: 'kcal', kind: 'energy' },
  HKQuantityTypeIdentifierAppleExerciseTime: { key: 'exerciseMinutes', label: '锻炼时间', agg: 'sum', unit: '分钟', kind: 'time' },
  HKQuantityTypeIdentifierAppleStandTime: { key: 'standMinutes', label: '站立时间', agg: 'sum', unit: '分钟', kind: 'time' },
  HKQuantityTypeIdentifierDistanceWalkingRunning: { key: 'distanceKm', label: '步行跑步距离', agg: 'sum', unit: 'km', kind: 'distance' },
  HKQuantityTypeIdentifierBodyMass: { key: 'weightKg', label: '体重', agg: 'last', unit: 'kg', kind: 'mass' },
  HKQuantityTypeIdentifierBodyFatPercentage: { key: 'bodyFatPct', label: '体脂率', agg: 'last', unit: '%', kind: 'percent' },
  HKQuantityTypeIdentifierLeanBodyMass: { key: 'leanMassKg', label: '瘦体重', agg: 'last', unit: 'kg', kind: 'mass' },
  HKQuantityTypeIdentifierHeight: { key: 'heightCm', label: '身高', agg: 'last', unit: 'cm', kind: 'length' },
  HKQuantityTypeIdentifierRestingHeartRate: { key: 'restingHR', label: '静息心率', agg: 'avg', unit: 'bpm', kind: 'rate' },
  HKQuantityTypeIdentifierVO2Max: { key: 'vo2max', label: '最大摄氧量', agg: 'last', unit: 'ml/kg·min', kind: 'raw' },
  HKQuantityTypeIdentifierDietaryEnergyConsumed: { key: 'hkKcal', label: '膳食热量', agg: 'sum', unit: 'kcal', kind: 'energy' },
  HKQuantityTypeIdentifierDietaryProtein: { key: 'hkProtein', label: '蛋白质', agg: 'sum', unit: 'g', kind: 'mass_g' },
  HKQuantityTypeIdentifierDietaryFatTotal: { key: 'hkFat', label: '脂肪', agg: 'sum', unit: 'g', kind: 'mass_g' },
  HKQuantityTypeIdentifierDietaryCarbohydrates: { key: 'hkCarb', label: '碳水化合物', agg: 'sum', unit: 'g', kind: 'mass_g' },
  HKQuantityTypeIdentifierDietaryFiber: { key: 'hkFiber', label: '膳食纤维', agg: 'sum', unit: 'g', kind: 'mass_g' },
  HKQuantityTypeIdentifierDietarySugar: { key: 'hkSugar', label: '糖', agg: 'sum', unit: 'g', kind: 'mass_g' },
  HKQuantityTypeIdentifierDietarySodium: { key: 'hkSodium', label: '钠', agg: 'sum', unit: 'mg', kind: 'mass_mg' },
  HKQuantityTypeIdentifierDietaryWater: { key: 'waterMl', label: '饮水', agg: 'sum', unit: 'ml', kind: 'volume' },
  HKCategoryTypeIdentifierSleepAnalysis: { key: 'sleepMinutes', label: '睡眠', agg: 'sleep', unit: '分钟', kind: 'sleep' },
};

/** Health Auto Export / 快捷指令常见字段名 → 内部字段 */
export const ALIAS_KEYS = {
  step_count: 'steps', steps: 'steps', 步数: 'steps',
  active_energy: 'activeEnergy', active_energy_burned: 'activeEnergy', 活动能量: 'activeEnergy', 活动卡路里: 'activeEnergy',
  basal_energy_burned: 'restingEnergy', resting_energy: 'restingEnergy', 静息能量: 'restingEnergy',
  apple_exercise_time: 'exerciseMinutes', exercise_time: 'exerciseMinutes', 锻炼时间: 'exerciseMinutes',
  apple_stand_time: 'standMinutes',
  walking_running_distance: 'distanceKm', distance: 'distanceKm', 距离: 'distanceKm',
  weight_body_mass: 'weightKg', body_mass: 'weightKg', weight: 'weightKg', 体重: 'weightKg',
  body_fat_percentage: 'bodyFatPct', 体脂率: 'bodyFatPct',
  lean_body_mass: 'leanMassKg',
  height: 'heightCm', 身高: 'heightCm',
  resting_heart_rate: 'restingHR', 静息心率: 'restingHR',
  vo2_max: 'vo2max',
  dietary_energy: 'hkKcal', dietary_energy_consumed: 'hkKcal',
  protein: 'hkProtein', total_fat: 'hkFat', carbohydrates: 'hkCarb',
  fiber: 'hkFiber', dietary_sugar: 'hkSugar', sodium: 'hkSodium',
  dietary_water: 'waterMl', water: 'waterMl', 饮水: 'waterMl',
  sleep_analysis: 'sleepMinutes', 睡眠: 'sleepMinutes',
};

/**
 * 键名归一化：去首尾空白、转小写、去掉空格/下划线/连字符。
 * 手写或快捷指令拼出来的 JSON 常见 "activeEnergy "（末尾多个空格）、
 * "active energy"、"Active_Energy" 这类写法，都应该认得。
 */
export function normalizeKey(k) {
  return String(k).trim().toLowerCase().replace(/[\s_\-]+/g, '');
}

const SUM_KEYS = new Set(
  Object.values(HEALTH_TYPES).filter((t) => t.agg === 'sum').map((t) => t.key),
);

/** 内部字段名集合，用于「用户直接写内部字段名」的情况 */
const INTERNAL_KEYS = new Set(Object.values(HEALTH_TYPES).map((t) => t.key));

/** 归一化后的别名查找表：别名与内部字段名都收进来 */
const ALIAS_LOOKUP = (() => {
  const map = new Map();
  for (const [alias, key] of Object.entries(ALIAS_KEYS)) map.set(normalizeKey(alias), key);
  for (const key of INTERNAL_KEYS) map.set(normalizeKey(key), key);
  return map;
})();

const DATE_KEYS = new Set(['date', 'day', 'datetime', 'timestamp', 'time', '日期']);

/** 把任意写法的字段名解析成内部字段名，认不出返回 null */
export function resolveKey(k) {
  return ALIAS_LOOKUP.get(normalizeKey(k)) || null;
}

/** 单位归一化 */
export function normalizeValue(kind, value, unit) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const u = String(unit || '').trim().toLowerCase();
  switch (kind) {
    case 'energy': {
      // 能量单位必须区分大小写：Apple 健康导出的 export.xml 写的是 unit="Cal"，
      // 那是「大卡」也就是 kcal；而小写 cal 才是 1/1000 的小卡。
      // 先转小写再比较会把 Cal 当成 cal，整套能量数据被缩小一千倍。
      const raw = String(unit || '').trim();
      if (/^kj$/i.test(raw)) return v / 4.184;
      if (raw === 'cal') return v / 1000;
      if (raw === 'J') return v / 4184;
      return v; // kcal / Cal / KCAL
    }
    case 'mass':
      if (u === 'lb') return v * 0.45359237;
      if (u === 'g') return v / 1000;
      if (u === 'st') return v * 6.35029;
      return v; // kg
    case 'mass_g':
      if (u === 'mg') return v / 1000;
      if (u === 'mcg' || u === 'µg') return v / 1e6;
      if (u === 'oz') return v * 28.3495;
      return v; // g
    case 'mass_mg':
      if (u === 'g') return v * 1000;
      if (u === 'mcg' || u === 'µg') return v / 1000;
      return v; // mg
    case 'length':
      if (u === 'm') return v * 100;
      if (u === 'in') return v * 2.54;
      if (u === 'ft') return v * 30.48;
      return v; // cm
    case 'distance':
      if (u === 'm') return v / 1000;
      if (u === 'mi') return v * 1.609344;
      if (u === 'ft') return v * 0.0003048;
      if (u === 'yd') return v * 0.0009144;
      return v; // km
    case 'volume':
      if (u === 'l') return v * 1000;
      if (u === 'fl_oz_us' || u === 'floz_us' || u === 'fl oz') return v * 29.5735;
      if (u === 'cup_us') return v * 236.588;
      return v; // mL
    case 'percent':
      // HealthKit 的 % 单位存的是 0~1 的比例（0.181 表示 18.1%），
      // 而第三方导出常直接写 18.1，按数值大小区分。
      return v > 0 && v <= 1 ? v * 100 : v;
    case 'time':
      if (u === 'hr' || u === 'h') return v * 60;
      if (u === 's' || u === 'sec') return v / 60;
      return v; // min
    default:
      return v;
  }
}

/**
 * 解析 Apple 导出的时间戳，例如 "2026-08-21 07:12:33 +0800"。
 * 字符串本身已是设备本地时间，因此日期直接取前 10 位最稳妥。
 */
export function parseAppleDate(str) {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2}):?(\d{2})?/.exec(String(str).trim());
  if (!m) {
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : { date: d, dayKey: toDayKey(d) };
  }
  const [, y, mo, d, h, mi, s, oh, om] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${oh}:${om || '00'}`;
  const date = new Date(iso);
  return { date: Number.isNaN(date.getTime()) ? null : date, dayKey: `${y}-${mo}-${d}` };
}

/** Date → YYYY-MM-DD（本地时区） */
export function toDayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 从 `<Record ... />` 的属性串里取出需要的字段（比正则逐个 exec 快很多） */
export function parseAttrs(tag) {
  const attrs = {};
  const re = /([A-Za-z]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1]] = m[2];
  return attrs;
}

const SLEEP_ASLEEP = /Asleep/i;

/**
 * 按天聚合器。
 * 累加型直接相加；快照型（体重等）保留当天最后一条；睡眠按「入睡时段」归到起床那天。
 */
export function createAggregator() {
  const days = new Map();
  let recordCount = 0;
  let skipped = 0;
  const seenTypes = new Set();

  const dayOf = (key) => {
    let d = days.get(key);
    if (!d) {
      d = { date: key, _lastTs: {}, _avg: {} };
      days.set(key, d);
    }
    return d;
  };

  function addRecord({ type, value, unit, startDate, endDate }) {
    const meta = HEALTH_TYPES[type];
    if (!meta) { skipped += 1; return false; }
    seenTypes.add(type);

    const start = parseAppleDate(startDate);
    if (!start?.dayKey) { skipped += 1; return false; }

    if (meta.agg === 'sleep') {
      // 睡眠：只统计真正入睡的片段，归到「醒来那天」
      if (!SLEEP_ASLEEP.test(String(value))) return false;
      const end = parseAppleDate(endDate);
      if (!start.date || !end?.date) return false;
      const minutes = (end.date - start.date) / 60000;
      if (!(minutes > 0) || minutes > 24 * 60) return false;
      const day = dayOf(end.dayKey);
      day.sleepMinutes = (day.sleepMinutes || 0) + minutes;
      recordCount += 1;
      return true;
    }

    const v = normalizeValue(meta.kind, value, unit);
    if (v == null) { skipped += 1; return false; }

    const day = dayOf(start.dayKey);
    recordCount += 1;

    if (meta.agg === 'sum') {
      day[meta.key] = (day[meta.key] || 0) + v;
    } else if (meta.agg === 'avg') {
      const a = day._avg[meta.key] || (day._avg[meta.key] = { sum: 0, n: 0 });
      a.sum += v; a.n += 1;
      day[meta.key] = a.sum / a.n;
    } else {
      // last：以时间戳最新的一条为准
      const ts = start.date ? start.date.getTime() : 0;
      if (day._lastTs[meta.key] == null || ts >= day._lastTs[meta.key]) {
        day._lastTs[meta.key] = ts;
        day[meta.key] = v;
      }
    }
    return true;
  }

  function result() {
    const out = [];
    for (const [key, day] of days) {
      const clean = { date: key, source: 'apple' };
      for (const [k, v] of Object.entries(day)) {
        if (k.startsWith('_') || k === 'date') continue;
        clean[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
      }
      out.push(clean);
    }
    out.sort((a, b) => (a.date < b.date ? -1 : 1));
    return { days: out, recordCount, skipped, types: [...seenTypes] };
  }

  return { addRecord, result, get size() { return days.size; } };
}

/**
 * 从 XML 文本片段中提取所有 <Record .../> 并送入聚合器。
 * 返回未处理完的尾部（可能是被截断的标签），供下一个分片拼接。
 */
export function feedXmlChunk(chunk, aggregator) {
  let searchFrom = 0;
  let consumed = 0;
  for (;;) {
    const start = chunk.indexOf('<Record ', searchFrom);
    if (start === -1) break;
    const end = chunk.indexOf('>', start);
    if (end === -1) break; // 标签被切断，留给下一片
    const attrs = parseAttrs(chunk.slice(start + 8, end));
    aggregator.addRecord({
      type: attrs.type,
      value: attrs.value,
      unit: attrs.unit,
      startDate: attrs.startDate,
      endDate: attrs.endDate || attrs.startDate,
    });
    searchFrom = end + 1;
    consumed = end + 1;
  }
  // 保留尾部（可能含半个标签），但避免无限增长
  const tailStart = Math.max(consumed, chunk.length - 4096);
  return chunk.slice(tailStart);
}

/**
 * 解析 JSON。同时支持三种形态：
 *   1. Health Auto Export 的 { data: { metrics: [...] } }
 *   2. 每天一条的数组 [{date, steps, ...}, ...]
 *   3. 单独一条记录 {date, steps, ...} —— 快捷指令最容易产出这种
 */
export function parseHealthJson(json) {
  const days = new Map();
  const ignored = new Set();

  const put = (dayKey, key, value, mode = 'sum') => {
    if (!dayKey || value == null || !Number.isFinite(Number(value))) return;
    let d = days.get(dayKey);
    if (!d) { d = { date: dayKey, source: 'apple' }; days.set(dayKey, d); }
    if (mode === 'sum' && SUM_KEYS.has(key)) d[key] = (d[key] || 0) + Number(value);
    else d[key] = Number(value);
  };

  const metrics = json?.data?.metrics || json?.metrics || (Array.isArray(json) && json[0]?.data ? json : null);
  if (Array.isArray(metrics)) {
    for (const metric of metrics) {
      const key = resolveKey(metric.name || metric.type || '');
      if (!key) { if (metric.name) ignored.add(String(metric.name)); continue; }
      const meta = Object.values(HEALTH_TYPES).find((t) => t.key === key);
      for (const point of metric.data || []) {
        const stamp = parseAppleDate(point.date || point.startDate || point.timestamp);
        if (!stamp?.dayKey) continue;
        let value = point.qty ?? point.value ?? point.Avg ?? point.avg;
        if (key === 'sleepMinutes' && point.asleep != null) value = Number(point.asleep) * 60;
        if (value == null) continue;
        const norm = meta ? normalizeValue(meta.kind, value, metric.units) : Number(value);
        put(stamp.dayKey, key, norm, SUM_KEYS.has(key) ? 'sum' : 'last');
      }
    }
  }

  // 扁平结构：数组、或单独一条记录
  let rows = null;
  if (Array.isArray(json?.days)) rows = json.days;
  else if (Array.isArray(json) && !json[0]?.data) rows = json;
  else if (json && typeof json === 'object' && !Array.isArray(json)
    && !json.data && !json.metrics && !json.days) rows = [json];

  if (rows) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const dateEntry = Object.entries(row).find(([k]) => DATE_KEYS.has(normalizeKey(k)));
      const stamp = dateEntry ? parseAppleDate(dateEntry[1]) : null;
      const dayKey = stamp?.dayKey
        || (typeof dateEntry?.[1] === 'string' ? dateEntry[1].slice(0, 10) : null);
      if (!dayKey) continue;
      for (const [k, v] of Object.entries(row)) {
        if (DATE_KEYS.has(normalizeKey(k))) continue;
        const key = resolveKey(k);
        if (!key) { ignored.add(String(k)); continue; }
        put(dayKey, key, v, 'last');
      }
    }
  }

  const out = [...days.values()].map((d) => {
    const c = { ...d };
    for (const [k, v] of Object.entries(c)) if (typeof v === 'number') c[k] = Math.round(v * 100) / 100;
    return c;
  });
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { days: out, recordCount: out.length, skipped: 0, types: [], ignoredKeys: [...ignored] };
}

/** 解析 CSV（首行为表头，需含 date 列） */
export function parseHealthCsv(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { days: [], recordCount: 0, skipped: 0, types: [] };
  const split = (line) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const header = split(lines[0]);
  const dateIdx = header.findIndex((h) => DATE_KEYS.has(normalizeKey(h)) || /date|日期|day/i.test(h));
  if (dateIdx === -1) return { days: [], recordCount: 0, skipped: lines.length - 1, types: [] };

  const rows = [];
  const ignored = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const cells = split(lines[i]);
    const stamp = parseAppleDate(cells[dateIdx]);
    const dayKey = stamp?.dayKey || cells[dateIdx]?.slice(0, 10);
    if (!dayKey) continue;
    const row = { date: dayKey, source: 'apple' };
    header.forEach((h, idx) => {
      if (idx === dateIdx) return;
      const key = resolveKey(h);
      const v = Number(cells[idx]);
      if (key && Number.isFinite(v)) row[key] = v;
      else if (!key && h.trim()) ignored.add(h.trim());
    });
    if (Object.keys(row).length > 2) rows.push(row);
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { days: rows, recordCount: rows.length, skipped: 0, types: [], ignoredKeys: [...ignored] };
}

/* ------------------------------------------------------------------ */
/* 历史数据修复                                                          */
/* ------------------------------------------------------------------ */

/** 受单位缺陷影响的能量字段 */
export const ENERGY_FIELDS = ['activeEnergy', 'restingEnergy', 'hkKcal'];

/**
 * 找出被「Cal 当成小卡」缺陷缩小一千倍的日子。
 *
 * 判据要足够保守，宁可漏也不能误伤手动录入的正确数据：
 *  - 全天静息能量低于 50 kcal 在生理上不可能（成人躺一天也有 1200+）
 *  - 活动能量低于 20 kcal 却走了一千步以上，同样只可能是量级错了
 */
export function findMisscaledEnergyDays(days = []) {
  return days.filter((d) => {
    const resting = Number(d.restingEnergy);
    const active = Number(d.activeEnergy);
    const steps = Number(d.steps) || 0;
    if (resting > 0 && resting < 50) return true;
    if (active > 0 && active < 20 && steps > 1000) return true;
    return false;
  });
}

/**
 * 把受影响的日子的能量字段乘回 1000。
 * 返回需要写回的记录，不改原数组。
 */
export function repairMisscaledEnergy(days = []) {
  return findMisscaledEnergyDays(days).map((d) => {
    const fixed = { ...d };
    for (const key of ENERGY_FIELDS) {
      const v = Number(fixed[key]);
      if (Number.isFinite(v) && v > 0) fixed[key] = Math.round(v * 1000 * 100) / 100;
    }
    return fixed;
  });
}

/** 计算近期基线（用于动态 TDEE 与趋势判断） */
export function computeBaseline(healthDays = [], dietDays = [], today = toDayKey(new Date()), window = 14) {
  const recent = healthDays.filter((d) => d.date < today).slice(-window);
  const avg = (arr, key) => {
    const vals = arr.map((d) => Number(d[key])).filter((v) => Number.isFinite(v) && v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const weights = healthDays
    .filter((d) => Number(d.weightKg) > 0)
    .slice(-28)
    .map((d) => ({ date: d.date, w: Number(d.weightKg) }));

  let weightTrend = null;
  if (weights.length >= 4) {
    // 用最小二乘拟合 kg/天，再换算成 kg/周
    const t0 = new Date(weights[0].date).getTime();
    const xs = weights.map((p) => (new Date(p.date).getTime() - t0) / 86400000);
    const ys = weights.map((p) => p.w);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0; let den = 0;
    for (let i = 0; i < n; i += 1) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    if (den > 0) weightTrend = Math.round((num / den) * 7 * 100) / 100;
  }

  const dietRecent = dietDays.filter((d) => d.date < today).slice(-window);
  const kcalIntake = dietRecent.length
    ? dietRecent.reduce((a, d) => a + (d.kcal || 0), 0) / dietRecent.length
    : null;
  const proteinIntake = dietRecent.length
    ? dietRecent.reduce((a, d) => a + (d.protein || 0), 0) / dietRecent.length
    : null;

  return {
    days: Math.max(recent.length, dietRecent.length),
    activeEnergy: avg(recent, 'activeEnergy'),
    restingEnergy: avg(recent, 'restingEnergy'),
    steps: avg(recent, 'steps'),
    sleepMinutes: avg(recent, 'sleepMinutes'),
    weightTrend,
    latestWeight: weights.length ? weights[weights.length - 1].w : null,
    kcalIntake: kcalIntake != null ? Math.round(kcalIntake) : null,
    proteinIntake: proteinIntake != null ? Math.round(proteinIntake) : null,
  };
}
