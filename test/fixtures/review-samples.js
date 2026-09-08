/** Fixed synthetic records. Never load real health data into tests. */
export function completeRow(row) {
  const start = new Date(row.date + 'T00:00:00+08:00');
  const end = new Date(start.getTime() + 86400000);
  return { ...row, energyObservedAt: end.toISOString(), energyCoverage: { status: 'complete', start: start.toISOString(), end: end.toISOString() } };
}
export function oldCalEvidence(row, keys = ['restingEnergy','activeEnergy','hkKcal']) {
  return { ...row, _fieldProvenance: Object.fromEntries(keys.filter(k => row[k] != null).map(k => [k, { parserVersion: 'cal-div1000-v1', originalUnit: 'Cal', originalValue: row[k] * 1000 }])) };
}
