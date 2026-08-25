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

export const CLOUD_HEALTH_SELECT = [
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
  for (const [column, key] of Object.entries(CLOUD_HEALTH_FIELD_MAP)) {
    if (row[column] == null || row[column] === '') continue;
    const value = Number(row[column]);
    if (isPlausibleHealthValue(key, value)) day[key] = value;
  }
  const capturedAt = validInstant(row.captured_at);
  const cumulativeCapturedAt = validInstant(row.cumulative_captured_at) || capturedAt;
  if (cumulativeCapturedAt && (day.activeEnergy != null || day.restingEnergy != null)) {
    day.energyObservedAt = cumulativeCapturedAt;
  }
  day._cloudHealthSync = {
    schemaVersion: 1,
    capturedAt,
    updatedAt: validInstant(row.updated_at) || capturedAt,
    deviceId: row.device_id || null,
    source: row.source || 'apple_shortcuts',
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
  return rows.map(cloudHealthRowToDay).filter(Boolean).filter((day) => {
    const local = localByDate.get(day.date);
    if (!local?._cloudHealthSync) return true;
    const remoteUpdated = timestamp(day._cloudHealthSync.updatedAt || day._cloudHealthSync.capturedAt);
    const localUpdated = timestamp(local._cloudHealthSync.updatedAt || local._cloudHealthSync.capturedAt);
    return remoteUpdated > localUpdated;
  }).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function cloudHealthRange(rows = []) {
  const dates = rows.map((row) => String(row?.date || '')).filter(validDay).sort();
  return dates.length ? [dates[0], dates.at(-1)] : null;
}
