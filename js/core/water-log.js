/** 饮食页和数据页共用同一日的饮水次数口径；设备毫升量另记。 */
export const MAX_WATER_TAPS = 40;

export function recordedWaterCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.min(MAX_WATER_TAPS, Math.round(number)) : 0;
}
