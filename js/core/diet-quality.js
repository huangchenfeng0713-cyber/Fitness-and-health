/** 日级人工确认与营养字段完整性独立；签名用于识别旧客户端编辑后的过期确认。 */
export const DIET_LOG_STATES = { unknown: '未确认', partial: '部分记录', complete: '已确认完整' };
export const dietStatusKey = date => `dietLogStatus:${date}`;
export function dietRecordSignature(entries) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify([...entries].sort((a, b) => Number(a.id) - Number(b.id)).map(canonical));
}
export function dietDayQuality(entries = [], metadata = null) {
  if (!entries.length) return { status: 'unknown', label: '没有记录', calibrationEligible: false };
  const current = metadata?.signature === dietRecordSignature(entries);
  const status = current && Object.hasOwn(DIET_LOG_STATES, metadata.status) ? metadata.status : 'unknown';
  return { status, label: DIET_LOG_STATES[status], confirmedAt: current ? metadata.confirmedAt : null,
    // 仅表示人工完整度这一项满足；不代表通过设备覆盖、营养质量和趋势跨度等后续条件。
    calibrationEligible: status === 'complete' };
}
