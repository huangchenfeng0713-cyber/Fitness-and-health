/** 组记录契约。上限为输入护栏，不是训练处方或生理极限。 */
export const SET_TYPES = { unknown: '性质未注明', warmup: '热身', work: '工作组' };
export const LOAD_MODES = { unknown: '重量方式未注明', bodyweight: '自重', external: '附加负重', assistance: '辅助重量', machine: '器械标示' };
export const LOAD_CONVENTIONS = { unknown: '重量口径未注明', single: '单手／单侧', total: '双手合计', scale: '器械刻度' };
export const SET_LIMITS = { reps: 500, weightKg: 500, rir: 10, durationSeconds: 86400 };
export function validTrainingDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + 'T00:00:00Z'))
    && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
}
export function validateTrainingRecord(raw) {
  if (raw?.date != null && !validTrainingDate(raw.date)) throw new RangeError('训练日期无效');
  if (raw?.items != null && !Array.isArray(raw.items)) throw new RangeError(`${raw.date || '训练'}：items 必须为数组`);
  for (const [i, item] of (raw?.items || []).entries()) {
    if (item?.sets != null && !Array.isArray(item.sets)) throw new RangeError(`${raw.date || '训练'} · ${item?.id || i + 1}：sets 必须为数组`);
    for (const [k, set] of (item?.sets || []).entries()) {
      const fail = field => { throw new RangeError(`${raw.date || '训练'} · ${item.id || i + 1} 第 ${k + 1} 组：${field} 无效`); };
      if (!set || typeof set !== 'object') continue; // 旧记录继续由兼容读取处理。
      for (const [field, values] of Object.entries({ setType: SET_TYPES, loadMode: LOAD_MODES, loadConvention: LOAD_CONVENTIONS })) {
        if (set[field] != null && !Object.hasOwn(values, set[field])) fail(field);
      }
      if (set.completed != null && typeof set.completed !== 'boolean') fail('completed');
      const extended = ['completed','rir','durationSeconds','setType','loadMode','loadConvention'].some(field => Object.hasOwn(set, field));
      if (extended) for (const [field, max] of Object.entries(SET_LIMITS)) {
        const value = set[field];
        if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max
          || (field !== 'weightKg' && !Number.isInteger(value)))) fail(field);
      }
    }
  }
}

export function isRecordedSet(set) {
  return set?.completed !== false && (set?.reps > 0 || set?.durationSeconds > 0);
}
export function isRecordedItem(item) {
  return item.sets.some(isRecordedSet) || (item.done === true && item.sets.every(set => set.completed == null));
}
export function setCategory(set) {
  if (!isRecordedSet(set)) return 'draft';
  return set.completed === true && ['work','warmup'].includes(set.setType) ? set.setType : 'unknown';
}
export function trainingSetText(set) {
  const load = set.loadMode === 'bodyweight' ? `自重${set.weightKg > 0 ? `（原记 ${set.weightKg} kg）` : ''}` : `${set.weightKg != null ? set.weightKg + ' kg' : '重量未填'}`;
  const mode = ['external','assistance','machine'].includes(set.loadMode) ? LOAD_MODES[set.loadMode] + ' ' : '';
  const dose = [set.reps > 0 ? `${set.reps} 次` : '', set.durationSeconds > 0 ? `${set.durationSeconds} 秒` : ''].filter(Boolean).join(' / ') || '次数未填';
  const extras = [set.loadConvention && set.loadConvention !== 'unknown' ? LOAD_CONVENTIONS[set.loadConvention] : '',
    set.setType && set.setType !== 'unknown' ? SET_TYPES[set.setType] : '', set.rir != null ? `RIR ${set.rir}` : '',
    set.completed === false ? '未完成' : ''].filter(Boolean);
  return `${mode}${load} × ${dose}${extras.length ? ' · ' + extras.join(' · ') : ''}`;
}
