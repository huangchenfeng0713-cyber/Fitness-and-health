import { coordinateIntervals } from './source-intervals.js';
import { completeEnergyDay, ENERGY_POLICY } from './energy-observation.js';
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
  active_energy: 'activeEnergy', active_energy_burned: 'activeEnergy', active_energy_kcal: 'activeEnergy',
  活动能量: 'activeEnergy', 活动卡路里: 'activeEnergy',
  basal_energy_burned: 'restingEnergy', resting_energy: 'restingEnergy',
  resting_energy_kcal: 'restingEnergy', basal_energy_kcal: 'restingEnergy', 静息能量: 'restingEnergy',
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

const HEALTH_BY_KEY = new Map(Object.values(HEALTH_TYPES).map((t) => [t.key, t]));

/**
 * 仅对会由手机/手表连续生成的累计量做多来源消重。
 * 饮食和饮水通常是用户主动记录的离散事件，来源不同也可能是不同餐次，不能按日取最大值。
 */
const DEVICE_CUMULATIVE_KEYS = new Set([
  'steps', 'activeEnergy', 'restingEnergy', 'exerciseMinutes', 'standMinutes', 'distanceKm',
]);

/** ActivitySummary 的站立圆环是“达标小时数”，不能伪装成 AppleStandTime 的分钟数。 */
export const ACTIVITY_SUMMARY_KEYS = new Set(['activeEnergy', 'exerciseMinutes', 'standHours']);
const ENERGY_OBSERVATION_KEYS = new Set(['activeEnergy', 'restingEnergy']);

/** 完整 Apple export.xml 能权威替换的每日字段。 */
export const HEALTH_FIELD_KEYS = new Set([
  ...Object.values(HEALTH_TYPES).map((t) => t.key),
  ...ACTIVITY_SUMMARY_KEYS,
]);

/** 多来源累计样本的解析分辨率；结果会在 quality 中明确披露这是近似值。 */
export const SOURCE_BUCKET_MINUTES = 5;

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

/**
 * 手机输入法和对话应用经常把 JSON 的英文引号替换成“智能引号”，
 * 也可能在复制时连同 Markdown 代码框一起带进来。这里只清理粘贴文本的
 * 常见包装，后面仍由 JSON.parse 做严格语法校验。
 */
export function normalizeHealthJsonText(text) {
  let normalized = String(text ?? '').trim().replace(/^\uFEFF/, '');
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(normalized);
  if (fenced) normalized = fenced[1].trim();
  return normalized.replace(/[\u201c\u201d\uff02]/g, '"');
}

/** 解析粘贴或文件中的健康 JSON，并把原生英文语法错误换成可操作的提示。 */
export function parseHealthJsonText(text) {
  try {
    return parseHealthJson(JSON.parse(normalizeHealthJsonText(text)));
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('JSON 格式不正确，请检查引号、逗号和括号');
    }
    throw err;
  }
}

/** 把任意写法的字段名解析成内部字段名，认不出返回 null */
export function resolveKey(k) {
  return ALIAS_LOOKUP.get(normalizeKey(k)) || null;
}

/** 单位归一化 */
export function normalizeValue(kind, value, unit, { allowDefault = false, percentFormat = 'percent' } = {}) {
  if (value == null || String(value).trim() === '') return null;
  const v = Number(value);
  if (!Number.isFinite(v) || v < 0) return null;
  const u = String(unit || '').trim().toLowerCase();
  const allowed = { energy: ['kcal', 'cal', 'kj', 'j'], mass: ['kg', 'lb', 'g', 'st'], mass_g: ['g','mg','mcg','µg','oz'],
    mass_mg: ['mg','g','mcg','µg'], length: ['cm','m','in','ft'], distance: ['km','m','mi','ft','yd'], volume: ['ml','l','fl_oz_us','floz_us','fl oz','cup_us'],
    percent: ['%','percent','ratio','fraction'], time: ['min','分钟','hr','h','s','sec'], sleep: ['min','分钟','hr','h','s','sec'], count: ['count','步'], rate: ['bpm','count/min'], raw: ['ml/kg·min','ml/kg/min','ml/(kg*min)'] };
  if (u ? !allowed[kind]?.includes(u) : !allowDefault) return null;
  switch (kind) {
    case 'energy': {
      // 能量单位必须区分大小写：Apple 健康导出的 export.xml 写的是 unit="Cal"，
      // 那是「大卡」也就是 kcal；而小写 cal 才是 1/1000 的小卡。
      // 先转小写再比较会把 Cal 当成 cal，整套能量数据被缩小一千倍。
      const raw = String(unit || '').trim();
      // 只有 cal / Cal 这一对需要区分大小写；焦耳没有同名的歧义单位，可以不区分
      if (/^kj$/i.test(raw)) return v / 4.184;   // 1 kcal = 4.184 kJ（热化学卡）
      if (/^j$/i.test(raw)) return v / 4184;
      if (raw === 'cal') return v / 1000;
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
      return percentFormat === 'ratio' || u === 'ratio' || u === 'fraction' ? v * 100 : v;
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
  const decode = (value) => String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const re = /([A-Za-z_:][\w:.-]*)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1]] = decode(m[2]);
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
    standHours: [0, 24],
    weightKg: [1, 500], bodyFatPct: [1, 75], leanMassKg: [1, 350], heightCm: [50, 260],
    restingHR: [20, 250], vo2max: [5, 120], sleepMinutes: [0, 1440],
    hkKcal: [0, 30000], hkProtein: [0, 5000], hkFat: [0, 5000], hkCarb: [0, 5000],
    hkFiber: [0, 1000], hkSugar: [0, 5000], hkSodium: [0, 1000000], waterMl: [0, 100000],
    waterCount: [0, 200],
  };
  const range = limits[key];
  return !range || (v >= range[0] && v <= range[1]);
}

/**
 * 按天聚合器。
 * 累加型直接相加；快照型（体重等）保留当天最后一条；睡眠按「入睡时段」归到起床那天。
 */
export function createAggregator(options = {}) {
  const bucketMs = SOURCE_BUCKET_MINUTES * 60000;
  const bucketCount = Math.ceil((24 * 60) / SOURCE_BUCKET_MINUTES);
  const days = new Map();
  const sleepIntervals = [];
  const sleepWakeDays = new Set();
  const workouts = [];
  const syncRecords = new Map();
  const deferredDayKeys = new Set();
  const seenIdentifiers = new Set();
  const recentFingerprints = new Set();
  const fingerprintQueue = [];
  const seenTypes = new Set();
  const unsupportedTypes = new Map();
  const unsupportedElements = new Map();
  const unknownTopLevelElements = new Map();
  const sourceStats = new Map();
  const activitySummaryDays = new Set();
  const exportMetadata = { exportDate: null, me: null };
  const identityCounts = { uuid: 0, externalUUID: 0, fingerprint: 0 };
  let recordCount = 0;
  let skipped = 0;
  let duplicateRecords = 0;
  let invalidRecords = 0;
  const issues = [];
  const invalid = detail => { invalidRecords++; if (issues.length < 100) issues.push(detail); };
  let activitySummaryCount = 0;
  let activitySummaryOverrides = 0;
  let supersededSyncRecords = 0;
  let syncFlushed = false;
  let documentStarted = false;
  let documentComplete = false;
  let truncatedXml = false;

  const explicitPriority = new Map();
  if (Array.isArray(options.sourcePriority)) {
    options.sourcePriority.forEach((source, i) => explicitPriority.set(String(source), 100000 - i));
  } else if (options.sourcePriority && typeof options.sourcePriority === 'object') {
    for (const [source, score] of Object.entries(options.sourcePriority)) {
      if (Number.isFinite(Number(score))) explicitPriority.set(source, Number(score));
    }
  }

  const dayOf = (key) => {
    let d = days.get(key);
    if (!d) {
      d = {
        date: key, _lastTs: {}, _avg: {}, _sourceBuckets: {}, _activitySummary: null,
        _energyObservedMs: 0,
      };
      days.set(key, d);
    }
    return d;
  };

  const truthyMetadata = (metadata, keys) => keys.some((key) => {
    const value = String(metadata?.[key] ?? '').trim().toLowerCase();
    return value === '1' || value === 'true' || value === 'yes';
  });

  const sourceRank = (source, device, userEntered) => {
    if (explicitPriority.has(source)) return 2000000 + explicitPriority.get(source);
    if (userEntered) return 1500000;
    const text = `${source} ${device}`.toLowerCase();
    if (/apple watch|watch\d*,\d*|watch/.test(text)) return 400;
    if (/iphone/.test(text)) return 300;
    if (/health auto export|apple health|健康/.test(text)) return 250;
    return source === '未知来源' ? 0 : 100;
  };

  const noteSource = ({ source, sourceVersion = '', device = '', creationDate = '', type = '',
    userEntered = false }) => {
    let stat = sourceStats.get(source);
    if (!stat) {
      stat = {
        sourceName: source, records: 0, userEnteredRecords: 0, selectedBuckets: 0,
        droppedBuckets: 0, sourceVersions: new Set(), devices: new Set(), types: new Set(),
        firstCreationDate: null, lastCreationDate: null,
      };
      sourceStats.set(source, stat);
    }
    stat.records += 1;
    if (userEntered) stat.userEnteredRecords += 1;
    if (sourceVersion) stat.sourceVersions.add(sourceVersion);
    if (device) stat.devices.add(device);
    if (type) stat.types.add(type);
    if (creationDate && (!stat.firstCreationDate || creationDate < stat.firstCreationDate)) stat.firstCreationDate = creationDate;
    if (creationDate && (!stat.lastCreationDate || creationDate > stat.lastCreationDate)) stat.lastCreationDate = creationDate;
    return stat;
  };

  const rememberIdentity = ({ uuid = '', externalUUID = '', fingerprint }) => {
    const normalizedUuid = String(uuid || '').trim().toLowerCase();
    const normalizedExternal = String(externalUUID || '').trim().toLowerCase();
    if (normalizedUuid || normalizedExternal) {
      const identity = normalizedUuid ? `uuid:${normalizedUuid}` : `external:${normalizedExternal}`;
      if (seenIdentifiers.has(identity)) return false;
      seenIdentifiers.add(identity);
      identityCounts[normalizedUuid ? 'uuid' : 'externalUUID'] += 1;
      return true;
    }
    if (recentFingerprints.has(fingerprint)) return false;
    recentFingerprints.add(fingerprint);
    fingerprintQueue.push(fingerprint);
    identityCounts.fingerprint += 1;
    // UUID/ExternalUUID 永久保留；只有无标识回退指纹使用有界窗口，避免数 GB 导出耗尽内存。
    if (fingerprintQueue.length > 100000) recentFingerprints.delete(fingerprintQueue.shift());
    return true;
  };

  /** 将跨午夜样本按真实持续时间拆到本地日；单点样本保留完整值。 */
  const intervalParts = (start, end, value) => {
    const startMs = start.date?.getTime();
    const endMs = end?.date?.getTime();
    const offset = Number.isFinite(start.offsetMinutes) ? start.offsetMinutes : 0;
    if (!(endMs > startMs) || start.dayKey === end.dayKey) {
      return [{ dayKey: start.dayKey, startMs, endMs: endMs > startMs ? endMs : startMs,
        offsetMinutes: offset, value }];
    }
    const duration = endMs - startMs;
    if (duration > 48 * 60 * 60 * 1000) {
      return [{ dayKey: start.dayKey, startMs, endMs: startMs, offsetMinutes: offset, value }];
    }
    const [y, m, d] = start.dayKey.split('-').map(Number);
    const nextMidnight = Date.UTC(y, m - 1, d + 1) - offset * 60000;
    if (!(nextMidnight > startMs && nextMidnight < endMs)) {
      return [{ dayKey: start.dayKey, startMs, endMs, offsetMinutes: offset, value }];
    }
    const firstRatio = (nextMidnight - startMs) / duration;
    return [
      { dayKey: start.dayKey, startMs, endMs: nextMidnight, offsetMinutes: offset, value: value * firstRatio },
      { dayKey: end.dayKey, startMs: nextMidnight, endMs,
        offsetMinutes: Number.isFinite(end.offsetMinutes) ? end.offsetMinutes : offset, value: value * (1 - firstRatio) },
    ];
  };

  const addBucketPart = (key, sourceInfo, part) => {
    const day = dayOf(part.dayKey);
    const bySource = day._sourceBuckets[key] || (day._sourceBuckets[key] = new Map());
    // 同一个 sourceName 可能来自新旧两台设备；不按 device 拆开会先在来源内相加，
    // 使本应参与重叠消重的两块数据再次翻倍。
    const sourceId = [sourceInfo.source, sourceInfo.device || '未知设备',
      sourceInfo.userEntered ? 'manual' : 'device'].join('\u0000');
    let entry = bySource.get(sourceId);
    if (!entry) {
      entry = {
        source: sourceInfo.source, sourceId, segments: [],
        userEntered: sourceInfo.userEntered,
        rank: sourceInfo.rank,
      };
      bySource.set(sourceId, entry);
    } else {
      entry.rank = Math.max(entry.rank, sourceInfo.rank);
    }

    entry.segments.push(part);

  };

  function processRecord(attrs = {}) {
    const {
      type, value, unit, startDate, endDate, sourceName = '', sourceVersion = '',
      device = '', creationDate = '', metadata = {},
    } = attrs;
    const meta = HEALTH_TYPES[type];
    if (!meta) {
      skipped += 1;
      unsupportedTypes.set(type || '未知类型', (unsupportedTypes.get(type || '未知类型') || 0) + 1);
      return false;
    }
    seenTypes.add(type);

    const start = parseAppleDate(startDate);
    if (!start?.dayKey) { skipped += 1; invalidRecords += 1; return false; }
    const end = parseAppleDate(endDate || startDate) || start;
    const source = String(sourceName || '未知来源').trim() || '未知来源';
    const userEntered = truthyMetadata(metadata,
      ['HKWasUserEntered', 'HKMetadataKeyWasUserEntered', 'WasUserEntered']);
    const uuid = attrs.uuid || attrs.UUID || '';
    const externalUUID = metadata.HKExternalUUID || metadata.HKMetadataKeyExternalUUID
      || metadata.ExternalUUID || '';
    const fingerprint = [type, value, unit, startDate, endDate || startDate, source, sourceVersion,
      device, creationDate].join('|');
    if (!rememberIdentity({ uuid, externalUUID: externalUUID ? `${type}:${externalUUID}` : '', fingerprint })) {
      duplicateRecords += 1;
      return false;
    }

    if (meta.agg === 'sleep') {
      if (!SLEEP_ASLEEP.test(String(value))) return false;
      if (!start.date || !end?.date) { skipped += 1; invalidRecords += 1; return false; }
      const minutes = (end.date - start.date) / 60000;
      if (!(minutes > 0) || minutes > 24 * 60) { skipped += 1; invalidRecords += 1; return false; }
      sleepIntervals.push({
        start: start.date.getTime(), end: end.date.getTime(), wakeDay: end.dayKey,
        source, uuid: uuid || null, externalUUID: externalUUID || null,
      });
      sleepWakeDays.add(end.dayKey);
      noteSource({ source, sourceVersion, device, creationDate, type, userEntered });
      recordCount += 1;
      return true;
    }

    const v = normalizeValue(meta.kind, value, unit, { percentFormat: 'ratio' });
    if (v == null || !isPlausibleHealthValue(meta.key, v)) {
      skipped += 1; invalid({ field: meta.key, value, unit, date: startDate, source, reason: v == null ? '单位或数值无效' : '超出应用检查范围' }); return false;
    }
    const rank = sourceRank(source, device, userEntered);
    noteSource({ source, sourceVersion, device, creationDate, type, userEntered });
    recordCount += 1;

    if (meta.agg === 'sum') {
      for (const part of intervalParts(start, end, v)) {
        if (ENERGY_OBSERVATION_KEYS.has(meta.key)) {
          const day = dayOf(part.dayKey);
          day._energyObservedMs = Math.max(day._energyObservedMs || 0, part.endMs || part.startMs || 0);
        }
        if (DEVICE_CUMULATIVE_KEYS.has(meta.key)) {
          addBucketPart(meta.key, { source, device, userEntered, rank }, part);
        } else {
          const day = dayOf(part.dayKey);
          day[meta.key] = (day[meta.key] || 0) + part.value;
        }
      }
    } else if (meta.agg === 'avg') {
      const day = dayOf(start.dayKey);
      const a = day._avg[meta.key] || (day._avg[meta.key] = { sum: 0, n: 0 });
      a.sum += v; a.n += 1;
      day[meta.key] = a.sum / a.n;
    } else {
      const day = dayOf(start.dayKey);
      const ts = start.date ? start.date.getTime() : 0;
      if (day._lastTs[meta.key] == null || ts >= day._lastTs[meta.key]) {
        day._lastTs[meta.key] = ts;
        day[meta.key] = v;
      }
    }
    return true;
  }

  /** 同步标识是可更新记录：同 type+SyncIdentifier 只在 result() 落入最高版本。 */
  function addRecord(attrs = {}) {
    const metadata = attrs.metadata || {};
    const syncIdentifier = metadata.HKMetadataKeySyncIdentifier || metadata.HKSyncIdentifier
      || metadata.SyncIdentifier || '';
    if (!syncIdentifier) return processRecord(attrs);
    const rawVersion = metadata.HKMetadataKeySyncVersion || metadata.HKSyncVersion
      || metadata.SyncVersion || 0;
    const numericVersion = Number(rawVersion);
    const version = Number.isFinite(numericVersion) ? numericVersion : 0;
    const key = `${attrs.type || '未知类型'}|${syncIdentifier}`;
    const previous = syncRecords.get(key);
    if (!previous || version > previous.version) {
      if (previous) supersededSyncRecords += 1;
      syncRecords.set(key, { version, attrs });
      const stamp = parseAppleDate(attrs.startDate);
      if (stamp?.dayKey) deferredDayKeys.add(stamp.dayKey);
      return true;
    }
    duplicateRecords += 1;
    return false;
  }

  function addActivitySummary(attrs = {}) {
    const declaredDate = /\d{4}-\d{2}-\d{2}/.exec(String(attrs.dateComponents || attrs.date || ''))?.[0];
    const stamp = parseAppleDate(declaredDate);
    if (!stamp?.dayKey) { skipped += 1; invalidRecords += 1; return false; }
    const fingerprint = ['ActivitySummary', ...Object.entries(attrs).sort().flat()].join('|');
    if (!rememberIdentity({ uuid: attrs.uuid || attrs.UUID, fingerprint })) {
      duplicateRecords += 1;
      return false;
    }
    const values = {};
    const active = normalizeValue('energy', attrs.activeEnergyBurned,
      attrs.activeEnergyBurnedUnit || 'kcal');
    const exercise = normalizeValue('time', attrs.appleExerciseTime,
      attrs.appleExerciseTimeUnit || 'min');
    const stand = Number(attrs.appleStandHours);
    if (active != null && isPlausibleHealthValue('activeEnergy', active)) values.activeEnergy = active;
    if (exercise != null && isPlausibleHealthValue('exerciseMinutes', exercise)) values.exerciseMinutes = exercise;
    if (Number.isFinite(stand) && isPlausibleHealthValue('standHours', stand)) values.standHours = stand;
    if (!Object.keys(values).length) { skipped += 1; invalidRecords += 1; return false; }
    dayOf(stamp.dayKey)._activitySummary = {
      ...values,
      goals: {
        activeEnergy: Number(attrs.activeEnergyBurnedGoal) || null,
        exerciseMinutes: Number(attrs.appleExerciseTimeGoal) || null,
        standHours: Number(attrs.appleStandHoursGoal) || null,
      },
    };
    activitySummaryDays.add(stamp.dayKey);
    activitySummaryCount += 1;
    return true;
  }

  function addWorkout(attrs = {}, metadata = {}, statistics = []) {
    const uuid = attrs.uuid || attrs.UUID || '';
    const externalUUID = metadata.HKExternalUUID || metadata.HKMetadataKeyExternalUUID
      || metadata.ExternalUUID || '';
    const fingerprint = ['Workout', attrs.workoutActivityType, attrs.startDate, attrs.endDate,
      attrs.sourceName, attrs.device, attrs.duration, attrs.totalEnergyBurned, attrs.totalDistance].join('|');
    if (!rememberIdentity({ uuid, externalUUID: externalUUID ? `Workout:${externalUUID}` : '', fingerprint })) {
      duplicateRecords += 1;
      return false;
    }
    const start = parseAppleDate(attrs.startDate);
    const end = parseAppleDate(attrs.endDate);
    if (!start?.date || !end?.date || end.date < start.date) {
      skipped += 1; invalidRecords += 1; return false;
    }
    const durationMinutes = normalizeValue('time', attrs.duration,
      attrs.durationUnit || 'min');
    const energyStatistic = statistics.find((stat) =>
      /ActiveEnergyBurned$/.test(String(stat.type || '')) && stat.sum != null);
    const distanceStatistic = statistics.find((stat) =>
      /Distance/.test(String(stat.type || '')) && stat.sum != null);
    const totalEnergy = normalizeValue('energy',
      attrs.totalEnergyBurned ?? energyStatistic?.sum,
      attrs.totalEnergyBurnedUnit || energyStatistic?.unit || 'kcal');
    const distanceKm = normalizeValue('distance',
      attrs.totalDistance ?? distanceStatistic?.sum,
      attrs.totalDistanceUnit || distanceStatistic?.unit || 'km');
    const source = String(attrs.sourceName || '未知来源').trim() || '未知来源';
    const userEntered = truthyMetadata(metadata,
      ['HKWasUserEntered', 'HKMetadataKeyWasUserEntered', 'WasUserEntered']);
    noteSource({
      source, sourceVersion: attrs.sourceVersion, device: attrs.device,
      creationDate: attrs.creationDate, type: 'Workout', userEntered,
    });
    const workout = {
      uuid: uuid || null,
      externalUUID: externalUUID || null,
      activityType: attrs.workoutActivityType || '未知锻炼',
      sourceName: source,
      sourceVersion: attrs.sourceVersion || null,
      device: attrs.device || null,
      creationDate: attrs.creationDate || null,
      startDate: attrs.startDate,
      endDate: attrs.endDate,
      durationMinutes: Number.isFinite(durationMinutes) ? Math.round(durationMinutes * 100) / 100 : null,
      totalEnergy: Number.isFinite(totalEnergy) ? Math.round(totalEnergy * 100) / 100 : null,
      distanceKm: Number.isFinite(distanceKm) ? Math.round(distanceKm * 1000) / 1000 : null,
      metadata: { ...metadata },
      statistics: statistics.map((stat) => ({ ...stat })),
    };
    workouts.push(workout);
    const day = dayOf(start.dayKey);
    if (!day._workouts) day._workouts = [];
    day._workouts.push(workout);
    return true;
  }

  function setExportMetadata(kind, attrs = {}) {
    if (kind === 'ExportDate') exportMetadata.exportDate = { ...attrs };
    else if (kind === 'Me') exportMetadata.me = { ...attrs };
  }

  function addUnsupportedElement(kind, unknown = false) {
    unsupportedElements.set(kind, (unsupportedElements.get(kind) || 0) + 1);
    if (unknown) {
      unknownTopLevelElements.set(kind, (unknownTopLevelElements.get(kind) || 0) + 1);
    }
  }

  function markDocumentComplete() {
    documentComplete = true;
  }

  function markDocumentStart() {
    documentStarted = true;
  }

  function finishDocument(tail = '') {
    const finalTail = String(tail);
    const closingAt = finalTail.lastIndexOf('</HealthData>');
    documentComplete = documentStarted && closingAt >= 0
      && finalTail.slice(closingAt + '</HealthData>'.length).trim() === '';
    const unfinishedKnownTag = /<[A-Za-z_][\w:.-]*\b[^>]*$/
      .test(finalTail);
    // feedXmlChunk 会消费所有完整顶层元素；闭合根标签前若还残留非空文本，
    // 就代表有未知/已知容器尚未闭合，绝不能把它当成可删除旧数据的完整快照。
    const unconsumedBeforeRootClose = closingAt >= 0
      && finalTail.slice(0, closingAt).trim() !== '';
    truncatedXml = unfinishedKnownTag || unconsumedBeforeRootClose || !documentComplete;
  }

  function result() {
    if (!syncFlushed) {
      syncFlushed = true;
      for (const { attrs } of syncRecords.values()) processRecord(attrs);
    }
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

    const droppedOverlapByMetric = {};
    let overlapBuckets = 0;
    const multiSourceMetrics = new Set();
    const out = [];
    const allKeys = new Set([...days.keys(), ...sleepByDay.keys()]);
    for (const key of allKeys) {
      const day = days.get(key) || {
        date: key, _sourceBuckets: {}, _activitySummary: null, _energyObservedMs: 0,
      };
      const clean = { date: key, source: 'apple' };
      for (const [k, v] of Object.entries(day)) {
        if (k.startsWith('_') || k === 'date') continue;
        clean[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
      }
      for (const [metricKey, bySource] of Object.entries(day._sourceBuckets || {})) {
        const combined = coordinateIntervals([...bySource.values()]);
        clean[metricKey] = Math.round(combined.total * 100) / 100;
        overlapBuckets += combined.overlaps;
        if (combined.dropped) droppedOverlapByMetric[metricKey] = (droppedOverlapByMetric[metricKey] || 0) + combined.dropped;
        if (combined.overlaps) multiSourceMetrics.add(key + '|' + metricKey);
        for (const source of combined.sources) sourceStats.get(source).selectedBuckets += 1;
        if (ENERGY_OBSERVATION_KEYS.has(metricKey) && combined.end != null) {
          const sample = [...bySource.values()][0].segments[0];
          const offset = sample.offsetMinutes * 60000;
          const [y, m, d] = key.split('-').map(Number);
          const start = Date.UTC(y, m - 1, d) - offset, end = Date.UTC(y, m - 1, d + 1) - offset;
          const exported = parseAppleDate(exportMetadata.exportDate?.value)?.date?.getTime() || 0;
          const complete = combined.start === start && combined.end === end && combined.coveredMs >= end - start && exported >= end;
          clean._fieldProvenance ||= {};
          clean._fieldProvenance[metricKey] = { origin: 'apple', source: combined.sources.join('、'),
            observedAt: new Date(combined.end).toISOString(), coverage: { status: complete ? 'complete' : 'partial', start: new Date(start).toISOString(), end: new Date(end).toISOString() } };
          if (metricKey === 'restingEnergy') clean.energyCoverage = clean._fieldProvenance[metricKey].coverage;
        }
      }
      const summary = day._activitySummary;
      if (summary) {
        for (const metricKey of ACTIVITY_SUMMARY_KEYS) {
          if (summary[metricKey] == null) continue;
          if (clean[metricKey] != null && Math.abs(clean[metricKey] - summary[metricKey]) > 0.01) {
            activitySummaryOverrides += 1;
          }
          clean[metricKey] = Math.round(summary[metricKey] * 100) / 100;
        }
        clean.activityGoals = summary.goals;
        if (summary.activeEnergy != null) {
          // 汇总覆盖了区间值，截止时间也必须来自汇总来源；不能沿用被替换样本的时间。
          const exportStamp = parseAppleDate(exportMetadata.exportDate?.value);
          clean._fieldProvenance ||= {};
          clean._fieldProvenance.activeEnergy = { origin: 'apple', source: 'Apple ActivitySummary',
            observedAt: exportStamp?.dayKey === key ? exportStamp.date.toISOString() : null,
            coverage: { status: 'unknown' } };
        }
      }
      // 动态预算必须按「这份累计能量覆盖到几点」外推。丢掉这个时间戳后，
      // 页面每分钟都会拿同一份旧快照除以更晚的当前时间，预算便会凭空下降。
      let energyObservedMs = day._energyObservedMs || 0;
      if (summary && exportMetadata.exportDate?.value) {
        const exported = parseAppleDate(exportMetadata.exportDate.value);
        if (exported?.dayKey === key) energyObservedMs = Math.max(energyObservedMs, exported.date?.getTime() || 0);
      }
      if ((clean.activeEnergy != null || clean.restingEnergy != null) && energyObservedMs > 0) {
        clean.energyObservedAt = new Date(energyObservedMs).toISOString();
      }
      if (clean.energyCoverage?.status === 'complete' && clean.activeEnergy != null) {
        clean._fieldProvenance.activeEnergy = { ...clean._fieldProvenance.activeEnergy,
          observedAt: clean.energyCoverage.end, coverage: clean.energyCoverage };
      }
      if (day._workouts?.length) {
        clean.workouts = day._workouts;
        clean.workoutCount = day._workouts.length;
        clean.workoutMinutes = Math.round(day._workouts.reduce(
          (sum, workout) => sum + (Number(workout.durationMinutes) || 0), 0) * 100) / 100;
        clean.workoutEnergy = Math.round(day._workouts.reduce(
          (sum, workout) => sum + (Number(workout.totalEnergy) || 0), 0) * 100) / 100;
        clean.workoutDistanceKm = Math.round(day._workouts.reduce(
          (sum, workout) => sum + (Number(workout.distanceKm) || 0), 0) * 1000) / 1000;
      }
      if (sleepByDay.has(key)) clean.sleepMinutes = Math.round(sleepByDay.get(key) * 100) / 100;
      if (Object.keys(clean).length > 2) out.push(clean);
    }
    out.sort((a, b) => (a.date < b.date ? -1 : 1));

    const sources = [...sourceStats.values()].map((stat) => ({
      sourceName: stat.sourceName,
      records: stat.records,
      userEnteredRecords: stat.userEnteredRecords,
      selectedBuckets: stat.selectedBuckets,
      droppedBuckets: stat.droppedBuckets,
      sourceVersions: [...stat.sourceVersions],
      devices: [...stat.devices],
      types: [...stat.types],
      firstCreationDate: stat.firstCreationDate,
      lastCreationDate: stat.lastCreationDate,
    })).sort((a, b) => b.records - a.records || a.sourceName.localeCompare(b.sourceName));
    const unsupported = [...unsupportedTypes.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
    const unsupportedXmlElements = [...unsupportedElements.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
    const unsupportedXmlElementCount = unsupportedXmlElements
      .reduce((sum, item) => sum + item.count, 0);
    const unknownXmlElements = [...unknownTopLevelElements.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
    const unknownXmlElementCount = unknownXmlElements.reduce((sum, item) => sum + item.count, 0);
    for (const key of Object.keys(droppedOverlapByMetric)) {
      droppedOverlapByMetric[key] = Math.round(droppedOverlapByMetric[key] * 100) / 100;
    }

    return {
      days: out,
      workouts,
      recordCount,
      skipped,
      types: [...seenTypes],
      sourceFormat: 'apple-health-export',
      // 完整闭合仍不等于“已理解整个 schema”。未来未知顶层容器可能承载支持字段，
      // 此时只能增量合并，不能因为没读懂新结构而删除旧 Apple 数据。
      fullSnapshot: documentStarted && documentComplete && !truncatedXml && unknownXmlElementCount === 0,
      snapshotFields: [...HEALTH_FIELD_KEYS],
      metadata: { ...exportMetadata, sources },
      quality: {
        duplicateRecords,
        invalidRecords, issues,
        unsupportedRecords: [...unsupportedTypes.values()].reduce((a, b) => a + b, 0),
        unsupportedTypes: unsupported,
        unsupportedXmlElements,
        unsupportedXmlElementCount,
        unknownXmlElements,
        unknownXmlElementCount,
        snapshotBlockedByUnknownElements: unknownXmlElementCount > 0,
        multiSourceDays: multiSourceMetrics.size,
        overlapBuckets,
        droppedOverlapByMetric,
        droppedOverlap: {
          buckets: overlapBuckets,
          byMetric: droppedOverlapByMetric,
          estimated: true,
        },
        sourceCoverage: sources,
        resolutionMinutes: null, resolution: 'interval-boundaries',
        estimatedOverlap: overlapBuckets > 0,
        priorityMode: explicitPriority.size ? 'explicit+inferred' : 'inferred',
        identityCounts,
        syncIdentifierRecords: syncRecords.size,
        supersededSyncRecords,
        sleepOverlapMinutes: Math.round(Math.max(0, rawSleepMinutes - unionSleepMinutes) * 10) / 10,
        activitySummaryCount,
        activitySummaryDays: activitySummaryDays.size,
        activitySummaryOverrides,
        workoutCount: workouts.length,
        documentStarted,
        documentComplete,
        truncatedXml,
      },
    };
  }

  return {
    addRecord,
    addActivitySummary,
    addWorkout,
    setExportMetadata,
    addUnsupportedElement,
    markDocumentStart,
    markDocumentComplete,
    finishDocument,
    result,
    get size() { return new Set([...days.keys(), ...sleepWakeDays, ...deferredDayKeys]).size; },
  };
}

/** 找到非自闭合元素真正对应的结束标签；同名嵌套、注释和 CDATA 都不能提前截断外层。 */
function findMatchingXmlClose(text, tagName, openingEnd) {
  let depth = 1;
  let cursor = openingEnd + 1;
  while (cursor < text.length) {
    const start = text.indexOf('<', cursor);
    if (start < 0) return null;
    if (text.startsWith('<!--', start)) {
      const end = text.indexOf('-->', start + 4);
      if (end < 0) return null;
      cursor = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', start)) {
      const end = text.indexOf(']]>', start + 9);
      if (end < 0) return null;
      cursor = end + 3;
      continue;
    }
    const end = text.indexOf('>', start + 1);
    if (end < 0) return null;
    const token = text.slice(start, end + 1);
    const closingName = /^<\/([A-Za-z_][\w:.-]*)\b/.exec(token)?.[1];
    const openingName = /^<([A-Za-z_][\w:.-]*)\b/.exec(token)?.[1];
    if (closingName === tagName) depth -= 1;
    else if (openingName === tagName && !/\/\s*>$/.test(token)) depth += 1;
    if (depth === 0) return { closeAt: start, elementEnd: end + 1 };
    cursor = end + 1;
  }
  return null;
}

/** 这些 Apple 顶层结构语义已知且与本应用支持的独立 Record/圆环字段不重叠，可安全整体略过。 */
const SAFE_SKIPPED_TOP_LEVEL_ELEMENTS = new Set([
  'Correlation', 'ClinicalRecord', 'Audiogram', 'VisionPrescription', 'Electrocardiogram',
]);

/**
 * 从 XML 文本片段中提取所有 <Record .../> 并送入聚合器。
 * 返回未处理完的尾部（可能是被截断的标签），供下一个分片拼接。
 */
export function feedXmlChunk(chunk, aggregator) {
  let searchFrom = 0;
  let consumed = 0;
  for (;;) {
    const start = chunk.indexOf('<', searchFrom);
    if (start < 0) break;

    // 注释、CDATA、处理指令与 DTD 都不是 HealthData 的子元素，必须先跨过，
    // 否则其中看起来像 <Record> 的文本会被误当成真实样本。
    if (chunk.startsWith('<!--', start)) {
      const end = chunk.indexOf('-->', start + 4);
      if (end < 0) return chunk.slice(start);
      searchFrom = end + 3;
      consumed = searchFrom;
      continue;
    }
    if (chunk.startsWith('<![CDATA[', start)) {
      const end = chunk.indexOf(']]>', start + 9);
      if (end < 0) return chunk.slice(start);
      searchFrom = end + 3;
      consumed = searchFrom;
      continue;
    }
    if (chunk.startsWith('<?', start)) {
      const end = chunk.indexOf('?>', start + 2);
      if (end < 0) return chunk.slice(start);
      searchFrom = end + 2;
      consumed = searchFrom;
      continue;
    }
    if (chunk.startsWith('<!', start)) {
      const end = chunk.indexOf('>', start + 2);
      if (end < 0) return chunk.slice(start);
      searchFrom = end + 1;
      consumed = searchFrom;
      continue;
    }

    const end = chunk.indexOf('>', start);
    if (end === -1) return chunk.slice(start); // 开始标签被切断
    if (chunk.startsWith('</', start)) {
      const closingName = /^<\/([A-Za-z_][\w:.-]*)\b/.exec(chunk.slice(start, end + 1))?.[1];
      if (closingName === 'HealthData') {
        aggregator.markDocumentComplete();
        break; // 保留根结束标签给 finishDocument 做完整性安全检查
      }
      searchFrom = end + 1;
      consumed = searchFrom;
      continue;
    }

    const tagName = /^<([A-Za-z_][\w:.-]*)\b/.exec(chunk.slice(start, end + 1))?.[1];
    if (!tagName) {
      searchFrom = start + 1;
      continue;
    }
    const opening = chunk.slice(start + tagName.length + 1, end);
    const attrs = parseAttrs(opening);
    const selfClosing = /\/\s*$/.test(opening);

    if (tagName === 'HealthData') {
      aggregator.markDocumentStart();
      searchFrom = end + 1;
      consumed = searchFrom;
      continue;
    }

    let elementEnd = end + 1;
    let body = '';
    if (!selfClosing) {
      const closing = findMatchingXmlClose(chunk, tagName, end);
      if (!closing) return chunk.slice(start); // 子元素或结束标签可能在下一片
      body = chunk.slice(end + 1, closing.closeAt);
      elementEnd = closing.elementEnd;
    }

    const metadata = {};
    const metadataRe = /<MetadataEntry\b([^>]*)\/?\s*>/g;
    let metadataMatch;
    while ((metadataMatch = metadataRe.exec(body))) {
      const entry = parseAttrs(metadataMatch[1]);
      if (entry.key) metadata[entry.key] = entry.value ?? '';
    }
    const statistics = [];
    if (tagName === 'Workout') {
      const statisticsRe = /<WorkoutStatistics\b([^>]*)\/?\s*>/g;
      let statisticsMatch;
      while ((statisticsMatch = statisticsRe.exec(body))) {
        statistics.push(parseAttrs(statisticsMatch[1]));
      }
    }

    if (tagName === 'Record') {
      aggregator.addRecord({ ...attrs, endDate: attrs.endDate || attrs.startDate, metadata });
    } else if (tagName === 'ActivitySummary') {
      aggregator.addActivitySummary(attrs);
    } else if (tagName === 'Workout') {
      aggregator.addWorkout(attrs, metadata, statistics);
    } else if (tagName === 'ExportDate' || tagName === 'Me') {
      aggregator.setExportMetadata(tagName, attrs);
    } else {
      // 未知顶层元素和 Correlation/ClinicalRecord 整体略过；其内嵌 Record 不能当顶层样本。
      aggregator.addUnsupportedElement(tagName, !SAFE_SKIPPED_TOP_LEVEL_ELEMENTS.has(tagName));
    }
    searchFrom = elementEnd;
    consumed = elementEnd;
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
  // “设置 → 导入与备份 → 备份与恢复”导出的完整应用备份也是 JSON，但不能在这里按 Apple 健康文件解析。
  // 若继续走扁平记录分支，只会因为根对象没有 date 而给出误导性的“缺少 date”提示。
  if (json?.app === 'health-diet-tracker' && Array.isArray(json.health)) {
    throw new Error('这是完整应用备份，不是 Apple 健康导出文件。请到「设置 → 导入与备份 → 备份与恢复」恢复');
  }

  const days = new Map();
  const ignored = new Set();
  let recordCount = 0;
  let skipped = 0;
  let invalidRecords = 0;
  const issues = [];
  const invalid = detail => { invalidRecords++; if (issues.length < 100) issues.push(detail); };

  const sampleTime = value => /(?:T|\s)\d{1,2}:\d{2}/.test(String(value || '')) ? (parseAppleDate(value)?.date?.getTime() || 0) : 0;
  const put = (dayKey, key, value, mode = 'sum', timestamp = 0) => {
    if (!dayKey || !isPlausibleHealthValue(key, value)) return false;
    let d = days.get(dayKey);
    if (!d) {
      d = { date: dayKey, source: 'apple', _avg: {}, _lastTs: {}, _energyObservedMs: 0 };
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
    if (ENERGY_OBSERVATION_KEYS.has(key)) {
      d._fieldProvenance ||= {};
      const prior = Date.parse(d._fieldProvenance[key]?.observedAt || '') || 0;
      d._fieldProvenance[key] = { origin: 'apple', observedAt: timestamp > 0 ? new Date(mode === 'sum' ? Math.max(prior,timestamp) : timestamp).toISOString() : null, coverage: { status: 'unknown' } };
      if (timestamp > 0) d._energyObservedMs = Math.max(d._energyObservedMs || 0, timestamp);
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
        if (norm == null || !put(stamp.dayKey, key, norm, mode, sampleTime(point.date || point.startDate || point.timestamp))) {
          skipped += 1; invalid({ field: key, value, unit: units, date: point.date || point.startDate, reason: '单位或数值无效' }); continue;
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
        if (k.startsWith('_') || k === 'energyCoverage' || /ObservedAt$/.test(k) || DATE_KEYS.has(normalizeKey(k)) || normalizeKey(k) === 'units' || /unit$/i.test(k)) continue;
        const key = resolveKey(k);
        if (!key) { ignored.add(String(k)); continue; }
        if (v == null || String(v).trim() === '') continue;
        const meta = HEALTH_BY_KEY.get(key);
        const unit = row.units?.[k] ?? row.units?.[key] ?? row[`${k}Unit`] ?? row[`${key}Unit`];
        const norm = meta ? normalizeValue(meta.kind, v, unit, { allowDefault: true }) : Number(v);
        if (norm == null || !put(dayKey, key, norm, 'last', sampleTime(row[`${key}ObservedAt`] || row.energyObservedAt || dateEntry?.[1]))) {
          skipped += 1; invalid({ field: key, value: v, unit, date: dayKey, reason: '单位或数值无效' }); continue;
        }
        accepted = true;
      }
      if (accepted) {
        const d = days.get(dayKey);
        if (row._fieldProvenance) d._fieldProvenance = { ...(d._fieldProvenance || {}), ...row._fieldProvenance };
        if (row.energyCoverage) d.energyCoverage = row.energyCoverage;
        if (row.energyObservedAt) d.energyObservedAt = row.energyObservedAt;
        recordCount += 1;
      }
    }
  }

  const out = [...days.values()].map((d) => {
    const c = {};
    for (const [k, v] of Object.entries(d)) if (!k.startsWith('_')) c[k] = v;
    if ((c.activeEnergy != null || c.restingEnergy != null) && d._energyObservedMs > 0) {
      c.energyObservedAt = new Date(d._energyObservedMs).toISOString();
    }
    for (const [k, v] of Object.entries(c)) if (typeof v === 'number') c[k] = Math.round(v * 100) / 100;
    if (d._fieldProvenance) c._fieldProvenance = d._fieldProvenance;
    if (d.energyObservedAt) c.energyObservedAt = d.energyObservedAt;
    return c;
  });
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    days: out, recordCount, skipped, types: [], ignoredKeys: [...ignored],
    quality: { invalidRecords, issues, duplicateRecords: 0, multiSourceDays: 0, sleepOverlapMinutes: 0 },
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
  const issues = [];
  const invalid = detail => { invalidRecords++; if (issues.length < 100) issues.push(detail); };
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
      if (v == null) { if (String(cells[idx]).trim()) invalid({ row: i+1, field: spec.raw, value: cells[idx], reason: '数值无效' }); return; }
      const meta = HEALTH_BY_KEY.get(spec.key);
      const norm = meta ? normalizeValue(meta.kind, v, spec.unit, { allowDefault: true }) : v;
      if (norm == null || !isPlausibleHealthValue(spec.key, norm)) {
        invalid({ row: i+1, field: spec.raw, value: cells[idx], unit: spec.unit, reason: '单位或数值无效' }); return;
      }
      current[spec.key] = norm;
      if (ENERGY_OBSERVATION_KEYS.has(spec.key)) {
        const timestamp = /(?:T|\s)\d{1,2}:\d{2}/.test(cells[dateIdx]) ? stamp.date?.toISOString() : null;
        current._fieldProvenance ||= {};
        current._fieldProvenance[spec.key] = { origin: 'apple', observedAt: timestamp, coverage: { status: 'unknown' } };
        if (!timestamp) { accepted = true; return; }
        const previous = Date.parse(current.energyObservedAt || '');
        if (!Number.isFinite(previous) || stamp.date.getTime() >= previous) {
          current.energyObservedAt = stamp.date.toISOString();
        }
      }
      accepted = true;
    });
    if (accepted) { days.set(dayKey, current); recordCount += 1; }
    else skipped += 1;
  }
  const rows = [...days.values()];
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    days: rows, recordCount, skipped, types: [], ignoredKeys: [...ignored],
    quality: { invalidRecords, issues, duplicateRecords: 0, multiSourceDays: 0, sleepOverlapMinutes: 0 },
  };
}

/* ------------------------------------------------------------------ */
/* 历史数据修复                                                          */
/* ------------------------------------------------------------------ */

/** 受单位缺陷影响的能量字段 */
export const ENERGY_FIELDS = ['activeEnergy', 'restingEnergy', 'hkKcal'];

/** 只修复明确携带旧解析器版本、原单位和原始值证据的历史字段。 */
function misscaledEnergyFields(day, today) {
  if (!day?.date || day.date >= today) return [];
  return ENERGY_FIELDS.filter(key => {
    const p = day._fieldProvenance?.[key];
    const value = Number(day[key]);
    return !day._energyRepair && p?.parserVersion === 'cal-div1000-v1' && p?.originalUnit === 'Cal'
      && p?.originalValue != null && Number(p.originalValue) === value * 1000
      && value > 0 && Number.isFinite(value) && value * 1000 <= (IMPLAUSIBLE_LIMITS[key] || 15000);
  });
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
    const fixed = { ...d, _energyRepair: { original: Object.fromEntries(ENERGY_FIELDS.filter(k => d[k] != null).map(k => [k, d[k]])), kind: 'Cal-v1' } };
    for (const key of misscaledEnergyFields(d, today)) {
      const v = Number(fixed[key]);
      if (Number.isFinite(v) && v > 0) fixed[key] = Math.round(v * 1000 * 100) / 100;
    }
    fixed._energyRepair.repaired = Object.fromEntries(Object.keys(fixed._energyRepair.original).map(k => [k, fixed[k]]));
    return fixed;
  });
}

/** 产品合理性检查上限；超过只代表可疑，不能认定普遍生理不可能。 */
export const IMPLAUSIBLE_LIMITS = {
  restingEnergy: 5000,
  activeEnergy: 8000,
  hkKcal: 15000,
  steps: 100000,
  exerciseMinutes: 1440,
  sleepMinutes: 1440,
};

/** 列出超出检查范围的字段，供显示、排除与人工核对。 */
export function implausibleFields(day = {}) {
  return Object.keys(IMPLAUSIBLE_LIMITS).filter((k) => {
    const v = Number(day[k]);
    return day[k] != null && day[k] !== '' && (!Number.isFinite(v) || v < 0 || v > IMPLAUSIBLE_LIMITS[k]);
  });
}

export function findImplausibleDays(days = []) {
  return days.filter((d) => implausibleFields(d).length > 0);
}

/** 标记排除，不清除原值。核对后可重新导入或补录。 */
export function clearImplausibleValues(days = []) {
  return findImplausibleDays(days).map((d) => {
    const fixed = { ...d };
    fixed._excludedFields = [...new Set([...(d._excludedFields || []), ...implausibleFields(d)])];
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
  const energyDays = recent.filter(d => completeEnergyDay(d, new Date(`${today}T00:00:00`)));
  const usableEnergy = energyDays.length >= ENERGY_POLICY.minimumBaselineDays ? energyDays : [];
  const avg = (arr, key) => {
    // 上限过滤不能省：一天坏数据会顺着基线污染之后 14 天的热量预算
    const cap = IMPLAUSIBLE_LIMITS[key] ?? Infinity;
    const vals = arr
      .filter((d) => d[key] != null && String(d[key]).trim() !== '')
      .map((d) => Number(d[key]))
      .filter((v) => Number.isFinite(v) && v >= 0 && v <= cap);
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

  /*
   * 摄入均值只能按「真正记了饮食的天数」算，而且必须把这个天数报出去。
   *
   * dietDays 里只有留下过记录的日子——没记的那天根本不在数组里，不是 0 kcal。
   * 原先把分母写成 max(健康天数, 饮食天数)，于是只记了 1 天的人会看到
   * 「近 14 天平均低于目标 3168 kcal/天，相当于每周 2.88 kg 脂肪赤字」，
   * 那 13 天并不是饿着，只是没记。这个结论是凭空造出来的。
   *
   * 现在均值与天数一起返回，谁用谁负责说清楚样本有多大。
   */
  const dietRecent = [...dietDays]
    .filter((d) => Number.isFinite(dayNumber(d.date))
      && d.date < today && dayNumber(d.date) >= todayNo - window)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const nutrientDays = (key) => dietRecent.filter(d => d.coverage?.[key]?.complete !== false
    && ['number', 'string'].includes(typeof d[key]) && String(d[key]).trim() !== ''
    && Number.isFinite(Number(d[key])) && Number(d[key]) >= 0);
  const kcalDays = nutrientDays('kcal'), proteinDays = nutrientDays('protein');
  const mean = (rows, key) => rows.length ? rows.reduce((sum, d) => sum + Number(d[key]) / rows.length, 0) : null;
  const loggedDays = kcalDays.length;
  const kcalIntake = mean(kcalDays, 'kcal');
  const proteinIntake = mean(proteinDays, 'protein');

  return {
    days: Math.max(recent.length, loggedDays),
    healthDaysCounted: recent.length,
    // 摄入类结论的真实分母：有饮食记录的天数，和上面那个 days 不是一回事
    loggedDays,
    proteinLoggedDays: proteinDays.length,
    windowDays: window,
    energyPairedDays: energyDays.length,
    activeEnergy: avg(usableEnergy, 'activeEnergy'),
    restingEnergy: avg(usableEnergy, 'restingEnergy'),
    steps: avg(recent, 'steps'),
    sleepMinutes: avg(recent, 'sleepMinutes'),
    weightTrend,
    latestWeight: weights.length ? weights[weights.length - 1].w : null,
    kcalIntake: kcalIntake != null ? Math.round(kcalIntake) : null,
    proteinIntake: proteinIntake != null ? Math.round(proteinIntake) : null,
  };
}
