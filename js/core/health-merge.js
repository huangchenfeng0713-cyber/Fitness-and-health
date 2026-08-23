import { HEALTH_FIELD_KEYS } from './health.js';

/**
 * 持久化在每日健康行里的 Apple 字段。
 * 完整 export.xml 是这些字段的快照：下一次完整导入里消失的 Apple 字段也必须删除，
 * 否则用户已经在「健康」App 删除的样本会永远残留在本应用。
 */
export const APPLE_HEALTH_FIELDS = new Set([
  ...HEALTH_FIELD_KEYS,
  'workoutCount',
  'workoutMinutes',
  'workoutEnergy',
  'workoutDistanceKm',
  'workouts',
  'activityGoals',
]);

const metaKeys = new Set(['date', 'source', '_fieldProvenance', '_importQuality']);

/** 格式名称不能证明文件完整；只有解析器明确给出的布尔标记才允许删除旧 Apple 数据。 */
export function isCompleteAppleSnapshot(meta = {}) {
  return meta.fullSnapshot === true;
}

function originOf(row, key) {
  const explicit = row?._fieldProvenance?.[key]?.origin;
  if (explicit) return explicit;
  // 兼容早期没有字段级 provenance 的每日记录。
  if (row?.source === 'apple' && APPLE_HEALTH_FIELDS.has(key)) return 'apple';
  if (row?.source === 'manual' && APPLE_HEALTH_FIELDS.has(key)) return 'manual';
  return null;
}

function dataKeys(row) {
  return Object.keys(row || {}).filter((key) => !metaKeys.has(key) && row[key] != null);
}

function sourceLabel(row) {
  const origins = new Set(dataKeys(row).map((key) => originOf(row, key)).filter(Boolean));
  if (origins.size > 1) return 'mixed';
  if (origins.has('manual')) return 'manual';
  if (origins.has('apple')) return 'apple';
  return row.source || 'apple';
}

/** 为解析器产出的 Apple 字段补齐字段级 provenance。 */
export function stampAppleRow(row, importId = null) {
  const provenance = { ...(row?._fieldProvenance || {}) };
  for (const key of dataKeys(row)) {
    if (!APPLE_HEALTH_FIELDS.has(key)) continue;
    provenance[key] = {
      ...(provenance[key] || {}),
      origin: 'apple',
      ...(importId ? { importId } : {}),
    };
  }
  return { ...row, source: 'apple', _fieldProvenance: provenance };
}

/** 手动补录某些字段时只改变这些字段的来源，不抹掉同一天的 Apple 字段。 */
export function stampManualPatch(existing, patch) {
  const provenance = { ...(existing?._fieldProvenance || {}) };
  for (const key of dataKeys(patch)) {
    if (APPLE_HEALTH_FIELDS.has(key)) provenance[key] = { origin: 'manual' };
  }
  const row = { ...existing, ...patch, _fieldProvenance: provenance };
  return { ...row, source: sourceLabel(row) };
}

function stripAppleFields(row) {
  const clean = { ...row, _fieldProvenance: { ...(row?._fieldProvenance || {}) } };
  for (const key of APPLE_HEALTH_FIELDS) {
    if (originOf(row, key) !== 'apple') continue;
    delete clean[key];
    delete clean._fieldProvenance[key];
  }
  return clean;
}

function hasMeaningfulData(row) {
  return dataKeys(row).some((key) => row[key] != null);
}

/**
 * 把官方完整导出作为 Apple 字段的全量快照应用。
 * 返回完整 upsert 行和需要删除的日期；调用方可在一个 IndexedDB 事务里落盘。
 */
export function replaceAppleSnapshotRows(existingRows = [], incomingRows = [], importId = null) {
  const existing = new Map(existingRows.map((row) => [row.date, row]));
  const incoming = new Map(incomingRows.map((row) => [row.date, stampAppleRow(row, importId)]));
  const dates = new Set([...existing.keys(), ...incoming.keys()]);
  const upserts = [];
  const deletes = [];

  for (const date of dates) {
    const base = stripAppleFields(existing.get(date) || { date });
    const fresh = incoming.get(date);
    const merged = { ...base, date, _fieldProvenance: { ...(base._fieldProvenance || {}) } };
    for (const key of dataKeys(fresh)) {
      // 手动补录是用户明确选择的值；完整导出只替换 Apple 来源字段。
      if (originOf(base, key) === 'manual') continue;
      merged[key] = fresh[key];
      if (fresh._fieldProvenance?.[key]) merged._fieldProvenance[key] = fresh._fieldProvenance[key];
    }
    if (!hasMeaningfulData(merged)) {
      deletes.push(date);
      continue;
    }
    merged.source = sourceLabel(merged);
    upserts.push(merged);
  }

  upserts.sort((a, b) => (a.date < b.date ? -1 : 1));
  deletes.sort();
  return { upserts, deletes };
}

/** 快捷指令/JSON/CSV 属于增量导入，只覆盖本次实际提供的 Apple 字段。 */
export function mergeApplePartialRows(existingRows = [], incomingRows = [], importId = null) {
  const byDate = new Map(existingRows.map((row) => [row.date, { ...row }]));
  for (const raw of incomingRows) {
    const fresh = stampAppleRow(raw, importId);
    const base = byDate.get(raw.date) || { date: raw.date };
    const merged = { ...base, _fieldProvenance: { ...(base._fieldProvenance || {}) } };
    for (const key of dataKeys(fresh)) {
      if (originOf(base, key) === 'manual') continue;
      merged[key] = fresh[key];
      if (fresh._fieldProvenance?.[key]) merged._fieldProvenance[key] = fresh._fieldProvenance[key];
    }
    merged.source = sourceLabel(merged);
    byDate.set(raw.date, merged);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
