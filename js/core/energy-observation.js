/** Shared observation contract. Limits and freshness are product checks, not diagnoses. */
import { todayKey, shiftDay } from './day.js';

export const ENERGY_POLICY = Object.freeze({ staleMinutes: 120, alignmentMinutes: 5, minimumBaselineDays: 3,
  /*
   * 老行反推覆盖范围时，「够到这一天的末尾」允许差这么多分钟。
   *
   * 它不是一个生理量，是护栏：最后一段样本不一定正好压在零点上，
   * 而真正要拦的那种截断（同步停在早上八点）离这个窗口有十几个小时，
   * 差一小时的基础代谢大约 70 kcal，远在设备估算误差里。
   */
  legacyTailMinutes: 60 });
export const ENERGY_LIMITS = Object.freeze({ restingEnergy: 5000, activeEnergy: 8000 });
export const presentNumber = v => ['number', 'string'].includes(typeof v) && String(v).trim() !== '' && Number.isFinite(Number(v));

/*
 * 3.15.0 之前存下的那些行没有 _fieldProvenance / energyCoverage —— 那时候还没有这两个字段。
 *
 * **「没有声明」不等于「声明了不完整」。** 只认显式的 `coverage.status === 'complete'`
 * 的话，用户之前所有的每日消耗记录会一次性作废：历史日一律判成 unknown-coverage，
 * 当日收支、趋势图、近 7 日、14 天基线全部变空 —— 而那些数字一直好好地躺在
 * IndexedDB 里，一条都没少。实测：一整批老数据里，「最后一个样本正好结束于次日零点」
 * 的完整一天，和「只同步到早上八点」的残缺一天，被同等地判成不可用。
 * 判据分不出这两者，说明它拦的不是残缺，是「没有元数据」。
 *
 * 老行本来就带着证据：`energyObservedAt` 在旧聚合器里就是
 * 「当天最后一个样本结束于几点」（`Math.max(part.endMs)`）。完整的一天它落在次日零点，
 * 停在早上八点的那种它就写着八点。所以按这个时间戳反推覆盖范围 ——
 * 不凭空信任，也不因为缺一个当年还不存在的字段就把人的历史抹掉。
 */
function legacyCoverage(time, start, end) {
  const wholeDay = { status: 'complete', start: new Date(start).toISOString(), end: new Date(end).toISOString() };
  const tail = ENERGY_POLICY.legacyTailMinutes * 60000;
  // 没有时间戳，或者时间戳就是这一天本身（来源只给了日期、没给钟点）：
  // 拿不到「停在几点」这个信息，而那一行本来就是按天汇总出来的一天总量。
  if (!Number.isFinite(time) || time === start) return wholeDay;
  // 时间戳压根不落在这一天里：它说明不了这一天覆盖到哪儿，这行自相矛盾，不猜。
  if (time < start || time > end + tail) return null;
  return time >= end - tail ? wholeDay : { status: 'partial' };
}

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
    const declared = provenance?.coverage || row.energyCoverage;
    // 只有历史日才反推：今天这一行按定义就还没走完，该由下面的过期 / 缺截止时间那几档说话
    const inferred = !declared && dateMode === 'historical' ? legacyCoverage(time, start, end) : null;
    const coverage = declared || inferred;
    // 反推出来的「完整」，它的截止时间就是这一天的结束（老行的最后一个样本不一定压在零点上）
    const reach = inferred?.status === 'complete' ? end : time;
    // A file export or upload finishing does not establish a complete natural day.
    const complete = natural && coverage?.status === 'complete' && Date.parse(coverage.start) === start
      && Date.parse(coverage.end) === end && end > start
      && Number.isFinite(reach) && reach >= end && end <= now.getTime();
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
  /*
   * 两项都覆盖了同一个完整日时，「截止时间对不对得齐」这个问题本身就不成立 ——
   * 它们都走到了这一天的末尾。老行两项共用一个 energyObservedAt（甚至一个都没有），
   * 只按时间戳判的话，一整天的记录会卡在「两项截止时间待对齐」上出不来。
   */
  const aligned = list.every(f => f.complete)
    || (list.every(f => f.observedAt) && Math.abs(Date.parse(list[0].observedAt) - Date.parse(list[1].observedAt)) <= ENERGY_POLICY.alignmentMinutes * 60000);
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
