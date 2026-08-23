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

const HEALTH_BY_KEY = new Map(Object.values(HEALTH_TYPES).map((t) => [t.key, t]));

/**
 * 仅对会由手机/手表连续生成的累计量做多来源消重。
 * 饮食和饮水通常是用户主动记录的离散事件，来源不同也可能是不同餐次，不能按日取最大值。
 */
const DEVICE_CUMULATIVE_KEYS = new Set([
  'steps', 'activeEnergy', 'restingEnergy', 'exerciseMinutes', 'standMinutes', 'distanceKm',
]);

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
      if (/^j$/i.test(raw)) return v / 4184;
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
    case 'sleep':
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
  const input = String(str).trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    const local = new Date(Number(y), Number(mo) - 1, Number(d));
    if (local.getFullYear() !== Number(y)
      || local.getMonth() !== Number(mo) - 1
      || local.getDate() !== Number(d)) return null;
    return { date: local, dayKey: input, offsetMinutes: -local.getTimezoneOffset() };
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*([+-]\d{2}):?(\d{2})?/.exec(input);
  if (!m) {
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return null;
    // ISO 字符串已经声明了日历日；不能再按运行浏览器的时区把它前移/后移。
    const declared = /^(\d{4})-(\d{2})-(\d{2})[T ]/.exec(input);
    return {
      date: parsed,
      dayKey: declared ? `${declared[1]}-${declared[2]}-${declared[3]}` : toDayKey(parsed),
      offsetMinutes: -parsed.getTimezoneOffset(),
    };
  }
  const [, y, mo, d, h, mi, s, oh, om] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${oh}:${om || '00'}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const check = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
  if (check.getUTCFullYear() !== Number(y)
    || check.getUTCMonth() !== Number(mo) - 1
    || check.getUTCDate() !== Number(d)
    || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  const sign = oh.startsWith('-') ? -1 : 1;
  const offsetMinutes = sign * (Math.abs(Number(oh)) * 60 + Number(om || 0));
  return { date, dayKey: `${y}-${mo}-${d}`, offsetMinutes };
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

/** 宽松的生理/设备量级校验：只隔离明显损坏的数据，不对正常极值做截断。 */
export function isPlausibleHealthValue(key, value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0) return false;
  const limits = {
    steps: [0, 250000], activeEnergy: [0, 30000], restingEnergy: [0, 10000],
    exerciseMinutes: [0, 1440], standMinutes: [0, 1440], distanceKm: [0, 1000],
    weightKg: [1, 500], bodyFatPct: [1, 75], leanMassKg: [1, 350], heightCm: [50, 260],
    restingHR: [20, 250], vo2max: [5, 120], sleepMinutes: [0, 1440],
    hkKcal: [0, 30000], hkProtein: [0, 5000], hkFat: [0, 5000], hkCarb: [0, 5000],
    hkFiber: [0, 1000], hkSugar: [0, 5000], hkSodium: [0, 1000000], waterMl: [0, 100000],
  };
  const range = limits[key];
  return !range || (v >= range[0] && v <= range[1]);
}

/**
 * 按天聚合器。
 * 累加型直接相加；快照型（体重等）保留当天最后一条；睡眠按「入睡时段」归到起床那天。
 */
export function createAggregator() {
  const days = new Map();
  const sleepIntervals = [];
  const sleepWakeDays = new Set();
  const recentFingerprints = new Set();
  const fingerprintQueue = [];
  let recordCount = 0;
  let skipped = 0;
  let duplicateRecords = 0;
  let invalidRecords = 0;
  const seenTypes = new Set();

  const dayOf = (key) => {
    let d = days.get(key);
    if (!d) {
      d = { date: key, _lastTs: {}, _avg: {}, _sourceSums: {} };
      days.set(key, d);
    }
    return d;
  };

  const rememberFingerprint = (fingerprint) => {
    if (recentFingerprints.has(fingerprint)) return false;
    recentFingerprints.add(fingerprint);
    fingerprintQueue.push(fingerprint);
    // 完整导出可有数百万条记录；有界窗口既能去掉同步产生的相邻重复，也不破坏流式内存上限。
    if (fingerprintQueue.length > 100000) recentFingerprints.delete(fingerprintQueue.shift());
    return true;
  };

  const addSourceSum = (dayKey, key, source, value) => {
    const day = dayOf(dayKey);
    const bySource = day._sourceSums[key] || (day._sourceSums[key] = new Map());
    bySource.set(source, (bySource.get(source) || 0) + value);
  };

  /** 将极少见的跨午夜累计样本按持续时间拆到两个本地日。 */
  const sumParts = (start, end, value) => {
    const startMs = start.date?.getTime();
    const endMs = end?.date?.getTime();
    if (!(endMs > startMs)) return [[start.dayKey, value]];
    const duration = endMs - startMs;
    if (duration > 24 * 60 * 60 * 1000 || start.dayKey === end.dayKey) return [[start.dayKey, value]];
    const [y, m, d] = start.dayKey.split('-').map(Number);
    const offset = Number.isFinite(start.offsetMinutes) ? start.offsetMinutes : 0;
    const nextMidnight = Date.UTC(y, m - 1, d + 1) - offset * 60000;
    if (!(nextMidnight > startMs && nextMidnight < endMs)) return [[start.dayKey, value]];
    const firstRatio = (nextMidnight - startMs) / duration;
    return [[start.dayKey, value * firstRatio], [end.dayKey, value * (1 - firstRatio)]];
  };

  function addRecord({ type, value, unit, startDate, endDate, sourceName = '', device = '' }) {
    const meta = HEALTH_TYPES[type];
    if (!meta) { skipped += 1; return false; }
    seenTypes.add(type);

    const start = parseAppleDate(startDate);
    if (!start?.dayKey) { skipped += 1; return false; }

    if (meta.agg === 'sleep') {
      // 先保留真正入睡的区间；result() 再统一求并集、拼成会话并归到最终醒来日。
      if (!SLEEP_ASLEEP.test(String(value))) return false;
      const end = parseAppleDate(endDate);
      if (!start.date || !end?.date) { skipped += 1; invalidRecords += 1; return false; }
      const minutes = (end.date - start.date) / 60000;
      if (!(minutes > 0) || minutes > 24 * 60) { skipped += 1; invalidRecords += 1; return false; }
      const fingerprint = [type, value, startDate, endDate, sourceName, device].join('|');
      if (!rememberFingerprint(fingerprint)) { duplicateRecords += 1; return false; }
      sleepIntervals.push({ start: start.date.getTime(), end: end.date.getTime(), wakeDay: end.dayKey });
      sleepWakeDays.add(end.dayKey);
      recordCount += 1;
      return true;
    }

    const v = normalizeValue(meta.kind, value, unit);
    if (v == null || !isPlausibleHealthValue(meta.key, v)) {
      skipped += 1; invalidRecords += 1; return false;
    }

    const end = parseAppleDate(endDate || startDate) || start;
    const source = String(sourceName || device || '未知来源').trim() || '未知来源';
    const fingerprint = [type, value, unit, startDate, endDate || startDate, source, device].join('|');
    if (!rememberFingerprint(fingerprint)) { duplicateRecords += 1; return false; }

    recordCount += 1;

    if (meta.agg === 'sum') {
      for (const [dayKey, part] of sumParts(start, end, v)) {
        if (DEVICE_CUMULATIVE_KEYS.has(meta.key)) addSourceSum(dayKey, meta.key, source, part);
        else {
          const day = dayOf(dayKey);
          day[meta.key] = (day[meta.key] || 0) + part;
        }
      }
    } else if (meta.agg === 'avg') {
      const day = dayOf(start.dayKey);
      const a = day._avg[meta.key] || (day._avg[meta.key] = { sum: 0, n: 0 });
      a.sum += v; a.n += 1;
      day[meta.key] = a.sum / a.n;
    } else {
      const day = dayOf(start.dayKey);
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
    const sleepByDay = new Map();
    let rawSleepMinutes = 0;
    let unionSleepMinutes = 0;
    if (sleepIntervals.length) {
      const sorted = [...sleepIntervals].sort((a, b) => a.start - b.start || a.end - b.end);
      const sessionGap = 90 * 60 * 1000;
      let session = [];
      let sessionEnd = -Infinity;
      const finishSession = () => {
        if (!session.length) return;
        let unionStart = session[0].start;
        let unionEnd = session[0].end;
        let minutes = 0;
        let wake = session[0];
        for (const interval of session) {
          rawSleepMinutes += (interval.end - interval.start) / 60000;
          if (interval.end > wake.end) wake = interval;
          if (interval.start <= unionEnd) unionEnd = Math.max(unionEnd, interval.end);
          else {
            minutes += (unionEnd - unionStart) / 60000;
            unionStart = interval.start; unionEnd = interval.end;
          }
        }
        minutes += (unionEnd - unionStart) / 60000;
        unionSleepMinutes += minutes;
        sleepByDay.set(wake.wakeDay, (sleepByDay.get(wake.wakeDay) || 0) + minutes);
        session = [];
      };
      for (const interval of sorted) {
        if (session.length && interval.start > sessionEnd + sessionGap) finishSession();
        session.push(interval);
        sessionEnd = Math.max(sessionEnd, interval.end);
      }
      finishSession();
    }

    const out = [];
    const allKeys = new Set([...days.keys(), ...sleepByDay.keys()]);
    let multiSourceDays = 0;
    for (const key of allKeys) {
      const day = days.get(key) || { date: key, _sourceSums: {} };
      const clean = { date: key, source: 'apple' };
      for (const [k, v] of Object.entries(day)) {
        if (k.startsWith('_') || k === 'date') continue;
        clean[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
      }
      for (const [metricKey, bySource] of Object.entries(day._sourceSums || {})) {
        const totals = [...bySource.values()];
        if (totals.length > 1) multiSourceDays += 1;
        // export.xml 不包含用户在 Health App 中设置的完整来源优先级。
        // 取单来源日总量最大值可避免静默双算；导入结果会明确标出这是近似消重。
        clean[metricKey] = Math.round(Math.max(...totals) * 100) / 100;
      }
      if (sleepByDay.has(key)) clean.sleepMinutes = Math.round(sleepByDay.get(key) * 100) / 100;
      if (Object.keys(clean).length > 2) out.push(clean);
    }
    out.sort((a, b) => (a.date < b.date ? -1 : 1));
    return {
      days: out, recordCount, skipped, types: [...seenTypes],
      quality: {
        duplicateRecords,
        invalidRecords,
        multiSourceDays,
        sleepOverlapMinutes: Math.round(Math.max(0, rawSleepMinutes - unionSleepMinutes) * 10) / 10,
      },
    };
  }

  return {
    addRecord,
    result,
    get size() { return new Set([...days.keys(), ...sleepWakeDays]).size; },
  };
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
      sourceName: attrs.sourceName,
      device: attrs.device,
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
  let recordCount = 0;
  let skipped = 0;
  let invalidRecords = 0;

  const put = (dayKey, key, value, mode = 'sum', timestamp = 0) => {
    if (!dayKey || !isPlausibleHealthValue(key, value)) return false;
    let d = days.get(dayKey);
    if (!d) {
      d = { date: dayKey, source: 'apple', _avg: {}, _lastTs: {} };
      days.set(dayKey, d);
    }
    const v = Number(value);
    if (mode === 'sum') d[key] = (d[key] || 0) + v;
    else if (mode === 'avg') {
      const a = d._avg[key] || (d._avg[key] = { sum: 0, n: 0 });
      a.sum += v; a.n += 1; d[key] = a.sum / a.n;
    } else if (d._lastTs[key] == null || timestamp >= d._lastTs[key]) {
      d._lastTs[key] = timestamp;
      d[key] = v;
    }
    return true;
  };

  const metrics = json?.data?.metrics || json?.metrics || (Array.isArray(json) && json[0]?.data ? json : null);
  if (Array.isArray(metrics)) {
    for (const metric of metrics) {
      const key = resolveKey(metric.name || metric.type || '');
      if (!key) { if (metric.name) ignored.add(String(metric.name)); continue; }
      const meta = HEALTH_BY_KEY.get(key);
      for (const point of metric.data || []) {
        const stamp = parseAppleDate(point.date || point.startDate || point.timestamp);
        if (!stamp?.dayKey) { skipped += 1; continue; }
        let value = point.qty ?? point.value ?? point.Avg ?? point.avg;
        let units = point.units ?? point.unit ?? metric.units ?? metric.unit;
        if (key === 'sleepMinutes' && point.asleep != null) {
          value = point.asleep;
          units ||= 'hr';
        }
        if (value == null || String(value).trim() === '') { skipped += 1; continue; }
        const norm = meta ? normalizeValue(meta.kind, value, units) : Number(value);
        const mode = meta?.agg === 'avg' ? 'avg' : meta?.agg === 'last' ? 'last' : 'sum';
        if (norm == null || !put(stamp.dayKey, key, norm, mode, stamp.date?.getTime() || 0)) {
          skipped += 1; invalidRecords += 1; continue;
        }
        recordCount += 1;
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
      if (!row || typeof row !== 'object') { skipped += 1; continue; }
      const dateEntry = Object.entries(row).find(([k]) => DATE_KEYS.has(normalizeKey(k)));
      const stamp = dateEntry ? parseAppleDate(dateEntry[1]) : null;
      const dayKey = stamp?.dayKey;
      if (!dayKey) { skipped += 1; continue; }
      let accepted = false;
      for (const [k, v] of Object.entries(row)) {
        if (DATE_KEYS.has(normalizeKey(k)) || normalizeKey(k) === 'units' || /unit$/i.test(k)) continue;
        const key = resolveKey(k);
        if (!key) { ignored.add(String(k)); continue; }
        if (v == null || String(v).trim() === '') continue;
        const meta = HEALTH_BY_KEY.get(key);
        const unit = row.units?.[k] ?? row.units?.[key] ?? row[`${k}Unit`] ?? row[`${key}Unit`];
        const norm = meta ? normalizeValue(meta.kind, v, unit) : Number(v);
        if (norm == null || !put(dayKey, key, norm, 'last', stamp.date?.getTime() || 0)) {
          skipped += 1; invalidRecords += 1; continue;
        }
        accepted = true;
      }
      if (accepted) recordCount += 1;
    }
  }

  const out = [...days.values()].map((d) => {
    const c = {};
    for (const [k, v] of Object.entries(d)) if (!k.startsWith('_')) c[k] = v;
    for (const [k, v] of Object.entries(c)) if (typeof v === 'number') c[k] = Math.round(v * 100) / 100;
    return c;
  });
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    days: out, recordCount, skipped, types: [], ignoredKeys: [...ignored],
    quality: { invalidRecords, duplicateRecords: 0, multiSourceDays: 0, sleepOverlapMinutes: 0 },
  };
}

/** 解析 CSV（首行为表头，需含 date 列） */
export function parseHealthCsv(text) {
  const input = String(text).replace(/^\uFEFF/, '');
  const table = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim() !== '')) table.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== '')) table.push(row);
  if (quoted || table.length < 2) return { days: [], recordCount: 0, skipped: Math.max(0, table.length - 1), types: [] };

  const header = table[0].map((h) => h.trim());
  const specs = header.map((raw) => {
    const m = /^(.*?)(?:\s*(?:\(([^)]+)\)|\[([^\]]+)\]))?$/.exec(raw);
    const base = (m?.[1] || raw).trim();
    return { raw, base, unit: (m?.[2] || m?.[3] || '').trim(), key: resolveKey(base) };
  });
  const dateIdx = specs.findIndex((s) => DATE_KEYS.has(normalizeKey(s.base)) || /date|日期|day/i.test(s.base));
  if (dateIdx === -1) return { days: [], recordCount: 0, skipped: table.length - 1, types: [] };

  const days = new Map();
  const ignored = new Set();
  let recordCount = 0;
  let skipped = 0;
  let invalidRecords = 0;
  const numeric = (raw) => {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const normalized = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  };

  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i];
    if (cells.length !== header.length) { skipped += 1; continue; }
    const stamp = parseAppleDate(cells[dateIdx]);
    const dayKey = stamp?.dayKey;
    if (!dayKey) { skipped += 1; continue; }
    const current = days.get(dayKey) || { date: dayKey, source: 'apple' };
    let accepted = false;
    specs.forEach((spec, idx) => {
      if (idx === dateIdx) return;
      if (!spec.key) { if (spec.raw) ignored.add(spec.raw); return; }
      const v = numeric(cells[idx]);
      if (v == null) return;
      const meta = HEALTH_BY_KEY.get(spec.key);
      const norm = meta ? normalizeValue(meta.kind, v, spec.unit) : v;
      if (norm == null || !isPlausibleHealthValue(spec.key, norm)) {
        invalidRecords += 1; return;
      }
      current[spec.key] = norm;
      accepted = true;
    });
    if (accepted) { days.set(dayKey, current); recordCount += 1; }
    else skipped += 1;
  }
  const rows = [...days.values()];
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    days: rows, recordCount, skipped, types: [], ignoredKeys: [...ignored],
    quality: { invalidRecords, duplicateRecords: 0, multiSourceDays: 0, sleepOverlapMinutes: 0 },
  };
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
function misscaledEnergyFields(day, today) {
  if (!day?.date || day.date >= today) return [];
  const resting = Number(day.restingEnergy);
  const active = Number(day.activeEnergy);
  const intake = Number(day.hkKcal);
  const steps = Number(day.steps) || 0;
  const restingBad = resting > 0 && resting < 50;
  const activeBad = active > 0 && active < 20 && (steps > 1000 || restingBad);
  const fields = [];
  if (restingBad) fields.push('restingEnergy');
  if (activeBad) fields.push('activeEnergy');
  // 膳食热量低本身完全可能；只有同一天活动和静息都呈现旧缺陷的千分之一量级时才联动修复。
  if (intake > 0 && intake < 10 && restingBad && activeBad) fields.push('hkKcal');
  return fields;
}

export function findMisscaledEnergyDays(days = [], today = toDayKey(new Date())) {
  return days.filter((d) => misscaledEnergyFields(d, today).length > 0);
}

/**
 * 把受影响的日子的能量字段乘回 1000。
 * 返回需要写回的记录，不改原数组。
 */
export function repairMisscaledEnergy(days = [], today = toDayKey(new Date())) {
  return findMisscaledEnergyDays(days, today).map((d) => {
    const fixed = { ...d };
    for (const key of misscaledEnergyFields(d, today)) {
      const v = Number(fixed[key]);
      if (Number.isFinite(v) && v > 0) fixed[key] = Math.round(v * 1000 * 100) / 100;
    }
    return fixed;
  });
}

/** 计算近期基线（用于动态 TDEE 与趋势判断） */
export function computeBaseline(healthDays = [], dietDays = [], today = toDayKey(new Date()), window = 14) {
  const dayNumber = (key) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : NaN;
  };
  const todayNo = dayNumber(today);
  const healthHistory = [...healthDays]
    .filter((d) => Number.isFinite(dayNumber(d.date)) && d.date < today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const recent = healthHistory.filter((d) => dayNumber(d.date) >= todayNo - window);
  const avg = (arr, key) => {
    const vals = arr
      .filter((d) => d[key] != null && String(d[key]).trim() !== '')
      .map((d) => Number(d[key]))
      .filter((v) => Number.isFinite(v) && v >= 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const weights = healthHistory
    .filter((d) => dayNumber(d.date) >= todayNo - 28 && Number(d.weightKg) > 0)
    .map((d) => ({ date: d.date, w: Number(d.weightKg) }));

  let weightTrend = null;
  if (weights.length >= 4 && dayNumber(weights.at(-1).date) - dayNumber(weights[0].date) >= 7) {
    // 用最小二乘拟合 kg/天，再换算成 kg/周
    const t0 = dayNumber(weights[0].date);
    const xs = weights.map((p) => dayNumber(p.date) - t0);
    const ys = weights.map((p) => p.w);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0; let den = 0;
    for (let i = 0; i < n; i += 1) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    if (den > 0) weightTrend = Math.round((num / den) * 7 * 100) / 100;
  }

  const dietRecent = [...dietDays]
    .filter((d) => Number.isFinite(dayNumber(d.date)) && d.date < today && dayNumber(d.date) >= todayNo - window)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
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
