/**
 * 今日热量环：环形跑道，不是目标进度条。
 *
 * 绿是摄入，黄是消耗，同一条固定长度的跑道上赛跑。
 * 整圈不是「今日目标」，只是当天的画布长度。
 *
 * 尺度每天开始算一次：scale = round(预计日消耗 / 100) * 100。
 * 当天内不许改，否则加一餐、同步消耗都会让弧跳。
 */

const SCALE_KEY = 'health-diet-ring-scale';
const BALANCE_WITHIN = 40;

const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function trackScale(projected) {
  const raw = n(projected);
  const base = raw != null && raw > 0 ? raw : 2000;
  return Math.max(100, Math.round(base / 100) * 100);
}

function memoryStore() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function toScaleMap(raw) {
  if (!raw || typeof raw !== 'object') return {};
  if (raw.date && Number.isFinite(raw.scale) && raw.scale >= 100) {
    return { [raw.date]: raw.scale };
  }
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Number.isFinite(v) && v >= 100) out[k] = v;
  }
  return out;
}

/** 当天尺子锁住。换日再重算。storage 可注入，方便单测。 */
export function lockTrackScale(date, projected, storage = memoryStore()) {
  const computed = trackScale(projected);
  const key = String(date || '');
  if (!key || !storage) return computed;
  try {
    const map = toScaleMap(JSON.parse(storage.getItem(SCALE_KEY) || 'null'));
    if (Number.isFinite(map[key]) && map[key] >= 100) return map[key];
    map[key] = computed;
    storage.setItem(SCALE_KEY, JSON.stringify(map));
  } catch {
    return computed;
  }
  return computed;
}

export function lap(x, scale) {
  const v = Math.max(0, n(x) || 0);
  const s = Math.max(1, scale);
  return {
    pct: v / s,
    laps: Math.floor(v / s),
    firstPct: (Math.min(v, s) / s) * 100,
    wrapPct: (Math.min(Math.max(v - s, 0), s) / s) * 100,
  };
}

function centerOf(eaten, burned, hasBurn) {
  const diff = Math.round(eaten - (hasBurn ? burned : 0));
  if (!hasBurn && eaten <= 0) {
    return { kcal: 0, label: '接近平衡', over: false };
  }
  if (Math.abs(diff) <= BALANCE_WITHIN) {
    return { kcal: Math.abs(diff), label: '接近平衡', over: false };
  }
  if (diff > 0) return { kcal: diff, label: '摄入领先', over: true };
  return { kcal: Math.abs(diff), label: '消耗领先', over: false };
}

/**
 * @param {object} input
 *   eaten     已摄入 kcal
 *   burned    当前消耗。没有设备数据时传 null
 *   projected 预计全天消耗，只用来在没传入 scale 时算尺子
 *   scale     当天锁定的圆周。传入则不再改
 */
export function energyRing({
  eaten = 0, burned = null, projected = null, scale = null,
} = {}) {
  const ate = Math.max(0, n(eaten) || 0);
  const burnRaw = n(burned);
  const hasBurn = burnRaw != null && burnRaw >= 0;
  const burn = hasBurn ? burnRaw : 0;
  const sc = Math.max(100, n(scale) || trackScale(projected));

  const eatLap = lap(ate, sc);
  const burnLap = lap(burn, sc);

  /*
   * 消耗套圈：黄刻度扫过的绿弧变回灰轨。
   * 第一圈被扫掉当 burn.laps >= 1；第二圈被扫掉当 burn.laps >= 2。
   * 再多的数值只写在圈心，最多画满两圈。
   */
  const firstGreen = burnLap.laps >= 1 ? 0 : eatLap.firstPct;
  const wrapGreen = burnLap.laps >= 2 ? 0 : eatLap.wrapPct;

  const segments = [];
  if (firstGreen > 0.3) {
    segments.push({
      key: 'eaten', fromPct: 0, toPct: firstGreen,
      kcal: Math.round(Math.min(ate, sc)), label: '已摄入', tone: 'solid',
    });
  }
  if (wrapGreen > 0.3) {
    segments.push({
      key: 'wrap', fromPct: 0, toPct: wrapGreen,
      kcal: Math.round(Math.min(Math.max(ate - sc, 0), sc)), label: '第二圈', tone: 'wrap',
    });
  }

  /*
   * 摄入端点越过黄刻度：越过的那段改深绿。
   * 只在同一圈上比。摄入已经套圈、消耗还没有时，第二圈从 12 点
   * 顺时针往右盖（wrap），不要再把黄刻度到 12 点（12 点左边）涂深 ——
   * 那看起来像第二圈往反方向盖。
   */
  if (ate > burn + 0.5 && hasBurn && burnLap.laps === eatLap.laps) {
    const fromPct = eatLap.laps >= 1 ? burnLap.wrapPct : burnLap.firstPct;
    const toPct = eatLap.laps >= 1 ? eatLap.wrapPct : eatLap.firstPct;
    if (toPct > fromPct + 0.3) {
      segments.push({
        key: 'lead', fromPct, toPct,
        kcal: Math.round(ate - burn), label: '摄入领先', tone: 'deep',
      });
    }
  }

  const ticks = [];
  if (ate > 0.5) {
    ticks.push({
      key: 'eaten',
      pct: (ate % sc) / sc * 100,
      kcal: Math.round(ate),
      label: '当前摄入',
      tone: 'intake',
      laps: eatLap.laps,
    });
  }
  if (hasBurn) {
    ticks.push({
      key: 'burned',
      pct: (burn % sc) / sc * 100,
      kcal: Math.round(burn),
      label: '当前消耗',
      tone: 'burn',
      laps: burnLap.laps,
    });
  }

  const center = centerOf(ate, burn, hasBurn);
  const scaleCaption = `${Math.round(ate)} / ≈${sc} kcal`;

  return {
    scale: sc,
    eaten: Math.round(ate),
    burned: hasBurn ? Math.round(burn) : null,
    projected: n(projected) != null ? Math.round(n(projected)) : null,
    target: null,
    hasBurn,
    segments,
    ticks,
    laps: { eaten: eatLap, burned: burnLap },
    drawn: { firstPct: firstGreen, wrapPct: wrapGreen },
    center,
    scaleCaption,
    remaining: Math.round(ate - burn),
    gap: hasBurn && burn > ate ? Math.round(burn - ate) : 0,
    surplus: hasBurn && ate > burn ? Math.round(ate - burn) : 0,
    overflow: null,
  };
}
