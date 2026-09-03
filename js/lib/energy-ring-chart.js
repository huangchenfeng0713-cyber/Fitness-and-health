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
  const padX = 78;
  const padY = 28;
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
    preserveAspectRatio: 'xMidYMid meet', overflow: 'visible',
  });

  const strokeFor = (cls) => {
    if (cls.includes('ring-seg-wrap')) return { stroke: '#147a5c' };
    if (cls.includes('ring-seg-deep')) return { stroke: '#0b4f3c' };
    if (cls.includes('ring-burn-wrap')) return { stroke: '#c9a20c' };
    if (cls.includes('ring-burn-track')) return {};
    if (cls.includes('ring-burn')) return { stroke: '#e8c84a' };
    if (cls.includes('ring-seg-solid')) return { stroke: '#22c55e' };
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
    intake: { stroke: '#ffffff', fill: '#ffffff', inner: false },
    burn: { stroke: '#e8c84a', fill: '#e8c84a', inner: true },
  };
  const placed = (model.ticks || []).map((tick) => {
    const tone = tickTone[tick.tone] || tickTone.intake;
    const deg = angleOf(tick.pct);
    const r0 = tone.inner ? burnR : r;
    const r1 = tone.inner ? r + stroke * 0.2 : r + stroke * 0.55;
    return { tick, tone, deg, r0, r1 };
  });

  /*
   * 标签放在左右边沟里，不沿半径往外飞。
   * 「当前摄入 1584」一整行约 110px，原先 pad 只有 78，字会画出 viewBox
   * 被 SVG 裁掉，左边只剩「前摄入」。改成两行之后边沟够用。
   */
  const LABEL_H = 30;
  const labels = placed.map((p) => {
    const [, py] = point(p.deg, r + stroke * 0.65);
    const norm = ((p.deg % 360) + 360) % 360;
    const onLeft = norm > 90 && norm < 270;
    return {
      ...p,
      onLeft,
      lx: onLeft ? padX - 8 : vbW - padX + 8,
      ly: Math.max(14, Math.min(vbH - 18, py)),
    };
  });
  if (labels.length === 2 && labels[0].onLeft === labels[1].onLeft) {
    const a = labels[0].ly <= labels[1].ly ? labels[0] : labels[1];
    const b = a === labels[0] ? labels[1] : labels[0];
    if (b.ly - a.ly < LABEL_H + 4) {
      const mid = (a.ly + b.ly) / 2;
      a.ly = Math.max(14, mid - LABEL_H / 2 - 4);
      b.ly = Math.min(vbH - 18, a.ly + LABEL_H + 8);
    }
  }

  for (const item of labels) {
    const { tick, tone, deg, r0, r1, onLeft, lx, ly } = item;
    const [x1, y1] = point(deg, r0);
    const [x2, y2] = point(deg, r1);
    svg.append(el('line', {
      x1, y1, x2, y2, class: `ring-tick strong ${tick.key}`,
      stroke: tone.stroke, 'stroke-width': 3.2,
    }));
    svg.append(el('circle', {
      cx: x1, cy: y1, r: 2.7, fill: tone.fill, stroke: 'var(--text)', 'stroke-width': 1.2,
    }));
    if ((tick.laps || 0) >= 1) {
      svg.append(el('circle', {
        cx: x1, cy: y1, r: 5.4, fill: 'none',
        stroke: tone.stroke, 'stroke-width': 1.5,
      }));
    }
    const text = el('text', {
      x: lx, y: ly, class: `ring-tick-label strong ${tick.key}`,
      'text-anchor': onLeft ? 'end' : 'start',
      'font-size': 12,
    });
    const line = el('tspan', { x: lx, dy: '-0.45em' });
    line.textContent = tick.label;
    const num = el('tspan', { x: lx, dy: '1.25em' });
    num.textContent = String(tick.kcal);
    text.append(line, num);
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
