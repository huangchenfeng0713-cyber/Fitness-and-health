/**
 * 热量圆环：同一把尺子上画摄入和消耗。
 *
 * 整圈是当天锁定的近似尺度（预计消耗取整到百），不是「目标」。
 * 绿弧是已摄入，黄细环是当前消耗；谁都可以过 12 点再叠一圈加深。
 * 绿不被黄擦掉。圈里只说这一刻谁领先多少。
 *
 * 这个模块只算长度和位置，不碰 DOM；画在 lib/charts.js 里。
 */

/** 图例仍用这套名字，避免调用方再拼一份。 */
export const SEGMENT_META = Object.freeze({
  eaten: { label: '已摄入', tone: 'solid' },
  lead: { label: '摄入领先', tone: 'deep' },
  burn: { label: '当前消耗', tone: 'burn' },
});

const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const pos = (v) => (n(v) != null && n(v) > 0 ? n(v) : null);

/** 尺子取整到百。当天应保持不动；这里只负责「大约」。 */
export function trackScale(kcal) {
  const v = n(kcal);
  if (v == null || v <= 0) return 2200;
  return Math.max(800, Math.round(v / 100) * 100);
}

function lap(value, scale) {
  const turns = Math.max(0, (value || 0) / scale);
  return {
    firstPct: Math.min(turns, 1) * 100,
    wrapPct: Math.min(Math.max(turns - 1, 0), 1) * 100,
    pct: (turns % 1) * 100,
    laps: Math.floor(turns),
  };
}

export function energyRing({
  eaten = 0, target = 0, burned = null, projected = null,
} = {}) {
  const ate = Math.max(0, n(eaten) || 0);
  const goal = pos(target);
  const burnRaw = n(burned);
  const burn = burnRaw != null && burnRaw >= 0 ? burnRaw : null;
  const plan = pos(projected);
  const scale = trackScale(plan || goal || Math.max(ate, burn || 0, 1));

  const eatLap = lap(ate, scale);
  const burnLap = burn != null ? lap(burn, scale) : null;

  const segments = [];
  if (eatLap.firstPct > 0.05) {
    segments.push({
      key: 'eaten', fromPct: 0, toPct: eatLap.firstPct,
      kcal: Math.round(Math.min(ate, scale)),
      label: SEGMENT_META.eaten.label, tone: 'solid',
    });
  }

  const leadKcal = burn != null ? Math.round(ate - burn) : 0;
  if (leadKcal > 8) {
    const from = burnLap.pct;
    const span = Math.min(((ate - burn) / scale) * 100, 100);
    segments.push({
      key: 'lead', fromPct: from, toPct: Math.min(100, from + span),
      kcal: leadKcal, label: SEGMENT_META.lead.label, tone: 'deep',
    });
  }

  const ticks = [];
  if (burn != null) {
    ticks.push({
      key: 'burned',
      pct: burnLap.pct,
      kcal: Math.round(burn),
      label: '当前消耗',
      strong: true,
    });
  }

  let center;
  if (burn == null) {
    center = { kcal: Math.round(ate), label: '已摄入 kcal', over: false, lead: 'unknown' };
  } else if (Math.abs(leadKcal) < 30) {
    center = { kcal: Math.abs(leadKcal), label: '接近平衡', over: false, lead: 'even' };
  } else if (leadKcal > 0) {
    center = { kcal: leadKcal, label: '摄入领先 kcal', over: true, lead: 'eat' };
  } else {
    center = { kcal: Math.abs(leadKcal), label: '消耗领先 kcal', over: false, lead: 'burn' };
  }

  const remaining = goal != null ? Math.round(goal - ate) : null;

  return {
    scale,
    segments,
    ticks,
    overflow: null,
    laps: {
      eaten: eatLap,
      burned: burnLap,
      leadKcal,
    },
    eaten: Math.round(ate),
    burned: burn != null ? Math.round(burn) : null,
    projected: plan != null ? Math.round(plan) : null,
    target: goal != null ? Math.round(goal) : null,
    center,
    remaining,
    gap: burn != null && burn > ate ? Math.round(burn - ate) : 0,
    surplus: burn != null && ate > burn ? Math.round(ate - burn) : 0,
    hasBurn: burn != null,
  };
}

export function ringLegend(model) {
  const seen = new Set();
  const out = [];
  for (const seg of model?.segments || []) {
    if (seen.has(seg.key)) continue;
    seen.add(seg.key);
    out.push({ key: seg.key, label: seg.label, tone: seg.tone });
  }
  return out;
}
