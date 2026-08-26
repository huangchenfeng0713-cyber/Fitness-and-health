import { isPlausibleHealthValue } from './health.js';

/** Supabase 每日健康行与本地健康字段之间唯一的映射表。 */
export const CLOUD_HEALTH_FIELD_MAP = Object.freeze({
  steps: 'steps',
  active_energy: 'activeEnergy',
  resting_energy: 'restingEnergy',
  exercise_minutes: 'exerciseMinutes',
  stand_minutes: 'standMinutes',
  distance_km: 'distanceKm',
  sleep_minutes: 'sleepMinutes',
  water_ml: 'waterMl',
  weight_kg: 'weightKg',
  body_fat_pct: 'bodyFatPct',
  resting_hr: 'restingHR',
  vo2max: 'vo2max',
});

/** Each server field has an independent cursor so a partial upload cannot
 * replay preserved values from other fields over a newer local Apple import. */
export const CLOUD_HEALTH_CURSOR_MAP = Object.freeze({
  steps: 'steps_captured_at',
  activeEnergy: 'active_energy_captured_at',
  restingEnergy: 'resting_energy_captured_at',
  exerciseMinutes: 'exercise_minutes_captured_at',
  standMinutes: 'stand_minutes_captured_at',
  distanceKm: 'distance_km_captured_at',
  sleepMinutes: 'sleep_minutes_captured_at',
  waterMl: 'water_ml_captured_at',
  weightKg: 'weight_measured_at',
  bodyFatPct: 'body_fat_measured_at',
  restingHR: 'resting_hr_measured_at',
  vo2max: 'vo2max_measured_at',
});

export const CLOUD_HEALTH_SELECT = [
  'date', 'captured_at', 'cumulative_captured_at', 'timezone', 'source', 'device_id',
  ...Object.keys(CLOUD_HEALTH_FIELD_MAP),
  ...new Set(Object.values(CLOUD_HEALTH_CURSOR_MAP)),
  'updated_at',
].join(',');

/** Deployment-order fallback for a v1.6.3 database while v1.6.4 SQL is pending. */
export const CLOUD_HEALTH_LEGACY_SELECT = [
  'date', 'captured_at', 'cumulative_captured_at', 'timezone', 'source', 'device_id',
  ...Object.keys(CLOUD_HEALTH_FIELD_MAP),
  'weight_measured_at', 'body_fat_measured_at',
  'resting_hr_measured_at', 'vo2max_measured_at', 'updated_at',
].join(',');

const CLOUD_HEALTH_KEYS = new Set(Object.values(CLOUD_HEALTH_FIELD_MAP));

function validDay(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function validInstant(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** 把账号里的每日行转换成现有 store 能增量合并的 Apple 健康行。 */
export function cloudHealthRowToDay(row = {}) {
  if (!validDay(row.date)) return null;
  const day = { date: row.date, source: 'apple' };
  const fieldCursors = {};
  const fieldValues = {};
  const capturedAt = validInstant(row.captured_at);
  const cumulativeCapturedAt = validInstant(row.cumulative_captured_at) || capturedAt;
  const hasIndependentCursors = Object.values(CLOUD_HEALTH_CURSOR_MAP)
    .filter((column) => column.endsWith('_captured_at'))
    .some((column) => Object.hasOwn(row, column));
  for (const [column, key] of Object.entries(CLOUD_HEALTH_FIELD_MAP)) {
    if (row[column] == null || row[column] === '') continue;
    const value = Number(row[column]);
    if (!isPlausibleHealthValue(key, value)) continue;
    day[key] = value;
    fieldValues[key] = value;
    const cursorColumn = CLOUD_HEALTH_CURSOR_MAP[key];
    const cursor = validInstant(row[cursorColumn])
      || (cursorColumn.endsWith('_captured_at') ? cumulativeCapturedAt : capturedAt);
    if (cursor) fieldCursors[key] = cursor;
  }
  const energyCursors = ['activeEnergy', 'restingEnergy']
    .map((key) => fieldCursors[key]).filter(Boolean).map(Date.parse).filter(Number.isFinite);
  if (energyCursors.length) {
    // Use the older of the two coverage times so dynamic TDEE never assumes
    // both energy totals are current merely because one field was refreshed.
    day.energyObservedAt = new Date(Math.min(...energyCursors)).toISOString();
  }
  day._cloudHealthSync = {
    schemaVersion: hasIndependentCursors ? 2 : 1,
    capturedAt,
    updatedAt: validInstant(row.updated_at) || capturedAt,
    deviceId: row.device_id || null,
    source: row.source || 'apple_shortcuts',
    fieldCursors,
    fieldValues,
  };
  return Object.keys(day).some((key) => CLOUD_HEALTH_KEYS.has(key)) ? day : null;
}

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 只返回比本地已落地版本更新的云端行，避免每次轮询都把整份快照标脏。 */
export function newerCloudHealthDays(rows = [], localDays = []) {
  const localByDate = new Map(localDays.map((day) => [day.date, day]));
  return rows.map(cloudHealthRowToDay).filter(Boolean).map((day) => {
    const local = localByDate.get(day.date);
    if (!local?._cloudHealthSync) return day;
    const remoteUpdated = timestamp(day._cloudHealthSync.updatedAt || day._cloudHealthSync.capturedAt);
    const localUpdated = timestamp(local._cloudHealthSync.updatedAt || local._cloudHealthSync.capturedAt);
    if (remoteUpdated <= localUpdated) return null;

    const patch = {
      date: day.date,
      source: 'apple',
      _cloudHealthSync: day._cloudHealthSync,
    };
    let energyChanged = false;
    for (const key of CLOUD_HEALTH_KEYS) {
      if (day[key] == null) continue;
      const remoteCursor = timestamp(day._cloudHealthSync.fieldCursors?.[key]);
      const legacyCursor = local._cloudHealthSync.schemaVersion >= 2
        ? 0 : timestamp(local.energyObservedAt || local._cloudHealthSync.capturedAt);
      const localCursor = timestamp(local._cloudHealthSync.fieldCursors?.[key]) || legacyCursor;
      const previousRemoteValue = local._cloudHealthSync.fieldValues?.[key];
      const cursorAdvanced = remoteCursor > localCursor;
      const correctedAtSameTime = remoteCursor > 0 && remoteCursor === localCursor
        && previousRemoteValue != null && day[key] !== previousRemoteValue;
      if (!cursorAdvanced && !correctedAtSameTime) continue;
      patch[key] = day[key];
      if (key === 'activeEnergy' || key === 'restingEnergy') energyChanged = true;
    }
    if (energyChanged && day.energyObservedAt) patch.energyObservedAt = day.energyObservedAt;
    return patch;
  }).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function cloudHealthRange(rows = []) {
  const dates = rows.map((row) => String(row?.date || '')).filter(validDay).sort();
  return dates.length ? [dates[0], dates.at(-1)] : null;
}
