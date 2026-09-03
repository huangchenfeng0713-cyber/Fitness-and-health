/** 今日能量跑道环：绿=摄入，黄=消耗，圈心=谁领先。 */

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
  const padX = 78;
  const padY = 22;
  const vbW = size + padX * 2;
  const vbH = size + padY * 2;
  const cx = vbW / 2;
  const cy = vbH / 2;
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
    viewBox: `0 0 ${vbW} ${vbH}`, class: 'ring energy-ring',
    preserveAspectRatio: 'xMidYMid meet',
  });

  const strokeFor = (cls) => {
    if (cls.includes('ring-seg-wrap')) return { stroke: '#147a5c' };
    if (cls.includes('ring-seg-deep')) return { stroke: '#0b4f3c' };
    if (cls.includes('ring-burn-wrap')) return { stroke: '#c9a20c' };
    if (cls.includes('ring-burn-track')) return { stroke: '#efe3a8' };
    if (cls.includes('ring-burn')) return { stroke: '#e8c84a' };
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

  const eat = model.laps?.eaten;
  const burn = model.laps?.burned;

  arc(r, stroke, 'ring-track', 0, 100);
  if (eat) {
    arc(r, stroke, 'ring-seg ring-seg-solid', 0, eat.firstPct);
    arc(r, stroke, 'ring-seg ring-seg-wrap', 0, eat.wrapPct);
  }
  const lead = (model.segments || []).find((s) => s.key === 'lead');
  if (lead) arc(r, stroke, 'ring-seg ring-seg-deep', lead.fromPct, lead.toPct);

  arc(burnR, 3.5, 'ring-burn-track', 0, 100);
  if (burn) {
    const first = burn.laps >= 1 ? 100 : burn.firstPct;
    arc(burnR, 3.5, 'ring-burn', 0, first);
    arc(burnR, 3.5, 'ring-burn-wrap', 0, burn.wrapPct);
  }

  const [sx, sy] = point(start, r);
  svg.append(el('rect', {
    x: sx - 2.4, y: sy - 2.4, width: 4.8, height: 4.8, rx: 1, class: 'ring-origin',
  }));

  for (const tick of model.ticks || []) {
    const deg = angleOf(tick.pct);
    const [x1, y1] = point(deg, burnR);
    const [x2, y2] = point(deg, r + stroke * 0.55);
    svg.append(el('line', {
      x1, y1, x2, y2, class: 'ring-tick strong', stroke: '#ffffff', 'stroke-width': 3.2,
    }));
    svg.append(el('circle', {
      cx: x1, cy: y1, r: 2.6, fill: '#ffffff', stroke: 'var(--text)', 'stroke-width': 1.2,
    }));
    const norm = ((deg % 360) + 360) % 360;
    const onLeft = norm > 90 && norm < 270;
    const [tx, ty] = point(deg, r + stroke * 0.72 + 8);
    const text = el('text', {
      x: tx, y: ty, class: 'ring-tick-label strong',
      'text-anchor': onLeft ? 'end' : 'start',
      'dominant-baseline': 'middle',
      'font-size': 13,
    });
    text.textContent = `${tick.label} ${tick.kcal}`;
    svg.append(text);
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
