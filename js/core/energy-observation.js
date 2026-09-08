/** Shared observation contract. Limits and freshness are product checks, not diagnoses. */
import { todayKey, shiftDay } from './day.js';

export const ENERGY_POLICY = Object.freeze({ staleMinutes: 120, alignmentMinutes: 5, minimumBaselineDays: 3 });
export const ENERGY_LIMITS = Object.freeze({ restingEnergy: 5000, activeEnergy: 8000 });
export const presentNumber = v => ['number', 'string'].includes(typeof v) && String(v).trim() !== '' && Number.isFinite(Number(v));

function bounds(row, day) {
  const coverage = row.energyCoverage;
  const start = Date.parse(coverage?.start || `${day}T00:00:00`);
  const end = Date.parse(coverage?.end || `${shiftDay(day, 1)}T00:00:00`);
  const expected = Date.parse(day + 'T00:00:00Z');
  const duration = end - start;
  const natural = Number.isFinite(expected) && duration >= 23 * 3600000 && duration <= 25 * 3600000
    && start >= expected - 14 * 3600000 && start <= expected + 12 * 3600000;
  return { start, end, natural };
}

export function energyObservation(row = {}, day = row.date, now = new Date()) {
  const dateMode = day === todayKey(now) ? 'today' : day < todayKey(now) ? 'historical' : 'future';
  const { start, end, natural } = bounds(row, day);
  const fields = {};
  for (const key of Object.keys(ENERGY_LIMITS)) {
    const raw = row[key];
    const provenance = row._fieldProvenance?.[key];
    const stamp = provenance && Object.hasOwn(provenance, 'observedAt') ? provenance.observedAt : row._cloudHealthSync?.fieldCursors?.[key]
      || row[`${key}ObservedAt`] || row.energyObservedAt;
    const time = Date.parse(stamp || '');
    const value = presentNumber(raw) ? Number(raw) : null;
    const ageMinutes = Number.isFinite(time) ? (now.getTime() - time) / 60000 : null;
    const coverage = provenance?.coverage || row.energyCoverage;
    // A file export or upload finishing does not establish a complete natural day.
    const complete = natural && coverage?.status === 'complete' && Date.parse(coverage.start) === start
      && Date.parse(coverage.end) === end && end > start
      && Number.isFinite(time) && time >= end && end <= now.getTime();
    let status = raw == null || String(raw).trim() === '' ? 'missing'
      : value == null || value < 0 || value > ENERGY_LIMITS[key] || row._excludedFields?.includes(key) ? 'suspect'
        : dateMode === 'future' || time > now.getTime() ? 'future'
          : dateMode === 'historical' ? (complete ? 'valid' : coverage?.status === 'partial' ? 'partial' : 'unknown-coverage')
            : !Number.isFinite(time) ? 'missing-time'
              : time < start || time > end ? 'wrong-day'
                : ageMinutes >= ENERGY_POLICY.staleMinutes ? 'stale' : 'valid';
    if (status === 'valid' && dateMode === 'today' && key === 'activeEnergy'
      && value > Math.max(1, (time - start) / 60000) * 15) status = 'suspect';
    fields[key] = { raw, value, status, observedAt: Number.isFinite(time) ? new Date(time).toISOString() : null,
      ageMinutes, complete, source: provenance?.source || provenance?.origin || row._cloudHealthSync?.source || row.source || null };
  }
  const list = Object.values(fields);
  const aligned = list.every(f => f.observedAt) && Math.abs(Date.parse(list[0].observedAt) - Date.parse(list[1].observedAt)) <= ENERGY_POLICY.alignmentMinutes * 60000;
  const status = list.find(f => f.status !== 'valid')?.status || (aligned ? 'valid' : 'unaligned');
  const valid = status === 'valid';
  const observedAt = aligned ? list.map(f => f.observedAt).sort()[0] : null;
  const labels = { missing: '缺少能量字段', suspect: '能量记录可疑，暂不参与建议', future: '记录时间在未来',
    partial: '仅有部分日记录', 'unknown-coverage': '完整日覆盖未确认', 'missing-time': '缺少字段截止时间',
    'wrong-day': '字段日期不一致', stale: '能量记录已过期', unaligned: '两项截止时间待对齐' };
  return { fields, dateMode, valid, status, reason: labels[status] || '', observedAt,
    burnedNow: valid ? list.reduce((sum, f) => sum + f.value, 0) : null,
    complete: valid && list.every(f => f.complete),
    dayFraction: observedAt && end > start ? Math.min(1, Math.max(0, (Date.parse(observedAt) - start) / (end - start))) : null,
    ageMinutes: observedAt ? Math.max(...list.map(f => f.ageMinutes)) : null,
    stale: list.some(f => f.status === 'stale'), missingObservationTime: list.some(f => f.status === 'missing-time') };
}

export function completeEnergyDay(row, now = new Date()) {
  const observation = energyObservation(row, row?.date, now);
  return observation.complete ? observation : null;
}
