/**
 * 今日热量环：整圈 = 今天计划吃多少。只负责画，不算。
 *
 * 两条轨道各画各的：外圈粗的是摄入，内圈细的是消耗。
 * 每条轨道第一圈浅色、第二圈深色盖在浅色上，一条不去动另一条。
 */

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
  // 消耗环的粗细：画弧和画刻度共用一个数，否则刻度出头的长度会跟着漂
  const BURN_STROKE = 3.5;
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

  /* 两条轨道的几何和配色都只写一次，段落按 track / tone 取 */
  const TRACK = {
    intake: { radius: r, width: stroke, light: 'var(--ring-eat)', deep: 'var(--ring-eat-wrap)' },
    burn: { radius: burnR, width: BURN_STROKE, light: 'var(--ring-burn)', deep: 'var(--ring-burn-wrap)' },
  };

  const arc = (radius, width, cls, colour, fromPct, toPct) => {
    const circ = 2 * Math.PI * radius;
    const usable = (span / 360) * circ;
    const from = (Math.max(0, Math.min(100, fromPct)) / 100) * usable;
    const len = (Math.max(0, Math.min(100, toPct)) / 100) * usable - from;
    if (!(len > 0.3)) return;
    svg.append(el('circle', {
      cx, cy, r: radius, fill: 'none', class: cls, 'stroke-width': width, stroke: colour,
      'stroke-dasharray': `0 ${from} ${len} ${circ}`,
      transform: `rotate(${start} ${cx} ${cy})`,
    }));
  };

  // 灰轨先铺满，两条都有 —— 没画到的地方就是还没走到的部分
  arc(r, stroke, 'ring-track', null, 0, 100);
  arc(burnR, BURN_STROKE, 'ring-burn-track', null, 0, 100);

  /*
   * 先画完所有第一圈，再画所有第二圈。
   *
   * 同一条轨道上第二圈必须压在第一圈上面（深色盖浅色），而 model.segments
   * 的顺序不保证这一点 —— 按 tone 分两趟画，叠放次序就跟数据顺序无关了。
   */
  for (const tone of ['light', 'deep']) {
    for (const seg of model.segments || []) {
      if (seg.tone !== tone) continue;
      const t = TRACK[seg.track] || TRACK.intake;
      arc(t.radius, t.width, `ring-seg ring-seg-${seg.track} ring-seg-${tone}`,
        t[tone], seg.fromPct, seg.toPct);
    }
  }

  const [sx, sy] = point(start, r);
  svg.append(el('rect', {
    x: sx - 2.4, y: sy - 2.4, width: 4.8, height: 4.8, rx: 1, class: 'ring-origin',
  }));

  /*
   * 刻度线完整穿过它标的那条轨道，两端各出头一点点。
   *
   * 早先两条都只刻了一半：摄入那条浮在环的外侧、消耗那条从消耗环冲进主环
   * 停在半路 —— 穿不透的刻度读作「划痕」，不是「记号」。
   * 每条刻度只管自己那条轨道：摄入标主环，消耗标消耗环。
   */
  const OVERHANG = 2.5;
  for (const tick of model.ticks || []) {
    const t = TRACK[tick.track] || TRACK.intake;
    const deg = angleOf(tick.pct);
    const [x1, y1] = point(deg, t.radius - t.width / 2 - OVERHANG);
    const [x2, y2] = point(deg, t.radius + t.width / 2 + OVERHANG);
    /*
     * 刻度跟着它标的那条轨道走色：摄入用绿、消耗用金，跑过一整圈换成对应的深色。
     * 颜色和弧段取自同一张 TRACK 表 —— 刻度和它标的那条弧永远不会走散。
     */
    const tone = tick.laps >= 1 ? 'deep' : 'light';
    svg.append(el('line', {
      x1, y1, x2, y2, stroke: t[tone],
      class: `ring-tick ring-tick-${tick.key} ring-tick-${tone}`,
    }));
  }

  /*
   * 圈心只有一句话。差得很少时（「接近目标」）没有数字，
   * 那一句就自己占住中间，不留一个空的大号数字位。
   */
  if (model.center) {
    const hasNumber = model.center.kcal != null;
    if (hasNumber) {
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
    } else {
      const only = el('text', {
        x: cx, y: cy + size / 26, 'text-anchor': 'middle',
        class: 'ring-label', 'font-size': size / 8.5, 'font-weight': 620,
      });
      only.textContent = model.center.label;
      svg.append(only);
    }
  }
  return svg;
}
