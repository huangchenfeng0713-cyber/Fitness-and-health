/** 今日能量跑道：绿=摄入，黄=消耗，圈心=谁领先。只负责画，不算。 */

const NS = 'http://www.w3.org/2000/svg';
const RING_GAP_DEG = 8;

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, String(v));
  }
  return node;
}

export function energyRingChart({ model, size = 152, stroke = 14 }) {
  const pad = 16;
  const vb = size + pad * 2;
  const cx = vb / 2;
  const cy = vb / 2;
  const r = (size - stroke) / 2;
  const burnR = r - stroke / 2 - 7;
  const span = 360 - RING_GAP_DEG;
  const start = -90 + RING_GAP_DEG / 2;
  const angleOf = (p) => start + (Math.max(0, Math.min(100, p)) / 100) * span;
  const point = (deg, radius) => [
    cx + radius * Math.cos((deg * Math.PI) / 180),
    cy + radius * Math.sin((deg * Math.PI) / 180),
  ];

  const svg = el('svg', {
    viewBox: `0 0 ${vb} ${vb}`, class: 'ring energy-ring',
    preserveAspectRatio: 'xMidYMid meet', overflow: 'visible',
  });

  const strokeFor = (cls) => {
    if (cls.includes('ring-seg-wrap')) return { stroke: 'var(--ring-eat-wrap)' };
    if (cls.includes('ring-seg-deep')) return { stroke: 'var(--ring-eat-lead)' };
    if (cls.includes('ring-burn-wrap')) return { stroke: 'var(--ring-burn-wrap)' };
    if (cls.includes('ring-burn-track')) return {};
    if (cls.includes('ring-burn')) return { stroke: 'var(--ring-burn)' };
    if (cls.includes('ring-seg-solid')) return { stroke: 'var(--ring-eat)' };
    return {};
  };

  const arc = (radius, width, cls, fromPct, toPct) => {
    const circ = 2 * Math.PI * radius;
    const usable = (span / 360) * circ;
    const from = (Math.max(0, Math.min(100, fromPct)) / 100) * usable;
    const len = (Math.max(0, Math.min(100, toPct)) / 100) * usable - from;
    if (!(len > 0.3)) return;
    svg.append(el('circle', {
      cx, cy, r: radius, fill: 'none', class: cls, 'stroke-width': width, ...strokeFor(cls),
      'stroke-dasharray': `0 ${from} ${len} ${circ}`,
      transform: `rotate(${start} ${cx} ${cy})`,
    }));
  };

  const eat = model.drawn || {};
  const burn = model.laps?.burned;

  arc(r, stroke, 'ring-track', 0, 100);
  arc(r, stroke, 'ring-seg ring-seg-solid', 0, eat.firstPct || 0);
  arc(r, stroke, 'ring-seg ring-seg-wrap', 0, eat.wrapPct || 0);
  const lead = (model.segments || []).find((s) => s.key === 'lead');
  if (lead) arc(r, stroke, 'ring-seg ring-seg-deep', lead.fromPct, lead.toPct);

  arc(burnR, 3.5, 'ring-burn-track', 0, 100);
  if (model.hasBurn && burn) {
    const first = burn.laps >= 1 ? 100 : burn.firstPct;
    arc(burnR, 3.5, 'ring-burn', 0, first);
    arc(burnR, 3.5, 'ring-burn-wrap', 0, burn.wrapPct);
  }

  const [sx, sy] = point(start, r);
  svg.append(el('rect', {
    x: sx - 2.4, y: sy - 2.4, width: 4.8, height: 4.8, rx: 1, class: 'ring-origin',
  }));

  const tickTone = {
    intake: { inner: false },
    burn: { inner: true },
  };
  const placed = (model.ticks || []).map((tick) => {
    const tone = tickTone[tick.tone] || tickTone.intake;
    const deg = angleOf(tick.pct);
    const r0 = tone.inner ? burnR - 1 : r - stroke * 0.15;
    const r1 = tone.inner ? r + stroke * 0.15 : r + stroke * 0.45;
    return { tick, tone, deg, r0, r1 };
  });

  for (const { tick, deg, r0, r1 } of placed) {
    const [x1, y1] = point(deg, r0);
    const [x2, y2] = point(deg, r1);
    svg.append(el('line', {
      x1, y1, x2, y2, class: `ring-tick strong ${tick.key}`,
    }));
  }

  if (model.center) {
    const main = el('text', {
      x: cx, y: cy - 3, 'text-anchor': 'middle',
      class: 'ring-label', 'font-size': size / 4.6, 'font-weight': 650,
    });
    main.textContent = String(model.center.kcal);
    svg.append(main);
    const sub = el('text', {
      x: cx, y: cy + size / 5.6, 'text-anchor': 'middle',
      class: 'ring-sub', 'font-size': size / 11.5,
    });
    sub.textContent = model.center.label;
    svg.append(sub);
  }
  return svg;
}
