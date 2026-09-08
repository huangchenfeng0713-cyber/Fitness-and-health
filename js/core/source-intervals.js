/** Merge actual intervals with a sweep. Uniform distribution within a sample is a
 * product approximation; this does not reproduce Apple's private source merging. */
export function coordinateIntervals(entries = []) {
  const events = new Map();
  const at = time => { if (!events.has(time)) events.set(time, { changes: [], points: [] }); return events.get(time); };
  for (const entry of entries) for (const s of entry.segments) {
    if (![s.startMs, s.endMs, s.value].every(Number.isFinite) || s.value < 0 || s.endMs < s.startMs) continue;
    const meta = { sourceId: entry.sourceId, source: entry.source, rank: entry.rank };
    if (s.startMs === s.endMs) at(s.startMs).points.push({ ...meta, value: s.value });
    else {
      const rate = s.value / (s.endMs - s.startMs);
      at(s.startMs).changes.push({ ...meta, rate, count: 1 });
      at(s.endMs).changes.push({ ...meta, rate: -rate, count: -1 });
    }
  }
  const times = [...events.keys()].sort((a,b) => a-b), active = new Map(), selected = new Set();
  let total = 0, coveredMs = 0, overlaps = 0, dropped = 0, previous = null;
  const choose = candidates => candidates.sort((a,b) => b.rank-a.rank || b.value-a.value || String(a.sourceId).localeCompare(String(b.sourceId)));
  const consume = candidates => {
    const ranked = choose(candidates);
    if (!ranked.length) return false;
    total += ranked[0].value; selected.add(ranked[0].source);
    if (ranked.length > 1) { overlaps++; dropped += ranked.slice(1).reduce((s,c) => s+c.value,0); }
    return true;
  };
  for (const time of times) {
    if (previous != null && consume([...active.values()].filter(v => v.count > 0).map(v => ({ ...v, value: Math.max(0,v.rate) * (time-previous) })))) coveredMs += time-previous;
    const event = events.get(time);
    for (const change of event.changes) {
      const current = active.get(change.sourceId) || { ...change, rate: 0, count: 0 };
      current.rate += change.rate; current.count += change.count;
      active.set(change.sourceId,current);
    }
    for (const [id,value] of active) if (!value.count) active.delete(id);
    const points = new Map();
    for (const point of event.points) {
      const current = points.get(point.sourceId) || { ...point, value: 0 };
      current.value += point.value; points.set(point.sourceId,current);
    }
    consume([...points.values()]); previous = time;
  }
  return { total, coveredMs, start: times[0] ?? null, end: times.at(-1) ?? null, overlaps, dropped, sources: [...selected] };
}
