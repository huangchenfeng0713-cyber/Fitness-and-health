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
  'energyObservedAt', 'energyCoverage', 'activeEnergyObservedAt', 'restingEnergyObservedAt',
]);

const metaKeys = new Set(['date', 'source', '_fieldProvenance', '_importQuality']);

/** 格式名称不能证明文件完整；只有解析器明确给出的布尔标记才允许删除旧 Apple 数据。 */
export function isCompleteAppleSnapshot(meta = {}) {
  return meta.fullSnapshot === true;
}

function originOf(row, key) {
  const explicit = row?._fieldProvenance?.[key]?.origin;
  if (explicit) return explicit;
  // 旧记录只有整行来源；未填写的字段不能因此被视作手动覆盖。
  if (row?.[key] != null && row.source === 'apple' && APPLE_HEALTH_FIELDS.has(key)) return 'apple';
  if (row?.[key] != null && row.source === 'manual' && APPLE_HEALTH_FIELDS.has(key)) return 'manual';
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
      observedAt: provenance[key] && Object.hasOwn(provenance[key], 'observedAt') ? provenance[key].observedAt : row._cloudHealthSync?.fieldCursors?.[key] || row[`${key}ObservedAt`] || row.energyObservedAt || null,
      coverage: provenance[key]?.coverage || row.energyCoverage || { status: 'unknown' },
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
    if (APPLE_HEALTH_FIELDS.has(key)) provenance[key] = { origin: 'manual', observedAt: patch[`${key}ObservedAt`] || null, coverage: patch.energyCoverage || { status: 'unknown' } };
    if (key === 'activeEnergy' || key === 'restingEnergy') { provenance[key].observedAt = patch[`${key}ObservedAt`] || patch.energyObservedAt || null; }
  }
  const row = { ...existing, ...patch, _fieldProvenance: provenance };
  return { ...row, source: sourceLabel(row) };
}

function stripAppleFields(row, fields = APPLE_HEALTH_FIELDS) {
  const clean = { ...row, _fieldProvenance: { ...(row?._fieldProvenance || {}) } };
  for (const key of fields) {
    if (originOf(row, key) !== 'apple') continue;
    delete clean[key];
    delete clean._fieldProvenance[key];
  }
  return clean;
}

/**
 * 这份「完整导出」到底证明了什么。
 *
 * **快照只能删掉它拿得出证据的东西。** 原先 `replaceAppleSnapshotRows` 把
 * `fullSnapshot: true` 当成「这份文件说完了全部事实」，于是凡是它没提到的日期
 * 整行删除、没带的字段逐个抹掉。可解析器给不给得出某一天、某一项，取决于
 * 文件有多大、读没读完、重叠去重丢了哪些桶、来源优先级筛掉了谁 ——
 * **「这一项我没解析出来」和「用户在健康 App 里删掉了它」在数据上长得一模一样。**
 * 实测（`test/health-merge.test.js` 三条）：导出只覆盖最近 10 天，另外 20 天连行
 * 一起删；导出覆盖 30 天但静息能量一项都没解析出来，30 天的消耗全被抹平；
 * 一天都没解析出来时 30 天全删 —— 三种都不报一个字。
 *
 * 所以证据分两种，各管一维：
 *  - **日期**：导出自己覆盖到的那一段。这一段之外它什么都没说，不许动。
 *    Apple 的 export.xml 大体按时间排，截断只会砍掉尾巴，
 *    于是「读到一半停了」最多影响它真读到的那一段。
 *  - **字段**：整份导出里至少出现过一次的那些 Apple 字段。
 *    一次都没出现的，是解析器没给，不是用户删了。
 *
 * 代价是「用户把健康 App 里某一项**全部**样本都删了」不再传导过来
 * （只删了其中几天仍然照删）。这个代价是故意选的：**多留一个旧值，用户看得见、
 * 删得掉；少删几年记录，用户既看不见也找不回。**
 */
export function snapshotAuthority(incomingRows = []) {
  const dates = incomingRows
    .map((row) => row?.date)
    .filter((date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  const fields = new Set();
  for (const row of incomingRows) {
    for (const key of dataKeys(row)) if (APPLE_HEALTH_FIELDS.has(key)) fields.add(key);
  }
  return { from: dates[0] || null, to: dates[dates.length - 1] || null, fields };
}

function hasMeaningfulData(row) {
  return dataKeys(row).some((key) => row[key] != null);
}

/**
 * 把官方完整导出作为 Apple 字段的全量快照应用。
 * 返回完整 upsert 行和需要删除的日期；调用方可在一个 IndexedDB 事务里落盘。
 *
 * 快照的权威范围由 `snapshotAuthority` 划定（见那儿的长注释）：**范围之外一行不碰**，
 * 连 upsert 都不给 —— `bulkSync` 只写它拿到的、只删它被告知的，没提到的原样躺着。
 * 返回值里另外报一份 `untouched`，让界面说得出「这次没动多少天」。
 */
export function replaceAppleSnapshotRows(existingRows = [], incomingRows = [], importId = null) {
  const authority = snapshotAuthority(incomingRows);
  const existing = new Map(existingRows.map((row) => [row.date, row]));
  const incoming = new Map(incomingRows.map((row) => [row.date, stampAppleRow(row, importId)]));
  const dates = new Set([...existing.keys(), ...incoming.keys()]);
  const upserts = [];
  const deletes = [];
  let untouched = 0;

  for (const date of dates) {
    const covered = authority.from != null && date >= authority.from && date <= authority.to;
    if (!covered) { untouched += 1; continue; }
    const base = stripAppleFields(existing.get(date) || { date }, authority.fields);
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
  return { upserts, deletes, untouched, authority };
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
